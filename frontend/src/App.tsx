import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type ChangeEvent } from "react";
import type { PartName } from "../../Builder/types";
import { buildFlat } from "../../Builder/buildFlat";
import { mockSpec } from "../../Builder/mockSpec";
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
import { buildSavedPart, editsFor, type SavedPart } from "./library/libraryModel";
import { isTyping, useUndoShortcuts } from "./hooks/useUndoShortcuts";
import { ElementPanel } from "./components/ElementPanel";
import type { ElementPatch } from "./state/specReducer";
import { initialSpecState, specReducer } from "./state/specReducer";
import { FOLLOWER_PARTS, type EditAction } from "./state/specSchema";
import type { AiMode, AnalysisStatus, CanvasState } from "./types";

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

const PROJECT_NAME = "Untitled garment";

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

  // The flat is rebuilt from the spec on every change.
  const flat = useMemo(() => {
    if (!design.spec) return null;
    try {
      // Hand drawn elements are drawn on top of the dress. They are not part of the spec.
      return { svg: buildFlat(design.spec, design.customElements) };
    } catch {
      return { svg: null };
    }
  }, [design.spec, design.customElements]);

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
  } else {
    canvas = { status: "ready", source: "analysis", svgMarkup: flat.svg, aiMode: design.meta.aiMode };
  }

  // Which part is picked on the canvas. UI-only, so it lives outside the spec reducer.
  // The nonce changes on every click so re-clicking a part re-highlights its section.
  const [selection, setSelection] = useState<{ part: PartName; nonce: number } | null>(null);
  const nonce = useRef(0);
  // A hand drawn element can be selected instead of a dress part, never both at once.
  const [selectedElement, setSelectedElement] = useState<string | null>(null);
  const selectPart = useCallback((part: PartName | null) => {
    setSelection(part ? { part, nonce: ++nonce.current } : null);
    if (part) setSelectedElement(null);
  }, []);
  const selectElement = useCallback((id: string | null) => {
    setSelectedElement(id);
    if (id) setSelection(null);
  }, []);
  // A different design (new analysis, sample opened or closed) starts with nothing selected.
  useEffect(() => {
    setSelection(null);
    setSelectedElement(null);
  }, [design.meta]);
  // The selected drawing is gone (deleted, or its stroke was undone): nothing is selected any more.
  useEffect(() => {
    if (selectedElement && !design.customElements.some((e) => e.id === selectedElement)) setSelectedElement(null);
  }, [design.customElements, selectedElement]);

  // Export uses a fresh buildFlat string for the current spec, never the on-screen SVG,
  // so selection and hover styling cannot get into the file.
  const exportCurrent = useCallback(
    async (format: ExportFormat) => {
      if (!design.spec) throw new Error("There is nothing to export yet.");
      return exportFlat(buildFlat(design.spec, design.customElements), PROJECT_NAME, format);
    },
    [design.spec, design.customElements],
  );

  // The pen tool. Only usable while a flat is on the canvas; a new design starts back on Select.
  const [tool, setTool] = useState<CanvasTool>("select");
  useEffect(() => setTool("select"), [canvas.status, design.meta]);
  const drawStroke = useCallback((points: Point[]) => dispatch({ type: "draw", id: newElementId(), points }), []);

  // Changing, moving and deleting hand drawn elements. A drag or a stretch of typing is one undo step.
  const updateElement = useCallback(
    (id: string, patch: ElementPatch, coalesce?: string) => dispatch({ type: "update", id, patch, coalesce }),
    [],
  );
  const moveElement = useCallback(
    (id: string, x: number, y: number) =>
      dispatch({ type: "update", id, patch: { transform: { x, y } }, coalesce: `element:${id}:move` }),
    [],
  );
  const deleteElement = useCallback((id: string) => dispatch({ type: "delete", id }), []);

  // Delete or Backspace removes the selected drawing, but never while typing in a text box.
  useEffect(() => {
    if (!selectedElement || canvas.status !== "ready") return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.key !== "Delete" && e.key !== "Backspace") || e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      e.preventDefault();
      dispatch({ type: "delete", id: selectedElement });
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selectedElement, canvas.status]);

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

  const selectedElementData = selectedElement ? design.customElements.find((e) => e.id === selectedElement) ?? null : null;
  const matchBodice = useCallback((part: PartName) => dispatch({ type: "follow", part }), []);
  const commitEdit = useCallback(() => dispatch({ type: "commit" }), []);

  // Undo and redo step through the spec history kept by the reducer.
  const historyOn = canvas.status === "ready";
  const undo = useCallback(() => dispatch({ type: "undo" }), []);
  const redo = useCallback(() => dispatch({ type: "redo" }), []);
  useUndoShortcuts({ enabled: historyOn, onUndo: undo, onRedo: redo });
  const showSample = useCallback(
    () => dispatch({ type: "load", spec: mockSpec, meta: { source: "sample" } }),
    [],
  );
  const hideSample = useCallback(() => dispatch({ type: "clear", source: "sample" }), []);

  const browse = () => inputRef.current?.click();
  const onInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setLeftTab("sketch");
      void sketch.accept(file);
    }
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
          projectName={PROJECT_NAME}
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
            libraryCount={library.state.status === "ready" ? library.state.parts.length : null}
          >
            {leftTab === "sketch" ? (
              <UploadPanel
                state={sketch.state}
                onBrowse={browse}
                onFile={(f) => void sketch.accept(f)}
                onClear={sketch.clear}
              />
            ) : (
              <LibraryPanel
                state={library.state}
                onReload={() => void library.load()}
                canApply={canvas.status === "ready"}
                onApply={applyPart}
                onDelete={deleteSavedPart}
              />
            )}
          </LeftPanel>
          <ErrorBoundary resetKey={design.spec} fallback={(reset, error) => <CanvasCrash error={error} onRetry={reset} />}>
          <CanvasStage
            state={canvas}
            hasSketch={sketch.state.status === "ready"}
            onShowSample={showSample}
            onHideSample={hideSample}
            onUpload={browse}
            onRetry={analysis.retry}
            selectedPart={canvas.status === "ready" ? (selection?.part ?? null) : null}
            onSelectPart={selectPart}
            elements={design.customElements}
            selectedElement={canvas.status === "ready" ? selectedElement : null}
            onSelectElement={selectElement}
            onMoveElement={moveElement}
            onMoveEnd={commitEdit}
            tool={canvas.status === "ready" ? tool : "select"}
            onToolChange={setTool}
            canDraw={design.customElements.length < MAX_ELEMENTS}
            onStroke={drawStroke}
          />
          </ErrorBoundary>
          <ErrorBoundary resetKey={design.spec} fallback={(reset, error) => <PanelCrash error={error} onRetry={reset} />}>
          {canvas.status === "ready" && selectedElementData ? (
            <ElementPanel
              element={selectedElementData}
              onUpdate={(patch, coalesce) => updateElement(selectedElementData.id, patch, coalesce)}
              onCommit={commitEdit}
              onDelete={() => deleteElement(selectedElementData.id)}
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
          />
          )}
          </ErrorBoundary>
        </div>
      </div>
    </div>
  );
}
