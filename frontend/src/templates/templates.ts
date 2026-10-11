/*
 * Starter designs: complete dress specs a student can open and then edit.
 *
 * These are our own designs, written as plain spec values and drawn by Builder/buildFlat.ts
 * like any other dress. Nothing here is an image or a copy of another product's artwork;
 * a template is only a named combination of the options the spec already allows.
 */
import type { DesignSpec, PartName } from "../../../Builder/types";

export interface Template {
  id: string;
  name: string;
  /** One line shown under the name. */
  note: string;
  spec: DesignSpec;
}

const PARTS: PartName[] = ["collar_neckline", "bodice", "left_sleeve", "right_sleeve", "waist_seam", "skirt", "pockets", "buttons"];
const all = (fill: string, pattern: "solid" | "denim" | "plaid" | "floral" = "solid"): DesignSpec["style"] =>
  Object.fromEntries(PARTS.map((part) => [part, { fill, pattern }]));

/** Every field of a spec, so a template only has to say what makes it different. */
function design(o: {
  neckline?: Partial<DesignSpec["neckline"]>;
  collar?: DesignSpec["collar"];
  sleeves?: Partial<DesignSpec["sleeves"]>;
  waist?: Partial<DesignSpec["waist"]>;
  skirt?: Partial<DesignSpec["skirt"]>;
  details?: Partial<DesignSpec["details"]>;
  proportions?: Partial<DesignSpec["proportions"]>;
  style?: DesignSpec["style"];
}): DesignSpec {
  return {
    garment_type: "dress",
    neckline: { type: "crew", depth: 0.3, ...o.neckline },
    collar: { type: "none", ...o.collar },
    sleeves: { type: "none", length: "short", cuff: "none", shoulder: "set_in", ...o.sleeves },
    waist: { seam: true, style: "natural", ...o.waist },
    skirt: { silhouette: "a_line", length: "knee", fullness: "plain", hem: "plain", panels: "none", ...o.skirt },
    details: { pockets: "none", buttons: 0, placket: "none", darts: false, bow: "none", trim: "none", ...o.details },
    proportions: { shoulder_width: 0.5, waist_y: 0.5, ...o.proportions },
    style: o.style ?? {},
    notes: "",
  };
}

const white = { fill: "#ffffff", pattern: "solid" } as const;

export const TEMPLATES: readonly Template[] = [
  {
    id: "shirt-dress", name: "Shirt dress", note: "Collar, full button front, gathered skirt",
    spec: design({ neckline: { type: "v", depth: 0.2 }, collar: { type: "shirt" }, sleeves: { type: "fitted", length: "short" }, skirt: { fullness: "gathered" }, details: { buttons: 8, placket: "full", pockets: "patch" }, style: all("#c9d8e8") }),
  },
  {
    id: "slip-dress", name: "Slip dress", note: "Narrow straps, straight midi, side slit",
    spec: design({ neckline: { type: "v", depth: 0.55 }, waist: { seam: false }, skirt: { silhouette: "straight", length: "midi", hem: "slit" }, proportions: { shoulder_width: 0.15 }, style: all("#2b2b33") }),
  },
  {
    id: "tea-dress", name: "Tea dress", note: "Sweetheart neck, puff sleeves, floral",
    spec: design({ neckline: { type: "sweetheart", depth: 0.4 }, sleeves: { type: "puff", length: "short" }, skirt: { silhouette: "flared", length: "midi", fullness: "gathered" }, style: all("#d98aa5", "floral") }),
  },
  {
    id: "sundress", name: "Sundress", note: "Square neck, tiered skirt",
    spec: design({ neckline: { type: "square", depth: 0.45 }, skirt: { silhouette: "flared", length: "midi", fullness: "gathered", hem: "tiered" }, proportions: { shoulder_width: 0.3 }, style: all("#f1c75b") }),
  },
  {
    id: "sheath", name: "Sheath", note: "Fitted, darts, knee length",
    spec: design({ neckline: { type: "scoop", depth: 0.3 }, sleeves: { type: "cap" }, skirt: { silhouette: "straight", panels: "front_seam" }, details: { darts: true }, style: all("#22304f") }),
  },
  {
    id: "school-dress", name: "Collared dress", note: "Peter Pan collar, bow, pleats",
    spec: design({ collar: { type: "peter_pan" }, sleeves: { type: "puff", length: "short" }, skirt: { fullness: "pleated" }, details: { bow: "neckline" }, style: { ...all("#1f3a34"), collar_neckline: white, buttons: white } }),
  },
  {
    id: "halter", name: "Halter dress", note: "Halter neck, full flared skirt",
    spec: design({ neckline: { type: "halter", depth: 0.5 }, skirt: { silhouette: "flared", length: "knee" }, details: { bow: "waist" }, style: { ...all("#b23a55"), waist_seam: { fill: "#7c1f37", pattern: "solid" } } }),
  },
  {
    id: "off-shoulder", name: "Off-shoulder", note: "Bare shoulders, ruffle hem",
    spec: design({ neckline: { type: "off_shoulder", depth: 0.4 }, sleeves: { type: "puff", length: "short", cuff: "elastic" }, skirt: { length: "midi", hem: "ruffle" }, style: all("#2f6b62") }),
  },
  {
    id: "mandarin", name: "Mandarin collar", note: "Stand collar, cap sleeves, slit",
    spec: design({ collar: { type: "mandarin" }, sleeves: { type: "cap" }, skirt: { silhouette: "straight", length: "midi", hem: "slit" }, details: { trim: "piping" }, style: all("#a8322d") }),
  },
  {
    id: "turtleneck", name: "High-neck knit", note: "High neck, long sleeves, mini",
    spec: design({ neckline: { type: "high", depth: 0.5 }, sleeves: { type: "fitted", length: "long", cuff: "band" }, waist: { seam: false }, skirt: { silhouette: "straight", length: "mini" }, style: all("#6b4a7a") }),
  },
  {
    id: "belted", name: "Belted day dress", note: "Belt, elbow sleeves, pockets",
    spec: design({ neckline: { type: "v", depth: 0.35 }, sleeves: { type: "fitted", length: "elbow" }, waist: { style: "belted" }, skirt: { length: "midi" }, details: { pockets: "side_seam" }, style: { ...all("#d9c7a3"), waist_seam: { fill: "#5a3a22", pattern: "solid" } } }),
  },
  {
    id: "princess", name: "Princess line", note: "Long curved seams, no waist seam",
    spec: design({ neckline: { type: "scoop", depth: 0.35 }, sleeves: { type: "fitted", length: "short" }, waist: { seam: false }, skirt: { panels: "princess_seams" }, style: all("#3b5b8c", "denim") }),
  },
  {
    id: "empire", name: "Empire gown", note: "High waist, floor length",
    spec: design({ neckline: { type: "sweetheart", depth: 0.3 }, sleeves: { type: "cap" }, waist: { style: "empire" }, skirt: { length: "floor", fullness: "gathered" }, proportions: { waist_y: 0 }, style: all("#e9dff0") }),
  },
  {
    id: "drop-waist", name: "Drop waist", note: "Low waist, pleated mini skirt",
    spec: design({ neckline: { type: "square", depth: 0.3 }, waist: { style: "dropped" }, skirt: { length: "mini", fullness: "pleated" }, proportions: { waist_y: 1 }, style: all("#f3e3c3") }),
  },
  {
    id: "prairie", name: "Prairie dress", note: "Band collar, long sleeves, ruffles",
    spec: design({ collar: { type: "band" }, sleeves: { type: "fitted", length: "long", cuff: "ruffle", shoulder: "puff_top" }, skirt: { silhouette: "flared", length: "floor", fullness: "gathered", hem: "ruffle" }, details: { buttons: 4, placket: "bodice", trim: "lace" }, style: all("#d49a6a", "floral") }),
  },
  {
    id: "plaid-pinafore", name: "Plaid pinafore", note: "Square neck, patch pockets, plaid",
    spec: design({ neckline: { type: "square", depth: 0.6 }, skirt: { silhouette: "a_line", length: "knee" }, details: { pockets: "patch", buttons: 2, placket: "none" }, proportions: { shoulder_width: 0.25 }, style: all("#a8322d", "plaid") }),
  },
];
