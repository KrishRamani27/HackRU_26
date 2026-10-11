import { useEffect, useRef, useState, type PointerEvent } from "react";
import { FLAT_SIZE, type CustomElement } from "../../../Builder/buildFlat";
import { clientToCanvas } from "../draw/strokes";
import {
  angleAround, frameCorner, frameOf, frameToWorld, resizeElements, rotateElements, wrapAngle,
  type Frame, type Pt, type TransformPatch,
} from "../draw/transform";

interface Props {
  /** The hand drawn elements, and which of them are selected. */
  elements: readonly CustomElement[];
  selectedElements: readonly string[];
  /** Zoom of the sheet, so handles stay the same size on screen. */
  zoom: number;
  /** Sets new transform values on elements. Called repeatedly during one drag. */
  onTransform: (changes: Map<string, TransformPatch>) => void;
  /** The drag ended, so the next change starts a new undo step. */
  onTransformEnd: () => void;
}

type Gesture =
  | { kind: "resize"; pointerId: number; corner: number; start: CustomElement[]; frame: Frame }
  | { kind: "rotate"; pointerId: number; start: CustomElement[]; frame: Frame; last: number; total: number };

const HANDLE_PX = 9;
const ROTATE_GAP_PX = 24;
const SNAP_DEGREES = 15;
const CORNER_CURSOR = ["nwse-resize", "nesw-resize", "nwse-resize", "nesw-resize"];

/**
 * A thin box with four corner handles and a rotate handle around the selection, drawn on its own SVG layer
 * above the flat. It has the flat's viewBox, so canvas units and pointer positions line up at any zoom.
 * It is a separate React layer, never part of the builder's markup, so it can't reach an export.
 */
export function SelectionBox({ elements, selectedElements, zoom, onTransform, onTransformEnd }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const [unit, setUnit] = useState(1); // canvas units per screen pixel

  useEffect(() => {
    const measure = () => {
      const a = svgRef.current?.getScreenCTM()?.a;
      if (a && a > 0) setUnit(1 / a);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [zoom]);

  const selected = elements.filter((e) => selectedElements.includes(e.id));
  const frame = frameOf(selected);
  const point = (e: PointerEvent): Pt | null => (svgRef.current ? clientToCanvas(svgRef.current, e.clientX, e.clientY) : null);

  const begin = (e: PointerEvent<SVGElement>, make: (frame: Frame, start: CustomElement[], p: Pt) => Gesture) => {
    if (e.button !== 0 || !frame || gesture.current) return;
    const p = point(e);
    if (!p) return;
    e.stopPropagation(); // not a box select, not a click on the canvas
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    gesture.current = make(frame, selected.map((el) => structuredClone(el)), p);
  };

  const onMove = (e: PointerEvent) => {
    const g = gesture.current;
    if (!g || g.pointerId !== e.pointerId) return;
    const p = point(e);
    if (!p) return;
    if (g.kind === "resize") {
      const changes = resizeElements(g.start, g.frame, g.corner, p, e.shiftKey);
      if (changes) onTransform(changes);
    } else {
      // Follow the pointer's turn around the center without jumping when it crosses the opposite side.
      const now = angleAround([g.frame.cx, g.frame.cy], p);
      g.total += wrapAngle(now - g.last);
      g.last = now;
      let delta = g.total;
      if (e.shiftKey) {
        // One element snaps its own angle; several snap how far they turned.
        delta = g.start.length === 1
          ? Math.round((g.start[0].transform.rotation + delta) / SNAP_DEGREES) * SNAP_DEGREES - g.start[0].transform.rotation
          : Math.round(delta / SNAP_DEGREES) * SNAP_DEGREES;
      }
      onTransform(rotateElements(g.start, [g.frame.cx, g.frame.cy], delta));
    }
  };

  const end = (e: PointerEvent) => {
    const g = gesture.current;
    if (!g || g.pointerId !== e.pointerId) return;
    gesture.current = null;
    onTransformEnd(); // one drag is one undo step
  };

  if (!frame) return null;
  const k = unit;
  const half = (HANDLE_PX * k) / 2;
  const corners = [0, 1, 2, 3].map((i) => frameCorner(frame, i));
  const top = frameToWorld(frame, 0, -frame.h / 2);
  const knob = frameToWorld(frame, 0, -frame.h / 2 - ROTATE_GAP_PX * k);

  return (
    <svg
      ref={svgRef}
      className="xform-layer"
      viewBox={`0 0 ${FLAT_SIZE.width} ${FLAT_SIZE.height}`}
      aria-hidden="true"
      onPointerMove={onMove}
      onPointerUp={end}
      onPointerCancel={end}
      onClick={(e) => e.stopPropagation()}
    >
      <polygon className="xform__box" points={corners.map((c) => c.join(",")).join(" ")} vectorEffect="non-scaling-stroke" />
      <line className="xform__stem" x1={top[0]} y1={top[1]} x2={knob[0]} y2={knob[1]} vectorEffect="non-scaling-stroke" />
      {corners.map((c, i) => (
        <rect
          key={i}
          className="xform__handle"
          data-handle={`corner-${i}`}
          x={c[0] - half}
          y={c[1] - half}
          width={half * 2}
          height={half * 2}
          style={{ cursor: CORNER_CURSOR[i] }}
          vectorEffect="non-scaling-stroke"
          onPointerDown={(e) =>
            begin(e, (f, start) => ({ kind: "resize", pointerId: e.pointerId, corner: i, start, frame: f }))
          }
        />
      ))}
      <circle
        className="xform__handle xform__handle--rotate"
        data-handle="rotate"
        cx={knob[0]}
        cy={knob[1]}
        r={half * 1.15}
        vectorEffect="non-scaling-stroke"
        onPointerDown={(e) =>
          begin(e, (f, start, p) => {
            const a = angleAround([f.cx, f.cy], p);
            return { kind: "rotate", pointerId: e.pointerId, start, frame: f, last: a, total: 0 };
          })
        }
      />
    </svg>
  );
}
