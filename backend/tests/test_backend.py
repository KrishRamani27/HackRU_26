import io
import json
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from pydantic import BaseModel

from app.ai_schemas import GeminiDesignSpec, GeminiEditResult, GeminiSuggestions
from app.config import Settings
from app.main import create_app
from app.schemas import DesignSpec, EditAction, PartStyle, apply_actions


@pytest.fixture
def client(tmp_path, monkeypatch):
    # Keep test runs out of the real AI/results folder.
    monkeypatch.setattr("app.ai.RESULTS_DIR", tmp_path / "results")
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
            reply = DesignSpec().model_dump(exclude={"style"})
            reply["main_style"] = {"fill": "#1f2a44", "pattern": "denim"}
            return SimpleNamespace(text=json.dumps(reply))

    monkeypatch.setattr(genai, "Client", FakeClient)
    client.app.state.ai.settings.ai_mode = "gemini"
    client.app.state.ai.settings.gemini_api_key = "fake-test-key"
    result = client.post("/analyze", files={"sketch": ("dress.png", png())})
    assert result.status_code == 200
    assert result.headers["X-AI-Mode"] == "gemini"
    assert captured["config"].response_schema is GeminiDesignSpec
    assert captured["contents"][1].inline_data.mime_type == "image/png"
    assert captured["config"].thinking_config.thinking_level.value == "LOW"
    styles = result.json()["style"]
    assert len(styles) == 8
    assert all(style == {"fill": "#1f2a44", "pattern": "denim"} for style in styles.values())


def test_live_analyze_results_are_saved_for_evaluation(client, monkeypatch, tmp_path):
    reply = DesignSpec().model_dump(exclude={"style"})
    reply["main_style"] = {"fill": "#ffffff", "pattern": "solid"}
    results = tmp_path / "results"
    results.mkdir()
    client.post("/analyze", files={"sketch": ("mock.png", png())})
    assert list(results.iterdir()) == []  # mock replies are never saved
    fake_gemini(client, monkeypatch, json.dumps(reply))
    response = client.post("/analyze", files={"sketch": ("../my sketch.png", png())})
    saved = list(results.iterdir())
    assert len(saved) == 1 and saved[0].name.startswith("my_sketch__")
    model = client.app.state.ai.settings.gemini_model
    assert json.loads(saved[0].read_text()) == {"model": model, **response.json()}


def test_large_images_are_downscaled_for_gemini():
    from app.ai import MAX_IMAGE_SIDE, shrink

    output = io.BytesIO()
    Image.new("RGB", (4000, 2000), "white").save(output, format="JPEG")
    data, mime = shrink((output.getvalue(), "image/jpeg"))
    assert mime == "image/jpeg"
    assert Image.open(io.BytesIO(data)).size == (MAX_IMAGE_SIDE, MAX_IMAGE_SIDE // 2)
    small = (png(), "image/png")
    assert shrink(small) is small


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


def fake_gemini(client, monkeypatch, text):
    from google import genai

    class FakeClient:
        def __init__(self, **kwargs):
            self.models = self

        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def generate_content(self, **kwargs):
            return SimpleNamespace(text=text)

    monkeypatch.setattr(genai, "Client", FakeClient)
    client.app.state.ai.settings.ai_mode = "gemini"
    client.app.state.ai.settings.gemini_api_key = "fake-test-key"


def test_gemini_retries_once_on_timeout_or_server_error(client, monkeypatch):
    import httpx
    from google import genai
    from google.genai import errors

    reply = DesignSpec().model_dump(exclude={"style"})
    reply["main_style"] = {"fill": "#ffffff", "pattern": "solid"}
    calls = []

    class FakeClient:
        def __init__(self, **kwargs):
            self.models = self

        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def generate_content(self, **kwargs):
            calls.append(1)
            if len(calls) in failing:
                raise failing[len(calls)]
            return SimpleNamespace(text=json.dumps(reply))

    monkeypatch.setattr(genai, "Client", FakeClient)
    client.app.state.ai.settings.ai_mode = "gemini"
    client.app.state.ai.settings.gemini_api_key = "fake-test-key"
    timeout = httpx.ReadTimeout("The read operation timed out")
    server_error = errors.ServerError(503, {"error": {"message": "overloaded", "status": "UNAVAILABLE"}})

    failing = {1: timeout}
    assert client.post("/analyze", files={"sketch": ("dress.png", png())}).status_code == 200
    assert len(calls) == 2

    calls.clear()
    failing = {1: server_error, 2: timeout}
    assert client.post("/analyze", files={"sketch": ("dress.png", png())}).status_code == 502
    assert len(calls) == 2

    calls.clear()
    failing = {1: errors.ClientError(400, {"error": {"message": "bad request", "status": "INVALID_ARGUMENT"}})}
    assert client.post("/analyze", files={"sketch": ("dress.png", png())}).status_code == 502
    assert len(calls) == 1


def analyze_reply(**extra):
    reply = DesignSpec().model_dump(exclude={"style"})
    reply["main_style"] = {"fill": "#e8ebe9", "pattern": "floral"}
    return json.dumps({**reply, **extra})


def test_accents_recolor_single_parts(client, monkeypatch):
    accents = [{"part": "buttons", "fill": "#000000"}, {"part": "collar_neckline", "fill": "#112233"}]
    fake_gemini(client, monkeypatch, analyze_reply(accents=accents))
    result = client.post("/analyze", files={"sketch": ("dress.png", png())})
    assert result.status_code == 200
    style = result.json()["style"]
    # Only the fill changes; the main pattern stays on every part.
    assert style["buttons"] == {"fill": "#000000", "pattern": "floral"}
    assert style["collar_neckline"] == {"fill": "#112233", "pattern": "floral"}
    others = [value for part, value in style.items() if part not in ("buttons", "collar_neckline")]
    assert len(others) == 6 and all(value == {"fill": "#e8ebe9", "pattern": "floral"} for value in others)


def test_accents_are_optional_and_capped_at_three(client, monkeypatch):
    for reply in (analyze_reply(), analyze_reply(accents=[])):
        fake_gemini(client, monkeypatch, reply)
        style = client.post("/analyze", files={"sketch": ("dress.png", png())}).json()["style"]
        assert all(value["fill"] == "#e8ebe9" for value in style.values())

    parts = ["buttons", "pockets", "skirt", "bodice"]
    fake_gemini(client, monkeypatch, analyze_reply(accents=[{"part": part, "fill": "#000000"} for part in parts]))
    style = client.post("/analyze", files={"sketch": ("dress.png", png())}).json()["style"]
    # Only the first three accents are used; the fourth (bodice) is ignored.
    assert sorted(part for part, value in style.items() if value["fill"] == "#000000") == ["buttons", "pockets", "skirt"]


@pytest.mark.parametrize("accent", [
    {"part": "hem", "fill": "#000000"},      # not one of the 8 parts
    {"part": "buttons", "fill": "black"},    # not a 6-digit hex color
    {"part": "buttons"},                     # fill missing
])
def test_bad_accents_are_502(client, monkeypatch, accent):
    fake_gemini(client, monkeypatch, analyze_reply(accents=[accent]))
    assert client.post("/analyze", files={"sketch": ("dress.png", png())}).status_code == 502


def test_accent_parts_match_the_contract():
    from typing import get_args

    from app.ai_schemas import GeminiAccent
    from app.schemas import Styles

    assert list(get_args(GeminiAccent.model_fields["part"].annotation)) == list(Styles.model_fields)


def test_fallback_model_is_tried_when_primary_stays_unavailable(client, monkeypatch, tmp_path, caplog):
    import httpx
    from google import genai
    from google.genai import errors

    def api_error(kind, code, status):
        return kind(code, {"error": {"message": status.lower(), "status": status}})

    unavailable = api_error(errors.ServerError, 503, "UNAVAILABLE")
    deadline = api_error(errors.ServerError, 504, "DEADLINE_EXCEEDED")
    internal = api_error(errors.ServerError, 500, "INTERNAL")
    quota = api_error(errors.ClientError, 429, "RESOURCE_EXHAUSTED")
    timeout = httpx.ReadTimeout("The read operation timed out")
    models, waits = [], []

    class FakeClient:
        def __init__(self, **kwargs):
            self.models = self

        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def generate_content(self, **kwargs):
            models.append(kwargs["model"])
            if len(models) in failing:
                raise failing[len(models)]
            return SimpleNamespace(text=analyze_reply())

    monkeypatch.setattr(genai, "Client", FakeClient)
    monkeypatch.setattr("app.ai.time.sleep", waits.append)
    settings = client.app.state.ai.settings
    settings.ai_mode, settings.gemini_api_key = "gemini", "fake-test-key"
    settings.gemini_model, settings.gemini_fallback_model = "main-model", "backup-model"
    results = tmp_path / "results"
    results.mkdir()

    def analyze():
        models.clear()
        waits.clear()
        return client.post("/analyze", files={"sketch": ("dress.png", png())}).status_code

    main, backup = "main-model", "backup-model"

    # Overloaded (503) or out of quota (429): no retry, straight to the fallback after 2 seconds.
    for first in (unavailable, quota):
        failing = {1: first}
        assert analyze() == 200
        assert models == [main, backup] and waits == [2]
    assert "Gemini fallback model backup-model answered" in caplog.text
    saved = [json.loads(path.read_text()) for path in results.iterdir()]
    assert saved and all(result["model"] == backup for result in saved)

    # Timeouts and 504s get one retry on the main model first, then the fallback.
    for first, second in ((timeout, timeout), (deadline, deadline), (timeout, deadline), (deadline, unavailable)):
        failing = {1: first, 2: second}
        assert analyze() == 200
        assert models == [main, main, backup] and waits == [2]

    # A retry that succeeds never touches the fallback.
    failing = {1: deadline}
    assert analyze() == 200 and models == [main, main] and waits == []

    # The fallback gets one try only, whatever it fails with.
    for failing in ({1: unavailable, 2: unavailable}, {1: quota, 2: quota}):
        assert analyze() == 502 and models == [main, backup]

    # Other 5xx errors are retried once but never use the fallback.
    failing = {1: internal, 2: internal}
    assert analyze() == 502 and models == [main, main] and waits == []

    # Other 4xx errors fail immediately: no retry, no fallback.
    failing = {1: api_error(errors.ClientError, 400, "INVALID_ARGUMENT")}
    assert analyze() == 502 and models == [main] and waits == []

    # Without GEMINI_FALLBACK_MODEL: 503 gets the normal retry, 429 fails immediately.
    settings.gemini_fallback_model = ""
    failing = {1: unavailable, 2: unavailable}
    assert analyze() == 502 and models == [main, main] and waits == []
    failing = {1: unavailable}
    assert analyze() == 200 and models == [main, main]
    failing = {1: quota}
    assert analyze() == 502 and models == [main] and waits == []

def test_gemini_reply_with_missing_fields_is_502(client, monkeypatch):
    fake_gemini(client, monkeypatch, '{"garment_type": "dress"}')
    result = client.post("/analyze", files={"sketch": ("dress.png", png())})
    assert result.status_code == 502


def test_gemini_command_actions_are_validated(client, monkeypatch):
    body = {"text": "Make puff sleeves", "spec": DesignSpec().model_dump()}
    action = {"op": "set", "path": "sleeves.type", "value": "puff"}
    fake_gemini(client, monkeypatch, json.dumps({"actions": [action]}))
    result = client.post("/command", json=body)
    assert result.status_code == 200 and result.json() == [action]
    fake_gemini(client, monkeypatch, json.dumps({"actions": [{**action, "path": "garment_type"}]}))
    assert client.post("/command", json=body).status_code == 502


def test_edit_guide_covers_the_contract():
    from typing import get_args

    from app.ai import EDIT_GUIDE
    from app.schemas import editable_paths

    for path in editable_paths():
        section, *rest = path.split(".")
        if section == "style":
            assert rest[0] in EDIT_GUIDE and f"style.<part>.{rest[1]}" in EDIT_GUIDE, path
        else:
            assert f"- {path}:" in EDIT_GUIDE, path

    def allowed_values(model):
        for field in model.model_fields.values():
            if isinstance(field.annotation, type) and issubclass(field.annotation, BaseModel):
                yield from allowed_values(field.annotation)
            else:
                yield from (value for value in get_args(field.annotation) if isinstance(value, str))

    values = set(allowed_values(DesignSpec)) - {"dress"}
    assert len(values) > 20
    for value in values:
        assert f'"{value}"' in EDIT_GUIDE, value


def test_edit_prompts_carry_the_guide(client, monkeypatch):
    from google import genai

    from app.ai import EDIT_GUIDE, VERIFY_RULES

    prompts = []

    class FakeClient:
        def __init__(self, **kwargs):
            self.models = self

        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def generate_content(self, **kwargs):
            prompts.append(kwargs["contents"][0])
            return SimpleNamespace(text='{"actions": []}')

    monkeypatch.setattr(genai, "Client", FakeClient)
    client.app.state.ai.settings.ai_mode = "gemini"
    client.app.state.ai.settings.gemini_api_key = "fake-test-key"
    spec = DesignSpec()
    assert client.post("/command", json={"text": "maxi length", "spec": spec.model_dump()}).json() == []
    verify = client.post("/verify", data={"spec": spec.model_dump_json()},
                         files={"sketch": ("a.png", png()), "flat": ("b.png", png())})
    assert verify.json() == []
    assert EDIT_GUIDE in prompts[0] and VERIFY_RULES not in prompts[0]
    assert EDIT_GUIDE in prompts[1] and VERIFY_RULES in prompts[1]


@pytest.mark.parametrize("model", [GeminiDesignSpec, GeminiEditResult, GeminiSuggestions])
def test_gemini_schemas_avoid_unsupported_fields(model):
    schema = json.dumps(model.model_json_schema())
    assert "additionalProperties" not in schema
    assert '"default"' not in schema


# The detail fields added in prompt version v10, with the default an older spec gets.
DETAIL_DEFAULTS = {
    "collar.type": "none", "sleeves.cuff": "none", "sleeves.shoulder": "set_in",
    "waist.style": "natural", "skirt.fullness": "plain", "skirt.hem": "plain",
    "skirt.panels": "none", "details.placket": "none", "details.darts": False,
    "details.bow": "none", "details.trim": "none",
}


def test_specs_saved_before_the_detail_fields_still_load(client):
    from app.schemas import editable_paths

    part = {"fill": "#1f2a44", "pattern": "denim"}
    old = {
        "garment_type": "dress",
        "neckline": {"type": "scoop", "depth": 0.3},
        "sleeves": {"type": "puff", "length": "elbow"},
        "waist": {"seam": True},
        "skirt": {"silhouette": "flared", "length": "midi"},
        "details": {"pockets": "patch", "buttons": 4},
        "proportions": {"shoulder_width": 0.5, "waist_y": 0.5},
        "style": {name: part for name in DesignSpec().style.model_dump()},
        "notes": "saved before v10",
    }
    spec = DesignSpec.model_validate(old)
    assert spec.neckline.type == "scoop" and spec.details.buttons == 4  # old values are kept
    for path, default in DETAIL_DEFAULTS.items():
        section, field = path.split(".")
        assert getattr(getattr(spec, section), field) == default, path
    assert DETAIL_DEFAULTS.keys() <= editable_paths()
    assert client.post("/command", json={"text": "Make puff sleeves", "spec": old}).status_code == 200


@pytest.mark.parametrize("path,value", [
    ("neckline.type", "sweetheart"), ("neckline.type", "off_shoulder"), ("neckline.type", "halter"),
    ("neckline.type", "high"), ("collar.type", "peter_pan"), ("collar.type", "mandarin"),
    ("sleeves.cuff", "elastic"), ("sleeves.shoulder", "puff_top"), ("waist.style", "belted"),
    ("skirt.fullness", "pleated"), ("skirt.hem", "tiered"), ("skirt.panels", "princess_seams"),
    ("details.placket", "full"), ("details.darts", True), ("details.bow", "waist"), ("details.trim", "lace"),
])
def test_detail_values_are_valid_edits(path, value):
    section, field = path.split(".")
    spec = apply_actions(DesignSpec(), [EditAction(path=path, value=value)])
    assert getattr(getattr(spec, section), field) == value


@pytest.mark.parametrize("path,value", [
    ("neckline.type", "boat"), ("collar.type", "sailor"), ("collar", "shirt"), ("sleeves.cuff", "french"),
    ("waist.style", "high"), ("skirt.hem", "maxi"), ("details.darts", "yes"), ("details.placket", True),
])
def test_invalid_detail_values_are_rejected(path, value):
    with pytest.raises(ValueError):
        EditAction(path=path, value=value)


def test_gemini_detail_fields_reach_the_spec_and_are_required(client, monkeypatch):
    reply = json.loads(analyze_reply())
    reply["neckline"]["type"] = "sweetheart"
    reply["collar"] = {"type": "peter_pan"}
    reply["sleeves"].update(cuff="ruffle", shoulder="off_shoulder")
    reply["waist"]["style"] = "empire"
    reply["skirt"].update(fullness="gathered", hem="tiered", panels="front_seam")
    reply["details"].update(placket="full", darts=True, bow="neckline", trim="piping")
    fake_gemini(client, monkeypatch, json.dumps(reply))
    result = client.post("/analyze", files={"sketch": ("dress.png", png())})
    assert result.status_code == 200
    spec = result.json()
    for section in ("neckline", "collar", "sleeves", "waist", "skirt", "details"):
        assert spec[section] == reply[section], section

    # Gemini must fill in every detail field: a missing one is a 502, not a silent default.
    for section, field in (("collar", None), ("sleeves", "cuff"), ("details", "darts"), ("skirt", "hem")):
        broken = json.loads(json.dumps(reply))
        if field:
            del broken[section][field]
        else:
            del broken[section]
        fake_gemini(client, monkeypatch, json.dumps(broken))
        assert client.post("/analyze", files={"sketch": ("dress.png", png())}).status_code == 502, (section, field)


def test_analyze_prompt_explains_every_field_and_value():
    from typing import get_args

    from app.ai import ANALYZE_PROMPT

    def walk(model, prefix=""):
        for name, field in model.model_fields.items():
            kind = field.annotation
            if isinstance(kind, type) and issubclass(kind, BaseModel):
                yield from walk(kind, f"{prefix}{name}.")
            elif name != "accents":
                yield f"{prefix}{name}", [value for value in get_args(kind) if isinstance(value, str)]

    fields = dict(walk(GeminiDesignSpec))
    assert DETAIL_DEFAULTS.keys() <= fields.keys()
    for path, values in fields.items():
        assert f"- {path}:" in ANALYZE_PROMPT, path
        for value in values:
            assert f'"{value}"' in ANALYZE_PROMPT, (path, value)


def test_gemini_spec_matches_strict_contract():
    def same(loose, strict):
        # Gemini returns one main_style in place of the per-part style block.
        # accents is Gemini-only: ai.py folds it into the style block.
        names = ["style" if name == "main_style" else name for name in loose.model_fields if name != "accents"]
        assert names == list(strict.model_fields)
        for name, field in loose.model_fields.items():
            if name == "accents":
                continue
            if name == "main_style":
                same(field.annotation, PartStyle)
                continue
            other = strict.model_fields[name]
            if isinstance(field.annotation, type) and issubclass(field.annotation, BaseModel):
                same(field.annotation, other.annotation)
            else:
                bounds = lambda f: [m for m in f.metadata if type(m).__name__ in ("Ge", "Le")]
                assert field.annotation == other.annotation, name
                assert bounds(field) == bounds(other), name

    same(GeminiDesignSpec, DesignSpec)
    # The detail sections added in v10 are part of both models, so the walk above covers them.
    assert "collar" in GeminiDesignSpec.model_fields and "collar" in DesignSpec.model_fields


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
