// Design spec types — mirrors the contract in CLAUDE.md.
// If the contract changes in the group chat, change it here too.

export type NecklineType = "crew" | "v" | "scoop" | "square";
export type SleeveType = "none" | "cap" | "puff" | "fitted";
export type SleeveLength = "short" | "elbow" | "long";
export type Silhouette = "straight" | "a_line" | "flared";
export type SkirtLength = "mini" | "knee" | "midi" | "floor";
export type PocketType = "none" | "patch" | "side_seam";
export type Pattern = "solid" | "denim" | "plaid" | "floral";

// SVG group names, in CLAUDE.md order.
export type PartName =
  | "collar_neckline"
  | "bodice"
  | "left_sleeve"
  | "right_sleeve"
  | "waist_seam"
  | "skirt"
  | "pockets"
  | "buttons";

export interface PartStyle {
  fill: string; // hex, e.g. "#1f2a44"
  pattern: Pattern;
}

export interface DesignSpec {
  garment_type: "dress";
  neckline: { type: NecklineType; depth: number }; // depth 0-1
  sleeves: { type: SleeveType; length: SleeveLength };
  waist: { seam: boolean };
  skirt: { silhouette: Silhouette; length: SkirtLength };
  details: { pockets: PocketType; buttons: number }; // buttons 0-8
  proportions: { shoulder_width: number; waist_y: number }; // both 0-1
  style: Partial<Record<PartName, PartStyle>>; // missing part = white, solid
  notes: string;
}
