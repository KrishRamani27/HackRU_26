# Current project status

Updated October 10, 2026 after inspecting main, building the frontend and running
backend tests. This replaces the earlier snapshot that said export/library were missing.

## What is connected

- Frontend uploads sketches to POST /analyze and renders the Builder SVG.
- Property edits redraw the flat. Frontend includes v10 detail controls.
- SVG/PNG export, reusable dress parts and grouped custom-drawing libraries exist.
- Manual strokes can be selected, moved, resized, rotated, grouped and layered.
- Saved designs use /designs, including manual elements and stale-write protection.
- Try-on draws a configurable figure locally; it is not a physical fitting simulation.
- Backend has /verify, /command, /suggestions and /monitor/summary.
- Tiger is reachable from Aryan's backend configuration. TimescaleDB, the ai_calls
  hypertable and all three continuous aggregates were verified with read-only queries.
- GCS bucket access was verified; public access prevention is enforced.
  This was a metadata check, not a verified image upload/download.
- No Cloud Run deployment or deployed frontend URL was verified in this audit.

## Remaining team work

| Owner | Gap | Next action |
| --- | --- | --- |
| Builder | Builder/types.ts and geometry still use the older spec; new neckline types fall back to round-neck rendering and v10 details are not drawn | Agree/update the v10 type and rendering contract; frontend controls alone do not implement geometry |
| Frontend | No Monitor page or API client is wired | Use backend/MONITOR.md and backend/contracts/monitor.ts |
| Frontend + backend | Frontend sends no X-API-Key; Cloud Run requires BACKEND_API_KEY | Agree demo authentication before deployment; do not expose Gemini/Tiger/Google credentials in the frontend |
| Frontend | Verify, commands and suggestions are not wired | Connect only the features selected for the demo |
| Frontend | Save now uploads/links the original sketch; saved sketch preview on reopen is still missing | Load GET /assets/{id} into the Sketch tab; live GCS upload test still pending |
| Aryan + AI lead | Aryan's local AI mode is mock, with no Gemini key configured | Add an authorized Gemini key privately and choose AI_MODE=gemini for real analysis |
| Aryan | Cloud Run deployment, shared runtime identity, budget checks and domain are pending | Follow backend/README.md; do not assume a local login deploys the backend |

## Shared files versus private settings

The private GitHub repository shares tracked code, tests, safe environment templates
and documentation with repository collaborators. It does not automatically grant
Google Cloud access. Individual collaborator membership was not verified by this audit.

Never commit backend/.env, downloaded database credentials, Google login credentials,
service-account private keys, local databases or uploads. Each teammate creates their
own environment; deployed secrets belong in Secret Manager. Do not copy Aryan's ADC
credential file onto another laptop.

The original frontend lockfile change is still preserved in a Git stash. Do not drop
or apply it blindly; the current tracked lockfile built successfully.

## Local run on Windows

Terminal 1, from backend:

~~~powershell
.venv\Scripts\python -m uvicorn app.main:app --reload --port 8001
~~~

Terminal 2, from frontend:

~~~powershell
npm.cmd ci
$env:VITE_API_URL="http://localhost:8001"
npm.cmd run dev
~~~

Open http://localhost:5173 for the app and http://localhost:8001/docs for API testing.
The original default backend port remains 8000; 8001 avoids Aryan's local port issue.
Leave both servers running. Use localhost:5173 unless CORS is updated for another origin.

For offline development, create backend/.env from backend/.env.example and use mock
AI, SQLite and local storage. For cloud development, configure Tiger/GCS privately.
Settings in .env override code defaults, and the backend must start from backend/.
