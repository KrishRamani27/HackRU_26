// Runtime mirror of the shared contracts in CHATGPT.md / backend schemas.py:
// the allowed values per field, and the edit action `{ op: "set", path, value }`.
// The type-only definitions live in Builder/types.ts and are reused, not copied.

import type {
  DesignSpec,
  PartStyle,
  NecklineType,
  Pattern,
  PartName,
  PocketType,
  Silhouette,
  SkirtLength,
  SleeveLength,
  SleeveType,
} from "../../../Builder/types";

// Prompt version v10 (backend/app/schemas.py) added four neckline types and a set of detail fields. The type
// file in Builder/ still lists the original four necklines and none of the detail fields (and the builder does
// not draw them yet), so the full lists live here, as the single place the frontend reads allowed values from.
export type NecklineKind = NecklineType | "sweetheart" | "off_shoulder" | "halter" | "high";
export const NECKLINE_TYPES: readonly NecklineKind[] = ["crew", "v", "scoop", "square", "sweetheart", "off_shoulder", "halter", "high"];
export const COLLAR_TYPES = ["none", "shirt", "peter_pan", "band", "mandarin"] as const;
export const CUFF_TYPES = ["none", "band", "ruffle", "elastic"] as const;
export const SHOULDER_TYPES = ["set_in", "puff_top", "off_shoulder"] as const;
export const WAIST_STYLES = ["natural", "empire", "dropped", "belted"] as const;
export const FULLNESS_TYPES = ["plain", "gathered", "pleated"] as const;
export const HEM_TYPES = ["plain", "ruffle", "tiered", "slit"] as const;
export const PANEL_TYPES = ["none", "front_seam", "princess_seams"] as const;
export const PLACKET_TYPES = ["none", "bodice", "full"] as const;
export const BOW_TYPES = ["none", "neckline", "waist"] as const;
export const TRIM_TYPES = ["none", "piping", "lace"] as const;

/**
 * WHICH CONTROLS THE PROPERTIES PANEL SHOWS. One place, one line per control.
 *
 * Only settings that Builder/buildFlat.ts actually draws get a control: a control that changes nothing on the
 * canvas is confusing. The other fields still live in the spec (an /analyze result, a saved design or a saved
 * part carries them through untouched, and edits to them are still accepted by `isValidEdit`); they just have no
 * control yet.
 *
 * - `true` shows the control with all its options.
 * - A list shows only those options (the others are hidden, and a value the spec already holds that is not in
 *   the list is mentioned in a small note under the control).
 *
 * When the builder learns to draw one, turn its control back on by uncommenting its line below (or, for the
 * four extra necklines, adding them to the list).
 */
export const SHOWN_CONTROLS: Record<string, true | readonly string[]> = {
  // Neckline, collar, sleeves: all drawn (checked option by option against Builder/buildFlat.ts).
  "neckline.type": true,
  "neckline.depth": true,
  "collar.type": true,
  "sleeves.type": true,
  "sleeves.length": true,
  "sleeves.cuff": true,
  "sleeves.shoulder": true,
  "waist.seam": true,
  // The builder only draws "belted" (a taller band). Empire and dropped look the same as natural, because the
  // waist height slider already moves the waist, so they have no chip. All four: true.
  "waist.style": ["natural", "belted"],
  "skirt.silhouette": true,
  "skirt.length": true,
  "skirt.fullness": true,
  "skirt.hem": true,
  "skirt.panels": true,
  "details.pockets": true,
  "details.buttons": true,
  "details.placket": true,
  "details.darts": true,
  "details.bow": true,
  "details.trim": true,
  "proportions.shoulder_width": true,
  "proportions.waist_y": true,
};

/** Does the panel show a control for this spec path (for some kind of garment)? */
export const isShown = (path: string): boolean => path in SHOWN_CONTROLS;

/** Does the panel show any control whose path starts with one of these prefixes (a whole section)? */
export const anyShown = (...prefixes: string[]): boolean =>
  Object.keys(SHOWN_CONTROLS).some((path) => prefixes.some((p) => path.startsWith(p)));

/** The options of a control that are shown (all of them when the control is listed as `true`). */
export function shownOptions<T extends string>(path: string, options: readonly { value: T; label: string }[]) {
  const rule = SHOWN_CONTROLS[path];
  return Array.isArray(rule) ? options.filter((o) => (rule as readonly string[]).includes(o.value)) : [...options];
}

/** What the backend uses for a v10 field a spec doesn't have (older specs, the mock sample): "nothing special". */
export const V10_DEFAULTS: Record<string, string | boolean> = {
  "collar.type": "none",
  "sleeves.cuff": "none",
  "sleeves.shoulder": "set_in",
  "waist.style": "natural",
  "skirt.fullness": "plain",
  "skirt.hem": "plain",
  "skirt.panels": "none",
  "details.placket": "none",
  "details.darts": false,
  "details.bow": "none",
  "details.trim": "none",
};

/** The value at a dotted path of a spec, or the backend's default when the spec doesn't have the field. */
export function specValue<T extends string | number | boolean>(spec: DesignSpec, path: string): T {
  let node: unknown = spec;
  for (const key of path.split(".")) node = (node as Record<string, unknown> | undefined)?.[key];
  return (node === undefined || node === null ? V10_DEFAULTS[path] : node) as T;
}
export const SLEEVE_TYPES: readonly SleeveType[] = ["none", "cap", "puff", "fitted"];
export const SLEEVE_LENGTHS: readonly SleeveLength[] = ["short", "elbow", "long"];
export const SILHOUETTES: readonly Silhouette[] = ["straight", "a_line", "flared"];
export const SKIRT_LENGTHS: readonly SkirtLength[] = ["mini", "knee", "midi", "floor"];
export const POCKET_TYPES: readonly PocketType[] = ["none", "patch", "side_seam"];
export const PATTERNS: readonly Pattern[] = ["solid", "denim", "plaid", "floral"];
export const PART_NAMES: readonly PartName[] = [
  "collar_neckline",
  "bodice",
  "left_sleeve",
  "right_sleeve",
  "waist_seam",
  "skirt",
  "pockets",
  "buttons",
];

/** Display names for the Builder's group ids. The ids themselves are the selection values. */
export const PART_LABELS: Record<PartName, string> = {
  collar_neckline: "Collar & neckline",
  bodice: "Bodice",
  left_sleeve: "Left sleeve",
  right_sleeve: "Right sleeve",
  waist_seam: "Waist seam",
  skirt: "Skirt",
  pockets: "Pockets",
  buttons: "Buttons",
};

export const DEFAULT_STYLE = { fill: "#ffffff", pattern: "solid" } as const;
export const MAX_NOTES_LENGTH = 4000;

/** One edit. Clicked edits, voice edits and verify-loop corrections all use this shape. */
export interface EditAction {
  op: "set";
  /** Dotted spec path, e.g. "sleeves.type" or "style.bodice.fill". */
  path: string;
  value: string | number | boolean;
}

export const stylePath = (part: PartName, leaf: "fill" | "pattern") => `style.${part}.${leaf}`;

type Rule =
  | { kind: "enum"; options: readonly string[] }
  | { kind: "number"; min: number; max: number; integer?: boolean }
  | { kind: "boolean" }
  | { kind: "hex" }
  | { kind: "text"; max: number };

const unit: Rule = { kind: "number", min: 0, max: 1 };

// Only these paths are editable (garment_type is locked), as in editable_paths().
const RULES: Record<string, Rule> = {
  "neckline.type": { kind: "enum", options: NECKLINE_TYPES },
  "neckline.depth": unit,
  "collar.type": { kind: "enum", options: COLLAR_TYPES },
  "sleeves.type": { kind: "enum", options: SLEEVE_TYPES },
  "sleeves.length": { kind: "enum", options: SLEEVE_LENGTHS },
  "sleeves.cuff": { kind: "enum", options: CUFF_TYPES },
  "sleeves.shoulder": { kind: "enum", options: SHOULDER_TYPES },
  "waist.seam": { kind: "boolean" },
  "waist.style": { kind: "enum", options: WAIST_STYLES },
  "skirt.silhouette": { kind: "enum", options: SILHOUETTES },
  "skirt.length": { kind: "enum", options: SKIRT_LENGTHS },
  "skirt.fullness": { kind: "enum", options: FULLNESS_TYPES },
  "skirt.hem": { kind: "enum", options: HEM_TYPES },
  "skirt.panels": { kind: "enum", options: PANEL_TYPES },
  "details.pockets": { kind: "enum", options: POCKET_TYPES },
  "details.buttons": { kind: "number", min: 0, max: 8, integer: true },
  "details.placket": { kind: "enum", options: PLACKET_TYPES },
  "details.darts": { kind: "boolean" },
  "details.bow": { kind: "enum", options: BOW_TYPES },
  "details.trim": { kind: "enum", options: TRIM_TYPES },
  "proportions.shoulder_width": unit,
  "proportions.waist_y": unit,
  notes: { kind: "text", max: MAX_NOTES_LENGTH },
};
for (const part of PART_NAMES) {
  RULES[stylePath(part, "fill")] = { kind: "hex" };
  RULES[stylePath(part, "pattern")] = { kind: "enum", options: PATTERNS };
}

/** Same checks the backend applies: known path, correct type, allowed value or range. */
export function isValidEdit(action: EditAction): boolean {
  if (action.op !== "set") return false;
  const rule = RULES[action.path];
  if (!rule) return false;
  const { value } = action;
  switch (rule.kind) {
    case "enum":
      return typeof value === "string" && rule.options.includes(value);
    case "number":
      return (
        typeof value === "number" &&
        Number.isFinite(value) &&
        value >= rule.min &&
        value <= rule.max &&
        (!rule.integer || Number.isInteger(value))
      );
    case "boolean":
      return typeof value === "boolean";
    case "hex":
      return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
    case "text":
      return typeof value === "string" && value.length <= rule.max;
  }
}

/**
 * Parts whose style Builder/buildFlat.ts actually reads (it calls fillFor for exactly
 * these). A part missing from this list would have its color and pattern controls
 * disabled, because setting them could not change the drawing. Today the builder
 * fills all eight: the collar band and the waistband are 6px strips.
 */
export const FILLED_PARTS: readonly PartName[] = [
  "collar_neckline",
  "bodice",
  "left_sleeve",
  "right_sleeve",
  "waist_seam",
  "skirt",
  "pockets",
  "buttons",
];

/**
 * Trim parts that copy the bodice's color and pattern, and keep copying it when the
 * bodice changes, until the user sets their own color or pattern on that part.
 */
export const FOLLOWER_PARTS: readonly PartName[] = ["collar_neckline", "waist_seam"];

/** True when two parts have the same color and pattern. */
export function sameStyle(a: Partial<PartStyle> | undefined, b: Partial<PartStyle> | undefined): boolean {
  return !!a && !!b && a.fill?.toLowerCase() === b.fill?.toLowerCase() && a.pattern === b.pattern;
}

/**
 * Makes every part's style complete and safe before it reaches buildFlat:
 * - every part gets both a fill and a pattern (a missing key makes fillFor emit a
 *   reference to a pattern that doesn't exist, which draws nothing);
 * - a fill that isn't #rrggbb, or a pattern that isn't allowed, falls back to the
 *   default, because buildFlat copies fills into SVG attributes without escaping.
 * Runs on every loaded spec and after every edit.
 */
export function normalizeStyles(spec: DesignSpec): DesignSpec {
  const source = (spec.style ?? {}) as Record<string, { fill?: unknown; pattern?: unknown } | undefined>;
  const style: DesignSpec["style"] = {};
  for (const part of PART_NAMES) {
    const entry = source[part] && typeof source[part] === "object" ? source[part] : {};
    style[part] = {
      fill: typeof entry.fill === "string" && /^#[0-9a-fA-F]{6}$/.test(entry.fill) ? entry.fill : DEFAULT_STYLE.fill,
      pattern: PATTERNS.includes(entry.pattern as Pattern) ? (entry.pattern as Pattern) : DEFAULT_STYLE.pattern,
    };
  }
  return { ...spec, style };
}

// ---------- Garment types ----------
// `garment_type` is "dress", "top" or "skirt" (Builder/types.ts) and is locked: it comes from the spec and there is
// no control to change it. A top is the dress cut off at the hip; a skirt is the dress without its bodice.
// Which controls and parts apply to each was measured against Builder/buildFlat.ts (an option counts if it
// changes the drawing). Same fallback as the builder: anything else is a dress.

export type GarmentKind = "dress" | "top" | "skirt";
export const garmentOf = (spec: DesignSpec | null | undefined): GarmentKind =>
  spec?.garment_type === "top" || spec?.garment_type === "skirt" ? spec.garment_type : "dress";

/** The drawing's parts that can exist for each garment. A skirt has no collar, bodice or sleeves. */
export const PARTS_FOR: Record<GarmentKind, readonly PartName[]> = {
  dress: PART_NAMES,
  top: PART_NAMES,
  skirt: ["waist_seam", "skirt", "pockets", "buttons"],
};

/**
 * Controls that do nothing for a garment, as spec path prefixes. On a top the "skirt" controls do apply: they shape
 * its lower part (its length is where the top ends). On a skirt, everything above the waist does nothing.
 */
export const NOT_FOR_GARMENT: Record<GarmentKind, readonly string[]> = {
  dress: [],
  top: [],
  skirt: ["neckline.", "collar.", "sleeves.", "waist.seam", "details.darts"],
};

/** Single options that do nothing for a garment (a bow at the neckline needs a neckline). */
export const OPTIONS_NOT_FOR_GARMENT: Partial<Record<GarmentKind, Record<string, readonly string[]>>> = {
  skirt: { "details.bow": ["neckline"] },
};

/** Does the panel show a control for this path on this garment? */
export const controlShown = (path: string, garment: GarmentKind): boolean =>
  isShown(path) && !NOT_FOR_GARMENT[garment].some((p) => path.startsWith(p));

/** Does a whole section (any path under these prefixes) have a control for this garment? */
export const anyControlShown = (garment: GarmentKind, ...prefixes: string[]): boolean =>
  Object.keys(SHOWN_CONTROLS).some((path) => prefixes.some((p) => path.startsWith(p)) && controlShown(path, garment));

/** The options of a control to show: the list in SHOWN_CONTROLS, minus any that do nothing on this garment. */
export function optionsFor<T extends string>(path: string, garment: GarmentKind, options: readonly { value: T; label: string }[]) {
  const excluded = OPTIONS_NOT_FOR_GARMENT[garment]?.[path] ?? [];
  return shownOptions(path, options).filter((o) => !excluded.includes(o.value));
}

/** What a part is called on this garment: on a top the "skirt" group is the lower part of the top. */
export const partLabel = (part: PartName, garment: GarmentKind): string =>
  garment === "top" && part === "skirt" ? "Lower part" : PART_LABELS[part];

/** Library part types that mean nothing on this garment (a skirt has no neckline or sleeves). */
export const PART_TYPES_NOT_FOR_GARMENT: Record<GarmentKind, readonly string[]> = { dress: [], top: [], skirt: ["neckline", "sleeves"] };
