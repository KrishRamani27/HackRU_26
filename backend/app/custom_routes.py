"""Manual editing endpoints. None of these call Gemini."""
from copy import deepcopy
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import ValidationError
from sqlalchemy import select

from .custom_schemas import (MAX_ELEMENTS, CustomElement, CustomElementPatch,
                             CustomPartWrite, InstantiatePart)
from .database import CustomPart, Design, Version, now, record


def locked_design(session, design_id, expected_version=None):
    row = session.scalar(select(Design).where(Design.id == design_id).with_for_update())
    if row is None:
        raise HTTPException(404, "Design not found")
    if expected_version is not None and row.version != expected_version:
        raise HTTPException(409, "Design changed. Reload it before saving your edits.")
    return row


def save_snapshot(session, row):
    row.version += 1
    row.updated_at = now()
    session.add(Version(design_id=row.id, version=row.version,
                        spec=deepcopy(row.spec), custom_elements=deepcopy(row.custom_elements)))
    session.commit()
    return record(row)


def element_index(row, element_id):
    for index, element in enumerate(row.custom_elements):
        if element["id"] == element_id:
            return index
    raise HTTPException(404, "Custom element not found")


def append_element(session, row, element):
    return append_elements(session, row, [element])


def append_elements(session, row, elements):
    if len(row.custom_elements) + len(elements) > MAX_ELEMENTS:
        raise HTTPException(422, f"A design supports at most {MAX_ELEMENTS} custom elements")
    existing_ids = {existing["id"] for existing in row.custom_elements}
    if any(element.id in existing_ids for element in elements):
        raise HTTPException(409, "That element ID already exists in this design")
    row.custom_elements = [*row.custom_elements, *[element.model_dump() for element in elements]]
    return save_snapshot(session, row)


def part_elements(row):
    stored = row.element if isinstance(row.element, list) else [row.element]
    return [CustomElement.model_validate(item).model_dump() for item in stored]


def part_record(row):
    result = record(row)
    result.pop("element")
    result["elements"] = part_elements(row)
    # Preserve the old response for single-stroke clients. Never truncate a group.
    if len(result["elements"]) == 1:
        result["element"] = deepcopy(result["elements"][0])
    return result


def custom_router(db_session, protected):
    router = APIRouter(dependencies=protected, tags=["Manual drawing"])

    @router.get("/designs/{design_id}/elements", response_model=list[CustomElement])
    def elements(design_id: str, session=Depends(db_session)):
        row = session.get(Design, design_id)
        if row is None:
            raise HTTPException(404, "Design not found")
        return row.custom_elements

    @router.post("/designs/{design_id}/elements", status_code=201)
    def add_element(design_id: str, body: CustomElement,
                    expected_version: int | None = Query(None, ge=1), session=Depends(db_session)):
        return append_element(session, locked_design(session, design_id, expected_version), body)

    @router.put("/designs/{design_id}/elements/{element_id}")
    def replace_element(design_id: str, element_id: str, body: CustomElement,
                        expected_version: int | None = Query(None, ge=1), session=Depends(db_session)):
        if body.id != element_id:
            raise HTTPException(422, "Body id must match the element URL")
        row = locked_design(session, design_id, expected_version)
        index = element_index(row, element_id)
        changed = deepcopy(row.custom_elements)
        changed[index] = body.model_dump()
        row.custom_elements = changed
        return save_snapshot(session, row)

    @router.patch("/designs/{design_id}/elements/{element_id}")
    def edit_element(design_id: str, element_id: str, body: CustomElementPatch,
                     expected_version: int | None = Query(None, ge=1), session=Depends(db_session)):
        changes = body.model_dump(exclude_unset=True)
        if not changes:
            raise HTTPException(422, "Provide at least one changed field")
        row = locked_design(session, design_id, expected_version)
        index = element_index(row, element_id)
        merged = {**row.custom_elements[index], **changes}
        # transform is patched field-by-field, preserving the current scale/rotation.
        if isinstance(changes.get("transform"), dict):
            merged["transform"] = {**row.custom_elements[index]["transform"],
                                   **body.transform.model_dump(exclude_unset=True)}
        try:
            element = CustomElement.model_validate(merged)
        except ValidationError as exc:
            raise HTTPException(422, exc.errors(include_input=False, include_context=False)) from None
        changed = deepcopy(row.custom_elements)
        changed[index] = element.model_dump()
        row.custom_elements = changed
        return save_snapshot(session, row)

    @router.delete("/designs/{design_id}/elements/{element_id}")
    def remove_element(design_id: str, element_id: str,
                       expected_version: int | None = Query(None, ge=1), session=Depends(db_session)):
        row = locked_design(session, design_id, expected_version)
        index = element_index(row, element_id)
        row.custom_elements = [item for i, item in enumerate(row.custom_elements) if i != index]
        return save_snapshot(session, row)

    @router.post("/designs/{design_id}/versions/{version}/restore")
    def restore(design_id: str, version: int,
                expected_version: int | None = Query(None, ge=1), session=Depends(db_session)):
        row = locked_design(session, design_id, expected_version)
        snapshot = session.scalar(select(Version).where(Version.design_id == design_id,
                                                        Version.version == version))
        if snapshot is None:
            raise HTTPException(404, "Design version not found")
        row.spec = deepcopy(snapshot.spec)
        row.custom_elements = deepcopy(snapshot.custom_elements)
        return save_snapshot(session, row)

    @router.post("/custom-parts", status_code=201)
    def save_custom_part(body: CustomPartWrite, session=Depends(db_session)):
        row = CustomPart(name=body.name, element=[element.model_dump() for element in body.elements])
        session.add(row)
        session.commit()
        return part_record(row)

    @router.get("/custom-parts")
    def list_custom_parts(limit: int = Query(50, ge=1, le=100), offset: int = Query(0, ge=0),
                          session=Depends(db_session)):
        rows = session.scalars(select(CustomPart).order_by(CustomPart.created_at.desc(), CustomPart.id)
                               .limit(limit).offset(offset))
        return [part_record(row) for row in rows]

    def find_part(session, part_id):
        row = session.get(CustomPart, part_id)
        if row is None:
            raise HTTPException(404, "Custom part not found")
        return row

    @router.get("/custom-parts/{part_id}")
    def get_custom_part(part_id: str, session=Depends(db_session)):
        return part_record(find_part(session, part_id))

    @router.put("/custom-parts/{part_id}")
    def update_custom_part(part_id: str, body: CustomPartWrite, session=Depends(db_session)):
        row = find_part(session, part_id)
        row.name, row.element = body.name, [element.model_dump() for element in body.elements]
        session.commit()
        return part_record(row)

    @router.delete("/custom-parts/{part_id}", status_code=204)
    def delete_custom_part(part_id: str, session=Depends(db_session)):
        session.delete(find_part(session, part_id))
        session.commit()
        return Response(status_code=204)

    @router.post("/designs/{design_id}/elements/from-part/{part_id}", status_code=201)
    def reuse_custom_part(design_id: str, part_id: str, body: InstantiatePart,
                          expected_version: int | None = Query(None, ge=1), session=Depends(db_session)):
        row = locked_design(session, design_id, expected_version)
        copies = part_elements(find_part(session, part_id))
        if len(copies) > 1 and body.transform is not None:
            raise HTTPException(422, "Group placement must be applied by the editor; "
                                    "omit transform to preserve each stroke's position")
        groups = {}
        minimum_layer = min(item["layer_order"] for item in copies)
        elements = []
        for data in copies:
            data["id"] = str(uuid4())
            if data["group_id"] is not None:
                data["group_id"] = groups.setdefault(data["group_id"], str(uuid4()))
            if body.transform is not None:
                data["transform"] = body.transform.model_dump()
            if body.layer_order is not None:
                data["layer_order"] = body.layer_order + data["layer_order"] - minimum_layer
            try:
                elements.append(CustomElement.model_validate(data))
            except ValidationError as exc:
                raise HTTPException(422, exc.errors(include_input=False, include_context=False)) from None
        # Save the whole bow in one transaction and one history version.
        return append_elements(session, row, elements)

    return router
