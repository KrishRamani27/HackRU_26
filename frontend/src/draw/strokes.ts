// Freehand drawing helpers: no React, no state. The contract for what a drawn element
// looks like is backend/CUSTOM_ELEMENTS.md and backend/contracts/custom-elements.ts.

export type Point = [number, number];

// Defaults for a freehand stroke (phase 1).
export const STROKE_COLOR = "#1C1B1A";
export const STROKE_WIDTH = 2;

// Limits from the contract.
export const MAX_ELEMENTS = 200;
export const MAX_POINTS = 5000;
export const COORD_LIMIT = 10000;

/** Points closer than this (in canvas units) to the last kept point are dropped while drawing. */
const MIN_STEP = 0.4;
/** How far a simplified stroke may drift from what was drawn, in canvas units (the dress is 400 wide). */
const EPSILON = 0.6;

/**
 * Converts a pointer position on screen into the 400 by 600 canvas, whatever the zoom,
 * scroll position or letterboxing. The SVG's own screen matrix knows all of those.
 */
export function clientToCanvas(svg: SVGSVGElement, clientX: number, clientY: number): Point | null {
  const matrix = svg.getScreenCTM();
  if (!matrix) return null;
  const p = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
  return Number.isFinite(p.x) && Number.isFinite(p.y) ? [p.x, p.y] : null;
}

/** Appends a point unless it is practically on top of the previous one. */
export function addPoint(points: Point[], next: Point): Point[] {
  const last = points[points.length - 1];
  if (last && Math.hypot(next[0] - last[0], next[1] - last[1]) < MIN_STEP) return points;
  return [...points, next];
}

function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lengthSquared));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/**
 * Ramer-Douglas-Peucker: keeps the end points and any point that sticks out more than
 * `epsilon` from the straight line between the points kept around it. Iterative, so a
 * very long stroke can't overflow the call stack.
 */
export function simplify(points: Point[], epsilon: number): Point[] {
  if (points.length < 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [start, end] = stack.pop()!;
    let worst = 0;
    let worstIndex = -1;
    for (let i = start + 1; i < end; i++) {
      const d = distanceToSegment(points[i], points[start], points[end]);
      if (d > worst) { worst = d; worstIndex = i; }
    }
    if (worstIndex >= 0 && worst > epsilon) {
      keep[worstIndex] = 1;
      stack.push([start, worstIndex], [worstIndex, end]);
    }
  }
  return points.filter((_, i) => keep[i] === 1);
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * A finished pointer path becomes the points stored on the element: simplified so a
 * stroke is tens or hundreds of points rather than thousands, rounded to two decimals,
 * and always within the contract's limits. Returns null if there is no line to keep.
 */
export function finishStroke(raw: Point[]): Point[] | null {
  let epsilon = EPSILON;
  let points = simplify(raw, epsilon);
  // Absurdly long scribbles: loosen the tolerance until it fits the contract's point limit.
  while (points.length > MAX_POINTS && epsilon < 50) {
    epsilon *= 2;
    points = simplify(raw, epsilon);
  }
  const clean = points
    .filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]))
    .map((p): Point => [round2(Math.max(-COORD_LIMIT, Math.min(COORD_LIMIT, p[0]))), round2(Math.max(-COORD_LIMIT, Math.min(COORD_LIMIT, p[1])))]);
  // Rounding can make neighbours identical; a line needs at least two distinct points.
  const distinct = clean.filter((p, i) => i === 0 || p[0] !== clean[i - 1][0] || p[1] !== clean[i - 1][1]);
  return distinct.length >= 2 && distinct.length <= MAX_POINTS ? distinct : null;
}

/** A unique element id that satisfies the contract (1 to 64 letters, digits, underscores, hyphens). */
export function newElementId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `stroke-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
