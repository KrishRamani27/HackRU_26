import { useEffect, useRef, useState, type PointerEvent } from "react";
import { FLAT_SIZE } from "../../../Builder/buildFlat";
import { addPoint, clientToCanvas, finishStroke, newElementId, STROKE_COLOR, STROKE_WIDTH, type Point } from "../draw/strokes";
import { linePoints, shapeLabel, shapePoints, snapLineEnd, squareEnd, type ShapeKind } from "../draw/shapes";
import { ERASER_RADIUS } from "../draw/eraser";

export type DrawMode = "pen" | "line" | "shapes" | "eraser";

interface Props {
  mode: DrawMode;
  /** Which shape the shapes tool draws. */
  shape: ShapeKind;
  /** A finished stroke, line or shape (400 by 600 canvas units), and how to store it. */
  onDraw: (points: Point[], closed: boolean, label: string) => void;
  /** Eraser: the next stretch of its path (canvas units). `drag` is the same for the whole drag. */
  onErase: (path: Point[], drag: string) => void;
  /** Eraser: the drag ended, so the next one is a new undo step. */
  onEraseEnd: () => void;
}

const HINTS: Record<DrawMode, string> = {
  pen: "Press and drag to draw a stroke.",
  line: "Press and drag to draw a straight line. Hold Shift to snap to 45 degrees.",
  shapes: "Press and drag to draw a shape. Hold Shift to keep its proportions.",
  eraser: "Drag over drawn lines and shapes to erase them. The dress is not affected.",
};

/**
 * A transparent layer over the flat that turns a press and drag into a drawing (pen, line, shape)
 * or an erase.
 *
 * It is an SVG with the same viewBox as the flat, covering the same box, so its screen matrix
 * is the flat's: pointer positions convert to canvas units exactly, at any zoom or scroll.
 * While drawing it shows a preview; nothing is stored until the pointer is released. The eraser
 * is the exception: it erases as it goes, and the whole drag is one undo step.
 */
export function DrawLayer({ mode, shape, onDraw, onErase, onEraseEnd }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const raw = useRef<Point[]>([]);
  const active = useRef<number | null>(null);
  const shift = useRef(false);
  const eraseDrag = useRef<{ key: string; last: Point } | null>(null);
  const [draft, setDraft] = useState<{ points: Point[]; closed: boolean } | null>(null);
  const [cursor, setCursor] = useState<Point | null>(null);

  const reset = () => {
    active.current = null;
    raw.current = [];
    setDraft(null);
    if (eraseDrag.current) {
      eraseDrag.current = null;
      onEraseEnd();
    }
  };

  const canvasPoint = (clientX: number, clientY: number) =>
    svgRef.current ? clientToCanvas(svgRef.current, clientX, clientY) : null;

  /** Line and shape: the points the drag gives right now, with Shift applied. */
  const dragged = (start: Point, end: Point): { points: Point[]; closed: boolean } | null => {
    if (mode === "line") {
      const points = linePoints(start, shift.current ? snapLineEnd(start, end) : end);
      return points && { points, closed: false };
    }
    const points = shapePoints(shape, start, shift.current ? squareEnd(start, end) : end);
    return points && { points, closed: true };
  };

  const preview = () => {
    const points = raw.current;
    if (mode === "pen") setDraft({ points, closed: false });
    else if (points.length >= 2) setDraft(dragged(points[0], points[points.length - 1]));
  };

  // Pressing or releasing Shift mid drag updates the line or shape straight away, without a move.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Shift" || shift.current === e.shiftKey) return;
      shift.current = e.shiftKey;
      if (active.current !== null && (mode === "line" || mode === "shapes")) preview();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
    };
  });

  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0 || active.current !== null) return; // left button or touch, one drag at a time
    const p = canvasPoint(e.clientX, e.clientY);
    if (!p) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    active.current = e.pointerId;
    shift.current = e.shiftKey;
    raw.current = [p];
    e.preventDefault();
    if (mode === "eraser") {
      eraseDrag.current = { key: newElementId(), last: p };
      onErase([p], eraseDrag.current.key);
    } else {
      preview();
    }
  };

  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const here = canvasPoint(e.clientX, e.clientY);
    if (mode === "eraser") setCursor(here);
    if (active.current !== e.pointerId) return;
    shift.current = e.shiftKey;
    // Fast pointers skip positions between events; the coalesced events fill them in.
    const events = e.nativeEvent.getCoalescedEvents?.() ?? [];
    const points: Point[] = [];
    for (const ev of events.length ? events : [e.nativeEvent]) {
      const p = canvasPoint(ev.clientX, ev.clientY);
      if (p) points.push(p);
    }
    if (mode === "eraser") {
      const drag = eraseDrag.current;
      if (!drag || points.length === 0) return;
      onErase([drag.last, ...points], drag.key);
      drag.last = points[points.length - 1];
      return;
    }
    if (mode === "pen") for (const p of points) raw.current = addPoint(raw.current, p);
    else if (points.length) raw.current = [raw.current[0], points[points.length - 1]];
    preview();
  };

  const onPointerUp = (e: PointerEvent<SVGSVGElement>) => {
    if (active.current !== e.pointerId) return;
    shift.current = e.shiftKey;
    const last = canvasPoint(e.clientX, e.clientY);
    const path = raw.current;
    const currentMode = mode;
    reset(); // also ends an erase drag
    if (currentMode === "eraser") return;
    if (currentMode === "pen") {
      const stroke = finishStroke(last ? addPoint(path, last) : path);
      if (stroke) onDraw(stroke, false, "Stroke"); // a click without dragging is not a stroke
      return;
    }
    const result = dragged(path[0], last ?? path[path.length - 1]);
    if (result) onDraw(result.points, result.closed, currentMode === "line" ? "Line" : shapeLabel(shape));
  };

  const pointsAttr = (points: Point[]) => points.map((p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(" ");

  return (
    <svg
      ref={svgRef}
      className={`draw-layer draw-layer--${mode}`}
      viewBox={`0 0 ${FLAT_SIZE.width} ${FLAT_SIZE.height}`}
      role="group"
      aria-label={`Drawing area. ${HINTS[mode]} Press Escape to return to the select tool.`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={reset}
      onPointerLeave={() => setCursor(null)}
      onClick={(e) => e.stopPropagation()} // a drag ending in a click must not also deselect a part
    >
      {draft && draft.points.length > 1 && (
        draft.closed ? (
          <polygon points={pointsAttr(draft.points)} fill="none" stroke={STROKE_COLOR} strokeWidth={STROKE_WIDTH} strokeLinejoin="round" />
        ) : (
          <polyline
            points={pointsAttr(draft.points)}
            fill="none"
            stroke={STROKE_COLOR}
            strokeWidth={STROKE_WIDTH}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )
      )}
      {mode === "eraser" && cursor && (
        <circle className="draw-layer__eraser" cx={cursor[0]} cy={cursor[1]} r={ERASER_RADIUS} />
      )}
    </svg>
  );
}
