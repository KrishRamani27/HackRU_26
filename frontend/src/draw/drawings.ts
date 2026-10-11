import { buildCustomElements } from "../../../Builder/buildFlat";
import type { CustomElement } from "../../../Builder/buildFlat";

/**
 * An independent copy of a saved drawing, ready to add to the current design:
 * - every element gets a new id, so it never collides with the original or an earlier copy;
 * - every group id is replaced by a fresh one (one per original group), so the copy keeps its own
 *   grouping but is separate from other copies;
 * - layer_order starts above everything already drawn, keeping the drawing's own layer spacing;
 * - points, colors, fills and transforms are kept exactly as saved.
 */
export function instantiateDrawing(
  saved: readonly CustomElement[],
  existing: readonly CustomElement[],
  newId: () => string,
): CustomElement[] {
  const groups = new Map<string, string>();
  const lowest = Math.min(...saved.map((e) => e.layer_order ?? 0));
  const base = existing.reduce((max, e) => Math.max(max, e.layer_order), 0) + 1;
  return saved.map((e) => ({
    ...e,
    id: newId(),
    group_id: e.group_id ? (groups.get(e.group_id) ?? groups.set(e.group_id, newId()).get(e.group_id)!) : null,
    points: e.points.map((p): [number, number] => [p[0], p[1]]),
    transform: { ...e.transform },
    layer_order: base + ((e.layer_order ?? 0) - lowest),
  }));
}

/** A plain copy of elements, safe to send to the backend (nothing shared with the live design). */
export function cloneElements(elements: readonly CustomElement[]): CustomElement[] {
  return elements.map((e) => ({
    ...e,
    group_id: e.group_id ?? null,
    points: e.points.map((p): [number, number] => [p[0], p[1]]),
    transform: { ...e.transform },
  }));
}

/** The box a drawing covers on the canvas: points through each element's transform, plus half the line width. */
export function drawingBounds(elements: readonly CustomElement[]): [number, number, number, number] | null {
  let box: [number, number, number, number] | null = null;
  for (const e of elements) {
    const t = e.transform;
    const r = (t.rotation * Math.PI) / 180;
    const [a, b, c, d] = [t.scale_x * Math.cos(r), t.scale_x * Math.sin(r), -t.scale_y * Math.sin(r), t.scale_y * Math.cos(r)];
    const pad = (e.stroke_width * Math.max(t.scale_x, t.scale_y)) / 2;
    for (const [x, y] of e.points) {
      const px = a * x + c * y + t.x;
      const py = b * x + d * y + t.y;
      box = box
        ? [Math.min(box[0], px - pad), Math.min(box[1], py - pad), Math.max(box[2], px + pad), Math.max(box[3], py + pad)]
        : [px - pad, py - pad, px + pad, py + pad];
    }
  }
  return box;
}

/**
 * A small picture of a drawing, drawn by the builder (buildCustomElements) and framed on the
 * drawing itself. Returns an <img> source, or null if there is nothing to draw.
 */
export function drawingPreviewSrc(elements: readonly CustomElement[]): string | null {
  try {
    const { defs, markup } = buildCustomElements(elements);
    const box = drawingBounds(elements);
    if (!markup || !box) return null;
    const margin = 6;
    const x = box[0] - margin;
    const y = box[1] - margin;
    const w = Math.max(box[2] - box[0], 1) + margin * 2;
    const h = Math.max(box[3] - box[1], 1) + margin * 2;
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)}" ` +
      `width="${w.toFixed(2)}" height="${h.toFixed(2)}"><defs>${defs}</defs>${markup}</svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  } catch {
    return null;
  }
}
