# Builder work summary (Role 2: Atharva)

Everything done on the flat builder so far, as of Saturday Oct 10, 2026 (evening).
Deadlines from `CHATGPT.md`: freeze 7:00 AM Sunday, hacking ends 10:00 AM, judging 1:00 PM.

## 1. Where things stand

| Item | State |
|---|---|
| Drawing engine (`buildFlat.ts`) | Working. Draws every option in the contract. |
| Preview gallery | Working. 36 test dresses in `Builder/preview/gallery.html`. |
| Branch `builder-flat-polish` | Pushed to GitHub with 3 commits. **Not merged into `main`.** |
| Latest bug fixes and pattern fixes | Done on my machine. **Not committed, not pushed.** |
| Builder wired into the frontend app | **Not started.** The app still shows a placeholder tee. |
| Illustrator / Inkscape / Figma import test | **Not done.** Only I can do this. |
| `waist_y` meaning in the Gemini prompt | **Still the old meaning on `main`.** See section 6. |

## 2. What the builder is

`buildFlat(spec)` is a pure function: a design spec goes in, an SVG string comes out.
No React, no state. The same spec always gives the same drawing.
This is the "our code decides HOW to draw it" half of the project.

Files in `Builder/`:

| File | What it is |
|---|---|
| `buildFlat.ts` | The drawing engine (389 lines). |
| `types.ts` | TypeScript types for the design spec. Shared contract. Never changed in this work. |
| `mockSpec.ts` | A hand-made spec so the builder works without the backend. |
| `svgToPng.ts` | Browser-only helper: SVG string to PNG, for `POST /verify`. Untested so far. |
| `preview.ts` | Dev-only script that generates the gallery. |
| `BUILDER_NOTES.md` | Handoff notes and the list of known fixes. |
| `preview/` | Generated output. Ignored by git. |

## 3. How `buildFlat.ts` works (for judges)

- **Canvas:** 400 x 600, y grows down. `CX = 200` is the center line. `NECK_Y = 70` is the
  shoulder line. Hem height comes from skirt length (mini 300, knee 380, midi 460, floor 560).
- **`layout(spec)`:** computes every measurement once, for the right side only. Every other
  function reads from it. This is the one place to tune proportions.
- **Symmetry:** bodice and skirt are built from right-side points, and the left side is each
  point mirrored across the center line. Sleeves and pockets are drawn once and reused in a
  mirrored group. The two sides can never drift apart.
- **Fill vs outline:** each shape is drawn twice, once closed with fill and once open with a
  stroke. That is why the waist line only appears when the spec asks for a seam.
- **Draw order = stacking order:** sleeves, skirt, bodice, waist seam, neckline, pockets,
  buttons. Sleeves sit behind the bodice so the armhole line shows.
- **Line styles are SVG attributes, not CSS,** so Illustrator keeps them: outline 1.6,
  details 0.9, dashed topstitch 0.7.
- **Fabrics are pure SVG patterns** (denim, plaid, floral), no images, so PNG export cannot
  fail on cross-origin images.
- **Every part is a named group** (`collar_neckline`, `bodice`, `left_sleeve`, `right_sleeve`,
  `waist_seam`, `skirt`, `pockets`, `buttons`). Empty parts still get an empty group, so
  layer names stay stable in Illustrator.

## 4. Everything that was done, in order

### 4.1 Setup
- Found `preview.ts` missing from the handoff, and wrote a replacement from the notes.
- Created the gallery: one flat per option, each changing the mock spec in one area.
- Added `Builder/preview/` to `.gitignore`.

### 4.2 Shape polish
- **Shoulder slope:** was a fixed 14 px drop, so narrow shoulders were steep and wide ones
  flat. Now the same angle at any shoulder or neckline width.
- **Bodice side seam:** was a straight diagonal from armpit to waist. Now curves in to the waist.
- **Flared skirt fold lines:** were poking out below the curved hem. Now end exactly on it.
- **Sleeve underarm:** on short sleeves the inner edge hooked out from behind the bodice.
  Now it starts at the armpit on every sleeve type.

### 4.3 `waist_y` redefined (agreed in the group chat)
- **Old meaning:** a fraction of neckline-to-hem. The waist moved when skirt length changed
  and sat too high on short skirts.
- **New meaning:** a fixed scale. 0 = empire line, 0.5 = natural waist, 1 = dropped waist.
- **Formula:** `waistY = 175 + waist_y x 75` on the 400 x 600 canvas.
- **Changed with it:** `mockSpec.ts` (0.3 to 0.5), the `waist_y` line in `CHATGPT.md`, and two
  new gallery flats (`waist_empire`, `waist_dropped`).

### 4.4 Merge
- Merged `origin/main` (backend, frontend, team notes) into `builder-flat-polish`.
- Resolved the one conflict, `.gitignore`, by keeping both sets of lines and adding `.DS_Store`.

### 4.5 Bug fixes (not committed yet)
- **Code injection through a fake colour** (reported by a teammate): the fill colour was
  pasted into the SVG unchecked. Now only a six-digit hex colour gets through; anything else
  becomes white. Tested with a colour containing a `<script>` tag.
- **Crash on unknown values:** an unknown option threw an error and a `NaN` number printed
  `NaN` into the drawing. Unknown options now fall back to a default, bad numbers to the low
  end of their range.
- **Unknown fabric pattern:** wrote the word `undefined` into the SVG. Now draws as solid.
- **Pockets on short or narrow skirts:** sat on the waist seam, stuck out past the skirt, or
  nearly touched in the middle. Both pocket types now shrink to fit.
- **Buttons overlapping:** a deep neckline over a high waist piled 8 buttons into a few
  pixels. Now only as many as fit are drawn.
- **Button colour ignored:** buttons were always white. They now use `style.buttons`.
- **Neckline topstitch:** was drawn on top of the neck edge at the sides. Now runs parallel
  to it, 4 px into the garment.

### 4.6 Fabric pattern fixes (not committed yet)
- **Denim lines were broken** at the corners of each tile, so they looked dashed.
- **Denim and floral were invisible on white** because they only used white marks. Both now
  use light and dark marks and show on any colour.
- **Fabric ran backwards on the left sleeve and left pocket** because the mirror flipped it.
  The pattern is now flipped back so fabric runs the same way across the dress.
- **Base colour rectangle used `100%` sizing,** which Illustrator may read differently. It now
  uses the tile's real size.

## 5. How it was checked

- **Every combination:** 13,824 combinations of necklines, sleeves, skirts, pockets and
  extreme proportions. None produce `NaN`, `undefined` or coordinates off the canvas.
- **By eye:** edge cases and gallery flats were rendered to images and inspected before and
  after each change.
- **Type check:** the builder files pass a strict TypeScript check with the same settings as
  the frontend's `tsconfig.json`.
- **Structure:** every gallery SVG is well-formed and contains all eight named groups.
- **Not checked:** opening the SVGs in Illustrator, and `svgToPng.ts` in a real browser.

## 6. Problems to sort out with the team

1. **The Gemini prompt still uses the old `waist_y` meaning.** On `main`, `backend/app/ai.py`
   tells Gemini "0 = at the neckline, 1 = at the hem ... a natural waist is about 0.4 on a
   knee-length dress". The builder now reads 0.4 as slightly above the natural waist and
   0 as empire. Until the prompt changes to "0 = empire, 0.5 = natural, 1 = dropped",
   Gemini's waist values will be drawn in the wrong place. The test labels in `AI/label/`
   may need the same change. Owner: AI lead.
2. **`CHATGPT.md` on `main` still has the old `waist_y` line.** My branch has the new one.
   It updates when the branch is merged.
3. **`schemas.py` default is already 0.5 on `main`.** My local uncommitted edit to that file
   makes the same change, so it is no longer needed and should be discarded.
4. **`style.collar_neckline` and `style.waist_seam` are ignored by the builder.** Those parts
   are only lines, so there is no area to fill. Frontend should not offer a fill for them, or
   we decide they colour the line instead.
5. **`main` dropped the `Builder/preview/` line from `.gitignore`.** Merging my branch will
   hit a small conflict there again. Keep the line.

## 7. What is left, in order

1. **Commit and push** the bug fixes and pattern fixes (sections 4.5 and 4.6).
2. **Merge `builder-flat-polish` into `main`** so the team gets the fixed builder.
3. **Move the builder into the frontend:** `git mv Builder frontend/src/builder`, check it
   compiles in the Vite app, and have the canvas show `buildFlat(spec)` instead of the
   placeholder tee. This is what the demo needs most.
4. **Get the AI lead to update the `waist_y` prompt** (section 6, item 1).
5. **Import test:** open `fabric_denim.svg` and `fabric_plaid.svg` from `Builder/preview/` in
   Illustrator, Inkscape or Figma. Check the eight layers, the patterns, and that the left
   sleeve fabric lines up.
6. **Test `svgToPng.ts`** in the browser once the frontend calls `/verify`.
7. **Stretch:** back view.

## 8. Useful commands

```
npx tsx Builder/preview.ts          # regenerate the gallery
npx tsx watch Builder/preview.ts    # regenerate on every save
open Builder/preview/gallery.html   # view it
```

## 9. Lines for the judges

- "Gemini decides what the design is. Our code decides how to draw it. Gemini never outputs
  coordinates."
- "The flat is a pure function of the spec, so every edit, by click or by voice, is just a
  spec change and a rebuild."
- "Left and right are drawn from one definition and mirrored, so the flat is always symmetric."
- "Colours from the AI are validated before they go into the SVG, and the frontend sanitizes
  the SVG again before rendering it."
- "We ran all 13,824 option combinations through the builder and none break the drawing."
