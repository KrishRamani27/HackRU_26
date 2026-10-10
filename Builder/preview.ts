import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { buildFlat } from "./buildFlat";
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
    style: { ...mockSpec.style, ...o.style },
  };
}

const FABRIC_PARTS: PartName[] = ["bodice", "skirt", "left_sleeve", "right_sleeve", "pockets"];
const fabric = (fill: string, pattern: Pattern): DesignSpec["style"] =>
  Object.fromEntries(FABRIC_PARTS.map((p) => [p, { fill, pattern }]));

const flats: { name: string; spec: DesignSpec }[] = [];
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

const outDir = join(dirname(process.argv[1]), "preview");
mkdirSync(outDir, { recursive: true });

const cards = flats.map(({ name, spec }) => {
  const svg = buildFlat(spec);
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
