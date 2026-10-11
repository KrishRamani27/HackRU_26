// Design spec types — mirrors the contract in CHATGPT.md and backend/app/schemas.py.
// If the contract changes in the group chat, change it here too.
//
// The detail fields added in prompt version v10 are optional here, because specs saved before
// they existed (and the mock sample) don't have them. A missing one means "nothing special".

export type NecklineType = "crew" | "v" | "scoop" | "square" | "sweetheart" | "off_shoulder" | "halter" | "high";
export type CollarType = "none" | "shirt" | "peter_pan" | "band" | "mandarin";
export type CuffType = "none" | "band" | "ruffle" | "elastic";
export type ShoulderType = "set_in" | "puff_top" | "off_shoulder";
export type WaistStyle = "natural" | "empire" | "dropped" | "belted";
export type Fullness = "plain" | "gathered" | "pleated";
export type HemType = "plain" | "ruffle" | "tiered" | "slit";
export type PanelType = "none" | "front_seam" | "princess_seams";
export type PlacketType = "none" | "bodice" | "full";
export type BowType = "none" | "neckline" | "waist";
export type TrimType = "none" | "piping" | "lace";
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
  collar?: { type: CollarType };
  sleeves: { type: SleeveType; length: SleeveLength; cuff?: CuffType; shoulder?: ShoulderType };
  waist: { seam: boolean; style?: WaistStyle };
  skirt: { silhouette: Silhouette; length: SkirtLength; fullness?: Fullness; hem?: HemType; panels?: PanelType };
  details: {
    pockets: PocketType;
    buttons: number; // 0-8
    placket?: PlacketType;
    darts?: boolean;
    bow?: BowType;
    trim?: TrimType;
  };
  proportions: { shoulder_width: number; waist_y: number }; // both 0-1
  style: Partial<Record<PartName, PartStyle>>; // missing part = white, solid
  notes: string;
}
