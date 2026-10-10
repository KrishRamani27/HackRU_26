# Frontend: Flat Workbench

React + Vite + TypeScript workbench for viewing and editing fashion technical flats.

## Run (PowerShell)

```powershell
cd frontend
npm.cmd install
npm.cmd run dev        # http://localhost:5173
```

Other scripts: `npm.cmd run build`, `npm.cmd run preview`, `npm.cmd run typecheck`.

## Current scope

- **Upload and analyze:** a valid sketch (PNG, JPG or WebP, up to 5 MB) is sent once to `POST /analyze` (`VITE_API_URL`, default `http://localhost:8000`). The returned DesignSpec is drawn with `Builder/buildFlat`. If `X-AI-Mode` is `mock`, the result is labeled as a demo, not real sketch recognition. No API key is sent.
- **Editing:** the properties panel edits the current spec. One reducer (`src/state/specReducer.ts`) holds it and applies `{ op: "set", path, value }` edit actions; invalid actions are ignored using the same rules as the backend (`src/state/specSchema.ts`). Every change redraws the flat with `buildFlat`. Edits stay in the browser; nothing is saved or sent.
- **Part selection:** the flat is drawn inline (not in an `<img>`) so its parts can be clicked. The SVG is sanitized first (`src/flat/sanitizeSvg.ts`): a new tree is built from allowlisted elements, attributes and value formats, so scripts, event handlers, styles, links and external references cannot survive. Hover, click, keyboard (Tab, Enter or Space) and Escape or an empty-canvas click to deselect are handled in `src/components/InlineFlat.tsx`. Selecting a part scrolls the properties panel to its section and briefly highlights it and its fabric row.
- **Why export must use that string:** selection and hover styling exist only as CSS and attributes on the live DOM copy. The builder's markup string (`buildFlat(spec)`) is never modified, so export must serialize that string, never the on-screen DOM.
- **Undo and redo:** the reducer keeps up to 50 earlier specs (`past`) and the undone ones (`future`). Ctrl+Z undoes, Ctrl+Shift+Z or Ctrl+Y redoes (ignored while typing in a text box), and the top bar has undo and redo buttons. Edits that stream in from one control (slider drag, color picker, typing notes) pass a `coalesce` key and merge into one step until the control is released (`commit`). Re-choosing the current value adds no step.
- Loading a new sketch or opening the sample replaces the current spec and starts a fresh history.
- **Export:** the Export button (disabled until something is loaded) downloads SVG or PNG. It is built from a fresh `buildFlat(spec)` string, never the on-screen DOM (`src/export/exportFlat.ts`). SVG keeps xmlns, width, height, the named part groups, fills and patterns. PNG is 2x on white, via `Builder/svgToPng`. The file name comes from the project title, e.g. `untitled-garment.svg`.
- `CanvasState` in `src/types.ts` holds only UI state. Builder SVG is rendered through an `<img>`, so no script inside it can run.

## Sample preview

The empty canvas has a **View sample** button. It loads the Builder's `mockSpec` into the same editable spec, always labeled "Sample preview—not generated from a sketch". It is editable like any other spec, never enables Export, and has nothing to do with uploaded sketches.

## Previewing states (dev only)

- `http://localhost:5173/?canvas=loading`: canvas loading state
- `http://localhost:5173/?canvas=error`: canvas error state
- To see the upload error state, upload a non-image file or one larger than 5 MB.
