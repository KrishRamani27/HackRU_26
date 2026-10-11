import io
import json
import logging
from datetime import datetime, timezone

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import select

from app.config import Settings
from app.database import database, initialize_database
from app.main import create_app
from app.monitor import AICall, Monitor, classify
from app.monitor_import import import_history
from app.schemas import DesignSpec
from app.scoring import score_spec


@pytest.fixture
def monitor(tmp_path):
    settings = Settings(_env_file=None, ai_mode="gemini", gemini_api_key="fake-secret",
                        database_url=f"sqlite:///{tmp_path / 'monitor.db'}",
                        monitor_data_dir=str(tmp_path / "AI"), monitor_import_history=False,
                        local_storage_dir=str(tmp_path / "uploads"))
    engine, sessions = database(settings.database_url)
    initialize_database(engine)
    instance = Monitor(settings, sessions, engine)
    yield instance
    instance.close()
    engine.dispose()


def png():
    output = io.BytesIO()
    Image.new("RGB", (8, 8), "white").save(output, format="PNG")
    return output.getvalue()


def test_score_missing_fields_and_bool_types():
    result = score_spec({"details": {"buttons": True, "pockets": "none"}},
                        {"details": {"buttons": 1, "pockets": ["none", "patch"]},
                         "neckline": {"type": "scoop"}})
    assert result == {"correct": 1, "total": 3,
                      "fields": {"neckline.type": False, "details.pockets": True,
                                 "details.buttons": False}}


@pytest.mark.parametrize("message,status", [
    ("ReadTimeout: timed out", "timeout"), ("429 RESOURCE_EXHAUSTED", "quota"),
    ("Gemini returned an invalid contract", "invalid"), ("ServerError 503", "error"),
])
def test_classification(message, status):
    assert classify(message) == status


def test_success_and_retry_metadata(monitor):
    labels = monitor.data_dir / "label"
    labels.mkdir(parents=True)
    (labels / "dress.json").write_text(json.dumps({"neckline": {"type": "scoop"}}))
    with monitor.track("/analyze", "../dress.jpg") as call:
        monitor.invoke(lambda: None)
        logging.getLogger("app.ai").warning(
            "Gemini attempt 1 failed (%s): %s. Retrying once.", "ReadTimeout", "timeout")
        call["spec"] = DesignSpec().model_dump()
    with monitor.sessions() as session:
        row = session.scalar(select(AICall))
        assert row.status == "ok" and row.retry_used
        assert row.image_filename == "dress.jpg"
        assert row.categorical_total == 1 and row.response_time_ms >= 0
        assert row.prompt_version == __import__("app.ai", fromlist=["PROMPT_VERSION"]).PROMPT_VERSION
        assert "fake-secret" not in json.dumps(row.spec)


@pytest.mark.parametrize("message,status", [
    ("Gemini request failed (ReadTimeout): timeout", "timeout"),
    ("Gemini request failed (ClientError): 429 RESOURCE_EXHAUSTED", "quota"),
    ("Gemini returned an invalid contract: bad response", "invalid"),
])
def test_failure_logs_preserve_http_error(monitor, message, status):
    with pytest.raises(HTTPException) as error:
        with monitor.track("/analyze"):
            monitor.invoke(lambda: None)
            logging.getLogger("app.ai").warning(message)
            raise HTTPException(502, "AI service could not finish.")
    assert error.value.status_code == 502
    with monitor.sessions() as session:
        row = session.scalar(select(AICall))
        assert row.status == status and row.spec is None


def test_logging_failure_does_not_break_ai(monitor, monkeypatch):
    def broken():
        raise RuntimeError("DB unavailable with secret")
    monkeypatch.setattr(monitor, "sessions", broken)
    with monitor.track("/analyze") as call:
        call["spec"] = {"garment_type": "dress"}
    with pytest.raises(HTTPException):
        with monitor.track("/analyze"):
            raise HTTPException(502, "original error")


def test_bad_label_still_records_success(monitor):
    labels = monitor.data_dir / "label"
    labels.mkdir(parents=True)
    (labels / "dress.json").write_text("not json")
    with monitor.track("/analyze", "dress.jpg") as call:
        monitor.invoke(lambda: None)
        call["spec"] = DesignSpec().model_dump()
    with monitor.sessions() as session:
        row = session.scalar(select(AICall))
        assert row.status == "ok" and row.categorical_total is None


def test_summary_buckets_weighted_accuracy_and_mock_exclusion(monitor):
    base = dict(route="/analyze", model="test", retry_used=False, source="live",
                gemini_attempted=True, prompt_version="v8-accents", spec=None)
    with monitor.sessions() as session:
        session.add_all([
            AICall(**base, timestamp=datetime(2026, 10, 10, 22, 1, tzinfo=timezone.utc),
                   status="ok", response_time_ms=100, categorical_correct=1,
                   categorical_total=2, field_scores={"neckline.type": False, "waist.seam": True}),
            AICall(**base, timestamp=datetime(2026, 10, 10, 22, 9, tzinfo=timezone.utc),
                   status="quota", response_time_ms=300),
            AICall(**{**base, "source": "historical", "prompt_version": "v1-aistudio"},
                   timestamp=datetime(2026, 10, 10, 21, tzinfo=timezone.utc),
                   status="ok", response_time_ms=None, categorical_correct=8, categorical_total=8),
            AICall(**{**base, "source": "mock", "gemini_attempted": False},
                   timestamp=datetime(2026, 10, 10, 22, 5, tzinfo=timezone.utc),
                   status="ok", response_time_ms=1),
        ])
        session.commit()
    summary = monitor.summary()
    latest = summary["latency_10m"][0]
    assert latest["bucket"] == "2026-10-10T22:00:00+00:00"
    assert latest["avg_response_time_ms"] == 200 and latest["call_count"] == 2
    assert summary["latency_10m"][1]["avg_response_time_ms"] is None
    assert summary["failures_hourly"][0]["failure_rate"] == 0.5
    assert summary["most_missed_fields"][0]["field"] == "neckline.type"
    assert summary["source_counts"] == {"historical": 1, "live": 2, "mock": 1}
    accuracy = {row["prompt_version"]: row for row in summary["accuracy_by_prompt_version"]}
    assert accuracy["v8-accents"]["accuracy"] == 0.5


def test_history_import_is_offline_and_idempotent(monitor):
    results = monitor.data_dir / "results"
    results.mkdir(parents=True)
    labels = monitor.data_dir / "label"
    labels.mkdir()
    for name in ("test1.json", "test1__20261010-190217.json", "other__20261010-193923.json"):
        (results / name).write_text(json.dumps(DesignSpec().model_dump()))
    (results / "bad.json").write_text("bad")
    (labels / "test1.json").write_text(json.dumps({"neckline": {"type": "scoop"}}))
    (monitor.data_dir / "prompt_versions.md").write_text(
        "## v1-aistudio: AI Studio\n## v6-waist-y: Waist\n")
    assert import_history(monitor) == {"imported": 3, "skipped": 1}
    assert import_history(monitor) == {"imported": 0, "skipped": 4}
    with monitor.sessions() as session:
        rows = session.scalars(select(AICall)).all()
        assert len(rows) == 3
        assert {row.prompt_version for row in rows} == {"v1-aistudio", "v6-waist-y", "unknown"}
        assert all(row.response_time_ms is None and row.source == "historical" for row in rows)
        timed = next(row for row in rows if row.prompt_version == "v6-waist-y")
        assert timed.timestamp.hour == 23  # 19:02 New York -> 23:02 UTC in October.


def test_summary_route_auth_and_mock_tracking(monitor):
    settings = monitor.settings.model_copy(update={"ai_mode": "mock", "backend_api_key": "team-test"})
    app = create_app(settings)
    with TestClient(app) as client:
        assert client.get("/monitor/summary").status_code == 401
        headers = {"X-API-Key": "team-test"}
        assert client.post("/analyze", files={"sketch": ("dress.png", png())},
                           headers=headers).status_code == 200
        assert client.post("/analyze", files={"sketch": ("bad.png", b"bad")},
                           headers=headers).status_code == 422
        summary = client.get("/monitor/summary", headers=headers)
        assert summary.status_code == 200
        assert summary.json()["source_counts"] == {"mock": 2}
        assert summary.json()["accuracy_by_prompt_version"] == []


def test_analyze_failure_route_tracked(monitor, monkeypatch):
    app = create_app(monitor.settings)
    def fail(*args):
        logging.getLogger("app.ai").warning("Gemini request failed (ClientError): 429 quota")
        raise HTTPException(502, "AI service could not finish.")
    with TestClient(app) as client:
        monkeypatch.setattr(app.state.ai, "analyze", fail)
        assert client.post("/analyze", files={"sketch": ("dress.png", png())}).status_code == 502
        summary = client.get("/monitor/summary").json()
        assert summary["failures_hourly"][0]["by_status"] == {"quota": 1}


def test_real_adapter_retry_is_observed_without_ai_changes(monitor, monkeypatch):
    import httpx
    from google import genai
    from types import SimpleNamespace

    reply = DesignSpec().model_dump(exclude={"style"})
    reply["main_style"] = {"fill": "#ffffff", "pattern": "solid"}
    reply["accents"] = []
    calls = []

    class FakeClient:
        def __init__(self, **kwargs):
            self.models = self
        def __enter__(self):
            return self
        def __exit__(self, *args):
            pass
        def generate_content(self, **kwargs):
            calls.append(kwargs)
            if len(calls) == 1:
                raise httpx.ReadTimeout("temporary")
            return SimpleNamespace(text=json.dumps(reply))

    monkeypatch.setattr(genai, "Client", FakeClient)
    monkeypatch.setattr("app.ai.RESULTS_DIR", monitor.data_dir / "unused")
    app = create_app(monitor.settings)
    with TestClient(app) as client:
        assert client.post("/analyze", files={"sketch": ("dress.png", png())}).status_code == 200
    with monitor.sessions() as session:
        row = session.scalar(select(AICall))
        assert len(calls) == 2
        assert row.status == "ok" and row.retry_used and row.gemini_attempted
        assert row.spec["garment_type"] == "dress"


def test_edit_routes_use_separate_version_and_store_outputs(monitor):
    app = create_app(monitor.settings.model_copy(update={"ai_mode": "mock"}))
    with TestClient(app) as client:
        spec = DesignSpec().model_dump()
        assert client.post("/command", json={"text": "make it blue", "spec": spec}).status_code == 200
        assert client.post("/suggestions", json={"spec": spec}).status_code == 200
        assert client.post("/verify", data={"spec": json.dumps(spec)},
                           files={"sketch": ("a.png", png()), "flat": ("b.png", png())}).status_code == 200
    with monitor.sessions() as session:
        rows = session.scalars(select(AICall)).all()
        assert len(rows) == 3
        assert {row.prompt_version for row in rows} == {"unversioned-edits"}
        assert all(row.spec is not None and row.status == "ok" for row in rows)


def test_timescale_ddl_includes_partition_key_compatible_aggregates():
    from app.monitor import initialize_timescale
    statements = []
    class Connection:
        def __enter__(self):
            return self
        def __exit__(self, *args):
            pass
        def scalar(self, statement):
            return True
        def execute(self, statement):
            statements.append(str(statement))
    class Engine:
        class dialect:
            name = "postgresql"
        def begin(self):
            return Connection()
    initialize_timescale(Engine())
    assert any("create_hypertable" in statement for statement in statements)
    views = [statement for statement in statements if "CREATE MATERIALIZED VIEW" in statement]
    assert len(views) == 3
    assert all("time_bucket" in statement and "materialized_only = false" in statement for statement in views)
    assert sum("add_continuous_aggregate_policy" in statement for statement in statements) == 3
    assert {column.name for column in AICall.__table__.primary_key} == {"id", "timestamp"}


def test_fallback_model_metadata(monitor):
    with monitor.track("/analyze") as call:
        monitor.invoke(lambda: None)
        logging.getLogger("app.ai").warning(
            "Gemini model %s failed (%s): %s. Trying fallback model %s.",
            "primary", "ClientError", "429 quota", "fallback")
        call["spec"] = DesignSpec().model_dump()
    with monitor.sessions() as session:
        row = session.scalar(select(AICall))
        assert row.model == "fallback" and row.retry_used and row.status == "ok"


def test_historical_explicit_metadata_beats_filename_inference(monitor):
    results = monitor.data_dir / "results"
    results.mkdir(parents=True)
    spec = {"model": "recorded-model", "prompt_version": "v10-detailed",
            **DesignSpec().model_dump()}
    (results / "test1__20261010-190217.json").write_text(json.dumps(spec))
    assert import_history(monitor)["imported"] == 1
    with monitor.sessions() as session:
        row = session.scalar(select(AICall))
        assert row.model == "recorded-model" and row.prompt_version == "v10-detailed"
        assert row.version_basis == "prompt_version recorded in result"
        assert "model" not in row.spec and "prompt_version" not in row.spec


def test_restart_does_not_import_already_logged_live_call(monitor):
    results = monitor.data_dir / "results"
    results.mkdir(parents=True)
    spec = DesignSpec().model_dump()
    with monitor.sessions() as session:
        session.add(AICall(
            timestamp=datetime(2026, 10, 10, 23, 2, 12, tzinfo=timezone.utc),
            route="/analyze", model="live-model", prompt_version="v10-detailed",
            image_filename="test1.jpg", spec=spec, response_time_ms=5000,
            status="ok", retry_used=False, source="live", gemini_attempted=True))
        session.commit()
    (results / "test1__20261010-190217.json").write_text(json.dumps(
        {"model": "live-model", "prompt_version": "v10-detailed", **spec}))
    assert import_history(monitor) == {"imported": 0, "skipped": 1}
    with monitor.sessions() as session:
        assert len(session.scalars(select(AICall)).all()) == 1
