# FlatSketch: end-to-end workflow and status

A read of the whole repository (frontend, Builder, backend, AI) on October 10, 2026,
at commit `75bfaa5` on `main`. It describes what the code does today, not what is
planned.

This is from reading the code. The frontend was not run for this review, and three
prompt changes have not been tested against live Gemini (see the AI section).

## Summary

The core path exists in code: upload a sketch, the backend asks Gemini for a design
spec, the Builder draws a flat from it, and editing a property redraws the flat.

The one missing link for the demo is **Export**. The button is disabled and has no
code behind it. The library, the verify loop, text commands and suggestions are also
not connected in the frontend, although the backend routes for them exist.

## One sketch, end to end

| Step | File and function | What happens |
| --- | --- | --- |
| 1. Pick a file | [App.tsx](../frontend/src/App.tsx) `onInputChange`, or `onDrop` in [UploadPanel.tsx](../frontend/src/components/UploadPanel.tsx) | Calls `sketch.accept(file)` |
| 2. Check it locally | [useSketchUpload.ts](../frontend/src/hooks/useSketchUpload.ts) `accept` | PNG, JPG or WebP only, 5 MB max; decodes it for a preview |
| 3. Send to backend | [useAnalysis.ts](../frontend/src/hooks/useAnalysis.ts) → [analyze.ts](../frontend/src/api/analyze.ts) `analyzeSketch` | `POST http://localhost:8000/analyze`, form field `sketch` |
| 4. Route | [main.py](../backend/app/main.py) `analyze` → `read_image` | Checks size and format, passes the bytes and filename on |
| 5. Gemini | [ai.py](../backend/app/ai.py) `AIService.analyze` → `call` | `shrink` to 1536 px, sends `ANALYZE_PROMPT` with the `GeminiDesignSpec` schema, 45 s timeout, one retry |
| 6. Validate | [ai.py](../backend/app/ai.py) `spread_style`, then strict `DesignSpec` in [schemas.py](../backend/app/schemas.py) | One main style is copied to all 8 parts; a bad reply becomes a 502 |
| 7. Save for scoring | [ai.py](../backend/app/ai.py) `save_result` | Writes `AI/results/<image>__<time>.json` |
| 8. Load the spec | [useAnalysis.ts](../frontend/src/hooks/useAnalysis.ts) → [specReducer.ts](../frontend/src/state/specReducer.ts) `load` | `normalizeStyles` fills in safe styles; the `X-AI-Mode` header is kept for the label |
| 9. Draw the flat | [App.tsx](../frontend/src/App.tsx) `useMemo` → [buildFlat.ts](../Builder/buildFlat.ts) `buildFlat(spec)` | Returns one SVG string with 8 named groups |
| 10. Show it | [CanvasStage.tsx](../frontend/src/components/CanvasStage.tsx) → [InlineFlat.tsx](../frontend/src/components/InlineFlat.tsx) → `sanitizeSvg` | An inline, clickable copy of the SVG |
| 11. Edit | [PropertiesPanel.tsx](../frontend/src/components/PropertiesPanel.tsx) `set` → `applyEdit` in [App.tsx](../frontend/src/App.tsx) → reducer `apply` | The spec changes and step 9 runs again |
| 12. Export | [TopBar.tsx](../frontend/src/components/TopBar.tsx) | **Stops here.** The button is disabled and has no click handler |

## Five specific checks

### 1. Does upload call the backend `/analyze` route?

Yes. `analyzeSketch` in [analyze.ts](../frontend/src/api/analyze.ts) posts to
`${API_URL}/analyze`. `API_URL` is the `VITE_API_URL` setting, or
`http://localhost:8000` by default. It sends no `X-API-Key` header.

### 2. Does the frontend draw with the Builder, or by itself?

It uses the Builder. [App.tsx](../frontend/src/App.tsx) imports `buildFlat` from
`Builder/`.

- There is no `SampleFlat` file.
- `PlaceholderFlat` and `garmentPaths` draw a dashed T-shirt outline, only on the
  empty canvas and the empty properties panel.
- "View sample" draws the Builder's `mockSpec` through the same `buildFlat`.

### 3. Does an edit update the spec and redraw the flat?

Yes. Every control sends a `{ op: "set", path, value }` action. `isValidEdit` in
[specSchema.ts](../frontend/src/state/specSchema.ts) checks it with the same rules
as the backend, the reducer applies it, and the flat is rebuilt. Edits stay in the
browser; nothing is saved or sent.

### 4. Are save-to-library and export connected?

No.

- **Export:** `exportEnabled={false}` is hard-coded in [App.tsx](../frontend/src/App.tsx).
- **Library:** a disabled button in [NavRail.tsx](../frontend/src/components/NavRail.tsx).
  The frontend never calls `/parts` or `/designs`.

### 5. Mismatches between frontend, Builder, CHATGPT.md, AGENTS.md and schemas.py

The allowed values and the 8 SVG group names match everywhere: `CHATGPT.md`,
`Builder/types.ts`, `frontend/src/state/specSchema.ts` and `backend/app/schemas.py`.

The real differences:

| Mismatch | Where | Effect |
| --- | --- | --- |
| `waist_y` default is 0.4, on the old scale | [schemas.py](../backend/app/schemas.py), `Proportions` | Mock mode and `/spec/example` draw a slightly raised waist; 0.5 is the natural waist |
| "Waist height" slider ends say "Neckline" and "Hem" | [PropertiesPanel.tsx](../frontend/src/components/PropertiesPanel.tsx) | Wrong labels; the scale now runs from empire line to dropped waist |
| No `X-API-Key` sent | [analyze.ts](../frontend/src/api/analyze.ts) | Fine locally, where the key is empty; 401 once the backend is deployed with a key |
| CORS allows only `http://localhost:5173` | `backend/.env.example` | Opening the app at `127.0.0.1:5173` fails |
| Collar and waist seam have no fill | [buildFlat.ts](../Builder/buildFlat.ts) | Their style from the backend is ignored; the frontend disables those controls |
| Saved part types are spec sections, not SVG parts | [schemas.py](../backend/app/schemas.py), `SavedPart` | No frontend code uses them yet, so nothing breaks today |
| Stale docs | `frontend/README.md` says the SVG is shown through an `<img>`; `AGENTS.md` lists `ml/` (the folder is `AI/`) and has no `Builder/` row | Confusing, not breaking |

## Status of each part

### Frontend

- **Working:** upload with checks; the `/analyze` call with clear error states and
  retry; spec state; all property controls; per-part color and pattern;
  click-to-select parts; zoom; mock and Gemini labels.
- **Placeholder:** the T-shirt outline on empty states; "View sample" (the Builder's
  `mockSpec`, clearly labeled).
- **Missing:** export, library, `/verify`, `/command`, `/suggestions`, saving
  designs, voice.

### Builder

- **Working:** `buildFlat` draws every option, mirrored left and right, with fabric
  patterns and 8 named groups; `preview.ts` makes a test gallery.
- **Placeholder:** `mockSpec`.
- **Missing:** `svgToPng` exists but nothing calls it (it is for `/verify`); the back
  view is a stretch goal; the folder has not moved into `frontend/src` yet.

### Backend

- **Working:** all routes; strict validation; image checks; designs, versions and
  parts on SQLite; 30 tests pass.
- **Placeholder:** mock AI mode; local file storage and SQLite stand in for Google
  Cloud Storage and Tiger PostgreSQL.
- **Missing:** any cloud deployment; live tests of GCS and PostgreSQL; the Docker
  build is untested.

### AI

- **Working:** the `/analyze` prompt scored 39/40 over 5 live runs on 3 sketches; the
  Gemini schema fix, retry and image downscaling; `AI/evaluate.py` and
  `AI/prompt_versions.md`.
- **Placeholder:** only 3 labelled sketches; the AI Studio entries in the prompt log
  are empty.
- **Missing:** live tests of the neckline rule, the new `waist_y` scale and the edit
  prompts; a Gemini key with enough quota (the free tier allows 20 requests a day).
  `/analyze` returns one color for the whole dress.

## What to connect for the demo, in order

The demo: upload a sketch, see a clean flat drawn from Gemini's spec, edit one
property, export the SVG.

1. **Get Gemini answering.** Put a working key in `backend/.env` and restart the
   backend. Without this, an upload ends in an error card.
2. **Run both servers.** Backend on port 8000. In `frontend/`, run `npm install` then
   `npm run dev`, and open `http://localhost:5173` (not `127.0.0.1`).
3. **Do one real upload in the browser.** Steps 1 to 11 above are wired, but they
   have not been seen running together since the Gemini schema fix.
4. **Wire the Export button.** This is the only missing code. `App.tsx` already holds
   the finished SVG string in `flat.svg`. The button needs a click handler that
   downloads it as a `.svg` file, and `exportEnabled` needs to be true when a flat is
   on screen. Export that string, not the on-screen copy, which carries selection
   markup.
5. **Fix the two `waist_y` leftovers.** The slider labels in the frontend and the 0.4
   default in the backend.
6. **Open the exported file in Illustrator once** to confirm the 8 named groups and
   the patterns survive.
