import { useRef, useState, type PointerEvent } from "react";
import { FLAT_SIZE } from "../../../Builder/buildFlat";
import { addPoint, clientToCanvas, finishStroke, STROKE_COLOR, STROKE_WIDTH, type Point } from "../draw/strokes";

interface Props {
  /** Called with the finished, simplified stroke (400 by 600 canvas units). */
  onStroke: (points: Point[]) => void;
}

/**
 * A transparent layer over the flat that turns a press and drag into a freehand stroke.
 *
 * It is an SVG with the same viewBox as the flat, covering the same box, so its screen matrix
 * is the flat's: pointer positions convert to canvas units exactly, at any zoom or scroll.
 * While drawing it shows the stroke as it grows; nothing is stored until the pointer is released.
 */
export function DrawLayer({ onStroke }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const raw = useRef<Point[]>([]);
  const active = useRef<number | null>(null);
  const [draft, setDraft] = useState<Point[]>([]);

  const reset = () => {
    active.current = null;
    raw.current = [];
    setDraft([]);
  };

  const canvasPoint = (clientX: number, clientY: number) =>
    svgRef.current ? clientToCanvas(svgRef.current, clientX, clientY) : null;

  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0 || active.current !== null) return; // left button or touch, one stroke at a time
    const p = canvasPoint(e.clientX, e.clientY);
    if (!p) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    active.current = e.pointerId;
    raw.current = [p];
    setDraft(raw.current);
    e.preventDefault();
  };

  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    if (active.current !== e.pointerId) return;
    // Fast pointers skip positions between events; the coalesced events fill them in.
    const events = e.nativeEvent.getCoalescedEvents?.() ?? [];
    for (const ev of events.length ? events : [e.nativeEvent]) {
      const p = canvasPoint(ev.clientX, ev.clientY);
      if (p) raw.current = addPoint(raw.current, p);
    }
    setDraft(raw.current);
  };

  const onPointerUp = (e: PointerEvent<SVGSVGElement>) => {
    if (active.current !== e.pointerId) return;
    const last = canvasPoint(e.clientX, e.clientY);
    const path = last ? addPoint(raw.current, last) : raw.current;
    reset();
    const stroke = finishStroke(path);
    if (stroke) onStroke(stroke); // a click without dragging is not a stroke
  };

  return (
    <svg
      ref={svgRef}
      className="draw-layer"
      viewBox={`0 0 ${FLAT_SIZE.width} ${FLAT_SIZE.height}`}
      role="group"
      aria-label="Drawing area. Press and drag to draw a stroke. Press Escape to stop drawing."
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={reset}
      onClick={(e) => e.stopPropagation()} // a stroke ending in a click must not also deselect a part
    >
      {draft.length > 1 && (
        <polyline
          points={draft.map((p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(" ")}
          fill="none"
          stroke={STROKE_COLOR}
          strokeWidth={STROKE_WIDTH}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}
