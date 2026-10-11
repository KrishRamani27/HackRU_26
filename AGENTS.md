# FlatSketch — team notes and agent instructions

## How to talk to Aryan

- Keep replies short and use simple English.
- Use emojis naturally.
- When explaining code, explain it line by line until asked to stop.
- For quizzes, ask one question, wait for the answer, then ask the next.

## What we decided together

- Aryan owns backend + packaging.
- The MVP is **dress-only**, front view. General body-part drawings are outside this MVP.
- Use Python + FastAPI for the backend.
- Gemini reads the sketch into dress settings, suggests changes, verifies the flat,
  and turns text commands into edits. The AI lead owns prompts and AI quality.
- The frontend builds clean SVG dress parts from settings and handles editing/export.
- Reusable parts are saved settings and styles, not automatically cut-out images.
- Manual custom drawings are now stored separately from the AI `DesignSpec`, as
  top-level `custom_elements` on saved designs. Frontend/builder must render them.
- Google Cloud Run hosts the backend. Google Cloud Storage holds image files.
- Tiger Cloud PostgreSQL holds design records, history, reusable parts and image references.
- Google Secret Manager holds deployed credentials.

## What we built — October 10, 2026

- FastAPI routes for analysis, verification, commands and suggestions.
- A validated dress spec and validated edit actions matching the project guide.
- Image upload/read routes with format, size and pixel limits.
- Saving, reading, updating and deleting designs, with saved spec versions.
- Saving, listing, filtering, reading and deleting reusable dress parts.
- SQLite + local image storage for development without cloud accounts.
- Gemini, Tiger/PostgreSQL and Google Cloud Storage adapters.
- Explicit mock AI mode, so teammates can connect before credentials are ready.
- Shared team API-key protection, frontend CORS settings, health/readiness routes.
- Docker packaging, pinned dependencies, secret exclusions and setup notes.
- Verification: **36 tests passed** locally. Gemini and GCS adapter tests use fakes;
  this does not mean the live cloud services have been tested.
- Gemini rejects `additionalProperties` in response schemas, so `ai.py` sends the plain
  models in `ai_schemas.py` and validates replies with the strict contract afterwards.
  Checked once against live Gemini with `gemini-3.8-flash`: analyze, command and
  suggestions returned valid data; verify returned values outside the contract (502).
- The default model `gemini-2.5-flash` returns 404 for our key; set `GEMINI_MODEL`.
- Gemini speed-ups in `ai.py`: low thinking level, images downscaled to 1536 px on the
  longest side, 45 s timeout with one retry on a timeout or 5xx. `/analyze` asks Gemini
  for one main fill and pattern and copies it to all 8 parts. Live `/analyze` usually
  takes 4-6 s, with occasional stalls of 40 s or more.
- `/analyze` uses the full field-by-field prompt `ANALYZE_PROMPT` in `ai.py`.
- `/analyze` can also return up to 3 `accents` (a part and a fill) for contrast-color
  parts; `spread_style` in `ai.py` applies them after copying the main style.
- `/verify`, `/command` and `/suggestions` prompts carry `EDIT_GUIDE` (allowed values
  per path); `/verify` also carries `VERIFY_RULES`. Not yet tested against live Gemini.
- The Gemini key is on the free tier: 20 requests per day per model. It ran out during
  testing on October 10; calls then fail with 429 RESOURCE_EXHAUSTED.

## Where to find things

All paths below start at this repository's root.

| File | What it contains |
| --- | --- |
| `AGENTS.md` | These team notes, decisions and working instructions |
| `CHATGPT.md` | Existing project guide, dress spec, team contracts and build order |
| `backend/README.md` | Run instructions, API inputs/outputs, cloud setup and current limits |
| `backend/app/main.py` | FastAPI routes, upload checks and API-key checks |
| `backend/app/schemas.py` | Dress settings, styles, edit actions and saved-part rules |
| `backend/app/ai.py` | Gemini calls, starter prompts and mock replies; AI lead's main file |
| `backend/app/ai_schemas.py` | Gemini-facing reply shapes (all fields required); replies are then checked by `schemas.py` |
| `backend/app/database.py` | Design, version, saved-part and image-record tables |
| `backend/app/storage.py` | Local image files and Google Cloud Storage |
| `backend/app/config.py` | Environment settings |
| `backend/app/custom_schemas.py` | Manual stroke/shape validation and saved-design extension |
| `backend/app/custom_routes.py` | Custom element CRUD, library reuse and version restore |
| `backend/CUSTOM_ELEMENTS.md` | Exact manual drawing contract, coordinates and integration steps |
| `backend/contracts/custom-elements.ts` | Shared TypeScript types for frontend and builder |
| `backend/.env.example` | Settings template; contains no real credentials |
| `backend/requirements.txt` | Direct Python dependency ranges |
| `backend/requirements.lock` | Pinned dependencies used for setup and Docker |
| `backend/Dockerfile` | Backend container packaging |
| `backend/tests/test_backend.py` | Backend tests |
| `AI/evaluate.py` | Offline scoring of saved `/analyze` results against `AI/label/` |
| `AI/prompt_versions.md` | Log of analyze prompt versions, reasons and results |
| `AI/results/` | Saved specs; the backend adds one file per live `/analyze` call |
| `frontend/` | Frontend teammate's area |
| `ml/` | AI teammate's area; backend AI adapter currently lives in `backend/app/ai.py` |

`TEAM_HANDOUT.md` was visible in Aryan's screenshot outside the repository, but its
full contents were not read. `CHATGPT.md` is the project guide inspected so far.
Do not claim these two documents are identical.

## Run the current backend

From `backend/`, using the prepared virtual environment:

```powershell
.venv\Scripts\python -m uvicorn app.main:app --reload
```

Open `http://localhost:8000/docs` to try the API. Defaults use mock AI, SQLite and
local files, so no keys are needed. See `backend/README.md` for a fresh setup.

## Still to do

- Connect the frontend and agree the exact eight style-group names with its builder.
- Frontend: pen/select/move/resize controls and custom layer UI. Builder: render custom
  elements on top of the dress and include them in SVG/PNG export. Backend persistence
  exists; no visible manual editor has been implemented in this backend task.
- Have the AI lead refine prompts and test real dress sketches.
- Configure Gemini credentials, a Tiger database and a private Google Storage bucket.
- Test real Gemini, Tiger and GCS together, then deploy to Cloud Run.
- Test the Docker build; Docker was not available during the initial implementation.
- Voice/audio transcription and ElevenLabs remain stretch work.

No live cloud resources were created or deployed. No credentials were added.
The current backend is a shared team demo; it does not have individual user accounts.

## Manual drawing backend update — October 10, 2026

- Added custom element creation, full replacement, partial edits, deletion and reads.
- Saves points, color/fill/pattern, position/scale/rotation, visibility, parent-part label
  and layer order. Uses 400 × 600 canvas coordinates; parent_part is metadata, not an
  automatic part-relative transform. See `backend/CUSTOM_ELEMENTS.md` before integrating.
- Existing design PUT requests preserve custom elements when the field is omitted/null;
  sending [] clears them. IDs are unique per design. Invalid shapes are rejected.
- Design history includes manual elements; restoring a version appends a new version.
- Custom reusable parts use `/custom-parts`; inserting a template generates a fresh ID.
- Custom elements support optional `group_id` (same ID rules). `/custom-parts` accepts
  `{name, elements: [...]}` for multi-stroke bows and other shapes. Legacy single
  element requests/rows remain supported. Reuse creates fresh element/group IDs and
  inserts the entire group atomically. Contract/types are updated in the same files.
- Verification after the grouping update: **70 tests passed**. No live Gemini calls
  were needed; old single-stroke templates and failed group insertions are tested.
- Added a non-destructive startup upgrade for existing databases and stale-write checks.
- Verification after this update: **49 tests passed**, including old database preservation,
  custom edit/reuse/restore, invalid input rejection and concurrent-save checks.
- No Gemini requests are needed for these routes. No frontend, builder or AI prompt files
  were changed. SQLite migration is tested; live Tiger/GCS deployment still needs testing.

## Rules for future code work

- Keep changes inside the assigned role unless Aryan asks otherwise.
- Preserve existing teammate changes. Do not overwrite `CHATGPT.md` casually.
- Never commit `.env`, API keys, database passwords or service-account key files.
- Keep mock mode clearly marked. Never hide a real AI failure behind a mock reply.
- Keep the dress spec and edit-action contracts consistent with the frontend.
- Gemini chooses design settings; frontend code draws SVG geometry.
- Update these notes when decisions, file locations or completion status change.
