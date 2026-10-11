import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { buildFlat, type CustomElement } from "./buildFlat";
import { mockSpec } from "./mockSpec";
import type { DesignSpec, PartName, Pattern } from "./types";

// Dev-only gallery: `npx tsx Builder/preview.ts` writes preview/gallery.html
// plus one .svg per flat. The preview/ folder is generated; keep it out of git.

type Override = { [K in keyof DesignSpec]?: Partial<DesignSpec[K]> };

// Every variant starts from mockSpec and overrides only the fields it is showing off.
function variant(o: Override): DesignSpec {
  return {
    ...mockSpec,
    neckline: { ...mockSpec.neckline, ...o.neckline },
    sleeves: { ...mockSpec.sleeves, ...o.sleeves },
    waist: { ...mockSpec.waist, ...o.waist },
    skirt: { ...mockSpec.skirt, ...o.skirt },
    details: { ...mockSpec.details, ...o.details },
    proportions: { ...mockSpec.proportions, ...o.proportions },
    collar: { type: "none", ...o.collar },
    style: { ...mockSpec.style, ...o.style },
  };
}

const FABRIC_PARTS: PartName[] = ["bodice", "skirt", "left_sleeve", "right_sleeve", "pockets"];
const fabric = (fill: string, pattern: Pattern): DesignSpec["style"] =>
  Object.fromEntries(FABRIC_PARTS.map((p) => [p, { fill, pattern }]));

const flats: { name: string; spec: DesignSpec; elements?: CustomElement[] }[] = [];
const push = (name: string, o: Override) => flats.push({ name, spec: variant(o) });

// Necklines (4)
for (const type of ["crew", "v", "scoop", "square"] as const) {
  push(`neckline_${type}`, { neckline: { type, depth: 0.5 } });
}

// Sleeves (8)
push("sleeves_none", { sleeves: { type: "none" } });
push("sleeves_cap", { sleeves: { type: "cap" } });
for (const type of ["puff", "fitted"] as const) {
  for (const length of ["short", "elbow", "long"] as const) {
    push(`sleeves_${type}_${length}`, { sleeves: { type, length } });
  }
}

// Skirts (12)
for (const silhouette of ["straight", "a_line", "flared"] as const) {
  for (const length of ["mini", "knee", "midi", "floor"] as const) {
    push(`skirt_${silhouette}_${length}`, { skirt: { silhouette, length } });
  }
}

// Details (5)
push("pockets_patch", { details: { pockets: "patch" } });
push("pockets_side_seam", { details: { pockets: "side_seam" }, skirt: { silhouette: "a_line" } });
push("buttons_3", { details: { buttons: 3 } });
push("buttons_8", { details: { buttons: 8 } });
push("waist_no_seam", { waist: { seam: false } });

// Proportions (4)
push("waist_empire", { proportions: { waist_y: 0 } });
push("waist_dropped", { proportions: { waist_y: 1 } });
push("shoulders_narrow", { proportions: { shoulder_width: 0 }, sleeves: { type: "fitted", length: "short" } });
push("shoulders_wide", { proportions: { shoulder_width: 1 }, sleeves: { type: "fitted", length: "short" } });

// Fabrics (3)
const dressy: Override = {
  sleeves: { type: "fitted", length: "elbow" },
  skirt: { silhouette: "a_line" },
  details: { pockets: "patch" },
};
push("fabric_denim", { ...dressy, style: fabric("#3b5b8c", "denim") });
push("fabric_plaid", { ...dressy, style: fabric("#a8322d", "plaid") });
push("fabric_floral", { ...dressy, style: fabric("#d98aa5", "floral") });

// Contrast trim (1): collar band, waistband and buttons take their own color
push("contrast_trim", {
  details: { buttons: 4 },
  style: {
    ...fabric("#22304f", "solid"),
    collar_neckline: { fill: "#ffffff", pattern: "solid" },
    waist_seam: { fill: "#ffffff", pattern: "solid" },
    buttons: { fill: "#ffffff", pattern: "solid" },
  },
});

// Styles added in spec v10 (25): one flat per new option
for (const type of ["sweetheart", "off_shoulder", "halter", "high"] as const) {
  push(`neckline_${type}`, { neckline: { type, depth: 0.45 }, skirt: { silhouette: "a_line" } });
}
for (const type of ["shirt", "peter_pan", "band", "mandarin"] as const) {
  push(`collar_${type}`, { collar: { type }, sleeves: { type: "fitted", length: "short" }, skirt: { silhouette: "a_line" } });
}
for (const cuff of ["band", "ruffle", "elastic"] as const) {
  push(`cuff_${cuff}`, { sleeves: { type: "fitted", length: "elbow", cuff }, skirt: { silhouette: "a_line" } });
}
push("shoulder_puff_top", { sleeves: { type: "fitted", length: "short", shoulder: "puff_top" }, skirt: { silhouette: "a_line" } });
push("shoulder_off", { neckline: { type: "square", depth: 0.4 }, sleeves: { type: "fitted", length: "short", shoulder: "off_shoulder" }, skirt: { silhouette: "a_line" } });
push("waist_belted", { waist: { style: "belted" }, skirt: { silhouette: "a_line" } });
for (const fullness of ["gathered", "pleated"] as const) push(`skirt_${fullness}`, { skirt: { silhouette: "a_line", fullness } });
for (const hem of ["ruffle", "tiered", "slit"] as const) {
  push(`hem_${hem}`, { skirt: { silhouette: hem === "slit" ? "straight" : "a_line", length: "midi", hem } });
}
push("panels_front_seam", { skirt: { silhouette: "a_line", panels: "front_seam" } });
push("panels_princess", { skirt: { silhouette: "a_line", panels: "princess_seams" } });
push("placket_full", { details: { buttons: 8, placket: "full" }, skirt: { silhouette: "a_line" } });
push("darts", { details: { darts: true } });
push("bow_neckline", { details: { bow: "neckline" }, collar: { type: "peter_pan" }, skirt: { silhouette: "a_line" } });
push("bow_waist", { details: { bow: "waist" }, skirt: { silhouette: "a_line" } });
push("trim_piping", { details: { trim: "piping" }, neckline: { type: "scoop", depth: 0.4 }, skirt: { silhouette: "a_line" } });
push("trim_lace", { details: { trim: "lace" }, skirt: { silhouette: "flared" } });

// Manual drawing (1): hand-drawn custom elements on top of the dress
const drawn = (el: Partial<CustomElement> & Pick<CustomElement, "id" | "points">): CustomElement => ({
  name: el.id,
  type: "stroke",
  parent_part: null,
  closed: false,
  stroke: "#222222",
  stroke_width: 2,
  fill: null,
  pattern: "solid",
  transform: { x: 0, y: 0, scale_x: 1, scale_y: 1, rotation: 0 },
  visible: true,
  layer_order: 0,
  ...el,
});
flats.push({
  name: "custom_elements",
  spec: variant({ skirt: { silhouette: "a_line" }, style: fabric("#dfe8f5", "solid") }),
  elements: [
    // bow at the waist: two closed loops and a knot on top
    drawn({ id: "bow-left", points: [[200, 216], [172, 202], [172, 230]], closed: true, fill: "#c0392b", layer_order: 1 }),
    drawn({ id: "bow-right", points: [[200, 216], [228, 202], [228, 230]], closed: true, fill: "#c0392b", layer_order: 1 }),
    drawn({ id: "bow-knot", points: [[195, 211], [205, 211], [205, 221], [195, 221]], closed: true, fill: "#8e2a1f", layer_order: 2 }),
    // plaid hem panel, and an open stroke for a dart
    drawn({ id: "hem-panel", points: [[150, 340], [250, 340], [262, 372], [138, 372]], closed: true, fill: "#2f4a7a", pattern: "plaid" }),
    drawn({ id: "dart", points: [[176, 120], [182, 150], [180, 178]], stroke_width: 1.2 }),
    // same star twice: once as drawn, once moved, rotated and scaled by its transform
    drawn({ id: "star", points: [[0, -10], [3, -3], [10, -3], [4, 2], [6, 10], [0, 5], [-6, 10], [-4, 2], [-10, -3], [-3, -3]], closed: true, fill: "#f1c40f", stroke_width: 1, transform: { x: 232, y: 110, scale_x: 1, scale_y: 1, rotation: 0 } }),
    drawn({ id: "star-big", points: [[0, -10], [3, -3], [10, -3], [4, 2], [6, 10], [0, 5], [-6, 10], [-4, 2], [-10, -3], [-3, -3]], closed: true, fill: "#f1c40f", stroke_width: 1, transform: { x: 200, y: 290, scale_x: 2, scale_y: 2, rotation: 18 } }),
    drawn({ id: "hidden", points: [[100, 100], [300, 500]], stroke: "#ff0000", stroke_width: 8, visible: false }),
  ],
});

const outDir = join(dirname(process.argv[1]), "preview");
mkdirSync(outDir, { recursive: true });

const cards = flats.map(({ name, spec, elements }) => {
  const svg = buildFlat(spec, elements);
  writeFileSync(join(outDir, `${name}.svg`), svg);
  return `<figure>${svg}<figcaption>${name}</figcaption></figure>`;
});

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Flat builder gallery (${flats.length})</title>
<style>
  body { margin: 24px; font: 13px/1.4 system-ui, sans-serif; background: #f2f2f0; color: #1a1a1a; }
  main { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 16px; }
  figure { margin: 0; padding: 8px; background: #fff; border: 1px solid #ddd; border-radius: 6px; }
  svg { display: block; width: 100%; height: auto; }
  figcaption { padding-top: 6px; text-align: center; font-family: ui-monospace, monospace; }
</style>
</head>
<body>
<h1>Flat builder gallery: ${flats.length} flats</h1>
<main>
${cards.join("\n")}
</main>
</body>
</html>
`;
writeFileSync(join(outDir, "gallery.html"), html);
console.log(`Wrote ${flats.length} flats to ${outDir}`);
