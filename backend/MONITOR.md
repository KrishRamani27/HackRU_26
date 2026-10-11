# AI quality monitor: frontend handoff

GET /monitor/summary uses the same X-API-Key as other protected routes.
Fetching this endpoint never calls Gemini. No frontend code was changed.

## Response

Example only, not measured results:

~~~json
{
  "backend": "sqlite",
  "generated_at": "2026-10-11T02:00:00+00:00",
  "current_prompt_version": "v8-accents",
  "source_counts": {"live": 2, "historical": 9, "mock": 1},
  "latency_10m": [
    {"bucket": "2026-10-11T01:50:00+00:00", "route": "/analyze",
     "call_count": 2, "timed_calls": 2, "avg_response_time_ms": 4500.0}
  ],
  "accuracy_by_prompt_version": [
    {"prompt_version": "v8-accents", "call_count": 2, "scored_calls": 1,
     "categorical_correct": 7, "categorical_total": 8, "accuracy": 0.875}
  ],
  "failures_hourly": [
    {"bucket": "2026-10-11T01:00:00+00:00", "call_count": 2,
     "failure_count": 1, "by_status": {"ok": 1, "quota": 1},
     "failure_rate": 0.5, "status_rates": {"ok": 0.5, "quota": 0.5}}
  ],
  "most_missed_fields": [
    {"field": "neckline.type", "misses": 1, "total": 1, "miss_rate": 1.0}
  ]
}
~~~

- Times are UTC; buckets start at 10-minute/hour boundaries.
- Ratios are 0–1; multiply by 100 for percentages. Null means **not measured**.
- Empty arrays mean no eligible data. Source counts list only sources present.
- Latency covers route processing, including explicit retries. One row is one
  endpoint invocation, not one retry attempt.
- Live Gemini and historical rows enter charts. Mock rows, missing-key failures
  and rejected uploads that never reached Gemini are stored but excluded.
- Historical successes have no recorded latency. Historical failures were not
  saved, so old failure rates are not a complete measurement.
- Accuracy is weighted by labelled categorical fields. Unlabelled/failed calls
  are not scored. The eight fields match AI/evaluate.py; colors, accents and
  proportions are not scored. Three sketches are only a smoke test.
- Edits use "unversioned-edits", not the analyze prompt version. Suggestions store
  their returned JSON, not a newly generated dress.
- Latency returns the newest 500 bucket/route combinations; failures the newest
  500 hourly buckets (five statuses). Arrays are newest first. Accuracy and
  missed-field counts include all eligible rows.
- Show unknown versions honestly. These files do not prove scores improve
  monotonically across versions.

## Ownership and reliability

app/monitor.py observes existing AI warning logs with a request-local context.
It detects terminal timeout/quota/invalid errors and explicit retries without
changing app/ai.py. If Krish changes these warning messages, update the observer.
SDK-internal retries are not counted.

app/scoring.py is the shared scorer; AI/evaluate.py imports it with the same CLI
and matching rules as before. Tell Krish about this small refactor before pushing.
No prompts, Gemini response schemas or frontend files changed.

Logging is best effort: database/label failures do not replace AI results or hide
original HTTP errors. Check backend warnings for lost rows. No keys, prompts,
exception messages or image bytes are stored. Specs and image basenames are
stored, so keep the database private.

Authorization failures and malformed requests rejected before a route runs
are not Gemini calls and are not recorded.

## Historical import

Startup imports AI/results/*.json once per filename. Ledger and result inserts
commit together. Never change an already-imported file under the same name;
save new runs under new names.

- AI Studio test1/2/3.json: assigned v1-aistudio as requested, although the true
  source could be v1 or v2.
- Two 19:02–19:03 runs: inferred v6-waist-y.
- Three 19:10–19:26 runs: inferred v7-silhouette.
- The 19:39 run: unknown; the version log does not identify it.
- No invented rows for v3/v4/v5/v8 without attributable saved results.

Mappings in app/monitor_import.py check the named sections in AI/prompt_versions.md.
Ask Krish before adding mappings. Filename times use MONITOR_HISTORY_TIMEZONE
(New York by default). Undated files use modification time as a marked estimate.
Historical model is "unknown-historical"; retry=false means unavailable, not
proof no retry happened. Timestamp/version evidence is stored on each row.

## Tiger features

PostgreSQL needs TimescaleDB enabled. Startup makes ai_calls a timestamp hypertable
with a composite primary key including timestamp. SQLite uses a plain table and
normal SQL aggregation for the same JSON summaries.

- ai_latency_10m: counts and summed latency per 10 minutes and route.
- ai_accuracy_version: hourly correct/total counts by version; API rolls buckets
  up by version because continuous aggregates require a time bucket.
- ai_status_hourly: hourly status counts; API computes failure and status rates.

All three have one-minute refresh policies, open-ended historical windows and
real-time aggregation. New calls appear immediately. After backfilling older
already-materialized buckets, run the import CLI to refresh them immediately.
Startup-only backfills otherwise catch up on the next scheduled refresh.

References: [continuous aggregates](https://www.tigerdata.com/docs/reference/timescaledb/continuous-aggregates/create_materialized_view),
[refresh policies](https://www.tigerdata.com/docs/build/continuous-aggregates/refresh-policies).
