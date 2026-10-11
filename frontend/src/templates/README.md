# Templates (starter designs)

A **Templates** button in the canvas toolbar opens a picture gallery of ready-made dresses.
Clicking one opens it on the canvas, where everything about it can be edited as usual.

## What a template is

A template is a complete design spec with a name. It is not an image. The picture on each
card is drawn at that moment by `Builder/buildFlat.ts` from the template's spec, the same
way any dress is drawn. So every template uses only options the spec already allows, and
anything Gemini can return can also be reached by editing a template.

All of these designs are our own. Nothing is copied from another product.

## Files

| File | What it is |
| --- | --- |
| `templates.ts` | The list: id, name, one-line note and spec for each design |
| `TemplatesButton.tsx` | The toolbar button and the gallery dialog |
| `templates.css` | Styles, using the app's existing color tokens |
| `index.ts` | What the app imports |

## Adding a template

Add one entry to `TEMPLATES` in `templates.ts`. The `design({...})` helper fills in every
field, so an entry only lists what makes it different. Colors go through `all(fill, pattern)`,
with single parts overridden after it.

## Limits

- Dresses only. Tops and skirts on their own would need `garment_type` to allow them, which
  is a contract change for the whole team (backend, AI prompts and the builder).
- A template opens marked as a sample, like "View sample", because it did not come from a sketch.

## How it is wired into the app

Each touch is marked with `TEMPLATES` in a comment in `src/App.tsx`: the import, the
`openTemplate` callback, and the `<TemplatesButton>` inside `toolbarExtra`.

## How to remove it

Delete this folder and those three pieces in `src/App.tsx`, then run `npm run typecheck`.
