# FlatSketch — Devpost draft

Draft only. Confirm the project name, team credits, demo links and live cloud
status before submitting. Do not describe planned integrations as verified.

## Elevator pitch

Turn a hand-drawn dress sketch into a clean, editable dress design instead of a
single flattened image.

## Inspiration

Students and designers sketch ideas on paper, but rebuilding them digitally takes
time. We wanted to keep the creative idea while making its parts easy to adjust,
save and reuse.

## What it does

The app sends a dress sketch to Gemini and receives structured design settings.
The builder uses these settings to draw a flat dress. The backend supports saved
designs, version history and reusable parts, including grouped manual strokes.
Gemini can suggest changes, interpret text edits and compare the result with the
original sketch.

The AI quality monitor tracks calls, speed, failures and labelled categorical
accuracy by prompt version. It can import earlier test results without making
new Gemini requests.

Confirm which manual editing and export controls are connected in the final UI
before describing them as demo features.

## How we built it

- Python/FastAPI exposes the backend APIs and validates the dress contract.
- Gemini interprets images and returns structured choices; the builder draws SVG.
- Tiger Data integration stores AI calls in a TimescaleDB hypertable, with
  continuous aggregates for latency, prompt accuracy and hourly failures.
- Google Cloud Run and Cloud Storage integrations provide backend hosting and
  image storage. Local SQLite and file storage provide a development fallback.

Before submission, confirm Tiger, Cloud Run and Cloud Storage are actually live.
Backend code is implemented; live integration checks are still pending.

## Challenges

Gemini's response schemas needed separate models from the public API contract.
We also had to make waist positions independent of skirt length and keep manual
strokes separate from AI-controlled dress settings. Free-tier quota failures made
offline scoring and historical-result import useful.

## What we learned

Clear field definitions and versioned prompts make AI behavior easier to compare.
Keeping unlabelled results unscored and unknown historical versions explicit is
more useful than showing misleading accuracy.

## What's next

Expand the labelled test set, finish manual-editor integration and replace the
shared demo API key with individual user authentication.

## Submission checklist

- [ ] Confirm project title and all four teammates' names/roles.
- [ ] Add frontend demo URL, repository URL and demo video.
- [ ] Verify real Gemini/Tiger/GCS/Cloud Run together.
- [ ] Show the monitor and explain the small test set honestly.
- [ ] Confirm manual editor/export features in the final UI.
- [ ] Choose and register the .tech domain; connect it after deployment.
- [ ] Check sponsor eligibility rules before selecting prize categories.
