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
- Verification: **19 tests passed** locally. Gemini and GCS adapter tests use fakes;
  this does not mean the live cloud services have been tested.

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
| `backend/app/database.py` | Design, version, saved-part and image-record tables |
| `backend/app/storage.py` | Local image files and Google Cloud Storage |
| `backend/app/config.py` | Environment settings |
| `backend/.env.example` | Settings template; contains no real credentials |
| `backend/requirements.txt` | Direct Python dependency ranges |
| `backend/requirements.lock` | Pinned dependencies used for setup and Docker |
| `backend/Dockerfile` | Backend container packaging |
| `backend/tests/test_backend.py` | Backend tests |
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
- Have the AI lead refine prompts and test real dress sketches.
- Configure Gemini credentials, a Tiger database and a private Google Storage bucket.
- Test real Gemini, Tiger and GCS together, then deploy to Cloud Run.
- Test the Docker build; Docker was not available during the initial implementation.
- Voice/audio transcription and ElevenLabs remain stretch work.

No live cloud resources were created or deployed. No credentials were added.
The current backend is a shared team demo; it does not have individual user accounts.

## Rules for future code work

- Keep changes inside the assigned role unless Aryan asks otherwise.
- Preserve existing teammate changes. Do not overwrite `CHATGPT.md` casually.
- Never commit `.env`, API keys, database passwords or service-account key files.
- Keep mock mode clearly marked. Never hide a real AI failure behind a mock reply.
- Keep the dress spec and edit-action contracts consistent with the frontend.
- Gemini chooses design settings; frontend code draws SVG geometry.
- Update these notes when decisions, file locations or completion status change.
