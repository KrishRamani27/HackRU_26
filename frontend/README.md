# Frontend: Flat Workbench

React + Vite + TypeScript app for FlatSketch. A student uploads a photo of a hand drawn dress, the backend reads it into a design spec, the builder (`Builder/buildFlat.ts`) draws a clean technical flat from that spec, and the student edits it with controls or by clicking parts of the dress. The flat can be exported as SVG (for Illustrator) or PNG.

The idea of the whole project: the AI decides **what** the dress is, our code decides **how** to draw it. The frontend never draws garments itself. `buildFlat` does, and the frontend only holds the spec, edits it, and shows the result.

For a plain language walkthrough (for teammates and judges), read [HANDOUT.md](HANDOUT.md).

## Run

You need the backend running for uploads. The sample works without it.

```powershell
# Frontend (from frontend/)
npm.cmd install
npm.cmd run dev          # http://localhost:5173

# Backend (from backend/, needs Python 3.12 or newer; see backend/README.md)
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements.lock
Copy-Item .env.example .env
.venv\Scripts\python -m uvicorn app.main:app --reload     # http://localhost:8000
```

Scripts: `npm.cmd run build` (type check plus production build), `npm.cmd run preview`, `npm.cmd run typecheck`. The backend defaults to mock AI, so no keys are needed. Never commit `backend/.env`.

The backend address defaults to `http://localhost:8000`. Set `VITE_API_URL` to change it. There are no keys in the frontend, because anything in the bundle is public.

Dev only: `?canvas=loading` and `?canvas=error` on the dev URL preview those canvas states.

## What it does

* **Upload and analyze.** A PNG, JPG or WebP up to 5 MB (the backend's default limit) is checked in the browser, previewed, then sent once to `POST /analyze` as form data with the field `sketch`. The returned `DesignSpec` goes into the spec reducer. Too big or wrong type files are rejected before anything is sent.
* **Mock or real AI.** The backend's `X-AI-Mode` response header decides the label. `mock` is shown as "Demo result (mock AI), not real sketch recognition". `gemini` is "AI result". Anything else is "AI mode unknown".
* **View sample.** Loads the Builder's `mockSpec` into the same editable spec, labeled as not generated from a sketch. It needs no backend. Hide sample returns to the empty canvas.
* **Edit.** The properties panel has one control per `DesignSpec` field: neckline (type, depth), sleeves (type, length), waist seam, skirt (silhouette, length), details (pockets, buttons), proportions (shoulder width, waist height), color and pattern for each of the 8 parts, and notes. Every change redraws the flat with `buildFlat`.
* **Click to select a part.** The flat is drawn inline so its named groups can be clicked. Hover shows a soft outline, click selects, and the panel scrolls to and briefly highlights that part's section and fabric row. Escape or a click on empty canvas deselects. Parts are also reachable with Tab, then Enter or Space. A "Selected" label shows at the bottom of the sheet.
* **Undo and redo.** Ctrl+Z, Ctrl+Shift+Z or Ctrl+Y (Cmd on a Mac), plus buttons in the top bar. Up to 50 steps. A slider or color picker drag, or a stretch of typing in the notes box, is one step. The shortcuts are ignored inside text boxes so the notes box keeps its own undo.
* **Collar and waistband follow the bodice.** The builder fills these as 6px strips. By default they copy the bodice's color and pattern and keep following it. Setting a color or pattern on one gives it its own style. A "Match bodice" button then appears in its row and hands it back to the bodice, as one undo step.
* **Component library.** The left panel has "Sketch" and "Library" tabs (the dark side strip drives the same tabs). Select a part and use "Save to library" to store its settings and style. The Library tab shows saved parts as swatch cards with a `buildFlat` preview, part type filter chips, click to apply, and delete with a confirmation. Applying is one undo step.
* **Draw and edit on the flat.** A Select and a Pen tool sit in the canvas toolbar. With the pen on, press and drag on the flat to draw a freehand stroke; Escape leaves the pen. With Select, click right on a stroke to select it (an invisible 14px wide hit area makes thin strokes easy to hit; elsewhere clicks pass through to the dress part underneath). The properties panel then edits its name, stroke color, stroke width, open or closed, and for a closed shape its fill color and pattern, with a Delete button. Drag a selected stroke to move it (transform x and y); Delete or Backspace removes it unless you are typing in a text box. Strokes are custom elements from `backend/CUSTOM_ELEMENTS.md`, drawn on top of the dress by `buildFlat(spec, customElements)` in the canvas and in export. Every edit, drag and delete is one undo step.
* **Several at once, groups, saved drawings.** With Select, Shift+click adds or removes a drawn stroke, and dragging a box on empty canvas (paper or mat; a drag that starts on a dress part is a box too, a plain click still picks the part) selects every stroke fully inside it. Dragging moves all selected together, Delete or Backspace removes them, and each is one undo step. With several selected the panel shows only stroke color, stroke width, Group or Ungroup, and Delete. Group sets one shared `group_id` on the selection, and clicking any member selects the whole group. "Save to library" on a selected stroke or group stores it with `/custom-parts` (a group is one item). The Library tab has a "Drawings" chip; clicking a drawing card adds an independent copy (new ids, a new `group_id`, `layer_order` above everything) as one undo step.
* **Export.** The Export button (enabled once a design is on the canvas, including the sample) downloads SVG or PNG. The file name comes from the project title, for example `untitled-garment.svg`. A short "Exported" message confirms it.
* **Loading and errors.** While analyzing it says "Reading your sketch…" with a thin progress line. After about 4 seconds it softly rotates reassurance lines. Every failure has a clear title, a message, and "Try again". Two error boundaries (canvas, properties panel) turn an unexpected rendering error into a message instead of a white screen.

## How it fits together

```
upload ─► useSketchUpload ─► useAnalysis ─► POST /analyze ─► DesignSpec
                                                                │ load
                                                                ▼
 controls / library / Match bodice ─► edit actions ─► specReducer (the one spec + history)
                                                                │ spec
                                                                ▼
                                                  Builder/buildFlat(spec) ─► SVG text
                                                       │                        │
                                        sanitizeSvg ─► InlineFlat (canvas)      └─► exportFlat (SVG / PNG)
```

### The spec and edit actions

The spec shape and the edit action `{ op: "set", path, value }` are the shared contracts in `CHATGPT.md`. Types come from `Builder/types.ts`; `src/state/specSchema.ts` holds the allowed values and `isValidEdit`, which applies the same rules as the backend (known path, allowed value, range). Invalid edits are ignored.

`src/state/specReducer.ts` is the single place the current spec lives. Its state is the spec, the hand drawn `customElements` (beside the spec, never inside it, so the spec stays the dress contract that goes to `/analyze`), where it came from, the undo history (`past`, `future`, capped at 50; each snapshot holds the spec, `detached` and the drawing), which trim parts have their own style (`detached`), and an `openKey` used to merge a drag into one step. Actions: `load`, `apply`, `commit`, `undo`, `redo`, `follow`, `draw`, `update`, `delete`, `updateMany`, `deleteMany`, `insert`, `clear`. Selection is UI only and lives in `App.tsx`, outside the reducer. Loading a new sketch or opening the sample starts a fresh history.

After every change `normalizeStyles` makes each part's style complete (a fill and a pattern) and safe (a fill must be `#rrggbb`, a pattern must be allowed). `buildFlat` copies fills into SVG attributes without escaping, so this matters.

### Manual drawing
`src/components/DrawLayer.tsx` is a transparent SVG over the flat with the same viewBox, so its screen matrix is the flat's and pointer positions convert to 400 by 600 canvas units exactly at any zoom or scroll (`clientToCanvas` in `src/draw/strokes.ts`). A finished drag is simplified (Ramer-Douglas-Peucker, tolerance 0.6 units, rounded to 2 decimals, always within the contract's 5000 point limit) and dispatched as `draw`. The reducer adds it with the contract defaults (type `stroke`, `closed` false, stroke `#1C1B1A`, width 2, identity transform, visible, `layer_order` one above the highest, a UUID id, the name "Stroke N") as one undo step, up to 200 elements. `custom_elements` is never sent to `/analyze`. Library previews call `buildFlat(spec)` without elements.

**Selecting, editing, moving.** `InlineFlat` adds a `data-element` attribute, focus, an accessible name and a wide invisible hit copy (`vector-effect: non-scaling-stroke`, 14 screen px) to each `custom_` group in the live DOM only, and the CSS rule `#manual_drawing { pointer-events: none }` makes everything else in that group pass clicks through. Dragging captures the pointer on the stable container (the SVG is rebuilt on every change, which would drop a capture on the stroke itself), converts positions with `clientToCanvas`, and dispatches `update` with `coalesce: element:<id>:move` so a whole drag is one undo step, then `commit` on release. The reducer's `update` action validates against the contract (`validElement`, mirroring `backend/app/custom_schemas.py`), copies only the editable fields (name, stroke, stroke_width, closed, fill, pattern, transform), clears fill and pattern when a shape is opened or its fill removed, and ignores invalid changes. `delete` removes an element as one undo step. Selection (`selectedElements` in `App.tsx`) is UI only and is mutually exclusive with part selection.

**Several, groups and the drawing library.** `updateMany` applies patches to many elements as all or nothing (an unknown id makes it a no-op) and is one undo step; `deleteMany` and `insert` (strict validation, no duplicate ids, 200 cap) likewise. `src/draw/groups.ts` treats a group as one unit for click, Shift+click, box select, move, delete and save. Box select is a 4px drag on `.stage__canvas` with pointer capture taken only once the drag starts, so plain clicks still reach parts. `src/api/customParts.ts` wraps `GET/POST/DELETE /custom-parts` (`POST {name, elements}`; a 404 on delete counts as done). `src/draw/drawings.ts` makes the independent copy (`instantiateDrawing`) and the card previews (`buildCustomElements`). The builder does not write `group_id` into the SVG, so groups exist in state and in saved drawings, not in exports.

### Safe inline SVG

`src/flat/sanitizeSvg.ts` rebuilds the builder's SVG as a new tree from an allowlist of elements (`svg`, `g`, `defs`, `path`, `rect`, `circle`, `pattern`), attributes, and value formats. Scripts, event handlers, styles, links, external references and text nodes cannot survive. The root's `xmlns`, `width` and `height` are dropped on purpose because the canvas sizes the SVG. If the builder starts using another element or attribute, add it there deliberately.

`src/components/InlineFlat.tsx` mounts that tree and adds hover, selection, keyboard focus, and invisible wider hit areas for the thin parts (collar line, waist seam, button dots, side seam pockets).

**Export must use the builder's string, never the on-screen SVG.** Selection, hover and focus styling exist only as CSS and attributes on the live DOM copy. The markup string from `buildFlat(spec)` is never modified, so none of it can leak into a file. `src/export/exportFlat.ts` calls `buildFlat` fresh, refuses to write anything containing scripts or on-screen-only markers, adds an XML declaration, and keeps `xmlns`, `width`, `height`, the 8 named groups, fills and patterns. PNG is 2x (800 by 1200) on white, made with `Builder/svgToPng`.

### The library

A saved part is `{ name, part_type, spec_settings, style }`, with `id` and `created_at` added by the backend. `part_type` is one of neckline, sleeves, waist, skirt, details, proportions. The app uses `GET /parts`, `POST /parts` and `DELETE /parts/{id}`, and uses `/custom-parts` separately for saved drawings (see Manual drawing).

Canvas parts map onto library types in `src/library/libraryModel.ts`: collar is neckline, bodice is proportions, either sleeve is sleeves, waist seam is waist, skirt is skirt, pockets and buttons are details (each stores only its own setting). Applying a card turns it into the same edit actions the controls use and dispatches them together, so invalid values are ignored and one undo reverts all of it. A sleeve style is applied to both sleeves. Card previews are drawn by `buildFlat`: a plain dress with the part applied, cropped to the area it changes.

## File map

| Path | What it is |
| --- | --- |
| `src/main.tsx`, `src/App.tsx` | Entry point. `App` holds the reducer, runs the analysis, calls `buildFlat`, tracks selection and tabs, and assembles the panels. |
| `src/types.ts` | Screen state types (canvas, analysis status, AI mode). |
| `src/styles.css` | All styling. |
| `src/api/analyze.ts`, `src/api/parts.ts` | Backend requests with friendly error messages. |
| `src/hooks/useSketchUpload.ts` | File checks, preview, image size. |
| `src/hooks/useAnalysis.ts` | Sends each good sketch once (also under React StrictMode), cancels stale requests, loads the answer. |
| `src/hooks/useLibrary.ts` | Loads the saved parts once and keeps them in step with saves and deletes. |
| `src/hooks/useUndoShortcuts.ts` | Ctrl+Z, Ctrl+Shift+Z, Ctrl+Y. |
| `src/state/specSchema.ts`, `src/state/specReducer.ts` | Contract rules; the one spec, its history, and the trim follow rules. |
| `src/flat/sanitizeSvg.ts` | The SVG safety filter. |
| `src/draw/groups.ts`, `src/draw/drawings.ts`, `src/api/customParts.ts` | Group helpers, copy and preview of saved drawings, the `/custom-parts` client. |
| `src/draw/strokes.ts` | Pointer to canvas coordinates, stroke simplification, stroke defaults and limits. |
| `src/export/exportFlat.ts` | SVG and PNG download. |
| `src/library/libraryModel.ts` | Saved part mapping, apply, and previews. |
| `src/components/` | `ElementPanel` (properties of a selected stroke), `MultiPanel` (several selected), `TopBar`, `NavRail`, `LeftPanel`, `UploadPanel`, `LibraryPanel`, `CanvasStage`, `InlineFlat`, `DrawLayer`, `PropertiesPanel`, `SavePartBar`, `ExportMenu`, `LoadingNote`, `ErrorBoundary`, `Controls`, `PlaceholderFlat`, `garmentPaths`, `Icons`. |

The drawing code is a teammate's work in `Builder/` at the repo root (`buildFlat.ts`, `mockSpec.ts`, `types.ts`, `svgToPng.ts`). The frontend imports it and must not edit it. `vite.config.ts` allows the dev server to serve that folder.

## Checking changes

There is no automated test suite in the repo. Changes so far were checked with `npm.cmd run build` plus scripted headless-browser runs (real clicks and keystrokes, slow and failing backends, and inspecting downloaded files), which are not committed. If you add tests, the reducer and `libraryModel` are pure and the easiest place to start.

## Known limits

* Gemini mode has not been tested from the frontend. Everything was tested against the backend in mock mode, which returns the same fixed dress for any sketch.
* Whole designs are not saved, only library parts. A refresh loses the current design, including drawn strokes (the backend can store them, but the frontend does not use those routes yet).
* Saved drawings are shared (no accounts) and only the 100 newest are listed.
* Drawing: no resize, rotate, hide, reorder, parent attachment or click-the-corners shape tool yet. Drawing and moving need a pointer (mouse, touch, stylus); strokes can be selected with Tab and Enter but not drawn or moved by keyboard. On a touch screen, dragging a stroke may scroll the page.
* The SVG export has been checked as valid XML and rendered in a browser, but has not been opened in Adobe Illustrator itself.
* Floral on the waistband is hard to see because the builder's band is 6px tall. Side seam pockets are a line, so they take no color. The waistband only exists while the waist seam is on.
* If the backend enables its shared `BACKEND_API_KEY`, the app shows "Backend needs an API key", because it does not send one.
* The 5 MB upload limit mirrors the backend default. If the backend limit changes, change `MAX_BYTES` in `src/hooks/useSketchUpload.ts`.
* Dress only, front view only. Desktop first: it stacks the panels on small screens but is not tuned for phones.
* The loading reassurance lines ("Finding the neckline…") are only reassurance, not real progress.
* Not used yet: the backend's `/verify`, `/command` and `/suggestions` routes (verify loop, voice, AI suggestions), and saving designs.
