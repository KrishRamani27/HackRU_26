import type { CustomElement } from "../../../Builder/buildFlat";
import { COORD_LIMIT } from "./strokes";

// Resizing and rotating drawn elements. Pure functions, no React.
//
// The contract (and the builder) draw an element as translate(x y) rotate(r) scale(sx sy) applied to its
// points: scale first, then rotate around the canvas origin (0,0), then move. So to keep an element where the
// user expects, every resize or rotate has to adjust x and y as well as the scale or rotation.

export type Pt = [number, number];
export type ElementTransform = CustomElement["transform"];

export const MIN_SCALE = 0.01;
export const MAX_SCALE = 100;
const EPS = 1e-6;

const rad = (deg: number) => (deg * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
const round2 = (n: number) => Math.round(n * 100) / 100;
const round4 = (n: number) => Math.round(n * 10000) / 10000;
const clampN = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const clampCoord = (n: number) => round2(clampN(n, -COORD_LIMIT, COORD_LIMIT));

/** Folds any angle into -180..180 (inclusive of 180), which is inside the contract's -360..360. */
export function wrapAngle(a: number): number {
  const m = ((a % 360) + 360) % 360;
  return m > 180 ? m - 360 : m;
}

/** Where a point of the element lands on the canvas. */
export function toWorld(t: ElementTransform, p: Pt): Pt {
  const r = rad(t.rotation);
  const x = t.scale_x * p[0];
  const y = t.scale_y * p[1];
  return [t.x + x * Math.cos(r) - y * Math.sin(r), t.y + x * Math.sin(r) + y * Math.cos(r)];
}

/** The element's own bounding box (before its transform). Stroke width is not counted. */
export function localBounds(el: CustomElement): { x0: number; y0: number; x1: number; y1: number } {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of el.points) {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return { x0, y0, x1, y1 };
}

/** A rectangle that may be turned: its center on the canvas, its angle in degrees, and its size. */
export interface Frame {
  cx: number;
  cy: number;
  angle: number;
  w: number;
  h: number;
}

/**
 * The box shown around a selection. One element gets an exact box that turns with it. Several elements
 * get the straight (axis aligned) box around all of them. Hidden elements are not counted.
 */
export function frameOf(elements: readonly CustomElement[]): Frame | null {
  const shown = elements.filter((e) => e.visible !== false && e.points.length > 0);
  if (shown.length === 0) return null;
  if (shown.length === 1) {
    const el = shown[0];
    const b = localBounds(el);
    const [cx, cy] = toWorld(el.transform, [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2]);
    return { cx, cy, angle: el.transform.rotation, w: el.transform.scale_x * (b.x1 - b.x0), h: el.transform.scale_y * (b.y1 - b.y0) };
  }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const el of shown) {
    for (const p of el.points) {
      const [x, y] = toWorld(el.transform, p);
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, angle: 0, w: x1 - x0, h: y1 - y0 };
}

/** Corner signs in the frame's own axes: 0 top left, 1 top right, 2 bottom right, 3 bottom left. */
export const CORNER_SIGNS: readonly Pt[] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];

export function frameToWorld(f: Frame, lx: number, ly: number): Pt {
  const a = rad(f.angle);
  return [f.cx + lx * Math.cos(a) - ly * Math.sin(a), f.cy + lx * Math.sin(a) + ly * Math.cos(a)];
}

export function worldToFrame(f: Frame, p: Pt): Pt {
  const a = rad(f.angle);
  const dx = p[0] - f.cx;
  const dy = p[1] - f.cy;
  return [dx * Math.cos(a) + dy * Math.sin(a), -dx * Math.sin(a) + dy * Math.cos(a)];
}

export function frameCorner(f: Frame, corner: number): Pt {
  const [sx, sy] = CORNER_SIGNS[corner];
  return frameToWorld(f, (sx * f.w) / 2, (sy * f.h) / 2);
}

export type TransformPatch = Partial<ElementTransform>;

/** A quarter turn (0, 90, 180, 270 degrees apart) keeps a straight box straight. */
function quarterTurns(angle: number): number | null {
  const q = Math.round(angle / 90);
  return Math.abs(angle - q * 90) < 0.011 ? q : null;
}

/**
 * Resizes the elements by dragging one corner of the frame, around the opposite corner (which stays put).
 * `start` are the elements as they were when the drag began and `frame` is their frame then.
 *
 * Scaling happens along the frame's own axes. The contract can only scale an element along its own axes, so
 * if an element sits at some other angle than the frame (a group that was turned) a free stretch would
 * shear it; then the resize is forced to keep proportions instead. Scales stay within 0.01..100.
 */
export function resizeElements(
  start: readonly CustomElement[],
  frame: Frame,
  corner: number,
  pointer: Pt,
  keepRatio: boolean,
): Map<string, TransformPatch> | null {
  const [sx, sy] = CORNER_SIGNS[corner];
  const wide = frame.w > EPS;
  const tall = frame.h > EPS;
  if (!wide && !tall) return null;
  const [px, py] = worldToFrame(frame, pointer);
  // The factor each frame axis grows by: pointer distance from the fixed opposite edge over the old size.
  let fx = wide ? (px + (sx * frame.w) / 2) / frame.w * sx : 1;
  let fy = tall ? (py + (sy * frame.h) / 2) / frame.h * sy : 1;

  const aligned = start.every((e) => quarterTurns(e.transform.rotation - frame.angle) !== null);
  if (keepRatio || !aligned) {
    const k = !wide ? fy : !tall ? fx : Math.abs(fx - 1) >= Math.abs(fy - 1) ? fx : fy;
    fx = k;
    fy = k;
  }

  // Keep every scale inside the contract's limits.
  const scales = start.flatMap((e) => [e.transform.scale_x, e.transform.scale_y]);
  const lo = MIN_SCALE / Math.min(...scales);
  const hi = MAX_SCALE / Math.max(...scales);
  if (lo > hi) return null;
  fx = clampN(fx, lo, hi);
  fy = clampN(fy, lo, hi);

  const anchor = frameToWorld(frame, (-sx * frame.w) / 2, (-sy * frame.h) / 2);
  const a = rad(frame.angle);
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const out = new Map<string, TransformPatch>();
  for (const e of start) {
    const t = e.transform;
    // Move the element's origin with the same stretch: into the frame's axes, scale, and back.
    const dx = t.x - anchor[0];
    const dy = t.y - anchor[1];
    const lx = (dx * cos + dy * sin) * fx;
    const ly = (-dx * sin + dy * cos) * fy;
    const quarter = quarterTurns(t.rotation - frame.angle) ?? 0;
    const odd = Math.abs(quarter) % 2 === 1; // turned a quarter: its own x axis lies along the frame's y
    out.set(e.id, {
      x: clampCoord(anchor[0] + lx * cos - ly * sin),
      y: clampCoord(anchor[1] + lx * sin + ly * cos),
      scale_x: round4(clampN(t.scale_x * (odd ? fy : fx), MIN_SCALE, MAX_SCALE)),
      scale_y: round4(clampN(t.scale_y * (odd ? fx : fy), MIN_SCALE, MAX_SCALE)),
    });
  }
  return out;
}

/** Turns the elements by `delta` degrees around a point on the canvas (the selection's center). */
export function rotateElements(start: readonly CustomElement[], center: Pt, delta: number): Map<string, TransformPatch> {
  const c = Math.cos(rad(delta));
  const s = Math.sin(rad(delta));
  const out = new Map<string, TransformPatch>();
  for (const e of start) {
    const t = e.transform;
    const dx = t.x - center[0];
    const dy = t.y - center[1];
    out.set(e.id, {
      x: clampCoord(center[0] + dx * c - dy * s),
      y: clampCoord(center[1] + dx * s + dy * c),
      rotation: round2(wrapAngle(t.rotation + delta)),
    });
  }
  return out;
}

/** The angle, in degrees, of a point as seen from a center. */
export const angleAround = (center: Pt, p: Pt) => deg(Math.atan2(p[1] - center[1], p[0] - center[0]));

/**
 * Exact numbers for one element (the scale and rotation fields): the new scale or rotation is applied around
 * the center of the element's box, so it stays where it is instead of swinging around the canvas origin.
 */
export function setAroundCenter(el: CustomElement, change: { scale_x?: number; scale_y?: number; rotation?: number }): TransformPatch {
  const b = localBounds(el);
  const local: Pt = [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2];
  const center = toWorld(el.transform, local);
  const next: ElementTransform = { ...el.transform, ...change };
  const moved = toWorld({ ...next, x: 0, y: 0 }, local); // where the center lands with no translation
  return {
    ...(change.scale_x !== undefined ? { scale_x: change.scale_x } : {}),
    ...(change.scale_y !== undefined ? { scale_y: change.scale_y } : {}),
    ...(change.rotation !== undefined ? { rotation: change.rotation } : {}),
    x: clampCoord(center[0] - moved[0]),
    y: clampCoord(center[1] - moved[1]),
  };
}
