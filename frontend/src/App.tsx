import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type ChangeEvent } from "react";
import type { DesignSpec, PartName } from "../../Builder/types";
import { buildFlat } from "../../Builder/buildFlat";
import { MAX_ELEMENTS, newElementId, type Point } from "./draw/strokes";
import { exportFlat, type ExportFormat } from "./export/exportFlat";
import { NavRail } from "./components/NavRail";
import { TopBar } from "./components/TopBar";
import { UploadPanel } from "./components/UploadPanel";
import { LeftPanel, type LeftTab } from "./components/LeftPanel";
import { LibraryPanel } from "./components/LibraryPanel";
import { CanvasStage, type CanvasTool } from "./components/CanvasStage";
import { PropertiesPanel } from "./components/PropertiesPanel";
import { CanvasCrash, ErrorBoundary, PanelCrash } from "./components/ErrorBoundary";
import { ACCEPT_ATTR, useSketchUpload } from "./hooks/useSketchUpload";
import { useAnalysis } from "./hooks/useAnalysis";
import { useLibrary } from "./hooks/useLibrary";
import { describeError } from "./api/parts";
import { useDesignFile } from "./hooks/useDesignFile";
import { OpenDialog } from "./components/OpenDialog";
import { ReplaceDialog } from "./components/ReplaceDialog";
import { type SampleDesign } from "./samples";
import { buildSavedPart, editsFor, type SavedPart } from "./library/libraryModel";
import { isTyping, useUndoShortcuts } from "./hooks/useUndoShortcuts";
import { ElementPanel } from "./components/ElementPanel";
import { MultiPanel } from "./components/MultiPanel";
import type { LayersProps } from "./components/LayersSection";
import type { TransformPatch } from "./draw/transform";
import { validElement, type ElementPatch } from "./state/specReducer";
import type { CustomElement } from "../../Builder/buildFlat";
import type { SavedDrawing } from "./api/customParts";
import { cloneElements, instantiateDrawing } from "./draw/drawings";
import type { EraserMode } from "./draw/eraser";
import { initialSpecState, specReducer } from "./state/specReducer";
import { FOLLOWER_PARTS, garmentOf, type EditAction } from "./state/specSchema";
import type { AiMode, AnalysisStatus, CanvasState } from "./types";
import { TryOnControls, useTryOn } from "./tryon"; // TRY-ON (optional feature, see src/tryon/README.md)
import { TemplatesButton } from "./templates"; // TEMPLATES (starter designs, see src/templates/README.md)

/**
 * Dev-only: preview canvas states with ?canvas=loading or ?canvas=error.
 * Otherwise nothing is in flight until a sketch is uploaded.
 */
function initialAnalysisStatus(): AnalysisStatus {
  if (import.meta.env.DEV) {
    const preview = new URLSearchParams(window.location.search).get("canvas");
    if (preview === "loading") return { status: "loading" };
    if (preview === "error") {
      return { status: "error", title: "Preview", message: "Preview of the error state. Nothing actually failed." };
    }
  }
  return { status: "idle" };
}

function aiStatus(mode: AiMode) {
  if (mode === "mock") return "Mock AI mode";
  if (mode === "gemini") return "Gemini";
  return "AI mode unknown";
}

export default function App() {
  const sketch = useSketchUpload();
  const inputRef = useRef<HTMLInputElement>(null);

  // The one current design spec. Every change goes through this reducer.
  const [design, dispatch] = useReducer(specReducer, initialSpecState);

  const [leftTab, setLeftTab] = useState<LeftTab>("sketch");
  const library = useLibrary();
  const { ensureLoaded: ensureLibraryLoaded } = library;
  // The library is fetched the first time its tab is opened.
  useEffect(() => {
    if (leftTab === "library") ensureLibraryLoaded();
  }, [leftTab, ensureLibraryLoaded]);

  const sketchFile = sketch.state.status === "ready" ? sketch.state.file : null;
  const analysis = useAnalysis(sketchFile, dispatch, initialAnalysisStatus());

  // TRY-ON: when on, the canvas shows the flat on a figure. Export is not affected.
  const tryOn = useTryOn();

  // The flat is rebuilt from the spec on every change.
  const flat = useMemo(() => {
    if (!design.spec) return null;
    try {
      // Hand drawn elements are drawn on top of the dress. They are not part of the spec.
      const svg = buildFlat(design.spec, design.customElements);
      return { svg: tryOn.wear(svg, design.spec.proportions.shoulder_width, design.spec.garment_type) }; // TRY-ON
    } catch {
      return { svg: null };
    }
  }, [design.spec, design.customElements, tryOn.wear]);

  let canvas: CanvasState;
  if (analysis.status.status === "loading") {
    canvas = { status: "loading" };
  } else if (analysis.status.status === "error") {
    canvas = { status: "error", title: analysis.status.title, message: analysis.status.message };
  } else if (!design.spec || !design.meta || !flat) {
    canvas = { status: "empty" };
  } else if (flat.svg === null) {
    canvas = {
      status: "error",
      title: "Couldn’t draw the flat",
      message: "The builder couldn’t draw the current design.",
    };
  } else if (design.meta.source === "sample") {
    canvas = { status: "ready", source: "sample", svgMarkup: flat.svg };
  } else if (design.meta.source === "saved") {
    canvas = { status: "ready", source: "saved", svgMarkup: flat.svg };
  } else {
    canvas = { status: "ready", source: "analysis", svgMarkup: flat.svg, aiMode: design.meta.aiMode };
  }

  // Which part is picked on the canvas. UI-only, so it lives outside the spec reducer.
  // The nonce changes on every click so re-clicking a part re-highlights its section.
  const [selection, setSelection] = useState<{ part: PartName; nonce: number } | null>(null);
  const nonce = useRef(0);
  // Hand drawn elements can be selected (one, several, or a whole group) instead of a dress part,
  // never both at once.
  const [selectedElements, setSelectedElements] = useState<string[]>([]);
  const selectPart = useCallback((part: PartName | null) => {
    setSelection(part ? { part, nonce: ++nonce.current } : null);
    if (part) setSelectedElements([]);
  }, []);
  const selectElements = useCallback((ids: string[]) => {
    setSelectedElements(ids);
    if (ids.length > 0) setSelection(null);
  }, []);
  // Dress parts hidden with the eye in the Layers list. Canvas only: it is a view setting, not part of the
  // design, so it is not in the undo history and never reaches an export.
  const [hiddenParts, setHiddenParts] = useState<PartName[]>([]);
  const togglePartHidden = useCallback(
    (part: PartName) => setHiddenParts((h) => (h.includes(part) ? h.filter((p) => p !== part) : [...h, part])),
    [],
  );
  // A different design (new analysis, sample opened or closed) starts with nothing selected.
  useEffect(() => {
    setSelection(null);
    setSelectedElements([]);
    setHiddenParts([]);
  }, [design.meta]);
  // Drawings that are gone (deleted, or their stroke was undone) are not selected any more.
  useEffect(() => {
    if (selectedElements.some((id) => !design.customElements.some((e) => e.id === id))) {
      setSelectedElements((ids) => ids.filter((id) => design.customElements.some((e) => e.id === id)));
    }
  }, [design.customElements, selectedElements]);
  const selectedData = selectedElements
    .map((id) => design.customElements.find((e) => e.id === id))
    .filter((e): e is CustomElement => !!e);

  // Saving and opening whole designs (POST and PUT /designs, with the version check).
  const file = useDesignFile(design, dispatch);
  const [openingDesign, setOpeningDesign] = useState(false);

  // Export uses a fresh buildFlat string for the current spec, never the on-screen SVG,
  // so selection and hover styling cannot get into the file.
  const exportCurrent = useCallback(
    async (format: ExportFormat) => {
      if (!design.spec) throw new Error("There is nothing to export yet.");
      return exportFlat(buildFlat(design.spec, design.customElements), file.name, format);
    },
    [design.spec, design.customElements, file.name],
  );

  // The drawing tools (pen, line, shapes, eraser). Only usable while a flat is on the canvas; a new
  // design starts back on Select.
  const [tool, setTool] = useState<CanvasTool>("select");
  useEffect(() => setTool("select"), [canvas.status, design.meta]);
  const drawElement = useCallback(
    (points: Point[], closed: boolean, label: string) => dispatch({ type: "draw", id: newElementId(), points, closed, label }),
    [],
  );
  // Each stretch of an eraser drag erases as it goes; the drag key makes the whole drag one undo step.
  const eraseAlong = useCallback(
    (path: Point[], mode: EraserMode, drag: string) =>
      dispatch({ type: "erase", path, mode, newId: newElementId, coalesce: `erase:${drag}` }),
    [],
  );

  // Changing, moving and deleting hand drawn elements. A drag or a stretch of typing is one undo step.
  const updateElement = useCallback(
    (id: string, patch: ElementPatch, coalesce?: string) => dispatch({ type: "update", id, patch, coalesce }),
    [],
  );
  // Several at once (a multi selection or a group): moving, restyling, grouping and deleting each
  // happen in one dispatch, so each is one undo step.
  const moveElements = useCallback(
    (moves: { id: string; x: number; y: number }[]) =>
      dispatch({
        type: "updateMany",
        changes: moves.map((m) => ({ id: m.id, patch: { transform: { x: m.x, y: m.y } } })),
        coalesce: `move:${moves.map((m) => m.id).join(",")}`,
      }),
    [],
  );
  // Resize and rotate: new x, y, scale or rotation for each element, one undo step per drag.
  const transformElements = useCallback(
    (changes: Map<string, TransformPatch>) =>
      dispatch({
        type: "updateMany",
        changes: [...changes].map(([id, transform]) => ({ id, patch: { transform } })),
        coalesce: `xform:${[...changes.keys()].join(",")}`,
      }),
    [],
  );
  // Layers list: hide or show, rename, and stack order. Each is one undo step.
  const setVisible = useCallback(
    (ids: string[], visible: boolean) =>
      dispatch({ type: "updateMany", changes: ids.map((id) => ({ id, patch: { visible } })) }),
    [],
  );
  const renameElement = useCallback((id: string, name: string) => dispatch({ type: "update", id, patch: { name } }), []);
  const reorderElements = useCallback(
    (ids: string[], direction: "up" | "down") => dispatch({ type: "reorder", ids, direction }),
    [],
  );
  const updateSelected = useCallback(
    (patch: ElementPatch, coalesce: string) =>
      dispatch({ type: "updateMany", changes: selectedElements.map((id) => ({ id, patch })), coalesce }),
    [selectedElements],
  );
  const deleteSelected = useCallback(() => dispatch({ type: "deleteMany", ids: selectedElements }), [selectedElements]);
  // Grouping uses the contract's group_id: one new id for every selected element, or null to ungroup.
  const groupSelected = useCallback(() => {
    const groupId = newElementId();
    dispatch({ type: "updateMany", changes: selectedElements.map((id) => ({ id, patch: { group_id: groupId } })) });
  }, [selectedElements]);
  const ungroupSelected = useCallback(
    () => dispatch({ type: "updateMany", changes: selectedElements.map((id) => ({ id, patch: { group_id: null } })) }),
    [selectedElements],
  );

  // Delete or Backspace removes everything selected, but never while typing in a text box.
  useEffect(() => {
    if (selectedElements.length === 0 || canvas.status !== "ready") return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.key !== "Delete" && e.key !== "Backspace") || e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      e.preventDefault();
      dispatch({ type: "deleteMany", ids: selectedElements });
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selectedElements, canvas.status]);

  // Drawings in the library (/custom-parts). Saving stores a copy of the selected elements, a group
  // as one item. Using one adds an independent copy: new ids, a new group id for a group, layered
  // above everything already drawn, as one undo step.
  const saveDrawing = useCallback(
    async (name: string) => {
      try {
        await library.saveDrawingItem({ name, elements: cloneElements(selectedData) });
      } catch (err) {
        throw new Error(describeError(err, "Couldn’t save this drawing."));
      }
    },
    [selectedData, library.saveDrawingItem],
  );
  const applyDrawing = useCallback(
    (saved: SavedDrawing): string | null => {
      if (!design.spec) return "Open a design first.";
      if (design.customElements.length + saved.elements.length > MAX_ELEMENTS) {
        return `A design holds at most ${MAX_ELEMENTS} drawn lines; there isn’t room for ${saved.elements.length} more.`;
      }
      const copies = instantiateDrawing(saved.elements, design.customElements, newElementId);
      if (!copies.every(validElement)) return "This drawing couldn’t be added: it doesn’t match the drawing rules.";
      dispatch({ type: "insert", elements: copies });
      selectElements(copies.map((c) => c.id)); // the copy is selected, ready to move
      return null;
    },
    [design.spec, design.customElements, selectElements],
  );
  const deleteSavedDrawing = useCallback(
    async (saved: SavedDrawing) => {
      try {
        await library.removeDrawing(saved.id);
      } catch (err) {
        throw new Error(describeError(err, "Couldn’t delete this drawing."));
      }
    },
    [library.removeDrawing],
  );

  const applyEdit = useCallback(
    (action: EditAction, coalesce?: string) => dispatch({ type: "apply", actions: [action], coalesce }),
    [],
  );
  // Library: save the selected part, apply a saved part (one batch of edit actions, so one undo
  // reverts it), or delete one.
  const savePart = useCallback(
    async (part: PartName, name: string) => {
      if (!design.spec) throw new Error("There is nothing to save yet.");
      try {
        await library.save(buildSavedPart(design.spec, part, name));
      } catch (err) {
        throw new Error(describeError(err, "Couldn’t save this part."));
      }
    },
    [design.spec, library.save],
  );
  const applyPart = useCallback((saved: SavedPart) => dispatch({ type: "apply", actions: editsFor(saved) }), []);
  const deleteSavedPart = useCallback(
    async (saved: SavedPart) => {
      try {
        await library.remove(saved.id);
      } catch (err) {
        throw new Error(describeError(err, "Couldn’t delete this part."));
      }
    },
    [library.remove],
  );

  const layers: LayersProps = {
    elements: design.customElements,
    selectedElements,
    selectedPart: selection?.part ?? null,
    hiddenParts,
    garment: garmentOf(design.spec),
    onSelectElements: selectElements,
    onSelectPart: selectPart,
    onSetVisible: setVisible,
    onTogglePart: togglePartHidden,
    onReorder: reorderElements,
    onRename: renameElement,
  };

  const matchBodice = useCallback((part: PartName) => dispatch({ type: "follow", part }), []);
  const commitEdit = useCallback(() => dispatch({ type: "commit" }), []);

  // Undo and redo step through the spec history kept by the reducer.
  const historyOn = canvas.status === "ready";
  const undo = useCallback(() => dispatch({ type: "undo" }), []);
  const redo = useCallback(() => dispatch({ type: "redo" }), []);
  useUndoShortcuts({ enabled: historyOn, onUndo: undo, onRedo: redo });
  // A sample is a new, unsaved design with a fresh undo history, like an analysis result. The spec is copied so
  // edits never change the preset.
  const showSample = useCallback(
    (sample: SampleDesign) => dispatch({ type: "load", spec: structuredClone(sample.spec), meta: { source: "sample" } }),
    [],
  );
  const hideSample = useCallback(() => dispatch({ type: "clear", source: "sample" }), []);
  // TEMPLATES: a starter design opens the same way the sample does.
  const openTemplate = useCallback((spec: DesignSpec) => dispatch({ type: "load", spec, meta: { source: "sample" } }), []);

  // Anything that would replace the design on the canvas (a new sketch, the sample, removing the sketch) asks
  // first when there are unsaved changes, the same as Open does. "Keep editing" changes nothing.
  const [replacing, setReplacing] = useState<{ what: string; run: () => void } | null>(null);
  const confirmReplace = (what: string, run: () => void) => {
    if (canvas.status === "ready" && file.dirty) setReplacing({ what, run });
    else run();
  };
  const acceptSketch = (picked: File) =>
    confirmReplace("Uploading this sketch", () => {
      setLeftTab("sketch");
      void sketch.accept(picked);
    });

  // New design: an empty canvas, no sketch, no drawings, no undo history, the title back to "Untitled garment",
  // and no saved design id, so the next save creates a new design. Asks first if there are unsaved changes.
  const startNewDesign = () =>
    confirmReplace("Starting a new design", () => {
      sketch.clear();
      dispatch({ type: "clear" });
    });

  const chooseSample = (sample: SampleDesign) =>
    confirmReplace(`Opening “${sample.name}”`, () => {
      setLeftTab("sketch");
      showSample(sample);
    });

  const browse = () => inputRef.current?.click();
  const onInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    if (picked) acceptSketch(picked);
    e.target.value = "";
  };

  return (
    <div className="app">
      <a className="skip-link" href="#canvas-heading">Skip to canvas</a>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_ATTR}
        className="visually-hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={onInputChange}
      />
      <NavRail tab={leftTab} onTabChange={setLeftTab} />
      <div className="shell">
        <TopBar
          projectName={file.name}
          designOpen={canvas.status === "ready"}
          onRename={file.setName}
          saved={file.saved}
          dirty={canvas.status === "ready" && file.dirty}
          saveStatus={file.status}
          notice={file.notice}
          onSave={() => void file.save()}
          onReload={() => void file.reload()}
          onDismiss={file.dismiss}
          onOpenDesign={() => setOpeningDesign(true)}
          onNewDesign={startNewDesign}
          onUpload={browse}
          exportEnabled={canvas.status === "ready"}
          onExport={exportCurrent}
          canUndo={historyOn && design.past.length > 0}
          canRedo={historyOn && design.future.length > 0}
          onUndo={undo}
          onRedo={redo}
          status={canvas.status === "ready" && canvas.source === "analysis" ? aiStatus(canvas.aiMode) : null}
        />
        <div className="workspace">
          <LeftPanel
            tab={leftTab}
            onTabChange={setLeftTab}
            libraryCount={
              library.state.status === "ready" || library.drawings.status === "ready"
                ? (library.state.status === "ready" ? library.state.parts.length : 0) +
                  (library.drawings.status === "ready" ? library.drawings.drawings.length : 0)
                : null
            }
          >
            {leftTab === "sketch" ? (
              <UploadPanel
                state={sketch.state}
                onBrowse={browse}
                onFile={acceptSketch}
                onClear={() => confirmReplace("Removing the sketch", sketch.clear)}
                onChooseSample={chooseSample}
              />
            ) : (
              <LibraryPanel
                state={library.state}
                onReload={() => void library.load()}
                drawings={library.drawings}
                onReloadDrawings={() => void library.loadDrawings()}
                canApply={canvas.status === "ready"}
                garment={garmentOf(design.spec)}
                onApply={applyPart}
                onApplyDrawing={applyDrawing}
                onDelete={deleteSavedPart}
                onDeleteDrawing={deleteSavedDrawing}
              />
            )}
          </LeftPanel>
          <ErrorBoundary resetKey={design.spec} fallback={(reset, error) => <CanvasCrash error={error} onRetry={reset} />}>
          <CanvasStage
            state={canvas}
            hasSketch={sketch.state.status === "ready"}
            onChooseSample={chooseSample}
            onHideSample={() => confirmReplace("Hiding the sample", hideSample)}
            onUpload={browse}
            onRetry={analysis.retry}
            selectedPart={canvas.status === "ready" ? (selection?.part ?? null) : null}
            onSelectPart={selectPart}
            elements={design.customElements}
            selectedElements={canvas.status === "ready" ? selectedElements : []}
            onSelectElements={selectElements}
            onMoveElements={moveElements}
            onMoveEnd={commitEdit}
            onTransformElements={transformElements}
            hiddenParts={hiddenParts}
            garment={garmentOf(design.spec)}
            tool={canvas.status === "ready" ? tool : "select"}
            onToolChange={setTool}
            canDraw={design.customElements.length < MAX_ELEMENTS}
            onDraw={drawElement}
            onErase={eraseAlong}
            toolbarExtra={
              <>
                {/* TEMPLATES */}
                <TemplatesButton onPick={(spec) => confirmReplace("Opening a template", () => openTemplate(spec))} />
                {/* TRY-ON */}
                <TryOnControls tryOn={tryOn} shoulderWidth={design.spec?.proportions.shoulder_width} disabled={canvas.status !== "ready"} />
              </>
            }
          />
          </ErrorBoundary>
          <ErrorBoundary resetKey={design.spec} fallback={(reset, error) => <PanelCrash error={error} onRetry={reset} />}>
          {canvas.status === "ready" && selectedData.length === 1 ? (
            <ElementPanel
              element={selectedData[0]}
              onUpdate={(patch, coalesce) => updateElement(selectedData[0].id, patch, coalesce)}
              onCommit={commitEdit}
              onDelete={deleteSelected}
              onSave={saveDrawing}
              onOpenLibrary={() => setLeftTab("library")}
              layers={layers}
            />
          ) : canvas.status === "ready" && selectedData.length > 1 ? (
            <MultiPanel
              elements={selectedData}
              onUpdateAll={updateSelected}
              onCommit={commitEdit}
              onGroup={groupSelected}
              onUngroup={ungroupSelected}
              onDelete={deleteSelected}
              onSave={saveDrawing}
              onOpenLibrary={() => setLeftTab("library")}
              layers={layers}
            />
          ) : (
          <PropertiesPanel
            spec={canvas.status === "ready" ? design.spec : null}
            canvasStatus={canvas.status}
            selection={canvas.status === "ready" ? selection : null}
            onEdit={applyEdit}
            onCommit={commitEdit}
            onSavePart={savePart}
            following={design.spec ? FOLLOWER_PARTS.filter((p) => !design.detached.includes(p)) : []}
            onOpenLibrary={() => setLeftTab("library")}
            onMatchBodice={matchBodice}
            layers={layers}
          />
          )}
          </ErrorBoundary>
        </div>
      </div>
      {replacing && (
        <ReplaceDialog
          what={replacing.what}
          onKeep={() => setReplacing(null)}
          onReplace={() => {
            const { run } = replacing;
            setReplacing(null);
            run();
          }}
        />
      )}
      {openingDesign && (
        <OpenDialog dirty={file.dirty} onClose={() => setOpeningDesign(false)} onOpen={file.openSaved} />
      )}
    </div>
  );
}
