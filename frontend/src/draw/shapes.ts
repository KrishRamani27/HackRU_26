// Line and shape tools: no React, no state. Every result is a plain point list for an ordinary
// custom element (type "stroke", closed or not), so it behaves like a pen stroke everywhere else.

import { COORD_LIMIT, type Point } from "./strokes";

export type ShapeKind = "rectangle" | "ellipse" | "triangle" | "star" | "heart";

export const SHAPE_KINDS: { kind: ShapeKind; label: string }[] = [
  { kind: "rectangle", label: "Rectangle" },
  { kind: "ellipse", label: "Ellipse" },
  { kind: "triangle", label: "Triangle" },
  { kind: "star", label: "Star" },
  { kind: "heart", label: "Heart" },
];

export const shapeLabel = (kind: ShapeKind) => SHAPE_KINDS.find((s) => s.kind === kind)!.label;

/** Drags shorter than this (canvas units) are treated as a click and draw nothing. */
const MIN_SIZE = 2;

const round2 = (n: number) => Math.round(Math.max(-COORD_LIMIT, Math.min(COORD_LIMIT, n)) * 100) / 100;
const roundAll = (points: Point[]) => points.map((p): Point => [round2(p[0]), round2(p[1])]);

/** With Shift, the end of a line snaps to the nearest 0, 45 or 90 degree direction from its start. */
export function snapLineEnd(start: Point, end: Point): Point {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const length = Math.hypot(dx, dy);
  const step = Math.PI / 4;
  const angle = Math.round(Math.atan2(dy, dx) / step) * step;
  return [start[0] + length * Math.cos(angle), start[1] + length * Math.sin(angle)];
}

/** A straight line from start to end, or null if it is too short to keep. */
export function linePoints(start: Point, end: Point): Point[] | null {
  if (Math.hypot(end[0] - start[0], end[1] - start[1]) < MIN_SIZE) return null;
  const points = roundAll([start, end]);
  return points[0][0] === points[1][0] && points[0][1] === points[1][1] ? null : points;
}

/** With Shift, the dragged box becomes a square, growing in the direction of the drag. */
export function squareEnd(start: Point, end: Point): Point {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const side = Math.max(Math.abs(dx), Math.abs(dy));
  return [start[0] + (dx < 0 ? -side : side), start[1] + (dy < 0 ? -side : side)];
}

/**
 * The outline of a shape filling the box from start to end, as the points of a closed element.
 * Ellipse and heart are smooth (many points); rectangle, triangle and star use their corners.
 * Returns null if the box is too small in either direction.
 */
export function shapePoints(kind: ShapeKind, start: Point, end: Point): Point[] | null {
  const left = Math.min(start[0], end[0]);
  const top = Math.min(start[1], end[1]);
  const w = Math.abs(end[0] - start[0]);
  const h = Math.abs(end[1] - start[1]);
  if (w < MIN_SIZE || h < MIN_SIZE) return null;
  const cx = left + w / 2;
  const cy = top + h / 2;
  let points: Point[];
  switch (kind) {
    case "rectangle":
      points = [[left, top], [left + w, top], [left + w, top + h], [left, top + h]];
      break;
    case "triangle":
      points = [[cx, top], [left + w, top + h], [left, top + h]];
      break;
    case "ellipse": {
      const n = 72;
      points = Array.from({ length: n }, (_, i): Point => {
        const a = (i / n) * Math.PI * 2;
        return [cx + (w / 2) * Math.cos(a), cy + (h / 2) * Math.sin(a)];
      });
      break;
    }
    case "star": {
      // Five points, inner radius a little under 40% of the outer one, first point straight up.
      // The star's own box is shorter than it is wide, so it is stretched to fill the dragged box.
      const raw = Array.from({ length: 10 }, (_, i): Point => {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const r = i % 2 === 0 ? 1 : 0.382;
        return [r * Math.cos(a), r * Math.sin(a)];
      });
      points = fitToBox(raw, left, top, w, h);
      break;
    }
    case "heart": {
      // The classic heart curve, sampled finely and fitted to the box.
      const n = 96;
      const raw = Array.from({ length: n }, (_, i): Point => {
        const t = (i / n) * Math.PI * 2;
        return [16 * Math.sin(t) ** 3, -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))];
      });
      points = fitToBox(raw, left, top, w, h);
      break;
    }
  }
  const rounded = roundAll(points);
  // Rounding can make neighbours identical in a tiny shape; drop the repeats.
  const distinct = rounded.filter((p, i) => {
    const prev = rounded[(i - 1 + rounded.length) % rounded.length];
    return i === 0 || p[0] !== prev[0] || p[1] !== prev[1];
  });
  return distinct.length >= 3 ? distinct : null;
}

/** Scales and moves points so their bounding box is exactly the given box. */
function fitToBox(points: Point[], left: number, top: number, w: number, h: number): Point[] {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  return points.map((p): Point => [left + ((p[0] - minX) / (maxX - minX)) * w, top + ((p[1] - minY) / (maxY - minY)) * h]);
}
