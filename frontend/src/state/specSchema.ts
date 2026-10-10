// Runtime mirror of the shared contracts in CHATGPT.md / backend schemas.py:
// the allowed values per field, and the edit action `{ op: "set", path, value }`.
// The type-only definitions live in Builder/types.ts and are reused, not copied.

import type {
  DesignSpec,
  NecklineType,
  Pattern,
  PartName,
  PocketType,
  Silhouette,
  SkirtLength,
  SleeveLength,
  SleeveType,
} from "../../../Builder/types";

export const NECKLINE_TYPES: readonly NecklineType[] = ["crew", "v", "scoop", "square"];
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
  "sleeves.type": { kind: "enum", options: SLEEVE_TYPES },
  "sleeves.length": { kind: "enum", options: SLEEVE_LENGTHS },
  "waist.seam": { kind: "boolean" },
  "skirt.silhouette": { kind: "enum", options: SILHOUETTES },
  "skirt.length": { kind: "enum", options: SKIRT_LENGTHS },
  "details.pockets": { kind: "enum", options: POCKET_TYPES },
  "details.buttons": { kind: "number", min: 0, max: 8, integer: true },
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
 * these). The collar and waist seam are drawn without a fill, so a color or pattern
 * set on them cannot change the drawing.
 */
export const FILLED_PARTS: readonly PartName[] = ["bodice", "left_sleeve", "right_sleeve", "skirt", "pockets", "buttons"];

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
