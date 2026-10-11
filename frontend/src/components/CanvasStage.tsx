import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import type { PartName } from "../../../Builder/types";
import type { CustomElement } from "../../../Builder/buildFlat";
import type { CanvasState } from "../types";
import { PART_LABELS } from "../state/specSchema";
import type { Point } from "../draw/strokes";
import { expandGroups } from "../draw/groups";
import { DrawLayer } from "./DrawLayer";
import { AlertIcon, CheckIcon, CursorIcon, EyeIcon, FitIcon, PenIcon, UploadIcon, ZoomInIcon, ZoomOutIcon } from "./Icons";
import { InlineFlat } from "./InlineFlat";
import { SelectionBox } from "./SelectionBox";
import type { TransformPatch } from "../draw/transform";
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
  /** The hand drawn elements, the one selected (if any), and what to do when one is picked or dragged. */
  elements: readonly CustomElement[];
  selectedElements: readonly string[];
  onSelectElements: (ids: string[]) => void;
  onMoveElements: (moves: { id: string; x: number; y: number }[]) => void;
  onMoveEnd: () => void;
  /** Resize or rotate: new transform values per element. Called repeatedly during one drag. */
  onTransformElements: (changes: Map<string, TransformPatch>) => void;
  /** Dress parts hidden on the canvas only. */
  hiddenParts: readonly PartName[];
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

export function CanvasStage({ state, hasSketch, onShowSample, onHideSample, onUpload, onRetry, selectedPart, onSelectPart, elements, selectedElements, onSelectElements, onMoveElements, onMoveEnd, onTransformElements, hiddenParts, tool, onToolChange, canDraw, onStroke }: Props) {
  const [zoomIndex, setZoomIndex] = useState(FIT_INDEX);
  const sampling = state.status === "ready" && state.source === "sample";
  const hasArt = state.status === "ready";
  const zoom = hasArt ? ZOOM_STEPS[zoomIndex] : 1;

  useEffect(() => setZoomIndex(FIT_INDEX), [hasArt]);

  // Escape leaves the pen tool first; with the select tool it deselects the part. Ignored while
  // typing, so it can't interfere with the notes field.
  useEffect(() => {
    if (tool !== "pen" && !selectedPart && selectedElements.length === 0) return;
    const onKey = (e: KeyboardEvent) => {
      // defaultPrevented: another control (e.g. the Export menu) already used this Escape.
      if (e.key !== "Escape" || e.defaultPrevented || e.target instanceof HTMLTextAreaElement) return;
      if (tool === "pen") onToolChange("select");
      else if (selectedPart) onSelectPart(null);
      else onSelectElements([]);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [tool, selectedPart, selectedElements, onSelectPart, onSelectElements, onToolChange]);

  // Dragging a box on empty canvas selects every drawn element inside it (Shift adds to the selection).
  // It only starts once the pointer has really moved, so a plain click still reaches the dress part or
  // clears the selection as before.
  const canvasRef = useRef<HTMLDivElement>(null);
  const boxDrag = useRef<{ pointerId: number; x0: number; y0: number; started: boolean } | null>(null);
  const swallowClick = useRef(false);
  const [box, setBox] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);

  const onBoxDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (tool !== "select" || !hasArt || e.button !== 0) return;
    if ((e.target as Element).closest("button, input, textarea, select, a")) return;
    boxDrag.current = { pointerId: e.pointerId, x0: e.clientX, y0: e.clientY, started: false };
  };
  const onBoxMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = boxDrag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    if (!d.started) {
      if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 4) return;
      d.started = true;
      e.currentTarget.setPointerCapture(e.pointerId); // only now, so a plain click still reaches what is under it
    }
    setBox({ x0: d.x0, y0: d.y0, x1: e.clientX, y1: e.clientY });
  };
  const onBoxUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = boxDrag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    boxDrag.current = null;
    if (!d.started) return;
    setBox(null);
    swallowClick.current = true; // the click that ends a drag must not deselect what the box just selected
    const left = Math.min(d.x0, e.clientX), right = Math.max(d.x0, e.clientX);
    const top = Math.min(d.y0, e.clientY), bottom = Math.max(d.y0, e.clientY);
    const inside: string[] = [];
    canvasRef.current?.querySelectorAll<SVGGElement>(".flat-inline [data-element]").forEach((g) => {
      const r = (g.querySelector("path:not([data-ui])") ?? g).getBoundingClientRect();
      if (r.left >= left && r.right <= right && r.top >= top && r.bottom <= bottom) inside.push(g.getAttribute("data-element")!);
    });
    // A group counts as inside when any of its members is, and is then selected whole.
    onSelectElements(expandGroups(e.shiftKey ? [...selectedElements, ...inside] : inside, elements));
  };
  const onBoxCancel = () => {
    boxDrag.current = null;
    setBox(null);
  };

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
        ref={canvasRef}
        className={`stage__canvas${zoom > 1 ? " is-zoomed" : ""}`}
        aria-busy={state.status === "loading"}
        onPointerDown={onBoxDown}
        onPointerMove={onBoxMove}
        onPointerUp={onBoxUp}
        onPointerCancel={onBoxCancel}
        onClickCapture={(e) => {
          if (swallowClick.current) {
            swallowClick.current = false;
            e.stopPropagation();
          }
        }}
        // Parts stop propagation on their own click, so anything reaching here is empty canvas.
        onClick={() => {
          onSelectPart(null);
          onSelectElements([]);
        }}
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
              elements={elements}
              selectedElements={selectedElements}
              onSelectElements={onSelectElements}
              onMoveElements={onMoveElements}
              onMoveEnd={onMoveEnd}
              hiddenParts={hiddenParts}
            />
            {tool === "select" && selectedElements.length > 0 && (
              <SelectionBox
                elements={elements}
                selectedElements={selectedElements}
                zoom={zoom}
                onTransform={onTransformElements}
                onTransformEnd={onMoveEnd}
              />
            )}
            {tool === "pen" && <DrawLayer onStroke={onStroke} />}
            </div>
            {tool === "pen" ? (
              <span className="sheet__selected" role="status">Pen · drag to draw · Esc to stop</span>
            ) : (
              (selectedPart || selectedElements.length > 0) && (
                <span className="sheet__selected" role="status">
                  Selected · {selectedPart
                    ? PART_LABELS[selectedPart]
                    : selectedElements.length === 1
                      ? elements.find((e) => e.id === selectedElements[0])?.name
                      : `${selectedElements.length} drawings`}
                </span>
              )
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
      {box &&
        createPortal(
          <div
            className="selection-box"
            aria-hidden="true"
            style={{ left: Math.min(box.x0, box.x1), top: Math.min(box.y0, box.y1), width: Math.abs(box.x1 - box.x0), height: Math.abs(box.y1 - box.y0) }}
          />,
          document.body,
        )}
    </main>
  );
}
