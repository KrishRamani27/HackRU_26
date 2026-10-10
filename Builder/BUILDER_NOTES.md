# Builder notes (Role 2: Atharva)

Handoff from planning chat. Read this together with CLAUDE.md (the contracts there win if they ever disagree).

## What I own
`Builder/` for now. It moves to `frontend/src/builder/` once the frontend's Vite app exists:
`git mv Builder frontend/src/builder`

## Files
- `types.ts`: TypeScript types for the design spec contract in CLAUDE.md. Shared contract: do not change without the group chat.
- `mockSpec.ts`: hand-made spec (crew neck, no sleeves, straight knee skirt, waist seam).
- `buildFlat.ts`: `buildFlat(spec): string`. Pure function, spec in, SVG string out. No React, no state.
- `svgToPng.ts`: browser-only helper, SVG string to PNG Blob, for POST /verify.
- `preview.ts`: dev-only gallery. `npx tsx Builder/preview.ts` writes `Builder/preview/gallery.html` (38 flats) plus one .svg per flat. `Builder/preview/` is generated; keep it out of git.

## How buildFlat works (judge explanation)
- Canvas 400 x 600, `viewBox="0 0 400 600"`. y grows down. Center line CX = 200. Neck/shoulder line NECK_Y = 70. Hem y comes from skirt.length (mini 300, knee 380, midi 460, floor 560). Waist y comes from proportions.waist_y on a fixed 175..250 scale.
- `layout(spec)` computes every measurement once: shoulder/bust/waist half-widths from proportions.shoulder_width, waist y from proportions.waist_y, neckline width/depth from neckline type/depth. Tune proportions here.
- Symmetry: bodice and skirt outlines are built from RIGHT-side points; left side = `mirror(p)` (x -> 2*CX - x). Sleeves and pockets are drawn once for the right side; the left copy is the same paths in a group with `transform="matrix(-1 0 0 1 400 0)"`. Left/right can never drift apart.
- Fill vs outline: each shape is a closed path for fill (no stroke) plus an open path for the outline. The bodice/skirt boundary line only appears when waist.seam is true (drawn by the waist_seam group).
- Draw order = stacking order: sleeves, skirt, bodice, waist_seam, collar_neckline, pockets, buttons. Sleeves sit behind the bodice so the armhole seam line shows.
- Line styles are SVG attributes (not CSS) so Illustrator keeps them: outline 1.6, details 0.9, topstitch 0.7 dashed.
- Fabric fills are pure-SVG `<pattern>`s (denim/plaid/floral), no images, so PNG export never fails on cross-origin images.
- Every part is a `<g id="...">` with the exact names from CLAUDE.md; empty parts still get an empty group so layer names stay stable.

## Open questions for the group chat
1. `style` shape is not pinned down in CLAUDE.md. Builder expects `style: { [partName]: { fill: "#hex", pattern: "solid"|"denim"|"plaid"|"floral" } }`; a missing part = white solid. AI lead + frontend must match.
2. RESOLVED: `waist_y` is now a fixed scale, 0 = empire line (y 175), 0.5 = natural waist, 1 = dropped waist (y 250): `waistY = 175 + waist_y * 75`. Skirt length no longer moves the waist. Backend default in `schemas.py` (0.4), Gemini prompts and test labels must switch to the new meaning too.

## Known fixes already made
- Duplicate `fill` attribute on filled+stroked shapes (would break Illustrator import).
- Long flared skirts clamped to stay on canvas.
- Patch pockets kept inside the side seam on narrow skirts.
- Shoulder slope is the same angle at any shoulder/neck width (was a fixed 14px drop).
- Bodice side seam curves in to the waist (was a straight diagonal).
- Flared-skirt fold lines end on the curved hem (were poking out below it).
- Sleeve underarm edge starts at the armpit (short sleeves hooked out from behind the bodice).
- Fill colors are checked before going into the SVG: only 6-digit hex gets through, anything else becomes white (blocks code injection through a fake "color"). Unknown patterns draw as solid.
- Unknown option values and NaN numbers fall back to defaults instead of crashing or printing NaN.
- Patch and side-seam pockets shrink to fit short or narrow skirts.
- Buttons are limited to how many fit between neckline and waist.
- Button color comes from style.buttons (was always white).
- Neckline topstitch runs parallel to the neck edge (was drawn on top of it at the sides).
- Fabric patterns: denim lines no longer break at tile corners; denim and floral show on white and light colors; left sleeve and left pocket fabric is no longer mirrored (pattern is flipped back with patternTransform).
- Collar and waist seam take a fill: the collar is a 6px band along the neck edge (`style.collar_neckline`), the waist seam a 6px waistband below the waist line (`style.waist_seam`). Stitch lines sit inside the bands. Buttons start just below the collar band. With every part the same color the drawing looks the same as before.
- Manual drawing: `buildFlat(spec, customElements)` draws hand-drawn strokes and closed shapes on top of the dress (contract: `backend/CUSTOM_ELEMENTS.md`). `buildCustomElements(elements)` returns just their markup. Each element is a `<g id="custom_<id>">` inside one `<g id="manual_drawing">`, sorted by `layer_order`, hidden ones skipped. Ids, colors and numbers are validated before going into the SVG; element names are never written.

## Next steps (in order)
1. Run the gallery and check every option looks right.
2. Open a few preview .svg files in Illustrator (or Inkscape/Figma): named groups present? patterns survive?
3. Line-weight / proportion polish against real dress technical flats.
4. When frontend/src exists: move the folder, check it compiles in the Vite project.
5. Stretch: back view.
