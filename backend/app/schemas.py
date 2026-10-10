from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class Contract(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class Neckline(Contract):
    type: Literal["crew", "v", "scoop", "square"] = "crew"
    depth: float = Field(default=0.25, ge=0, le=1)


class Sleeves(Contract):
    type: Literal["none", "cap", "puff", "fitted"] = "none"
    length: Literal["short", "elbow", "long"] = "short"


class Waist(Contract):
    seam: bool = True


class Skirt(Contract):
    silhouette: Literal["straight", "a_line", "flared"] = "a_line"
    length: Literal["mini", "knee", "midi", "floor"] = "knee"


class Details(Contract):
    pockets: Literal["none", "patch", "side_seam"] = "none"
    buttons: int = Field(default=0, ge=0, le=8, strict=True)


class Proportions(Contract):
    shoulder_width: float = Field(default=0.5, ge=0, le=1)
    waist_y: float = Field(default=0.4, ge=0, le=1)


class PartStyle(Contract):
    fill: str = Field(default="#ffffff", pattern=r"^#[0-9a-fA-F]{6}$")
    pattern: Literal["solid", "denim", "plaid", "floral"] = "solid"


class Styles(Contract):
    collar_neckline: PartStyle = Field(default_factory=PartStyle)
    bodice: PartStyle = Field(default_factory=PartStyle)
    left_sleeve: PartStyle = Field(default_factory=PartStyle)
    right_sleeve: PartStyle = Field(default_factory=PartStyle)
    waist_seam: PartStyle = Field(default_factory=PartStyle)
    skirt: PartStyle = Field(default_factory=PartStyle)
    pockets: PartStyle = Field(default_factory=PartStyle)
    buttons: PartStyle = Field(default_factory=PartStyle)


class DesignSpec(Contract):
    garment_type: Literal["dress"] = "dress"
    neckline: Neckline = Field(default_factory=Neckline)
    sleeves: Sleeves = Field(default_factory=Sleeves)
    waist: Waist = Field(default_factory=Waist)
    skirt: Skirt = Field(default_factory=Skirt)
    details: Details = Field(default_factory=Details)
    proportions: Proportions = Field(default_factory=Proportions)
    style: Styles = Field(default_factory=Styles)
    notes: str = Field(default="", max_length=4000)


# Build the allowed paths from the spec rather than accepting arbitrary object paths.
def editable_paths() -> set[str]:
    paths = set()
    for section, value in DesignSpec().model_dump().items():
        if isinstance(value, dict):
            for field, child in value.items():
                if isinstance(child, dict):
                    paths.update(f"{section}.{field}.{leaf}" for leaf in child)
                else:
                    paths.add(f"{section}.{field}")
    return paths | {"notes"}


class EditAction(Contract):
    op: Literal["set"] = "set"
    path: str
    value: str | int | float | bool

    @model_validator(mode="after")
    def validate_edit(self):
        if self.path not in editable_paths():
            raise ValueError("Unknown or locked design path")
        # Validate each value against the same contract used by /analyze.
        apply_actions(DesignSpec(), [self])
        return self


def apply_actions(spec: DesignSpec, actions: list[EditAction]) -> DesignSpec:
    data = spec.model_dump()
    for action in actions:
        target = data
        keys = action.path.split(".")
        for key in keys[:-1]:
            target = target[key]
        target[keys[-1]] = action.value
    return DesignSpec.model_validate(data)


class AIEditResult(Contract):
    actions: list[EditAction] = Field(default_factory=list, max_length=32)


class CommandRequest(Contract):
    text: str = Field(min_length=1, max_length=2000)
    spec: DesignSpec


class SuggestionRequest(Contract):
    spec: DesignSpec
    goal: str = Field(default="Improve this dress while keeping the student's intent", max_length=2000)


class Suggestion(Contract):
    explanation: str = Field(max_length=2000)
    actions: list[EditAction] = Field(max_length=32)


class Suggestions(Contract):
    suggestions: list[Suggestion] = Field(max_length=5)
    end_goal: str = Field(max_length=2000)


class DesignWrite(Contract):
    name: str = Field(min_length=1, max_length=120)
    spec: DesignSpec
    sketch_asset_id: str | None = None


class SavedPart(Contract):
    name: str = Field(min_length=1, max_length=120)
    part_type: Literal["neckline", "sleeves", "waist", "skirt", "details", "proportions"]
    spec_settings: dict[str, Any]
    style: PartStyle

    @model_validator(mode="after")
    def validate_settings(self):
        model = {
            "neckline": Neckline, "sleeves": Sleeves, "waist": Waist,
            "skirt": Skirt, "details": Details, "proportions": Proportions,
        }[self.part_type]
        if not self.spec_settings:
            raise ValueError("A saved part needs settings")
        parsed = model.model_validate(self.spec_settings)
        self.spec_settings = parsed.model_dump(include=set(self.spec_settings))
        return self
