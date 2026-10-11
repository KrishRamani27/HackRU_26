"""Idempotent offline import: python -m app.monitor_import [--data-dir ../AI]."""
import argparse
import json
import logging
import re
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from .config import Settings
from .database import database, initialize_database
from .monitor import AICall, HistoryImport, Monitor, initialize_timescale

logger = logging.getLogger(__name__)

# These saved runs are described in AI/prompt_versions.md. No rows are invented
# for v3/v4: their test runs were printed, not saved. The 19:39 run is unknown.
DOCUMENTED_RUNS = {
    "test1__20261010-190217.json": "v6-waist-y",
    "test2__20261010-190350.json": "v6-waist-y",
    "test2__20261010-191037.json": "v7-silhouette",
    "test1__20261010-191209.json": "v7-silhouette",
    "test3__20261010-192630.json": "v7-silhouette",
}


def historical_version(path, versions_text):
    known = set(re.findall(r"^## (v\d+-[\w-]+):", versions_text, re.MULTILINE))
    if path.name in ("test1.json", "test2.json", "test3.json") and "v1-aistudio" in known:
        return "v1-aistudio", "AI Studio v1/v2 ambiguous; team assigns v1"
    version = DOCUMENTED_RUNS.get(path.name)
    if version in known:
        return version, "inferred from AI/prompt_versions.md run times"
    return "unknown", "no documented version for this result"


def import_history(monitor):
    root = monitor.data_dir
    versions_path = root / "prompt_versions.md"
    versions = versions_path.read_text(encoding="utf-8") if versions_path.is_file() else ""
    imported, skipped = 0, 0
    for path in sorted((root / "results").glob("*.json")):
        key = path.name  # same file is never reimported after cloning or restarting.
        try:
            with monitor.sessions() as session:
                if session.get(HistoryImport, key):
                    skipped += 1
                    continue
                spec = json.loads(path.read_text(encoding="utf-8"))
                if not isinstance(spec, dict) or spec.get("garment_type") != "dress":
                    skipped += 1
                    continue
                timestamp_match = re.search(r"__(\d{8}-\d{6})$", path.stem)
                if timestamp_match:
                    timestamp = datetime.strptime(timestamp_match[1], "%Y%m%d-%H%M%S")
                    timestamp = timestamp.replace(
                        tzinfo=ZoneInfo(monitor.settings.monitor_history_timezone)).astimezone(timezone.utc)
                    timestamp_basis = "filename-local-time"
                else:
                    timestamp = datetime.fromtimestamp(path.stat().st_mtime, timezone.utc)
                    timestamp_basis = "file-mtime-estimate"
                version, basis = historical_version(path, versions)
                session.add(AICall(
                    timestamp=timestamp, route="/analyze", model="unknown-historical",
                    prompt_version=version, image_filename=path.stem.split("__")[0],
                    response_time_ms=None, status="ok", retry_used=False, spec=spec,
                    source="historical", gemini_attempted=True,
                    timestamp_basis=timestamp_basis, version_basis=basis,
                    **monitor.score(spec, path.stem.split("__")[0] + ".jpg")))
                session.add(HistoryImport(source_key=key))
                session.commit()
                imported += 1
        except IntegrityError:
            # Another worker imported the same file. Both inserts roll back together.
            skipped += 1
        except Exception as exc:
            logger.warning("Historical AI result skipped: %s (%s)", path.name, type(exc).__name__)
            skipped += 1
    return {"imported": imported, "skipped": skipped}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir")
    args = parser.parse_args()
    settings = Settings()
    if args.data_dir:
        settings.monitor_data_dir = args.data_dir
    engine, sessions = database(settings.database_url)
    monitor = None
    try:
        initialize_database(engine)
        initialize_timescale(engine)
        monitor = Monitor(settings, sessions, engine)
        print(json.dumps(import_history(monitor)))
        if engine.dialect.name == "postgresql":
            # Refresh backfilled old buckets; realtime aggregates alone do not cover
            # historical inserts older than an existing materialization watermark.
            with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as connection:
                for view in ("ai_latency_10m", "ai_accuracy_version", "ai_status_hourly"):
                    connection.execute(text(
                        f"CALL refresh_continuous_aggregate('{view}', NULL, NULL)"))
    finally:
        if monitor:
            monitor.close()
        engine.dispose()


if __name__ == "__main__":
    main()
