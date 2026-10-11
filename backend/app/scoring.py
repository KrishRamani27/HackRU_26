"""Offline categorical scoring shared by the monitor and AI/evaluate.py."""

FIELDS = [
    "neckline.type", "sleeves.type", "sleeves.length", "waist.seam",
    "skirt.silhouette", "skirt.length", "details.pockets", "details.buttons",
]
MISSING = "<missing>"


def read(spec, field):
    for key in field.split("."):
        if not isinstance(spec, dict) or key not in spec:
            return MISSING
        spec = spec[key]
    return spec


def matches(got, wanted):
    accepted = wanted if isinstance(wanted, list) else [wanted]
    return any(type(got) is type(value) and got == value for value in accepted)


def score_spec(spec, label):
    fields = {}
    for field in FIELDS:
        wanted = read(label, field)
        if wanted != MISSING:
            fields[field] = matches(read(spec, field), wanted)
    return {"correct": sum(fields.values()), "total": len(fields), "fields": fields}
