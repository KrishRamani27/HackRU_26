# Atelier

Turn hand-drawn dress sketches into editable SVG designs. Built at HackRU Fall 2026.
Older notes in this repository use the working name FlatSketch for the same project.

## Live demo

- App: https://hack-ru-26.vercel.app
- Backend API: https://hackru-26.onrender.com (health check at `/health`)

The backend runs on a free plan and sleeps when idle, so the first request after
a quiet spell can take up to a minute.

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

This repository is public. Collaborators share code, not personal Google logins.
Never commit .env, passwords or downloaded credential files. Each laptop needs
its own setup or access to the deployed backend. The frontend is deployed on
Vercel and the backend on Render; Cloud Run deployment is not in use.

## License

MIT. See [LICENSE](LICENSE).
