# Templates (starter designs)

A **Templates** button in the canvas toolbar opens a picture gallery of ready-made designs,
in three sections: **Dresses** (25), **Tops** (27) and **Skirts** (28). Clicking one opens it
on the canvas, where everything about it can be edited as usual.

## What a template is

A template is a complete design spec with a name. It is not an image. The picture on each
card is drawn at that moment by `Builder/buildFlat.ts` from the template's spec, the same
way any dress is drawn. So every template uses only options the spec already allows, and
anything Gemini can return can also be reached by editing a template.

All of these designs are our own. Nothing is copied from another product.

## Files

| File | What it is |
| --- | --- |
| `templates.ts` | Re-exports the list from `Builder/templates.ts`, where it lives so the builder's preview gallery shows the same designs |
| `TemplatesButton.tsx` | The toolbar button and the gallery dialog |
| `templates.css` | Styles, using the app's existing color tokens |
| `index.ts` | What the app imports |

## Adding a template

Add one line to `TEMPLATES` in `Builder/templates.ts`, using `dress(...)`, `top(...)` or
`skirt(...)`. Each takes an id, a name, a one-line note and only the spec fields that make the
design different. Colors go through `all(fill, pattern)`, with single parts overridden after it.

## Tops and skirts

`garment_type` is `"dress"`, `"top"` or `"skirt"`. The builder draws a top as the dress down
to a hem at the hip, and a skirt as the dress without its bodice. They use the same spec
fields as a dress, so the properties panel still shows every control: on a top the "Skirt"
controls shape its lower part, and on a skirt the neckline and sleeve controls do nothing.

Sketch analysis still only returns dresses. Tops and skirts come from templates.

## Limits

- A template opens marked as a sample, like "View sample", because it did not come from a sketch.
- The properties panel does not yet hide the controls that do not apply to a top or a skirt.

## How it is wired into the app

Each touch is marked with `TEMPLATES` in a comment in `src/App.tsx`: the import, the
`openTemplate` callback, and the `<TemplatesButton>` inside `toolbarExtra`.

## How to remove it

Delete this folder and those three pieces in `src/App.tsx`, then run `npm run typecheck`.
