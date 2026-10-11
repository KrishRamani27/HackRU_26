/*
 * Starter designs: complete specs a student can open and then edit, in three sections
 * (dresses, tops, skirts).
 *
 * These are our own designs, written as plain spec values and drawn by buildFlat like any
 * other garment. Nothing here is an image or a copy of another product's artwork; a template
 * is only a named combination of the options the spec already allows.
 *
 * Plain data with no browser or Node code, so the app and the preview gallery both import it.
 */
import type { DesignSpec, GarmentType, PartName, Pattern } from "./types";

export interface Template {
  id: string;
  name: string;
  /** One line shown under the name. */
  note: string;
  spec: DesignSpec;
}

export const TEMPLATE_SECTIONS: readonly { key: GarmentType; label: string }[] = [
  { key: "dress", label: "Dresses" },
  { key: "top", label: "Tops" },
  { key: "skirt", label: "Skirts" },
];

const PARTS: PartName[] = ["collar_neckline", "bodice", "left_sleeve", "right_sleeve", "waist_seam", "skirt", "pockets", "buttons"];
type Style = DesignSpec["style"];
/** The same fabric on every part. Single parts can be overridden after it. */
const all = (fill: string, pattern: Pattern = "solid"): Style => Object.fromEntries(PARTS.map((part) => [part, { fill, pattern }]));
const solid = (fill: string) => ({ fill, pattern: "solid" as const });
const white = solid("#ffffff");

interface Parts {
  neckline?: Partial<DesignSpec["neckline"]>;
  collar?: DesignSpec["collar"];
  sleeves?: Partial<DesignSpec["sleeves"]>;
  waist?: Partial<DesignSpec["waist"]>;
  skirt?: Partial<DesignSpec["skirt"]>;
  details?: Partial<DesignSpec["details"]>;
  proportions?: Partial<DesignSpec["proportions"]>;
  style?: Style;
}

/** Every field of a spec, so a template only has to say what makes it different. */
function design(garment: GarmentType, o: Parts): DesignSpec {
  return {
    garment_type: garment,
    neckline: { type: "crew", depth: 0.3, ...o.neckline },
    collar: { type: "none", ...o.collar },
    sleeves: { type: "none", length: "short", cuff: "none", shoulder: "set_in", ...o.sleeves },
    // A top is one piece unless it says otherwise; a dress has a waist seam unless it says otherwise.
    waist: { seam: garment !== "top", style: "natural", ...o.waist },
    skirt: { silhouette: garment === "top" ? "straight" : "a_line", length: "knee", fullness: "plain", hem: "plain", panels: "none", ...o.skirt },
    details: { pockets: "none", buttons: 0, placket: "none", darts: false, bow: "none", trim: "none", ...o.details },
    proportions: { shoulder_width: 0.5, waist_y: 0.5, ...o.proportions },
    style: o.style ?? {},
    notes: "",
  };
}

const make = (garment: GarmentType) => (id: string, name: string, note: string, o: Parts): Template => ({
  id: `${garment}-${id}`,
  name,
  note,
  spec: design(garment, o),
});
const dress = make("dress");
const top = make("top");
const skirt = make("skirt");

// On a top, skirt.length is where the top ends: "mini" = cropped, "knee" = hip, "midi" and "floor" = tunic.
const CROPPED = "mini";
const HIP = "knee";
const TUNIC = "midi";

export const TEMPLATES: readonly Template[] = [
  // ---------- Dresses ----------
  dress("shirt", "Shirt dress", "Collar, full button front, gathered skirt", { neckline: { type: "v", depth: 0.2 }, collar: { type: "shirt" }, sleeves: { type: "fitted", length: "short" }, skirt: { fullness: "gathered" }, details: { buttons: 8, placket: "full", pockets: "patch" }, style: all("#c9d8e8") }),
  dress("slip", "Slip dress", "Narrow straps, straight midi, side slit", { neckline: { type: "v", depth: 0.55 }, waist: { seam: false }, skirt: { silhouette: "straight", length: "midi", hem: "slit" }, proportions: { shoulder_width: 0.15 }, style: all("#2b2b33") }),
  dress("tea", "Tea dress", "Sweetheart neck, puff sleeves, floral", { neckline: { type: "sweetheart", depth: 0.4 }, sleeves: { type: "puff", length: "short" }, skirt: { silhouette: "flared", length: "midi", fullness: "gathered" }, style: all("#d98aa5", "floral") }),
  dress("sundress", "Sundress", "Square neck, tiered skirt", { neckline: { type: "square", depth: 0.45 }, skirt: { silhouette: "flared", length: "midi", fullness: "gathered", hem: "tiered" }, proportions: { shoulder_width: 0.3 }, style: all("#f1c75b") }),
  dress("sheath", "Sheath", "Fitted, darts, knee length", { neckline: { type: "scoop", depth: 0.3 }, sleeves: { type: "cap" }, skirt: { silhouette: "straight", panels: "front_seam" }, details: { darts: true }, style: all("#22304f") }),
  dress("collared", "Collared dress", "Peter Pan collar, bow, pleats", { collar: { type: "peter_pan" }, sleeves: { type: "puff", length: "short" }, skirt: { fullness: "pleated" }, details: { bow: "neckline" }, style: { ...all("#1f3a34"), collar_neckline: white, buttons: white } }),
  dress("halter", "Halter dress", "Halter neck, full flared skirt", { neckline: { type: "halter", depth: 0.5 }, skirt: { silhouette: "flared" }, details: { bow: "waist" }, style: { ...all("#b23a55"), waist_seam: solid("#7c1f37") } }),
  dress("off-shoulder", "Off-shoulder dress", "Bare shoulders, ruffle hem", { neckline: { type: "off_shoulder", depth: 0.4 }, sleeves: { type: "puff", length: "short", cuff: "elastic" }, skirt: { length: "midi", hem: "ruffle" }, style: all("#2f6b62") }),
  dress("mandarin", "Mandarin collar dress", "Stand collar, cap sleeves, slit", { collar: { type: "mandarin" }, sleeves: { type: "cap" }, skirt: { silhouette: "straight", length: "midi", hem: "slit" }, details: { trim: "piping" }, style: all("#a8322d") }),
  dress("knit", "High-neck knit dress", "High neck, long sleeves, mini", { neckline: { type: "high", depth: 0.5 }, sleeves: { type: "fitted", length: "long", cuff: "band" }, waist: { seam: false }, skirt: { silhouette: "straight", length: "mini" }, style: all("#6b4a7a") }),
  dress("belted", "Belted day dress", "Belt, elbow sleeves, pockets", { neckline: { type: "v", depth: 0.35 }, sleeves: { type: "fitted", length: "elbow" }, waist: { style: "belted" }, skirt: { length: "midi" }, details: { pockets: "side_seam" }, style: { ...all("#d9c7a3"), waist_seam: solid("#5a3a22") } }),
  dress("princess", "Princess line dress", "Long curved seams, no waist seam", { neckline: { type: "scoop", depth: 0.35 }, sleeves: { type: "fitted", length: "short" }, waist: { seam: false }, skirt: { panels: "princess_seams" }, style: all("#3b5b8c", "denim") }),
  dress("empire", "Empire gown", "High waist, floor length", { neckline: { type: "sweetheart", depth: 0.3 }, sleeves: { type: "cap" }, waist: { style: "empire" }, skirt: { length: "floor", fullness: "gathered" }, proportions: { waist_y: 0 }, style: all("#e9dff0") }),
  dress("drop-waist", "Drop waist dress", "Low waist, pleated mini skirt", { neckline: { type: "square", depth: 0.3 }, waist: { style: "dropped" }, skirt: { length: "mini", fullness: "pleated" }, proportions: { waist_y: 1 }, style: all("#f3e3c3") }),
  dress("prairie", "Prairie dress", "Band collar, long sleeves, ruffles", { collar: { type: "band" }, sleeves: { type: "fitted", length: "long", cuff: "ruffle", shoulder: "puff_top" }, skirt: { silhouette: "flared", length: "floor", fullness: "gathered", hem: "ruffle" }, details: { buttons: 4, placket: "bodice", trim: "lace" }, style: all("#d49a6a", "floral") }),
  dress("pinafore", "Plaid pinafore", "Square neck, patch pockets, plaid", { neckline: { type: "square", depth: 0.6 }, details: { pockets: "patch", buttons: 2 }, proportions: { shoulder_width: 0.25 }, style: all("#a8322d", "plaid") }),
  dress("wrap", "Wrap-style dress", "Deep V, tie waist, elbow sleeves", { neckline: { type: "v", depth: 0.6 }, sleeves: { type: "fitted", length: "elbow" }, skirt: { length: "midi" }, details: { bow: "waist" }, style: all("#4a7a5c") }),
  dress("babydoll", "Babydoll dress", "Empire waist, puff sleeves, mini", { neckline: { type: "square", depth: 0.35 }, sleeves: { type: "puff", length: "short" }, waist: { style: "empire" }, skirt: { silhouette: "flared", length: "mini", fullness: "gathered" }, proportions: { waist_y: 0 }, style: all("#f6d6dc") }),
  dress("maxi", "Tiered maxi dress", "Scoop neck, tiers to the floor", { neckline: { type: "scoop", depth: 0.4 }, skirt: { silhouette: "flared", length: "floor", fullness: "gathered", hem: "tiered" }, proportions: { shoulder_width: 0.3 }, style: all("#7fa3b8") }),
  dress("cocktail", "Cocktail dress", "Sweetheart neck, flared knee, lace hem", { neckline: { type: "sweetheart", depth: 0.5 }, skirt: { silhouette: "flared" }, details: { trim: "lace" }, proportions: { shoulder_width: 0.3 }, style: all("#1f1f24") }),
  dress("pencil", "Pencil dress", "Square neck, cap sleeves, back-of-knee slit", { neckline: { type: "square", depth: 0.35 }, sleeves: { type: "cap" }, skirt: { silhouette: "straight", hem: "slit" }, details: { darts: true }, style: all("#7a2f4a") }),
  dress("smock", "Smock dress", "Long puff sleeves, loose gathered body", { sleeves: { type: "puff", length: "long", cuff: "elastic" }, waist: { style: "empire" }, skirt: { length: "mini", fullness: "gathered" }, proportions: { waist_y: 0.05 }, style: all("#c7b299") }),
  dress("skater", "Skater dress", "Scoop neck, short sleeves, flared mini", { neckline: { type: "scoop", depth: 0.4 }, sleeves: { type: "fitted", length: "short" }, skirt: { silhouette: "flared", length: "mini" }, style: all("#2f4a7a") }),
  dress("polo", "Polo dress", "Shirt collar, short placket, straight mini", { neckline: { type: "v", depth: 0.15 }, collar: { type: "shirt" }, sleeves: { type: "fitted", length: "short", cuff: "band" }, waist: { seam: false }, skirt: { silhouette: "straight", length: "mini" }, details: { buttons: 3, placket: "bodice" }, style: { ...all("#ffffff"), collar_neckline: solid("#22304f") } }),
  dress("evening", "Evening gown", "Off the shoulder, princess seams, floor length", { neckline: { type: "off_shoulder", depth: 0.5 }, skirt: { silhouette: "flared", length: "floor", panels: "princess_seams" }, style: all("#5a1f3a") }),

  // ---------- Tops ----------
  top("tee", "Classic tee", "Crew neck, short sleeves", { sleeves: { type: "fitted", length: "short" }, skirt: { length: HIP }, style: all("#ffffff") }),
  top("v-tee", "V-neck tee", "V neck, short sleeves", { neckline: { type: "v", depth: 0.3 }, sleeves: { type: "fitted", length: "short" }, skirt: { length: HIP }, style: all("#2b2b33") }),
  top("long-sleeve", "Long-sleeve tee", "Crew neck, long sleeves", { sleeves: { type: "fitted", length: "long" }, skirt: { length: HIP }, style: all("#b7c4d1") }),
  top("tank", "Tank top", "Scoop neck, wide straps", { neckline: { type: "scoop", depth: 0.45 }, skirt: { length: HIP }, proportions: { shoulder_width: 0.2 }, style: all("#e7e2d8") }),
  top("cami", "Camisole", "Thin straps, lace hem", { neckline: { type: "v", depth: 0.5 }, skirt: { length: HIP, silhouette: "a_line" }, details: { trim: "lace" }, proportions: { shoulder_width: 0.05 }, style: all("#f1e4d8") }),
  top("crop", "Crop top", "Square neck, cap sleeves, cropped", { neckline: { type: "square", depth: 0.4 }, sleeves: { type: "cap" }, skirt: { length: CROPPED }, style: all("#d98aa5") }),
  top("button-up", "Button-up shirt", "Collar, long sleeves, cuffs", { neckline: { type: "v", depth: 0.2 }, collar: { type: "shirt" }, sleeves: { type: "fitted", length: "long", cuff: "band" }, skirt: { length: HIP }, details: { buttons: 7, placket: "full" }, style: all("#dce6f2") }),
  top("camp-shirt", "Short-sleeve shirt", "Collar, short sleeves, button front", { neckline: { type: "v", depth: 0.25 }, collar: { type: "shirt" }, sleeves: { type: "fitted", length: "short" }, skirt: { length: HIP, silhouette: "a_line" }, details: { buttons: 6, placket: "full" }, style: all("#e3c9a0", "floral") }),
  top("polo", "Polo shirt", "Collar, three buttons, banded sleeves", { neckline: { type: "v", depth: 0.15 }, collar: { type: "shirt" }, sleeves: { type: "fitted", length: "short", cuff: "band" }, skirt: { length: HIP }, details: { buttons: 3, placket: "bodice" }, style: all("#2f6b62") }),
  top("peplum", "Peplum top", "Fitted waist, flared hem", { neckline: { type: "scoop", depth: 0.35 }, sleeves: { type: "cap" }, waist: { seam: true }, skirt: { length: HIP, silhouette: "flared" }, style: all("#7a2f4a") }),
  top("peasant", "Peasant blouse", "Off shoulder, gathered sleeves", { neckline: { type: "off_shoulder", depth: 0.5 }, sleeves: { type: "puff", length: "elbow", cuff: "elastic" }, skirt: { length: HIP, silhouette: "a_line" }, style: all("#f6efe2") }),
  top("bardot", "Bardot top", "Off shoulder, short fitted sleeves", { neckline: { type: "off_shoulder", depth: 0.3 }, sleeves: { type: "fitted", length: "short" }, skirt: { length: HIP }, style: all("#1f1f24") }),
  top("halter", "Halter top", "Halter neck, cropped", { neckline: { type: "halter", depth: 0.45 }, skirt: { length: CROPPED }, style: all("#f1c75b") }),
  top("turtleneck", "Turtleneck", "High neck, long sleeves", { neckline: { type: "high", depth: 0.5 }, sleeves: { type: "fitted", length: "long" }, skirt: { length: HIP }, style: all("#3a3a44") }),
  top("mock-neck", "Mock-neck tank", "High neck, sleeveless", { neckline: { type: "high", depth: 0.3 }, skirt: { length: HIP }, style: all("#c7b299") }),
  top("puff-blouse", "Puff-sleeve blouse", "Square neck, puff sleeves", { neckline: { type: "square", depth: 0.4 }, sleeves: { type: "puff", length: "short" }, skirt: { length: HIP }, style: all("#ffffff") }),
  top("bow-blouse", "Bow blouse", "Band collar, bow, long sleeves", { collar: { type: "band" }, sleeves: { type: "fitted", length: "long", cuff: "band", shoulder: "puff_top" }, skirt: { length: HIP }, details: { bow: "neckline" }, style: all("#e9dff0") }),
  top("mandarin", "Mandarin shirt", "Stand collar, button front", { collar: { type: "mandarin" }, sleeves: { type: "fitted", length: "short" }, skirt: { length: HIP }, details: { buttons: 6, placket: "full", trim: "piping" }, style: all("#a8322d") }),
  top("tunic", "Tunic", "V neck, elbow sleeves, long line", { neckline: { type: "v", depth: 0.4 }, sleeves: { type: "fitted", length: "elbow" }, skirt: { length: TUNIC, silhouette: "a_line", hem: "slit" }, style: all("#7fa3b8") }),
  top("babydoll", "Babydoll top", "Empire seam, gathered swing body", { neckline: { type: "scoop", depth: 0.4 }, sleeves: { type: "cap" }, waist: { seam: true, style: "empire" }, skirt: { length: HIP, silhouette: "flared", fullness: "gathered" }, proportions: { waist_y: 0 }, style: all("#f6d6dc") }),
  top("corset", "Corset top", "Sweetheart neck, shaped seams", { neckline: { type: "sweetheart", depth: 0.4 }, skirt: { length: HIP, panels: "princess_seams" }, details: { darts: false }, proportions: { shoulder_width: 0.3 }, style: all("#5a1f3a") }),
  top("ruffle-hem", "Ruffle-hem top", "Scoop neck, frilled hem", { neckline: { type: "scoop", depth: 0.35 }, sleeves: { type: "cap" }, skirt: { length: HIP, silhouette: "a_line", hem: "ruffle" }, style: all("#4a7a5c") }),
  top("peter-pan", "Peter Pan blouse", "Round collar, puff sleeves, buttons", { collar: { type: "peter_pan" }, sleeves: { type: "puff", length: "short" }, skirt: { length: HIP }, details: { buttons: 5, placket: "full" }, style: { ...all("#22304f"), collar_neckline: white, buttons: white } }),
  top("belted-tunic", "Belted tunic", "Long sleeves, belt, long line", { neckline: { type: "v", depth: 0.3 }, sleeves: { type: "fitted", length: "long" }, waist: { style: "belted" }, skirt: { length: TUNIC, silhouette: "a_line" }, style: { ...all("#d9c7a3"), waist_seam: solid("#5a3a22") } }),
  top("bell-sleeve", "Bell-sleeve top", "Crew neck, frilled elbow sleeves", { sleeves: { type: "fitted", length: "elbow", cuff: "ruffle" }, skirt: { length: HIP }, style: all("#b23a55") }),
  top("denim-shirt", "Denim shirt", "Collar, long sleeves, denim", { neckline: { type: "v", depth: 0.2 }, collar: { type: "shirt" }, sleeves: { type: "fitted", length: "long", cuff: "band" }, skirt: { length: HIP }, details: { buttons: 7, placket: "full", pockets: "patch" }, style: all("#3b5b8c", "denim") }),
  top("flannel", "Plaid flannel", "Collar, long sleeves, plaid", { neckline: { type: "v", depth: 0.2 }, collar: { type: "shirt" }, sleeves: { type: "fitted", length: "long", cuff: "band" }, skirt: { length: HIP, silhouette: "a_line" }, details: { buttons: 7, placket: "full" }, style: all("#a8322d", "plaid") }),

  // ---------- Skirts ----------
  skirt("pencil", "Pencil skirt", "Straight, knee length", { skirt: { silhouette: "straight" }, details: { darts: false }, style: all("#2b2b33") }),
  skirt("pencil-slit", "Slit pencil skirt", "Straight midi with a slit", { skirt: { silhouette: "straight", length: "midi", hem: "slit" }, style: all("#7a2f4a") }),
  skirt("a-line-mini", "A-line mini", "Short, gently widening", { skirt: { length: "mini" }, style: all("#d98aa5") }),
  skirt("a-line-knee", "A-line skirt", "Knee length, gently widening", { style: all("#22304f") }),
  skirt("a-line-midi", "A-line midi", "Mid-calf, gently widening", { skirt: { length: "midi" }, style: all("#4a7a5c") }),
  skirt("circle", "Circle skirt", "Full flare, knee length", { skirt: { silhouette: "flared" }, style: all("#b23a55") }),
  skirt("full-midi", "Full midi skirt", "Gathered, full, mid-calf", { skirt: { silhouette: "flared", length: "midi", fullness: "gathered" }, style: all("#f1c75b") }),
  skirt("maxi", "Maxi skirt", "Floor length A-line", { skirt: { length: "floor" }, style: all("#7fa3b8") }),
  skirt("tiered-maxi", "Tiered maxi skirt", "Gathered tiers to the floor", { skirt: { silhouette: "flared", length: "floor", fullness: "gathered", hem: "tiered" }, style: all("#d49a6a", "floral") }),
  skirt("tennis", "Pleated mini", "Short, pleated all round", { skirt: { length: "mini", fullness: "pleated" }, style: all("#ffffff") }),
  skirt("pleated-midi", "Pleated midi", "Pressed pleats, mid-calf", { skirt: { length: "midi", fullness: "pleated" }, style: all("#c7b299") }),
  skirt("denim-mini", "Denim mini", "Straight mini, pockets, front seam", { skirt: { silhouette: "straight", length: "mini", panels: "front_seam" }, details: { pockets: "patch" }, style: all("#3b5b8c", "denim") }),
  skirt("button-midi", "Button-front midi", "Buttons from waist to hem", { skirt: { length: "midi" }, details: { buttons: 7, placket: "full" }, style: all("#e7e2d8") }),
  skirt("button-denim", "Button-front denim", "Straight, buttons, patch pockets", { skirt: { silhouette: "straight" }, details: { buttons: 5, placket: "full", pockets: "patch" }, style: all("#2f4a7a", "denim") }),
  skirt("tie-waist", "Tie-waist skirt", "Bow at the waist, side slit", { skirt: { hem: "slit" }, details: { bow: "waist" }, style: all("#2f6b62") }),
  skirt("ruffle-mini", "Ruffle-hem mini", "Short with a frilled hem", { skirt: { length: "mini", hem: "ruffle" }, style: all("#f6d6dc") }),
  skirt("ruffle-midi", "Ruffle-hem midi", "Mid-calf with a frilled hem", { skirt: { length: "midi", hem: "ruffle" }, style: all("#1f3a34") }),
  skirt("tiered-mini", "Tiered mini", "Short gathered tiers", { skirt: { silhouette: "flared", length: "mini", fullness: "gathered", hem: "tiered" }, style: all("#e9dff0") }),
  skirt("paneled", "Paneled skirt", "Shaped seams, knee length", { skirt: { panels: "princess_seams" }, style: all("#6b4a7a") }),
  skirt("front-seam", "Front-seam midi", "Straight midi, centre seam", { skirt: { silhouette: "straight", length: "midi", panels: "front_seam" }, style: all("#5a3a22") }),
  skirt("belted", "Belted skirt", "Belt and side pockets", { waist: { style: "belted" }, details: { pockets: "side_seam" }, style: { ...all("#d9c7a3"), waist_seam: solid("#5a3a22") } }),
  skirt("dirndl", "Gathered skirt", "Soft gathers into the waistband", { skirt: { fullness: "gathered" }, style: all("#a8322d") }),
  skirt("high-waist", "High-waist pencil", "Raised waist, straight midi", { skirt: { silhouette: "straight", length: "midi" }, proportions: { waist_y: 0.15 }, style: all("#1f1f24") }),
  skirt("low-rise", "Low-rise mini", "Sits on the hip, short", { skirt: { length: "mini" }, proportions: { waist_y: 0.95 }, style: all("#f3e3c3") }),
  skirt("kilt", "Plaid kilt", "Pleated mini in plaid", { skirt: { length: "mini", fullness: "pleated" }, details: { buttons: 2 }, style: all("#a8322d", "plaid") }),
  skirt("floral-maxi", "Floral maxi", "Full, floor length, floral", { skirt: { silhouette: "flared", length: "floor" }, style: all("#d98aa5", "floral") }),
  skirt("lace-trim", "Lace-trim skirt", "Flared, lace along the hem", { skirt: { silhouette: "flared" }, details: { trim: "lace" }, style: all("#ffffff") }),
  skirt("cargo", "Cargo skirt", "Straight midi, patch pockets", { skirt: { silhouette: "straight", length: "midi", panels: "front_seam" }, details: { pockets: "patch" }, style: all("#6f7355") }),
];

export const templatesFor = (garment: GarmentType) => TEMPLATES.filter((t) => t.spec.garment_type === garment);
