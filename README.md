# HackRU_26

FlatSketch: turn dress sketches into editable SVG designs.

## Start here

- [Current team status and remaining integration work](docs/WORKFLOW_STATUS.md)
- [Backend setup, Tiger, GCS and deployment](backend/README.md)
- [Frontend setup and features](frontend/README.md)
- [Builder notes](Builder/BUILDER_NOTES.md)
- [AI prompt versions](AI/prompt_versions.md)
- [AI monitor API contract](backend/MONITOR.md)
- [Manual drawing API contract](backend/CUSTOM_ELEMENTS.md)
- [Team decisions and file map](AGENTS.md)
- [Devpost draft](docs/DEVPOST_DRAFT.md)

## Run locally on Windows

From backend/, for a fresh setup only:

~~~powershell
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements.lock
Copy-Item .env.example .env
.venv\Scripts\python -m uvicorn app.main:app --reload --port 8001
~~~

Do not overwrite an existing .env. Defaults work offline with mock AI, SQLite
and local storage. Real AI and cloud storage need private credentials.

In a second terminal, from frontend/:

~~~powershell
npm.cmd ci
$env:VITE_API_URL="http://localhost:8001"
npm.cmd run dev
~~~

Open http://localhost:5173. API docs: http://localhost:8001/docs.
Mac/Linux Python commands are in backend/README.md; use npm instead of npm.cmd
and export VITE_API_URL=http://localhost:8001 before npm run dev.

## Team safety

This repository is private. Collaborators share code, not personal Google logins.
Never commit .env, passwords or downloaded credential files. Each laptop needs
its own setup or access to a deployed backend. Cloud Run deployment is pending.
