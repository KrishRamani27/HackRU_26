import { useEffect, useState, type CSSProperties } from "react";
import type { PartName } from "../../../Builder/types";
import type { CanvasState } from "../types";
import { PART_LABELS } from "../state/specSchema";
import type { Point } from "../draw/strokes";
import { DrawLayer } from "./DrawLayer";
import { AlertIcon, CheckIcon, CursorIcon, EyeIcon, FitIcon, PenIcon, UploadIcon, ZoomInIcon, ZoomOutIcon } from "./Icons";
import { InlineFlat } from "./InlineFlat";
import { LoadingNote } from "./LoadingNote";
import { PlaceholderFlat } from "./PlaceholderFlat";

interface Props {
  state: CanvasState;
  hasSketch: boolean;
  onShowSample: () => void;
  onHideSample: () => void;
  onUpload: () => void;
  onRetry: () => void;
  /** The part picked on the canvas (a Builder group id), if any. */
  selectedPart: PartName | null;
  onSelectPart: (part: PartName | null) => void;
  /** The active tool. With the pen, dragging on the flat draws a freehand stroke. */
  tool: CanvasTool;
  onToolChange: (tool: CanvasTool) => void;
  /** False once the design holds as many drawn elements as the contract allows. */
  canDraw: boolean;
  /** A finished stroke, in 400 by 600 canvas units. */
  onStroke: (points: Point[]) => void;
}

export type CanvasTool = "select" | "pen";

const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];
const FIT_INDEX = 2;
const SAMPLE_LABEL = "Sample preview—not generated from a sketch";
const MOCK_LABEL = "Demo result (mock AI)—not real sketch recognition";

export function CanvasStage({ state, hasSketch, onShowSample, onHideSample, onUpload, onRetry, selectedPart, onSelectPart, tool, onToolChange, canDraw, onStroke }: Props) {
  const [zoomIndex, setZoomIndex] = useState(FIT_INDEX);
  const sampling = state.status === "ready" && state.source === "sample";
  const hasArt = state.status === "ready";
  const zoom = hasArt ? ZOOM_STEPS[zoomIndex] : 1;

  useEffect(() => setZoomIndex(FIT_INDEX), [hasArt]);

  // Escape leaves the pen tool first; with the select tool it deselects the part. Ignored while
  // typing, so it can't interfere with the notes field.
  useEffect(() => {
    if (tool !== "pen" && !selectedPart) return;
    const onKey = (e: KeyboardEvent) => {
      // defaultPrevented: another control (e.g. the Export menu) already used this Escape.
      if (e.key !== "Escape" || e.defaultPrevented || e.target instanceof HTMLTextAreaElement) return;
      if (tool === "pen") onToolChange("select");
      else onSelectPart(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [tool, selectedPart, onSelectPart, onToolChange]);

  const context = state.status === "ready"
    ? state.source === "sample"
      ? { label: "Sample", tone: "sample" }
      : state.aiMode === "mock"
        ? { label: "Demo result", tone: "sample" }
        : state.aiMode === "gemini"
          ? { label: "AI result", tone: "live" }
          : { label: "Result · AI mode unknown", tone: "neutral" }
    : state.status === "loading"
      ? { label: "Analyzing…", tone: "neutral" }
      : state.status === "error"
        ? { label: "Error", tone: "error" }
        : { label: "Placeholder · nothing loaded yet", tone: "neutral" };

  return (
    <main className="stage" aria-labelledby="canvas-heading">
      <div className="stage__toolbar">
        <div className="panel__heading">
          <span className="panel__index" aria-hidden="true">02</span>
          <h2 id="canvas-heading" className="panel__title" tabIndex={-1}>Canvas</h2>
          <span className={`chip chip--${context.tone}`}>{context.label}</span>
        </div>
        <div className="stage__tools">
          {sampling && (
            <button type="button" className="btn btn--ghost btn--sm stage__hide" onClick={onHideSample}>
              Hide sample
            </button>
          )}
          <div className="tools" role="group" aria-label="Tools">
            <button
              type="button"
              className="icon-btn tool-btn"
              aria-label="Select tool"
              aria-pressed={tool === "select"}
              title="Select: click a part of the dress"
              disabled={!hasArt}
              onClick={() => onToolChange("select")}
            >
              <CursorIcon />
            </button>
            <button
              type="button"
              className="icon-btn tool-btn"
              aria-label="Pen tool"
              aria-pressed={tool === "pen"}
              title={canDraw ? "Pen: drag on the flat to draw (Esc to stop)" : "The drawing limit (200 strokes) is reached"}
              disabled={!hasArt || !canDraw}
              onClick={() => onToolChange("pen")}
            >
              <PenIcon />
            </button>
          </div>
          <div className="zoom" role="group" aria-label="Zoom">
            <button
              type="button"
              className="icon-btn"
              aria-label="Zoom out"
              disabled={!hasArt || zoomIndex === 0}
              onClick={() => setZoomIndex((i) => Math.max(0, i - 1))}
            >
              <ZoomOutIcon />
            </button>
            <output className="zoom__value" aria-live="polite">{Math.round(zoom * 100)}%</output>
            <button
              type="button"
              className="icon-btn"
              aria-label="Zoom in"
              disabled={!hasArt || zoomIndex === ZOOM_STEPS.length - 1}
              onClick={() => setZoomIndex((i) => Math.min(ZOOM_STEPS.length - 1, i + 1))}
            >
              <ZoomInIcon />
            </button>
            <button
              type="button"
              className="icon-btn"
              aria-label="Fit to canvas"
              disabled={!hasArt || zoomIndex === FIT_INDEX}
              onClick={() => setZoomIndex(FIT_INDEX)}
            >
              <FitIcon />
            </button>
          </div>
        </div>
      </div>

      <div
        className={`stage__canvas${zoom > 1 ? " is-zoomed" : ""}`}
        aria-busy={state.status === "loading"}
        // Parts stop propagation on their own click, so anything reaching here is empty canvas.
        onClick={() => onSelectPart(null)}
      >
        {hasArt && (
          <div className="sheet sheet--art" style={{ "--zoom": zoom } as CSSProperties}>
            {state.source === "sample" && <span className="sheet__tag sheet__tag--sample">{SAMPLE_LABEL}</span>}
            {state.source === "analysis" && state.aiMode === "mock" && (
              <span className="sheet__tag sheet__tag--sample">{MOCK_LABEL}</span>
            )}
            <div className="flat-wrap">
            <InlineFlat
              markup={state.svgMarkup}
              label={
                state.source === "sample"
                  ? "Sample technical flat of a dress. Not generated from a sketch. Select a part to edit it."
                  : state.aiMode === "mock"
                    ? "Demo technical flat from the backend's mock AI. Not recognized from the sketch. Select a part to edit it."
                    : "Generated technical flat. Select a part to edit it."
              }
              selected={selectedPart}
              onSelect={onSelectPart}
            />
            {tool === "pen" && <DrawLayer onStroke={onStroke} />}
            </div>
            {tool === "pen" ? (
              <span className="sheet__selected" role="status">Pen · drag to draw · Esc to stop</span>
            ) : (
              selectedPart && <span className="sheet__selected" role="status">Selected · {PART_LABELS[selectedPart]}</span>
            )}
          </div>
        )}

        {state.status === "empty" && (
          <div className="sheet sheet--empty">
            <div className="empty-canvas">
              <div className="empty-canvas__figure"><PlaceholderFlat /></div>
              <div className="empty-canvas__copy">
                <p className="display-title">
                  {hasSketch ? "Sketch ready" : "Begin with a sketch"}
                </p>
                <p className="muted">
                  {hasSketch
                    ? "Your sketch is in place. You can also view an editable sample."
                    : "Upload a front-view sketch. The backend reads its design, and the technical flat is drawn here."}
                </p>
              </div>
              <div className="empty-canvas__actions">
                {!hasSketch && (
                  <button type="button" className="btn btn--primary" onClick={onUpload}>
                    <UploadIcon />
                    <span>Upload sketch</span>
                  </button>
                )}
                <button type="button" className="btn btn--ghost" onClick={onShowSample}>
                  <EyeIcon />
                  <span>View sample</span>
                </button>
              </div>
              <ol className="steps" aria-label="How the workbench works">
                <li className={hasSketch ? "is-done" : "is-current"}>
                  <span className="steps__num">{hasSketch ? <CheckIcon width={13} height={13} /> : "1"}</span>
                  Upload sketch
                </li>
                <li className={hasSketch ? "is-current" : undefined}>
                  <span className="steps__num">2</span>
                  Generate flat
                </li>
                <li>
                  <span className="steps__num">3</span>
                  Refine parts
                </li>
              </ol>
            </div>
          </div>
        )}

        {state.status === "loading" && (
          <div className="sheet sheet--empty" role="status">
            <div className="empty-canvas">
              <div className="skeleton" aria-hidden="true" />
              <div className="empty-canvas__copy">
                <p className="display-title">Reading your sketch…</p>
                <LoadingNote />
              </div>
              <div className="progress-line" aria-hidden="true">
                <span className="progress-line__bar" />
              </div>
            </div>
          </div>
        )}

        {state.status === "error" && (
          <div className="sheet sheet--empty">
            <div className="empty-canvas">
              <div className="notice notice--error notice--center" role="alert">
                <AlertIcon />
                <div>
                  <p className="notice__title">{state.title ?? "Couldn’t display the flat"}</p>
                  <p>{state.message}</p>
                  {hasSketch && (
                    <button type="button" className="btn btn--ghost btn--sm notice__action" onClick={onRetry}>
                      Try again
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
