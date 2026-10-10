import io

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.config import Settings
from app.main import create_app
from app.schemas import DesignSpec, EditAction, apply_actions


@pytest.fixture
def client(tmp_path):
    settings = Settings(_env_file=None, database_url=f"sqlite:///{tmp_path / 'test.db'}",
                        local_storage_dir=str(tmp_path / "uploads"), backend_api_key="team-test",
                        ai_mode="mock", storage_mode="local", max_upload_bytes=2048)
    with TestClient(create_app(settings), headers={"X-API-Key": "team-test"}) as test_client:
        yield test_client


def png():
    output = io.BytesIO()
    Image.new("RGB", (16, 16), "white").save(output, format="PNG")
    return output.getvalue()


def test_auth_and_health(client):
    assert client.get("/health", headers={"X-API-Key": "wrong"}).status_code == 200
    assert client.get("/designs", headers={"X-API-Key": "wrong"}).status_code == 401
    assert client.get("/ready").status_code == 200


def test_mock_analysis_and_verify_contract(client):
    result = client.post("/analyze", files={"sketch": ("dress.png", png(), "image/png")})
    assert result.status_code == 200
    assert result.headers["X-AI-Mode"] == "mock"
    spec = result.json()
    assert spec["garment_type"] == "dress"
    assert "MOCK" in spec["notes"]
    assert "left_sleeve" in spec["style"]
    response = client.post("/verify", data={"spec": DesignSpec().model_dump_json()},
                           files={"sketch": ("a.png", png()), "flat": ("b.png", png())})
    assert response.status_code == 200 and response.json() == []


def test_invalid_and_large_uploads(client):
    invalid = client.post("/analyze", files={"sketch": ("fake.png", b"not a picture", "image/png")})
    assert invalid.status_code == 422
    large = client.post("/assets", files={"image": ("big.png", b"x" * 2049, "image/png")})
    assert large.status_code == 413
    svg = client.post("/assets", files={"image": ("bad.svg", b"<svg></svg>", "image/svg+xml")})
    assert svg.status_code == 422


def test_assets_designs_and_history(client):
    upload = client.post("/assets", files={"image": ("../../dress.png", png(), "image/png")})
    assert upload.status_code == 201
    asset = upload.json()
    assert client.get(asset["url"]).content == png()
    body = {"name": "First dress", "spec": DesignSpec().model_dump(), "sketch_asset_id": asset["id"]}
    result = client.post("/designs", json=body)
    assert result.status_code == 201
    design = result.json()
    path = f"/designs/{design['id']}"
    body["spec"]["sleeves"]["type"] = "puff"
    updated = client.put(path, json=body)
    assert updated.status_code == 200 and updated.json()["version"] == 2
    history = client.get(path + "/versions").json()
    assert history[0]["spec"]["sleeves"]["type"] == "puff"
    assert history[1]["spec"]["sleeves"]["type"] == "none"
    assert len(client.get("/designs").json()) == 1
    assert client.delete(path).status_code == 204
    assert client.get(path).status_code == 404
    # Deleting a design preserves its original image.
    assert client.get(asset["url"]).status_code == 200


def test_invalid_specs_and_missing_assets(client):
    body = {"name": "Test", "spec": {"garment_type": "shirt"}}
    assert client.post("/designs", json=body).status_code == 422
    body["spec"] = {"details": {"buttons": 9}}
    assert client.post("/designs", json=body).status_code == 422
    body["spec"] = DesignSpec().model_dump()
    body["sketch_asset_id"] = "missing"
    assert client.post("/designs", json=body).status_code == 404


def test_saved_parts_reuse_and_filter(client):
    body = {"name": "My puff sleeve", "part_type": "sleeves",
            "spec_settings": {"type": "puff", "length": "elbow"},
            "style": {"fill": "#1f2a44", "pattern": "denim"}}
    result = client.post("/parts", json=body)
    assert result.status_code == 201
    part = result.json()
    assert len(client.get("/parts?part_type=sleeves").json()) == 1
    assert client.get("/parts?part_type=skirt").json() == []
    assert client.get(f"/parts/{part['id']}").json()["spec_settings"]["type"] == "puff"
    assert client.delete(f"/parts/{part['id']}").status_code == 204
    body["spec_settings"]["type"] = "flared"
    assert client.post("/parts", json=body).status_code == 422


@pytest.mark.parametrize("path,value", [
    ("garment_type", "shirt"), ("__proto__.polluted", True),
    ("details.buttons", 10), ("neckline.depth", 1.5),
    ("style.skirt.fill", "red"), ("waist.seam", "yes"),
])
def test_invalid_ai_actions_are_rejected(path, value):
    with pytest.raises(ValueError):
        EditAction(path=path, value=value)


def test_valid_ai_action_can_be_applied():
    result = apply_actions(DesignSpec(), [EditAction(path="sleeves.type", value="puff")])
    assert result.sleeves.type == "puff"


def test_command_suggestions_and_bad_verify_spec(client):
    body = {"text": "Make puff sleeves", "spec": DesignSpec().model_dump()}
    assert client.post("/command", json=body).json() == []
    suggestions = client.post("/suggestions", json={"spec": body["spec"]})
    assert suggestions.status_code == 200
    assert "MOCK" in suggestions.json()["end_goal"]
    response = client.post("/verify", data={"spec": "not json"},
                           files={"sketch": ("a.png", png()), "flat": ("b.png", png())})
    assert response.status_code == 422


def test_missing_gemini_key_does_not_fall_back_to_mock(client):
    client.app.state.ai.settings.ai_mode = "gemini"
    client.app.state.ai.settings.gemini_api_key = ""
    result = client.post("/analyze", files={"sketch": ("dress.png", png())})
    assert result.status_code == 503


def test_cloud_run_requires_team_key(monkeypatch):
    monkeypatch.setenv("K_SERVICE", "flatsketch")
    with pytest.raises(ValueError, match="BACKEND_API_KEY"):
        create_app(Settings(_env_file=None, backend_api_key=""))


def test_real_gemini_adapter_validates_response(client, monkeypatch):
    from google import genai

    captured = {}

    class FakeClient:
        def __init__(self, **kwargs):
            self.models = self

        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def generate_content(self, **kwargs):
            captured.update(kwargs)
            from types import SimpleNamespace
            return SimpleNamespace(text=DesignSpec().model_dump_json())

    monkeypatch.setattr(genai, "Client", FakeClient)
    client.app.state.ai.settings.ai_mode = "gemini"
    client.app.state.ai.settings.gemini_api_key = "fake-test-key"
    result = client.post("/analyze", files={"sketch": ("dress.png", png())})
    assert result.status_code == 200
    assert result.headers["X-AI-Mode"] == "gemini"
    assert captured["config"].response_schema is DesignSpec
    assert captured["contents"][1].inline_data.mime_type == "image/png"


def test_bad_gemini_response_is_502(client, monkeypatch):
    from google import genai
    from types import SimpleNamespace

    class FakeClient:
        def __init__(self, **kwargs):
            self.models = self

        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def generate_content(self, **kwargs):
            return SimpleNamespace(text='{"garment_type": "shirt"}')

    monkeypatch.setattr(genai, "Client", FakeClient)
    client.app.state.ai.settings.ai_mode = "gemini"
    client.app.state.ai.settings.gemini_api_key = "fake-test-key"
    result = client.post("/analyze", files={"sketch": ("dress.png", png())})
    assert result.status_code == 502
    assert "fake-test-key" not in result.text


def test_gcs_adapter_uses_private_bucket(monkeypatch):
    from google.cloud import storage
    from app.storage import Storage

    calls = {}

    class FakeBlob:
        def upload_from_string(self, data, **kwargs):
            calls.update(data=data, **kwargs)

        def download_as_bytes(self, **kwargs):
            return calls["data"]

    class FakeBucket:
        def blob(self, key):
            calls["key"] = key
            return FakeBlob()

    class FakeClient:
        def __init__(self, **kwargs):
            pass

        def bucket(self, name):
            calls["bucket"] = name
            return FakeBucket()

    monkeypatch.setattr(storage, "Client", FakeClient)
    store = Storage(Settings(_env_file=None, storage_mode="gcs", gcs_bucket="test-private"))
    store.write("image.png", png(), "image/png")
    assert store.read("image.png") == png()
    assert calls["bucket"] == "test-private"
    assert calls["if_generation_match"] == 0
