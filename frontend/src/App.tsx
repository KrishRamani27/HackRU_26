import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type ChangeEvent } from "react";
import type { PartName } from "../../Builder/types";
import { buildFlat } from "../../Builder/buildFlat";
import { mockSpec } from "../../Builder/mockSpec";
import { NavRail } from "./components/NavRail";
import { TopBar } from "./components/TopBar";
import { UploadPanel } from "./components/UploadPanel";
import { CanvasStage } from "./components/CanvasStage";
import { PropertiesPanel } from "./components/PropertiesPanel";
import { ACCEPT_ATTR, useSketchUpload } from "./hooks/useSketchUpload";
import { useAnalysis } from "./hooks/useAnalysis";
import { initialSpecState, specReducer } from "./state/specReducer";
import type { EditAction } from "./state/specSchema";
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

export default function App() {
  const sketch = useSketchUpload();
  const inputRef = useRef<HTMLInputElement>(null);

  // The one current design spec. Every change goes through this reducer.
  const [design, dispatch] = useReducer(specReducer, initialSpecState);

  const sketchFile = sketch.state.status === "ready" ? sketch.state.file : null;
  const analysis = useAnalysis(sketchFile, dispatch, initialAnalysisStatus());

  // The flat is rebuilt from the spec on every change.
  const flat = useMemo(() => {
    if (!design.spec) return null;
    try {
      return { svg: buildFlat(design.spec) };
    } catch {
      return { svg: null };
    }
  }, [design.spec]);

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
  const selectPart = useCallback((part: PartName | null) => {
    setSelection(part ? { part, nonce: ++nonce.current } : null);
  }, []);
  // A different design (new analysis, sample opened or closed) starts with nothing selected.
  useEffect(() => setSelection(null), [design.meta]);

  const applyEdit = useCallback((action: EditAction) => dispatch({ type: "apply", actions: [action] }), []);
  const showSample = useCallback(
    () => dispatch({ type: "load", spec: mockSpec, meta: { source: "sample" } }),
    [],
  );
  const hideSample = useCallback(() => dispatch({ type: "clear", source: "sample" }), []);

  const browse = () => inputRef.current?.click();
  const onInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void sketch.accept(file);
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
      <NavRail />
      <div className="shell">
        <TopBar
          projectName="Untitled garment"
          onUpload={browse}
          exportEnabled={false}
          status={canvas.status === "ready" && canvas.source === "analysis" ? aiStatus(canvas.aiMode) : null}
        />
        <div className="workspace">
          <UploadPanel
            state={sketch.state}
            onBrowse={browse}
            onFile={(f) => void sketch.accept(f)}
            onClear={sketch.clear}
          />
          <CanvasStage
            state={canvas}
            hasSketch={sketch.state.status === "ready"}
            onShowSample={showSample}
            onHideSample={hideSample}
            onUpload={browse}
            onRetry={analysis.retry}
            selectedPart={canvas.status === "ready" ? (selection?.part ?? null) : null}
            onSelectPart={selectPart}
          />
          <PropertiesPanel
            spec={canvas.status === "ready" ? design.spec : null}
            canvasStatus={canvas.status}
            selection={canvas.status === "ready" ? selection : null}
            onEdit={applyEdit}
          />
        </div>
      </div>
    </div>
  );
}
