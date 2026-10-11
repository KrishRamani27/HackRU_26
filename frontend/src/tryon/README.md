# Try it on (optional feature)

A pill in the canvas toolbar, "Try it on". Click it and the dress is shown on a drawn
fashion figure (a woman with chin-length hair and a lightly drawn face), so you can see where the neckline, waist and hem sit on a body. Click
again to go back to the plain flat.

Everything for this feature is in this folder, so it can be deleted in one go if the
team decides not to keep it (see the last section).

## What it does and doesn't do

- The figure is drawn behind the dress on the same canvas. The dress stays clickable and
  editable while the figure is showing, and every edit redraws on the figure.
- It shows proportion: where things fall on a body and how wide the skirt is against the
  hips. It does not show drape, fit or movement. It is a preview, not a fitting.
- Export is not affected. Exported SVG and PNG files never contain the figure.
- No backend call, no Gemini call, and no change to the design spec.

## Files

| File | What it is |
| --- | --- |
| `mannequin.ts` | Draws the figure as SVG and puts it behind the builder's flat |
| `TryOnPill.tsx` | The toolbar pill |
| `tryon.css` | Styles for the pill, using the app's existing color tokens |
| `index.ts` | The two exports the app uses |

## How it works

`wearOnMannequin(flatSvg, shoulderWidth)` takes the SVG text from `buildFlat` and inserts
one group, `<g id="mannequin">`, before the dress groups. Because it is drawn first, the
dress covers it wherever there is fabric.

The figure lines up with every dress because it uses the builder's own landmarks: the
shoulder line, the underarm, the natural waist, the hip, and the four hem heights. Its
arms hang on the same 20° line the builder uses for sleeves, so sleeves sit over the arms.

The builder makes the whole dress wider or narrower with `proportions.shoulder_width`,
so the figure takes that number and sizes itself to fit inside the dress.

The figure is drawn by our own code as vector shapes, not from a photo. Each body part is
a short list of landmark points that `smooth()` rounds into curves. A photo would not work
here: the arms and legs have to sit exactly where the builder puts sleeves and hems, the
sanitizer does not allow images, and a stock photo is someone else's property.

The figure only uses SVG elements and attributes that `flat/sanitizeSvg.ts` already
allows, so the sanitizer needed no changes.

## One thing to keep in sync

`frame()` in `mannequin.ts` copies four measurements from `layout()` in
`Builder/buildFlat.ts` (shoulder, bust, waist and hip widths). If the builder changes
those, change them here too, or the figure will stop fitting the dress.

## Who does what

| Role | Work |
| --- | --- |
| Builder | Owns this folder: the figure and how it lines up with the dress |
| Frontend | Nothing required. Optional: move the pill, or restyle it in `tryon.css` |
| Backend | Nothing |
| AI | Nothing |

## How it is wired into the app

Four small touches outside this folder, each marked with `TRY-ON` in a comment:

1. `src/App.tsx`: the import of `TryOnPill` and `wearOnMannequin`.
2. `src/App.tsx`: the `tryOn` state, and one line in the `flat` memo that wraps the SVG.
3. `src/App.tsx`: the `toolbarExtra={<TryOnPill ... />}` prop on `<CanvasStage>`.
4. `src/components/CanvasStage.tsx`: an optional `toolbarExtra` prop, rendered at the
   start of the toolbar. It is a general slot and can stay even if this feature goes.

## How to remove it

1. Delete this folder, `frontend/src/tryon/`.
2. In `src/App.tsx`, remove the three `TRY-ON` pieces listed above. In the `flat` memo,
   put back `return { svg: buildFlat(design.spec, design.customElements) };` and take
   `tryOn` out of the dependency list.
3. Run `npm run typecheck` in `frontend/`. It will point at anything left over.
