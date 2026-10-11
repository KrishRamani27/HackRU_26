"""Shapes sent to Gemini as response_schema.

Gemini rejects additionalProperties, which our strict Contract models produce.
These plain models have the same fields and allowed values as schemas.py, with
every field required. Replies are still validated by the strict models afterwards.
One difference: Gemini returns a single main_style, which ai.py copies to every part,
plus optional accents for parts whose color differs from it.
"""
from typing import Literal

from pydantic import BaseModel, Field


class GeminiNeckline(BaseModel):
    type: Literal["crew", "v", "scoop", "square", "sweetheart", "off_shoulder", "halter", "high"]
    depth: float = Field(ge=0, le=1)


class GeminiCollar(BaseModel):
    type: Literal["none", "shirt", "peter_pan", "band", "mandarin"]


class GeminiSleeves(BaseModel):
    type: Literal["none", "cap", "puff", "fitted"]
    length: Literal["short", "elbow", "long"]
    cuff: Literal["none", "band", "ruffle", "elastic"]
    shoulder: Literal["set_in", "puff_top", "off_shoulder"]


class GeminiWaist(BaseModel):
    seam: bool
    style: Literal["natural", "empire", "dropped", "belted"]


class GeminiSkirt(BaseModel):
    silhouette: Literal["straight", "a_line", "flared"]
    length: Literal["mini", "knee", "midi", "floor"]
    fullness: Literal["plain", "gathered", "pleated"]
    hem: Literal["plain", "ruffle", "tiered", "slit"]
    panels: Literal["none", "front_seam", "princess_seams"]


class GeminiDetails(BaseModel):
    pockets: Literal["none", "patch", "side_seam"]
    buttons: int = Field(ge=0, le=8)
    placket: Literal["none", "bodice", "full"]
    darts: bool
    bow: Literal["none", "neckline", "waist"]
    trim: Literal["none", "piping", "lace"]


class GeminiProportions(BaseModel):
    shoulder_width: float = Field(ge=0, le=1)
    waist_y: float = Field(ge=0, le=1)


class GeminiPartStyle(BaseModel):
    fill: str = Field(description="6-digit hex color like #1f2a44")
    pattern: Literal["solid", "denim", "plaid", "floral"]


class GeminiAccent(BaseModel):
    part: Literal["collar_neckline", "bodice", "left_sleeve", "right_sleeve",
                  "waist_seam", "skirt", "pockets", "buttons"]
    fill: str = Field(description="6-digit hex color like #1f2a44")


class GeminiDesignSpec(BaseModel):
    garment_type: Literal["dress"]
    neckline: GeminiNeckline
    collar: GeminiCollar
    sleeves: GeminiSleeves
    waist: GeminiWaist
    skirt: GeminiSkirt
    details: GeminiDetails
    proportions: GeminiProportions
    main_style: GeminiPartStyle = Field(description="Main fabric color and pattern of the whole dress")
    # Optional: Gemini may leave it out. ai.py uses at most the first three.
    accents: list[GeminiAccent] = Field(
        default_factory=list, description="Up to 3 parts whose color clearly differs from the main color")
    notes: str


class GeminiEditAction(BaseModel):
    op: Literal["set"]
    path: str
    value: str | int | float | bool


class GeminiEditResult(BaseModel):
    actions: list[GeminiEditAction]


class GeminiSuggestion(BaseModel):
    # One change to one field. ai.py turns it into {"op": "set", path, value} and checks
    # it against the strict contract; a suggestion that fails is dropped.
    path: str
    value: str | int | float | bool
    reason: str = Field(description="One sentence about proportion, balance or cohesion")


class GeminiSuggestions(BaseModel):
    suggestions: list[GeminiSuggestion]
    end_goal: str = Field(description="One sentence: the overall direction of these suggestions")
