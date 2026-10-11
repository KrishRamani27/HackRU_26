# FlatSketch backend

Python + FastAPI for the **dress-only** MVP. Gemini reads design choices; the frontend
builds the SVG. Saved parts are settings and styles, not AI-cut image fragments.
The AI lead owns prompts in `app/ai.py`. Backend owns routes, validation, storage and deployment.

Manual strokes and shapes can now be saved with a design, edited, restored from history
and reused. See [the custom-element contract](CUSTOM_ELEMENTS.md) for frontend/builder
types, coordinate rules and endpoints. These operations do not call Gemini.

## Run locally

Run these commands from the `backend` folder with Python 3.12 or newer:

```powershell
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements.lock
Copy-Item .env.example .env
.venv\Scripts\python -m uvicorn app.main:app --reload
```

Open http://localhost:8000/docs to try the API. No keys are needed in mock mode.
If Windows `python` opens the Store, use an installed Python interpreter or `uv`.
This workspace already has `.venv` prepared, so you can start with the last command.

```powershell
.venv\Scripts\python -m pytest -q
```

## Services

Mac/Linux setup, from the backend folder:

~~~bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.lock
cp .env.example .env
.venv/bin/python -m uvicorn app.main:app --reload
~~~

Copy .env.example only for a fresh setup; do not overwrite an existing .env.

| Service | What goes there |
| --- | --- |
| Google Cloud Run | FastAPI code, running inside the Docker container |
| Google Cloud Storage | Original sketches, PNG/JPEG/WebP previews uploaded by the frontend |
| Tiger Cloud PostgreSQL | Designs, manual elements, history, reusable parts, image references and AI quality time-series |
| Gemini API | Sketch analysis, optional suggestions, verification, text edits |
| Google Secret Manager | Gemini key, database URL, shared backend key |

Local development uses SQLite and `data/uploads`. In Cloud Run, use Tiger and GCS:
local container files are temporary and are not shared between instances.

## API contract for teammates

All protected routes accept `X-API-Key` when `BACKEND_API_KEY` is set.
This is a shared team demo, not a multi-user account system. A browser-accessible shared
key is not a private user identity. Add real user authentication before public production use.

| Route | Input | Output |
| --- | --- | --- |
| `GET /health` | None | Status and AI mode |
| `GET /ready` | None | Database check and configured storage mode |
| `GET /spec/example` | None | Full sample dress spec |
| `POST /analyze` | Multipart file `sketch` | Design spec directly |
| `POST /verify` | Multipart files `sketch`, `flat`, text `spec` (JSON) | Array of edit actions |
| `POST /command` | JSON `{text, spec}` | Array of edit actions |
| `POST /suggestions` | JSON `{spec, goal?}` | `{suggestions: [{explanation, actions}], end_goal}` |
| `POST /assets` | Multipart file `image` | Asset record with `id` and relative `url` |
| `GET /assets/{id}` | None | Image bytes |
| `POST /designs` | JSON `{name, spec, sketch_asset_id?, custom_elements?}` | Saved design, ID, version |
| `GET /designs` | Optional `limit`, `offset` | Array of designs |
| `GET /designs/{id}` | None | Saved design |
| `PUT /designs/{id}` | Same JSON as create | Updated design, new version |
| `GET /designs/{id}/versions` | Optional `limit`, `offset` | Saved specs and custom elements, newest first |
| `DELETE /designs/{id}` | None | 204; removes design and versions, keeps image |
| `POST /parts` | Saved-part JSON from the handout | Saved part with ID |
| `GET /parts` | Optional `part_type`, `limit`, `offset` | Array of saved parts |
| `GET /parts/{id}` | None | Saved part |
| `DELETE /parts/{id}` | None | 204 |

The eight style keys follow the frontend SVG groups: `collar_neckline`, `bodice`,
`left_sleeve`, `right_sleeve`, `waist_seam`, `skirt`, `pockets`, `buttons`.
Each value is `{fill: "#ffffff", pattern: "solid"}`. Agree this naming with the builder teammate.
All other spec fields match `CHATGPT.md`. `/docs` includes the full schemas.
An edit uses `{op: "set", path: "sleeves.type", value: "puff"}`.
Unknown paths, invalid options, wrong types and out-of-range values are rejected.

### Frontend upload example

```typescript
const form = new FormData();
form.append("sketch", sketchFile);
const response = await fetch(`${apiUrl}/analyze`, {
  method: "POST",
  headers: { "X-API-Key": teamKey },
  body: form,
});
if (!response.ok) throw new Error("Analysis failed");
const spec = await response.json();
```

`FormData` attaches the drawing file. `fetch` sends it to the backend.
The status check catches failed requests. `response.json()` reads the dress settings.
Let the browser set multipart Content-Type, including its boundary.

To save a drawing: upload with `/assets`, then put the returned ID in `sketch_asset_id`
when creating a design. Analysis alone does not save the upload.
To display protected image URLs, fetch them with the header and use a Blob URL;
an ordinary `<img>` cannot attach `X-API-Key`.

### Saved sleeve example

```json
{
  "name": "My puff sleeve",
  "part_type": "sleeves",
  "spec_settings": {"type": "puff", "length": "elbow"},
  "style": {"fill": "#1f2a44", "pattern": "denim"}
}
```

The frontend applies these settings to `spec.sleeves`, applies the style to both
sleeve groups and rebuilds the flat. Supported library categories: neckline, sleeves,
waist, skirt, details, proportions. There is no standalone bodice shape field in the handout.

## Connect real Gemini

Set `AI_MODE=gemini`, `GEMINI_API_KEY`, and a `GEMINI_MODEL` available to your account.
The current example uses `gemini-2.5-flash`; the model is configurable.
Mock analysis always returns the same sample spec. Mock verify and command return `[]`.
Mock suggestions return no suggested edits. AI responses carry `X-AI-Mode` so the UI can
show a demo badge. Real AI errors never silently return a mock result.

The Gemini SDK uses structured responses, followed by backend validation.
The AI lead can refine prompts without changing the HTTP contract.
`/command` accepts transcribed text; audio transcription and ElevenLabs are stretch work.
Suggestions describe the end goal; they do not generate a finished dress image.

## Connect Tiger Cloud

Create a Tiger Cloud service. Put its provided connection URL in `DATABASE_URL`, keeping SSL:

```dotenv
DATABASE_URL=postgresql+psycopg://USER:PASSWORD@HOST:PORT/tsdb?sslmode=require
```

URL-encode special password characters. Keep this URL private.
The app creates five tables on startup: `assets`, `designs`, `design_versions`, `saved_parts`, `custom_parts`.
This MVP uses normal PostgreSQL tables; time-series features are not needed yet.
Switching from local SQLite does not copy local records to Tiger automatically.
The manual-drawing upgrade adds its JSON columns to old databases on startup without
deleting records. See `CUSTOM_ELEMENTS.md`. For future schema changes, add migrations.

## Google Cloud and Docker

Set `STORAGE_MODE=gcs`, `GCS_BUCKET`, `GOOGLE_CLOUD_PROJECT` and `BACKEND_API_KEY`.
Give the Cloud Run service account `roles/storage.objectUser` on the private bucket.
Use the default Cloud Run identity; do not commit a service-account key file.
Grant Secret Manager access only to the needed secrets.
Set `CORS_ORIGINS` to a JSON array containing your real frontend URL.
Cloud Run requires billing and enabled deployment APIs. Use your sponsor credits and a budget alert.

Build and run locally from `backend`:

```powershell
docker build -t flatsketch-backend .
docker run --rm -p 8080:8080 --env-file .env flatsketch-backend
```

The container excludes `.env`, uploaded images and local databases.
To preserve local Docker data, mount a volume at `/app/data`.

When your project, private bucket and secrets exist, a deployment template is:

```powershell
gcloud run deploy flatsketch-backend --source . --region us-central1 --allow-unauthenticated --max-instances 2 --set-env-vars 'AI_MODE=gemini,STORAGE_MODE=gcs,GCS_BUCKET=YOUR_BUCKET,GOOGLE_CLOUD_PROJECT=YOUR_PROJECT' --set-secrets 'GEMINI_API_KEY=gemini-api-key:latest,DATABASE_URL=tiger-database-url:latest,BACKEND_API_KEY=backend-api-key:latest'
```

Set the frontend CORS URL in the Cloud Run environment before connecting the UI.
`--allow-unauthenticated` makes the service reachable; application routes still check
the shared team key. This template is documentation; no cloud resources have been created.
The Docker entrypoint respects Cloud Run's `PORT`.

## Limits for this MVP

Uploads are limited to 5 MB and 20 million pixels; only PNG/JPEG/WebP are accepted.
The predefined library saves dress settings. The custom library saves manual drawing
points/styles/transforms. Neither automatically cuts parts out of images.
There is no Google Images scraper, generated-image service, user login or voice upload.
The frontend owns rendering, clicking edits, previews and layered SVG export.
Live Gemini, Tiger, GCS and Docker deployment require credentials/tools and separate testing.

References: [Gemini structured output](https://ai.google.dev/gemini-api/docs/structured-output),
[Cloud Run FastAPI](https://docs.cloud.google.com/run/docs/quickstarts/build-and-deploy/deploy-python-fastapi-service),
[Cloud Storage uploads](https://docs.cloud.google.com/storage/docs/uploading-objects-from-memory),
[Tiger Data MLH resources](https://www.mlh.com/partners/tigerdata).

## AI quality monitor and Tiger setup

GET /monitor/summary returns AI speed, accuracy, failures and frequently missed
fields. See [MONITOR.md](MONITOR.md) for the exact frontend JSON contract.
Default model is gemini-3.8-flash; an existing GEMINI_MODEL in .env overrides it.

1. Create a Tiger Cloud service with TimescaleDB enabled. Check the current
   signup card/trial rules before accepting anything; this code does not create
   a paid service or confirm free-tier eligibility.
2. Put the PostgreSQL connection URL in backend/.env as DATABASE_URL.
   Keep sslmode=require. URL-encode special password characters if constructing
   the URL manually. Never commit or share the connection URL in team chat.
3. Install requirements.lock (already includes psycopg and tzdata). Restart the
   backend from backend/. Startup creates the hypertable and continuous aggregates.
   The role must have permission to create these objects and refresh jobs.
4. Keep AI/label/ available for scoring, or set MONITOR_DATA_DIR to a folder with
   label/ (or labels/), results/ and prompt_versions.md. Unlabelled calls still log.
5. Import/refresh saved results without spending Gemini quota:

~~~powershell
.venv\Scripts\python -m app.monitor_import --data-dir ../AI
~~~

On Mac: .venv/bin/python -m app.monitor_import --data-dir ../AI.
These commands read DATABASE_URL from .env. Imported Tiger rows persist for
Cloud Run to read. MONITOR_IMPORT_HISTORY=false disables startup import, not logging.
SQLite needs no Tiger account; the same route and tests work locally.

The backend-only Docker build does not include the repository's AI/ folder.
Seed Tiger with the import CLI before deployment. For live Docker scoring, mount
a read-only labels folder and set MONITOR_DATA_DIR to its container path.
For Cloud Run use the repository-root image below to include labels/history.
Without labels, live calls remain unscored, not zero accuracy.

Build the monitor-ready image from the repository root (not backend/):

~~~powershell
docker build -t flatsketch-backend .
docker run --rm -p 8080:8080 --env-file backend/.env flatsketch-backend
~~~

For the deployment template above, run gcloud from the repository root instead
of backend/, keeping --source . and the same secret/environment flags.
The root .dockerignore and .gcloudignore allow only backend source, dependencies
and public test labels/results/version notes. They exclude .env and frontend files.
Docker/Tiger deployment still needs a live check; tests here use SQLite and fakes.
