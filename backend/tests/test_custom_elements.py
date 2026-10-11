from copy import deepcopy

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm.exc import StaleDataError

from app.config import Settings
from app.custom_schemas import CustomElement
from app.database import Design, database, initialize_database
from app.main import create_app
from app.schemas import DesignSpec


@pytest.fixture
def client(tmp_path):
    settings = Settings(_env_file=None, ai_mode="mock", backend_api_key="team-test",
                        storage_mode="local", database_url=f"sqlite:///{tmp_path / 'test.db'}",
                        local_storage_dir=str(tmp_path / "uploads"))
    with TestClient(create_app(settings), headers={"X-API-Key": "team-test"}) as client:
        yield client


def element(**changes):
    return {"id": "crease-1", "name": "Sleeve crease", "points": [[280, 120], [290, 135], [285, 150]],
            "parent_part": "right_sleeve", **changes}


def design(client, **changes):
    response = client.post("/designs", json={"name": "Dress", "spec": DesignSpec().model_dump(), **changes})
    assert response.status_code == 201
    return response.json()


def test_round_trip_and_old_clients_preserve_elements(client):
    saved = design(client, custom_elements=[element()])
    path = f"/designs/{saved['id']}"
    assert client.get(path).json()["custom_elements"][0]["points"] == element()["points"]
    updated = client.put(path, json={"name": "Edited dress", "spec": {"sleeves": {"type": "puff"}}})
    assert updated.status_code == 200
    assert updated.json()["custom_elements"] == saved["custom_elements"]
    history = client.get(path + "/versions").json()
    assert history[0]["custom_elements"] == history[1]["custom_elements"]
    cleared = client.put(path, json={"name": "Edited dress", "spec": {}, "custom_elements": []})
    assert cleared.json()["custom_elements"] == []


def test_edit_delete_and_restore_without_ai(client, monkeypatch):
    def forbidden(*args, **kwargs):
        raise AssertionError("Manual edits must not call Gemini")

    monkeypatch.setattr(client.app.state.ai, "call", forbidden)
    saved = design(client)
    path = f"/designs/{saved['id']}"
    created = client.post(path + "/elements?expected_version=1", json=element())
    assert created.status_code == 201 and created.json()["version"] == 2
    endpoint = path + "/elements/crease-1"
    resized = client.patch(endpoint + "?expected_version=2", json={"transform": {"scale_x": 2, "rotation": 30}})
    assert resized.status_code == 200 and resized.json()["version"] == 3
    moved = client.patch(endpoint, json={"transform": {"x": 25}, "visible": False, "layer_order": 5})
    drawing = moved.json()["custom_elements"][0]
    assert drawing["transform"] == {"x": 25, "y": 0, "scale_x": 2, "scale_y": 1, "rotation": 30}
    assert drawing["visible"] is False and drawing["layer_order"] == 5
    assert client.get(path + "/elements").json() == [drawing]
    assert client.delete(endpoint).json()["custom_elements"] == []
    restored = client.post(path + "/versions/3/restore")
    assert restored.status_code == 200 and restored.json()["version"] == 6
    assert restored.json()["custom_elements"][0]["transform"]["rotation"] == 30
    assert restored.json()["custom_elements"][0]["visible"] is True
    assert client.post(path + "/versions/999/restore").status_code == 404


def test_custom_library_reuse_creates_independent_instances(client):
    library = client.post("/custom-parts", json={"name": "Crease template", "element": element()})
    assert library.status_code == 201
    part = library.json()
    assert len(client.get("/custom-parts").json()) == 1
    saved = design(client)
    path = f"/designs/{saved['id']}/elements"
    first = client.post(path + f"/from-part/{part['id']}", json={"transform": {"x": 10}})
    second = client.post(path + f"/from-part/{part['id']}", json={"layer_order": 7})
    assert first.status_code == second.status_code == 201
    elements = second.json()["custom_elements"]
    assert elements[0]["id"] != elements[1]["id"]
    assert elements[0]["transform"]["x"] == 10
    assert elements[1]["layer_order"] == 7
    part_path = f"/custom-parts/{part['id']}"
    assert client.put(part_path, json={"name": "Renamed", "element": element()}).status_code == 200
    client.delete(part_path)
    assert client.get(part_path).status_code == 404
    assert len(client.get(f"/designs/{saved['id']}/elements").json()) == 2


def test_duplicates_stale_updates_and_auth(client):
    assert client.post("/designs", json={"name": "Test", "spec": {},
                                        "custom_elements": [element(), element()]}).status_code == 422
    saved = design(client, custom_elements=[element()])
    path = f"/designs/{saved['id']}"
    assert client.post(path + "/elements", json=element()).status_code == 409
    assert client.patch(path + "/elements/crease-1?expected_version=99", json={"name": "Changed"}).status_code == 409
    assert client.put(path + "?expected_version=99", json={"name": "Changed", "spec": {}}).status_code == 409
    assert client.get(path).json()["version"] == 1
    assert client.get(path + "/elements", headers={"X-API-Key": "wrong"}).status_code == 401
    assert client.post("/custom-parts", json={"name": "No", "element": element()},
                       headers={"X-API-Key": "wrong"}).status_code == 401
    assert client.delete(path + "/elements/missing").status_code == 404


@pytest.mark.parametrize("changes", [
    {"points": [[1]]}, {"points": [[1, 2, 3], [3, 4]]}, {"points": [[float("inf"), 1], [2, 3]]},
    {"points": [[1, 2]] * 5001}, {"stroke": "#fff"}, {"parent_part": "script"},
    {"transform": {"scale_x": 0}}, {"stroke_width": -1}, {"fill": "#ffffff"},
    {"points": [[1, 2], [2, 3]], "closed": True}, {"pattern": "denim"},
    {"layer_order": 1.5}, {"onload": "alert(1)"},
])
def test_invalid_drawing_data(changes):
    with pytest.raises(ValidationError):
        CustomElement.model_validate(element(**changes))


def test_closed_shape_style_and_failed_patch_leave_history_unchanged(client):
    saved = design(client, custom_elements=[element(closed=True, fill="#123456", pattern="denim")])
    path = f"/designs/{saved['id']}"
    endpoint = path + "/elements/crease-1"
    assert client.patch(endpoint, json={"closed": False}).status_code == 422
    assert client.patch(endpoint, json={"name": None}).status_code == 422
    assert client.patch(endpoint, json={}).status_code == 422
    assert client.put(endpoint, json=element(id="wrong")).status_code == 422
    assert client.get(path).json()["version"] == 1
    assert len(client.get(path + "/versions").json()) == 1
    result = client.patch(endpoint, json={"closed": False, "fill": None, "pattern": "solid", "parent_part": None})
    assert result.status_code == 200
    assert result.json()["custom_elements"][0]["parent_part"] is None


def test_element_count_limit(client):
    saved = design(client, custom_elements=[element(id=f"stroke-{i}") for i in range(200)])
    assert client.post(f"/designs/{saved['id']}/elements", json=element()).status_code == 422
    assert client.get(f"/designs/{saved['id']}").json()["version"] == 1


def test_migration_preserves_legacy_design_and_is_repeatable(tmp_path):
    url = f"sqlite:///{tmp_path / 'old.db'}"
    engine = create_engine(url)
    with engine.begin() as connection:
        connection.execute(text("CREATE TABLE designs (id TEXT PRIMARY KEY, name TEXT, spec JSON, "
                                "sketch_asset_id TEXT, version INTEGER, created_at DATETIME, updated_at DATETIME)"))
        connection.execute(text("CREATE TABLE design_versions (id TEXT PRIMARY KEY, design_id TEXT, "
                                "version INTEGER, spec JSON, created_at DATETIME)"))
        connection.execute(text("INSERT INTO designs(id, name, spec, version) VALUES ('old', 'Old dress', '{}', 1)"))
        connection.execute(text("INSERT INTO design_versions(id, design_id, version, spec) VALUES ('v1', 'old', 1, '{}')"))
    initialize_database(engine)
    initialize_database(engine)
    with engine.connect() as connection:
        assert connection.execute(text("SELECT name, custom_elements FROM designs")).one() == ("Old dress", "[]")
        assert connection.execute(text("SELECT custom_elements FROM design_versions")).scalar() == "[]"
    assert "custom_parts" in inspect(engine).get_table_names()
    engine.dispose()


def test_concurrent_saves_cannot_silently_overwrite(tmp_path):
    engine, sessions = database(f"sqlite:///{tmp_path / 'race.db'}")
    initialize_database(engine)
    with sessions() as session:
        row = Design(name="Dress", spec=DesignSpec().model_dump(), custom_elements=[])
        session.add(row)
        session.commit()
        row_id = row.id
    with sessions() as first, sessions() as second:
        a, b = first.get(Design, row_id), second.get(Design, row_id)
        a.custom_elements, a.version = [CustomElement.model_validate(element()).model_dump()], 2
        first.commit()
        b.name, b.version = "Stale edit", 2
        with pytest.raises(StaleDataError):
            second.commit()
    with sessions() as session:
        assert session.get(Design, row_id).custom_elements[0]["id"] == "crease-1"
    engine.dispose()


def test_group_id_round_trip_patch_and_restore(client):
    saved = design(client, custom_elements=[element(group_id="bow-1")])
    path = f"/designs/{saved['id']}"
    assert client.get(path + "/elements").json()[0]["group_id"] == "bow-1"
    assert client.patch(path + "/elements/crease-1", json={"group_id": "bow-2"}).status_code == 200
    cleared = client.patch(path + "/elements/crease-1", json={"group_id": None})
    assert cleared.json()["custom_elements"][0]["group_id"] is None
    restored = client.post(path + "/versions/1/restore")
    assert restored.json()["custom_elements"][0]["group_id"] == "bow-1"


@pytest.mark.parametrize("group_id", ["", "bad id", "a" * 65, 123, "<svg>"])
def test_group_id_follows_element_id_rules(group_id):
    with pytest.raises(ValidationError):
        CustomElement.model_validate(element(group_id=group_id))


def test_group_library_save_update_and_reuse(client):
    members = [element(id=f"bow-{i}", group_id="bow", layer_order=i,
                       transform={"x": i * 10, "rotation": i * 5}) for i in range(3)]
    members.append(element(id="ungrouped", group_id=None))
    response = client.post("/custom-parts", json={"name": "Bow", "elements": members})
    assert response.status_code == 201
    template = response.json()
    assert len(template["elements"]) == 4 and "element" not in template
    assert client.get(f"/custom-parts/{template['id']}").json()["elements"] == template["elements"]
    assert client.get("/custom-parts").json()[0]["elements"] == template["elements"]
    saved = design(client)
    path = f"/designs/{saved['id']}"
    reuse = path + f"/elements/from-part/{template['id']}"
    first = client.post(reuse, json={})
    second = client.post(reuse, json={"layer_order": 10})
    assert first.status_code == second.status_code == 201
    copies = second.json()["custom_elements"]
    assert len(copies) == 8 and second.json()["version"] == 3
    assert len({item["id"] for item in copies}) == 8
    assert copies[0]["group_id"] == copies[1]["group_id"] == copies[2]["group_id"]
    assert copies[4]["group_id"] == copies[5]["group_id"] == copies[6]["group_id"]
    assert copies[0]["group_id"] != copies[4]["group_id"] != "bow"
    assert copies[3]["group_id"] is None and copies[7]["group_id"] is None
    assert [item["transform"] for item in copies[:4]] == [item["transform"] for item in template["elements"]]
    assert [item["layer_order"] for item in copies[4:]] == [10, 11, 12, 10]
    assert client.get(path + "/versions").json()[1]["custom_elements"] == first.json()["custom_elements"]
    updated = client.put(f"/custom-parts/{template['id']}", json={"name": "Two strokes", "elements": members[:2]})
    assert updated.status_code == 200 and len(updated.json()["elements"]) == 2
    assert len(client.get(path).json()["custom_elements"]) == 8
    assert client.post(reuse, json={"transform": {"x": 99}}).status_code == 422


def test_group_reuse_capacity_failure_is_atomic(client):
    response = client.post("/custom-parts", json={"name": "Bow", "elements": [
        element(id="left", group_id="bow"), element(id="center", group_id="bow"),
        element(id="right", group_id="bow"),
    ]})
    saved = design(client, custom_elements=[element(id=f"stroke-{i}") for i in range(198)])
    path = f"/designs/{saved['id']}"
    result = client.post(path + f"/elements/from-part/{response.json()['id']}", json={})
    assert result.status_code == 422
    assert len(client.get(path).json()["custom_elements"]) == 198
    assert client.get(path).json()["version"] == 1


@pytest.mark.parametrize("body", [
    {"name": "Empty", "elements": []},
    {"name": "Duplicate", "elements": [element(), element()]},
    {"name": "Both", "element": element(), "elements": [element()]},
    {"name": "Too many", "elements": [element(id=f"e-{i}") for i in range(201)]},
])
def test_invalid_group_library_request(client, body):
    assert client.post("/custom-parts", json=body).status_code == 422
    assert client.get("/custom-parts").json() == []


def test_old_library_rows_still_load_and_reuse(tmp_path):
    from app.database import CustomPart

    url = f"sqlite:///{tmp_path / 'legacy-library.db'}"
    engine, sessions = database(url)
    initialize_database(engine)
    old = CustomElement.model_validate(element()).model_dump()
    old.pop("group_id")
    with sessions() as session:
        row = CustomPart(name="Old single stroke", element=old)
        session.add(row)
        session.commit()
        part_id = row.id
    engine.dispose()
    settings = Settings(_env_file=None, ai_mode="mock", storage_mode="local", backend_api_key="",
                        database_url=url, local_storage_dir=str(tmp_path / "uploads"))
    with TestClient(create_app(settings)) as client:
        response = client.get(f"/custom-parts/{part_id}")
        assert response.status_code == 200
        assert len(response.json()["elements"]) == 1
        assert response.json()["element"]["group_id"] is None
        saved = design(client)
        inserted = client.post(f"/designs/{saved['id']}/elements/from-part/{part_id}", json={})
        assert inserted.status_code == 201
        assert inserted.json()["custom_elements"][0]["id"] != old["id"]
