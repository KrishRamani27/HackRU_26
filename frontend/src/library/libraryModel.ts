// The saved-part contract (CHATGPT.md, backend schemas.py):
//   { name, part_type, spec_settings, style }, plus id and created_at from the backend.
// This file maps between that and the design spec, and never talks to the network.

import type { DesignSpec, PartName, Pattern } from "../../../Builder/types";
import { buildFlat } from "../../../Builder/buildFlat";
import { mockSpec } from "../../../Builder/mockSpec";
import { initialSpecState, specReducer } from "../state/specReducer";
import { DEFAULT_STYLE, isValidEdit, stylePath, type EditAction } from "../state/specSchema";

export const PART_TYPES = ["neckline", "sleeves", "waist", "skirt", "details", "proportions"] as const;
export type LibraryPartType = (typeof PART_TYPES)[number];

export const PART_TYPE_LABELS: Record<LibraryPartType, string> = {
  neckline: "Neckline",
  sleeves: "Sleeves",
  waist: "Waist",
  skirt: "Skirt",
  details: "Details",
  proportions: "Proportions",
};

export interface SavedPartInput {
  name: string;
  part_type: LibraryPartType;
  spec_settings: Record<string, string | number | boolean>;
  style: { fill: string; pattern: Pattern };
}

export interface SavedPart extends SavedPartInput {
  id: string;
  created_at: string;
}

// Which library part type, and which settings inside it, each canvas part stands for.
// Same grouping the properties panel uses to find a part's controls.
const SOURCE: Record<PartName, { type: LibraryPartType; keys: readonly string[] }> = {
  collar_neckline: { type: "neckline", keys: ["type", "depth"] },
  bodice: { type: "proportions", keys: ["shoulder_width", "waist_y"] },
  left_sleeve: { type: "sleeves", keys: ["type", "length"] },
  right_sleeve: { type: "sleeves", keys: ["type", "length"] },
  waist_seam: { type: "waist", keys: ["seam"] },
  skirt: { type: "skirt", keys: ["silhouette", "length"] },
  pockets: { type: "details", keys: ["pockets"] },
  buttons: { type: "details", keys: ["buttons"] },
};

/** Which canvas parts a saved part's style is applied to. */
function styleTargets(type: LibraryPartType, keys: string[]): PartName[] {
  switch (type) {
    case "neckline": return ["collar_neckline"];
    case "sleeves": return ["left_sleeve", "right_sleeve"]; // a sleeve style goes on both sides
    case "waist": return ["waist_seam"];
    case "skirt": return ["skirt"];
    case "proportions": return ["bodice"];
    case "details": return [...(keys.includes("pockets") ? ["pockets" as const] : []), ...(keys.includes("buttons") ? ["buttons" as const] : [])];
  }
}

/** The saved-part record for the selected canvas part, from the current design. */
export function buildSavedPart(spec: DesignSpec, part: PartName, name: string): SavedPartInput {
  const { type, keys } = SOURCE[part];
  const section = spec[type as keyof DesignSpec] as unknown as Record<string, string | number | boolean>;
  const spec_settings: SavedPartInput["spec_settings"] = {};
  for (const key of keys) spec_settings[key] = section[key];
  const style = { ...DEFAULT_STYLE, ...spec.style[part] };
  return { name: name.trim(), part_type: type, spec_settings, style: { fill: style.fill, pattern: style.pattern } };
}

/** The edit actions that apply a saved part to a design. Dispatched together, so undo reverts it in one step. */
export function editsFor(saved: SavedPartInput): EditAction[] {
  const keys = Object.keys(saved.spec_settings);
  const edits: EditAction[] = keys.map((key) => ({
    op: "set",
    path: `${saved.part_type}.${key}`,
    value: saved.spec_settings[key],
  }));
  for (const target of styleTargets(saved.part_type, keys)) {
    edits.push({ op: "set", path: stylePath(target, "fill"), value: saved.style.fill });
    edits.push({ op: "set", path: stylePath(target, "pattern"), value: saved.style.pattern });
  }
  return edits.filter(isValidEdit);
}

// A close-up of the area each part type changes, all 4:5 so the cards line up.
const CROP: Record<LibraryPartType, [number, number, number, number]> = {
  neckline: [110, 50, 180, 225],
  sleeves: [40, 50, 320, 400],
  waist: [90, 110, 220, 275],
  skirt: [50, 150, 300, 375],
  details: [90, 60, 220, 275],
  proportions: [0, 25, 400, 500],
};

/**
 * A small picture of the part: the builder draws a plain dress with the saved part applied,
 * cropped to the area that matters. Returns an <img> source, or null if the builder can't draw it.
 */
export function previewSrc(saved: SavedPartInput): string | null {
  try {
    let state = specReducer(initialSpecState, { type: "load", spec: mockSpec, meta: { source: "sample" } });
    state = specReducer(state, { type: "apply", actions: editsFor(saved) });
    if (!state.spec) return null;
    const [x, y, w, h] = CROP[saved.part_type];
    const svg = buildFlat(state.spec).replace(
      /<svg[^>]*>/,
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${w} ${h}" width="${w}" height="${h}">`,
    );
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  } catch {
    return null;
  }
}

/** "puff · elbow", "a line · knee": a short readable summary of the saved settings. */
export function settingsSummary(saved: SavedPartInput): string {
  return Object.values(saved.spec_settings)
    .map((v) => (typeof v === "boolean" ? (v ? "seam" : "no seam") : String(v).replace(/_/g, " ")))
    .join(" · ");
}
