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
