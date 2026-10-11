import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { buildFlat } from "./buildFlat";
import type { DesignSpec } from "./types";

// Dev-only: `npx tsx Builder/compare.ts` writes preview/compare.html, showing each real test
// sketch next to the flat the builder draws from Gemini's saved /analyze results (AI/results).
// Use it to see where the drawing does not match what a student actually sketched.

const root = join(dirname(process.argv[1]), "..");
const resultsDir = join(root, "AI", "results");
const outDir = join(root, "Builder", "preview");
mkdirSync(outDir, { recursive: true });

const esc = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// "test1__20261010-190217.json" and "test1.json" both belong to sketch "test1".
const runs = readdirSync(resultsDir)
  .filter((f) => f.endsWith(".json"))
  .sort()
  .map((file) => ({ file, sketch: file.replace(/(__.*)?\.json$/, "") }));

const rows = runs.map(({ file, sketch }) => {
  const spec = JSON.parse(readFileSync(join(resultsDir, file), "utf8")) as DesignSpec;
  let flat: string;
  try {
    flat = buildFlat(spec);
  } catch (error) {
    flat = `<p class="error">Builder could not draw this result: ${esc(String(error))}</p>`;
  }
  const summary = [
    `neckline ${spec.neckline?.type} (${spec.neckline?.depth ?? "?"})`,
    `sleeves ${spec.sleeves?.type} ${spec.sleeves?.length}`,
    `skirt ${spec.skirt?.silhouette} ${spec.skirt?.length}`,
    `waist seam ${spec.waist?.seam}, waist_y ${spec.proportions?.waist_y ?? "?"}`,
    `pockets ${spec.details?.pockets}, buttons ${spec.details?.buttons}`,
  ];
  return `<section>
  <h2>${esc(file)}</h2>
  <div class="pair">
    <figure><img src="../../AI/test_sketches/${esc(sketch)}.jpg" alt="sketch ${esc(sketch)}"><figcaption>sketch</figcaption></figure>
    <figure>${flat}<figcaption>builder flat</figcaption></figure>
    <div class="info"><ul>${summary.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>
    <p><b>Gemini notes:</b> ${esc(spec.notes ?? "") || "none"}</p></div>
  </div>
</section>`;
});

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Sketch vs flat (${runs.length} results)</title>
<style>
  body { margin: 24px; font: 14px/1.5 system-ui, sans-serif; background: #f2f2f0; color: #1a1a1a; }
  section { margin-bottom: 28px; padding: 16px; background: #fff; border: 1px solid #ddd; border-radius: 6px; }
  h2 { margin: 0 0 12px; font: 600 14px ui-monospace, monospace; }
  .pair { display: grid; grid-template-columns: 300px 300px 1fr; gap: 20px; align-items: start; }
  figure { margin: 0; text-align: center; }
  img, svg { display: block; width: 100%; height: 450px; object-fit: contain; background: #fafafa; border: 1px solid #eee; }
  figcaption { padding-top: 6px; color: #666; }
  .error { color: #b00020; }
</style>
</head>
<body>
<h1>Sketch vs builder flat: ${runs.length} saved /analyze results</h1>
${rows.join("\n")}
</body>
</html>
`;
writeFileSync(join(outDir, "compare.html"), html);
console.log(`Wrote ${runs.length} comparisons to ${join(outDir, "compare.html")}`);
