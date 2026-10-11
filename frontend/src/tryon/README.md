# Try it on (optional feature)

A pill in the canvas toolbar, "Try it on". Click it and the dress is shown on a drawn
fashion figure, so you can see where the neckline, waist and hem sit on a body. Click
again to go back to the plain flat.

While the figure is showing, the round button next to the pill opens **Figure**
settings: body shape, measurements, skin tone and hair.

Everything for this feature is in this folder, so it can be deleted in one go if the
team decides not to keep it (see the last section).

## What it does and doesn't do

- The figure is drawn behind the dress on the same canvas. The dress stays clickable and
  editable while the figure is showing, and every edit redraws on the figure.
- It shows proportion: where things fall on a body and how wide the skirt is against the
  hips. It does not show drape, fit or movement. It is a preview, not a fitting.
- Export is not affected. Exported SVG and PNG files never contain the figure.
- No backend call, no Gemini call, and no change to the design spec.
- The figure settings are remembered in the browser (`localStorage`), not saved to a design.

## Figure settings

| Setting | Options |
| --- | --- |
| Shape | Standard, Petite, Tall, Curvy, Athletic, Plus. Each is a starting point for the sliders |
| Measurements | Height, shoulders, bust, waist, hips, neck, arm length, leg length, shown in approximate cm |
| Skin | Six tones |
| Hair | Bob, long, short, curly, in six colors |

Longer legs take their length from the torso, so height is its own slider.

## Files

| File | What it is |
| --- | --- |
| `figure.ts` | The settings as plain data: defaults, slider ranges, presets, colors, cm readouts |
| `mannequin.ts` | Draws the figure as SVG and fits the builder's flat onto it |
| `useTryOn.ts` | The feature's state (on/off and the figure settings) in one hook |
| `TryOnControls.tsx` | The toolbar pill, the settings button and the settings panel |
| `tryon.css` | Styles, using the app's existing color tokens |
| `index.ts` | What the app imports |

## How it works

`wearOnMannequin(flatSvg, shoulderWidth, figure)` takes the SVG text from `buildFlat`.

1. **The standard figure fits the dress.** It uses the builder's own landmarks (shoulder
   line, underarm, natural waist, hip, floor) and takes `proportions.shoulder_width`,
   because the builder makes the whole dress wider or narrower with that one number.
   Its arms hang on the same 20° line the builder uses for sleeves.
2. **Each measurement scales one part of that figure.** 1 means standard.
3. **The dress is fitted to the body.** It is made as wide as the body's largest
   measurement needs and as long as the torso, by putting one `matrix(...)` transform on
   each of the builder's part groups. The groups keep their ids and stay top-level, so
   the canvas can still select them. With a standard figure no transform is added at all.
4. **It is drawn as one body.** Every part is a few landmark points rounded into a curve.
   All parts are drawn with a thick outline, then again as plain fills on top, which
   hides every line inside the body and leaves one outline around the whole figure.

The figure goes in `<g id="mannequin">` before the dress groups. Long hair that falls in
front of the shoulders goes in `<g id="mannequin_over">` after them. Both use only SVG
elements and attributes that `flat/sanitizeSvg.ts` already allows.

The figure is drawn by our own code, not from a photo: the arms and legs have to sit
exactly where the builder puts sleeves and hems, the sanitizer does not allow images,
and a stock photo is someone else's property.

## Known limits

- **Drawing with the pen on a non-standard figure.** The dress is stretched to fit the
  figure, but the pen records where the pointer is on the unstretched canvas, so a new
  stroke lands slightly off. Draw with the Standard shape (or try-on off), then switch.
- **One width for the whole dress.** A figure with hips much wider than its shoulders
  gets a dress that is loose at the shoulders, because the builder cannot widen only
  the skirt.
- **Centimetres are approximate.** They describe the drawn figure, not a real pattern.

## One thing to keep in sync

`build()` in `mannequin.ts` copies a few measurements from `layout()` in
`Builder/buildFlat.ts` (shoulder, bust and waist widths, and the range of waist heights).
If the builder changes those, change them here too, or the figure will stop fitting.

## Who does what

| Role | Work |
| --- | --- |
| Builder | Owns this folder: the figure and how the dress fits it |
| Frontend | Nothing required. Optional: move the controls, or restyle them in `tryon.css` |
| Backend | Nothing. Saving a figure with a design would need a new field; not done |
| AI | Nothing |

## How it is wired into the app

Four small touches outside this folder, each marked with `TRY-ON` in a comment:

1. `src/App.tsx`: the import of `TryOnControls` and `useTryOn`.
2. `src/App.tsx`: `const tryOn = useTryOn();`, and one line in the `flat` memo that
   passes the SVG through `tryOn.wear(...)`.
3. `src/App.tsx`: the `toolbarExtra={<TryOnControls ... />}` prop on `<CanvasStage>`.
4. `src/components/CanvasStage.tsx`: an optional `toolbarExtra` prop, rendered at the
   start of the toolbar. It is a general slot and can stay even if this feature goes.

## How to remove it

1. Delete this folder, `frontend/src/tryon/`.
2. In `src/App.tsx`, remove the three `TRY-ON` pieces listed above. In the `flat` memo,
   put back `return { svg: buildFlat(design.spec, design.customElements) };` and take
   `tryOn.wear` out of the dependency list.
3. Run `npm run typecheck` in `frontend/`. It will point at anything left over.
