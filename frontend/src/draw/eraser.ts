// Eraser: no React, no state. Works only on hand drawn elements; the dress is never touched.
// An erased line becomes zero or more ordinary elements, so undo, layers and export keep working.

import type { CustomElement } from "../../../Builder/buildFlat";
import { drawingBounds } from "./drawings";
import type { Point } from "./strokes";

export type EraserMode = "whole" | "partial";

/** The eraser's radius in canvas units (the dress is 400 wide). */
export const ERASER_RADIUS = 7;

/** Pieces shorter than this (canvas units) are crumbs and are dropped. */
const MIN_PIECE = 1;
/** At most this many samples per segment, so a huge scaled stroke can't stall the page. */
const MAX_SAMPLES = 2000;

type Matrix = [number, number, number, number, number, number];

/** The element's own points to canvas: scale, rotate around the origin, then move (as the builder draws it). */
function matrixOf(e: CustomElement): Matrix {
  const t = e.transform;
  const r = (t.rotation * Math.PI) / 180;
  return [t.scale_x * Math.cos(r), t.scale_x * Math.sin(r), -t.scale_y * Math.sin(r), t.scale_y * Math.cos(r), t.x, t.y];
}
const apply = (m: Matrix, p: Point): Point => [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]];

function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lengthSquared));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** The eraser's path as segments (a single press is one segment of zero length). */
function segmentsOf(path: Point[]): [Point, Point][] {
  if (path.length === 1) return [[path[0], path[0]]];
  return path.slice(1).map((p, i): [Point, Point] => [path[i], p]);
}

function underEraser(p: Point, segments: [Point, Point][], reach: number): boolean {
  return segments.some(([a, b]) => distanceToSegment(p, a, b) <= reach);
}

function insidePolygon(p: Point, polygon: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Walks the element's outline in small steps and calls `visit` for each sample, with its position
 * in canvas units and in the element's own units, plus whether the sample is one of the element's
 * own points. Steps are measured on the canvas, so a scaled up element is sampled just as finely.
 */
function walk(
  e: CustomElement,
  m: Matrix,
  step: number,
  visit: (canvas: Point, local: Point, isVertex: boolean, first: boolean) => void,
) {
  const local = e.closed ? [...e.points, e.points[0]] : e.points;
  const canvas = local.map((p) => apply(m, p));
  visit(canvas[0], local[0], true, true);
  for (let i = 0; i < local.length - 1; i++) {
    const length = Math.hypot(canvas[i + 1][0] - canvas[i][0], canvas[i + 1][1] - canvas[i][1]);
    const n = Math.min(MAX_SAMPLES, Math.max(1, Math.ceil(length / step)));
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      const lp: Point = [local[i][0] + (local[i + 1][0] - local[i][0]) * t, local[i][1] + (local[i + 1][1] - local[i][1]) * t];
      visit(apply(m, lp), lp, k === n, false);
    }
  }
}

/** How far from its center line an element counts as touched: the eraser plus half the drawn line width. */
function reachFor(e: CustomElement, radius: number) {
  return radius + (e.stroke_width * Math.max(e.transform.scale_x, e.transform.scale_y)) / 2;
}

function touches(e: CustomElement, segments: [Point, Point][], radius: number): boolean {
  const m = matrixOf(e);
  const reach = reachFor(e, radius);
  let hit = false;
  walk(e, m, radius / 3, (p) => {
    if (!hit && underEraser(p, segments, reach)) hit = true;
  });
  if (hit || !e.closed || e.fill === null) return hit;
  // A filled shape is also touched by rubbing over its inside.
  const polygon = e.points.map((p) => apply(m, p));
  return segments.some(([a, b]) => insidePolygon(a, polygon) || insidePolygon(b, polygon));
}

/** The parts of an open line the eraser missed, in the element's own units. */
function survivingPieces(e: CustomElement, segments: [Point, Point][], radius: number): Point[][] {
  const reach = reachFor(e, radius);
  const pieces: Point[][] = [];
  let current: Point[] | null = null;
  let lastOut: Point | null = null;
  let lastOutCanvas: Point | null = null;
  let pieceLength = 0;
  const finish = () => {
    if (current && lastOut) {
      const end = current[current.length - 1];
      if (end[0] !== lastOut[0] || end[1] !== lastOut[1]) current.push(lastOut);
      if (current.length >= 2 && pieceLength >= MIN_PIECE) pieces.push(current);
    }
    current = null;
    pieceLength = 0;
  };
  walk(e, matrixOf(e), radius / 4, (canvas, local, isVertex) => {
    if (underEraser(canvas, segments, reach)) {
      finish();
      lastOut = null;
      lastOutCanvas = null;
      return;
    }
    if (!current) current = [local];
    else if (isVertex) current.push(local);
    if (lastOutCanvas) pieceLength += Math.hypot(canvas[0] - lastOutCanvas[0], canvas[1] - lastOutCanvas[1]);
    lastOut = local;
    lastOutCanvas = canvas;
  });
  finish();
  return pieces;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The drawn elements after one stretch of the eraser's path (canvas units). Hidden elements are left
 * alone. In "whole" mode every touched element is removed. In "partial" mode an open line loses only
 * what the eraser went over and may split into several elements (the first keeps the original id and
 * name, the others get new ids and the same style, transform, group and layer); closed shapes are
 * removed whole. Returns the same array when nothing was touched.
 */
export function erase(
  elements: CustomElement[],
  path: Point[],
  mode: EraserMode,
  newId: () => string,
  radius = ERASER_RADIUS,
): CustomElement[] {
  if (path.length === 0) return elements;
  const segments = segmentsOf(path);
  const xs = path.map((p) => p[0]);
  const ys = path.map((p) => p[1]);
  const area = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  let changed = false;
  const next: CustomElement[] = [];
  for (const e of elements) {
    const box = drawingBounds([e]);
    const near =
      e.visible !== false && box !== null &&
      box[0] <= area[2] + radius && box[2] >= area[0] - radius && box[1] <= area[3] + radius && box[3] >= area[1] - radius;
    if (!near || !touches(e, segments, radius)) {
      next.push(e);
      continue;
    }
    changed = true;
    if (mode === "whole" || e.closed) continue;
    survivingPieces(e, segments, radius).forEach((points, i) => {
      next.push({
        ...e,
        id: i === 0 ? e.id : newId(),
        points: points.map((p): Point => [round2(p[0]), round2(p[1])]),
        transform: { ...e.transform },
      });
    });
  }
  return changed ? next : elements;
}
