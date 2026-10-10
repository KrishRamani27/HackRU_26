import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { NavRail } from "./components/NavRail";
import { TopBar } from "./components/TopBar";
import { UploadPanel } from "./components/UploadPanel";
import { CanvasStage } from "./components/CanvasStage";
import { PropertiesPanel } from "./components/PropertiesPanel";
import { ACCEPT_ATTR, useSketchUpload } from "./hooks/useSketchUpload";
import { useAnalysis } from "./hooks/useAnalysis";
import type { AiMode, CanvasState } from "./types";

/**
 * Dev-only: preview canvas states with ?canvas=loading or ?canvas=error.
 * Otherwise the canvas starts empty and is driven by the sketch analysis.
 */
function initialCanvasState(): CanvasState {
  if (import.meta.env.DEV) {
    const preview = new URLSearchParams(window.location.search).get("canvas");
    if (preview === "loading") return { status: "loading" };
    if (preview === "error") {
      return { status: "error", title: "Preview", message: "Preview of the error state. Nothing actually failed." };
    }
  }
  return { status: "empty" };
}

function aiStatus(mode: AiMode) {
  if (mode === "mock") return "Mock AI mode";
  if (mode === "gemini") return "Gemini";
  return "AI mode unknown";
}

export default function App() {
  const sketch = useSketchUpload();
  const inputRef = useRef<HTMLInputElement>(null);
  const [showSample, setShowSample] = useState(false);

  const sketchFile = sketch.state.status === "ready" ? sketch.state.file : null;
  const analysis = useAnalysis(sketchFile, initialCanvasState());
  const canvas = analysis.state;

  // A new sketch supersedes the sample preview.
  useEffect(() => {
    if (sketchFile) setShowSample(false);
  }, [sketchFile]);

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
          status={canvas.status === "ready" ? aiStatus(canvas.aiMode) : null}
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
            showSample={showSample}
            onToggleSample={() => setShowSample((v) => !v)}
            onUpload={browse}
            onRetry={analysis.retry}
          />
          <PropertiesPanel canvas={canvas} />
        </div>
      </div>
    </div>
  );
}
