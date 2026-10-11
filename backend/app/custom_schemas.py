"""Manual drawing contracts, separate from the AI lead's dress schemas."""
from typing import Annotated, Literal
from uuid import uuid4

from pydantic import Field, model_validator

from .schemas import Contract, DesignWrite

MAX_ELEMENTS = 200
MAX_POINTS = 5000
Number = Annotated[float, Field(allow_inf_nan=False, ge=-10000, le=10000)]
Color = Annotated[str, Field(pattern=r"^#[0-9a-fA-F]{6}$")]
ElementID = Annotated[str, Field(min_length=1, max_length=64, pattern=r"^[a-zA-Z0-9_-]+$")]
PartName = Literal["collar_neckline", "bodice", "left_sleeve", "right_sleeve",
                   "waist_seam", "skirt", "pockets", "buttons"]
Pattern = Literal["solid", "denim", "plaid", "floral"]


class ElementTransform(Contract):
    x: Number = 0
    y: Number = 0
    scale_x: float = Field(default=1, gt=0, le=100, allow_inf_nan=False)
    scale_y: float = Field(default=1, gt=0, le=100, allow_inf_nan=False)
    rotation: float = Field(default=0, ge=-360, le=360, allow_inf_nan=False)


class CustomElement(Contract):
    id: ElementID = Field(default_factory=lambda: str(uuid4()))
    group_id: ElementID | None = None
    name: str = Field(min_length=1, max_length=120)
    type: Literal["stroke"] = "stroke"
    parent_part: PartName | None = None
    points: list[list[Number]] = Field(min_length=2, max_length=MAX_POINTS)
    closed: bool = False
    stroke: Color = "#222222"
    stroke_width: float = Field(default=2, gt=0, le=100, allow_inf_nan=False)
    fill: Color | None = None
    pattern: Pattern = "solid"
    transform: ElementTransform = Field(default_factory=ElementTransform)
    visible: bool = True
    layer_order: int = Field(default=0, ge=0, le=10000)

    @model_validator(mode="after")
    def drawing_rules(self):
        if any(len(point) != 2 for point in self.points):
            raise ValueError("Each point must contain exactly [x, y]")
        if self.closed and len(self.points) < 3:
            raise ValueError("A closed shape needs at least three points")
        if self.fill is not None and not self.closed:
            raise ValueError("Only closed shapes can have a fill")
        if self.pattern != "solid" and self.fill is None:
            raise ValueError("A fabric pattern needs a filled closed shape")
        return self


class CustomElementPatch(Contract):
    # Explicit null clears fill/parent_part/group_id. Other nulls fail merged validation.
    group_id: ElementID | None = None
    name: str | None = None
    parent_part: PartName | None = None
    points: list[list[Number]] | None = None
    closed: bool | None = None
    stroke: Color | None = None
    stroke_width: float | None = None
    fill: Color | None = None
    pattern: Pattern | None = None
    transform: ElementTransform | None = None
    visible: bool | None = None
    layer_order: int | None = None


class DesignDocumentWrite(DesignWrite):
    # Omission preserves existing elements on PUT; [] intentionally clears them.
    custom_elements: list[CustomElement] | None = Field(default=None, max_length=MAX_ELEMENTS)

    @model_validator(mode="after")
    def unique_ids(self):
        if self.custom_elements is not None:
            ids = [element.id for element in self.custom_elements]
            if len(ids) != len(set(ids)):
                raise ValueError("Custom element IDs must be unique within a design")
        return self


class CustomPartWrite(Contract):
    name: str = Field(min_length=1, max_length=120)
    elements: list[CustomElement] = Field(min_length=1, max_length=MAX_ELEMENTS)

    @model_validator(mode="before")
    @classmethod
    def legacy_single_element(cls, data):
        if isinstance(data, dict) and "element" in data:
            if "elements" in data:
                raise ValueError("Send elements or legacy element, not both")
            data = dict(data)
            data["elements"] = [data.pop("element")]
        return data

    @model_validator(mode="after")
    def unique_ids(self):
        ids = [element.id for element in self.elements]
        if len(ids) != len(set(ids)):
            raise ValueError("Element IDs must be unique within a custom part")
        return self


class InstantiatePart(Contract):
    transform: ElementTransform | None = None
    layer_order: int | None = Field(default=None, ge=0, le=10000)
