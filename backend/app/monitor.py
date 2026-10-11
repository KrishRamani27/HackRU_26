"""Best-effort AI telemetry. Never changes AI results or consumes Gemini quota."""
import json
import logging
import re
import time
from collections import defaultdict
from contextlib import contextmanager
from contextvars import ContextVar
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import JSON, Boolean, DateTime, Float, Integer, String, func, select, text
from sqlalchemy.orm import Mapped, mapped_column

from . import ai
from .database import Base, now
from .scoring import score_spec

logger = logging.getLogger(__name__)
active_call = ContextVar("ai_monitor_call", default=None)


class AICall(Base):
    __tablename__ = "ai_calls"
    # Timescale unique keys must include the partition timestamp.
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), primary_key=True)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    route: Mapped[str] = mapped_column(String(30))
    model: Mapped[str] = mapped_column(String(100))
    prompt_version: Mapped[str] = mapped_column(String(100), index=True)
    image_filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    response_time_ms: Mapped[float | None] = mapped_column(Float, nullable=True)
    status: Mapped[str] = mapped_column(String(10))
    retry_used: Mapped[bool] = mapped_column(Boolean, default=False)
    spec: Mapped[dict | list | None] = mapped_column(JSON, nullable=True)
    categorical_correct: Mapped[int | None] = mapped_column(Integer, nullable=True)
    categorical_total: Mapped[int | None] = mapped_column(Integer, nullable=True)
    field_scores: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    source: Mapped[str] = mapped_column(String(15))  # live / historical / mock
    gemini_attempted: Mapped[bool] = mapped_column(Boolean, default=False)
    timestamp_basis: Mapped[str] = mapped_column(String(30), default="request")
    version_basis: Mapped[str] = mapped_column(String(100), default="PROMPT_VERSION")


class HistoryImport(Base):
    __tablename__ = "ai_history_imports"
    # Separate ordinary table: deduplicate files without violating hypertable keys.
    source_key: Mapped[str] = mapped_column(String(255), primary_key=True)
    imported_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


def classify(message):
    message = message.lower()
    if any(word in message for word in ("429", "resource_exhausted", "quota", "ratelimit")):
        return "quota"
    if "timeout" in message or "timed out" in message:
        return "timeout"
    if "invalid contract" in message or "invalid data" in message or "validationerror" in message:
        return "invalid"
    return "error"


class AIWarnings(logging.Handler):
    """Observe existing safe AI warnings, in this request only; do not store errors."""
    def emit(self, record):
        current = active_call.get()
        if current is None:
            return
        message = record.getMessage()
        if "Retrying once." in message:
            current["retry_used"] = True
        elif "Trying fallback model" in message and isinstance(record.args, tuple):
            # ai.py now supports a second model. Record the one actually attempted,
            # even if that attempt fails or its reply is invalid.
            current["model"] = str(record.args[-1])[:100]
            current["retry_used"] = True
        elif "Gemini fallback model" in message and isinstance(record.args, tuple):
            current["model"] = str(record.args[0])[:100]
        elif "Gemini request failed" in message or "Gemini returned an invalid contract" in message:
            current["failure_status"] = classify(message)


def initialize_timescale(engine):
    if engine.dialect.name != "postgresql":
        return
    with engine.begin() as connection:
        connection.execute(text("SELECT pg_advisory_xact_lock(2026101002)"))
        installed = connection.scalar(text(
            "SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'timescaledb')"))
        if not installed:
            raise RuntimeError("The monitor requires TimescaleDB on PostgreSQL. "
                               "Enable it on Tiger, or use SQLite locally.")
        connection.execute(text(
            "SELECT create_hypertable('ai_calls', 'timestamp', if_not_exists => TRUE, migrate_data => TRUE)"))
        views = {
            "ai_latency_10m": (
                "10 minutes", "route",
                "count(*) AS call_count, count(response_time_ms) AS timed_calls, "
                "sum(response_time_ms) AS response_time_sum_ms"),
            # A continuous aggregate needs a time bucket. API rolls buckets up by version.
            "ai_accuracy_version": (
                "1 hour", "prompt_version",
                "count(*) AS call_count, count(categorical_total) AS scored_calls, "
                "sum(categorical_correct) AS categorical_correct, "
                "sum(categorical_total) AS categorical_total"),
            "ai_status_hourly": ("1 hour", "status", "count(*) AS call_count"),
        }
        for name, (interval, group, aggregates) in views.items():
            connection.execute(text(
                f"CREATE MATERIALIZED VIEW IF NOT EXISTS {name} "
                "WITH (timescaledb.continuous, timescaledb.materialized_only = false) AS "
                f"SELECT time_bucket(INTERVAL '{interval}', timestamp) AS bucket, "
                f"{group}, {aggregates} FROM ai_calls "
                "WHERE source <> 'mock' AND gemini_attempted = true "
                f"GROUP BY bucket, {group} WITH NO DATA"))
            connection.execute(text(
                f"SELECT add_continuous_aggregate_policy('{name}', start_offset => NULL, "
                "end_offset => INTERVAL '10 minutes', schedule_interval => INTERVAL '1 minute', "
                "if_not_exists => TRUE)"))


def safe_filename(filename):
    return re.split(r"[/\\]", filename or "")[-1][:255] or None


class Monitor:
    def __init__(self, settings, sessions, engine):
        self.settings, self.sessions, self.engine = settings, sessions, engine
        self.data_dir = (Path(settings.monitor_data_dir).resolve() if settings.monitor_data_dir
                         else Path(__file__).resolve().parents[2] / "AI")
        self.handler = AIWarnings()
        logging.getLogger(ai.__name__).addHandler(self.handler)

    def close(self):
        logging.getLogger(ai.__name__).removeHandler(self.handler)

    def score(self, spec, filename):
        name = safe_filename(filename)
        if not isinstance(spec, dict) or not name:
            return {}
        stem = Path(name).stem.split("__")[0]
        for folder in ("labels", "label"):
            path = self.data_dir / folder / f"{stem}.json"
            if path.is_file():
                label = json.loads(path.read_text(encoding="utf-8"))
                scores = score_spec(spec, label)
                if not scores["total"]:
                    return {}
                return {"categorical_correct": scores["correct"],
                        "categorical_total": scores["total"], "field_scores": scores["fields"]}
        return {}

    @contextmanager
    def track(self, route, filename=None):
        started = time.perf_counter()
        current = {
            "timestamp": now(), "route": route, "model": self.settings.gemini_model,
            "prompt_version": ai.PROMPT_VERSION if route == "/analyze" else "unversioned-edits",
            "version_basis": "PROMPT_VERSION" if route == "/analyze" else "edit prompts not versioned",
            "image_filename": safe_filename(filename), "status": "ok",
            "retry_used": False, "source": "mock" if self.settings.ai_mode == "mock" else "live",
            "gemini_attempted": False, "spec": None,
        }
        token = active_call.set(current)
        try:
            yield current
        except Exception as exc:
            current["status"] = current.get("failure_status") or (
                "invalid" if isinstance(exc, HTTPException) and exc.status_code in (413, 415, 422)
                else classify(str(exc)))
            raise
        finally:
            active_call.reset(token)
            current.pop("failure_status", None)
            current["response_time_ms"] = round((time.perf_counter() - started) * 1000, 3)
            try:
                if current["status"] == "ok" and current["source"] == "live" and route == "/analyze":
                    current.update(self.score(current["spec"], filename))
            except Exception as exc:
                # A bad label must not hide a successful call; still persist it unscored.
                logger.warning("Monitor label scoring failed (%s)", type(exc).__name__)
            try:
                with self.sessions() as session:
                    session.add(AICall(**current))
                    session.commit()
            except Exception as exc:
                # No credentials, image contents, prompt text or exception strings in telemetry logs.
                logger.warning("AI monitor could not store a call (%s)", type(exc).__name__)

    def invoke(self, callback):
        current = active_call.get()
        if current is not None:
            current["gemini_attempted"] = (
                self.settings.ai_mode == "gemini" and bool(self.settings.gemini_api_key))
        return callback()

    def summary(self):
        with self.sessions() as session:
            eligible = (AICall.source != "mock", AICall.gemini_attempted.is_(True))
            if self.engine.dialect.name == "postgresql":
                latency = session.execute(text(
                    "SELECT bucket, route, call_count, timed_calls, response_time_sum_ms "
                    "FROM ai_latency_10m ORDER BY bucket DESC, route LIMIT 500")).mappings().all()
                accuracy = session.execute(text(
                    "SELECT prompt_version, sum(call_count) AS call_count, "
                    "sum(scored_calls) AS scored_calls, sum(categorical_correct) AS categorical_correct, "
                    "sum(categorical_total) AS categorical_total FROM ai_accuracy_version "
                    "GROUP BY prompt_version ORDER BY prompt_version")).mappings().all()
                statuses = session.execute(text(
                    "SELECT bucket, status, call_count FROM ai_status_hourly "
                    "ORDER BY bucket DESC, status LIMIT 2500")).mappings().all()
            else:
                # Normal SQL aggregates for the local SQLite fallback.
                def bucket(seconds):
                    return (func.cast(func.strftime("%s", AICall.timestamp), Integer) // seconds)
                # SQLite integer division gives UTC epoch bucket numbers.
                latency = session.execute(select(
                    bucket(600).label("bucket"), AICall.route,
                    func.count().label("call_count"),
                    func.count(AICall.response_time_ms).label("timed_calls"),
                    func.sum(AICall.response_time_ms).label("response_time_sum_ms")
                ).where(*eligible).group_by(bucket(600), AICall.route)
                  .order_by(bucket(600).desc(), AICall.route).limit(500)).mappings().all()
                accuracy = session.execute(select(
                    AICall.prompt_version, func.count().label("call_count"),
                    func.count(AICall.categorical_total).label("scored_calls"),
                    func.sum(AICall.categorical_correct).label("categorical_correct"),
                    func.sum(AICall.categorical_total).label("categorical_total")
                ).where(*eligible).group_by(AICall.prompt_version)
                  .order_by(AICall.prompt_version)).mappings().all()
                statuses = session.execute(select(
                    bucket(3600).label("bucket"), AICall.status, func.count().label("call_count")
                ).where(*eligible).group_by(bucket(3600), AICall.status)
                  .order_by(bucket(3600).desc(), AICall.status).limit(2500)).mappings().all()

            def stamp(value, seconds):
                if isinstance(value, datetime):
                    return value.astimezone(timezone.utc).isoformat()
                return datetime.fromtimestamp(int(value) * seconds, timezone.utc).isoformat()

            latency_out = [{
                "bucket": stamp(row["bucket"], 600), "route": row["route"],
                "call_count": int(row["call_count"]), "timed_calls": int(row["timed_calls"]),
                "avg_response_time_ms": round(float(row["response_time_sum_ms"]) /
                                              int(row["timed_calls"]), 3) if row["timed_calls"] else None,
            } for row in latency]
            accuracy_out = [{
                "prompt_version": row["prompt_version"], "call_count": int(row["call_count"]),
                "scored_calls": int(row["scored_calls"]),
                "categorical_correct": int(row["categorical_correct"] or 0),
                "categorical_total": int(row["categorical_total"] or 0),
                "accuracy": float(row["categorical_correct"] or 0) /
                            int(row["categorical_total"]) if row["categorical_total"] else None,
            } for row in accuracy]
            hourly = {}
            for row in statuses:
                key = stamp(row["bucket"], 3600)
                item = hourly.setdefault(key, {"bucket": key, "call_count": 0,
                                              "failure_count": 0, "by_status": {}})
                count = int(row["call_count"])
                item["call_count"] += count
                item["failure_count"] += count if row["status"] != "ok" else 0
                item["by_status"][row["status"]] = count
            for item in hourly.values():
                item["failure_rate"] = item["failure_count"] / item["call_count"]
                item["status_rates"] = {
                    status: count / item["call_count"] for status, count in item["by_status"].items()
                }
            fields = defaultdict(lambda: {"misses": 0, "total": 0})
            for scores in session.scalars(select(AICall.field_scores).where(*eligible)
                                          .execution_options(yield_per=500)):
                for field, correct in (scores or {}).items():
                    fields[field]["total"] += 1
                    fields[field]["misses"] += not correct
            missed = [{"field": field, **counts, "miss_rate": counts["misses"] / counts["total"]}
                      for field, counts in fields.items() if counts["misses"]]
            missed.sort(key=lambda item: (-item["misses"], item["field"]))
            source_counts = dict(session.execute(
                select(AICall.source, func.count()).group_by(AICall.source)).all())
            return {"backend": "timescaledb" if self.engine.dialect.name == "postgresql" else "sqlite",
                    "generated_at": now().isoformat(), "current_prompt_version": ai.PROMPT_VERSION,
                    "source_counts": source_counts, "latency_10m": latency_out,
                    "accuracy_by_prompt_version": accuracy_out,
                    "failures_hourly": list(hourly.values()), "most_missed_fields": missed}
