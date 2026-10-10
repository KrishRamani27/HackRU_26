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
    type: Literal["crew", "v", "scoop", "square"]
    depth: float = Field(ge=0, le=1)


class GeminiSleeves(BaseModel):
    type: Literal["none", "cap", "puff", "fitted"]
    length: Literal["short", "elbow", "long"]


class GeminiWaist(BaseModel):
    seam: bool


class GeminiSkirt(BaseModel):
    silhouette: Literal["straight", "a_line", "flared"]
    length: Literal["mini", "knee", "midi", "floor"]


class GeminiDetails(BaseModel):
    pockets: Literal["none", "patch", "side_seam"]
    buttons: int = Field(ge=0, le=8)


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
    explanation: str
    actions: list[GeminiEditAction]


class GeminiSuggestions(BaseModel):
    suggestions: list[GeminiSuggestion]
    end_goal: str
