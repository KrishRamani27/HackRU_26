"""Score saved /analyze results against hand-made labels. Offline: no Gemini calls.

Run from anywhere:
    python AI/evaluate.py               # scores every JSON in AI/results/
    python AI/evaluate.py some/folder   # scores another folder of result JSONs

A result file is matched to its label by image name. Both "test1.json" and
"test1__20261010-175000.json" (saved by the backend) use the label "test1.json".
A label value can be one value or a list of acceptable values.

Results are grouped by prompt version. A result file saved by the current backend
carries its own "prompt_version". For older files the version is inferred from the
time in the file name, using the "Version timeline" table in AI/prompt_versions.md.

A field is only judged when both the label and the result have it. Core fields and
the v10 detail fields are reported separately.
"""
import json
import re
import sys
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
# Shared with the backend monitor; still works when run from any directory.
sys.path.insert(0, str(HERE.parent / "backend"))
from app.scoring import FIELDS as CORE_FIELDS, MISSING, matches, read

# Added to the spec in prompt version v10-detailed. Older results do not have them.
DETAIL_FIELDS = [
    "collar.type", "sleeves.cuff", "sleeves.shoulder", "waist.style",
    "skirt.fullness", "skirt.hem", "skirt.panels",
    "details.placket", "details.darts", "details.bow", "details.trim",
]
ALL_FIELDS = CORE_FIELDS + DETAIL_FIELDS
# The three results exported by hand from AI Studio have no time in their file name.
NO_TIME_VERSION = "aistudio (v1 or v2)"
UNKNOWN = "unknown"


def labels_dir():
    for name in ("labels", "label"):
        if (HERE / name).is_dir():
            return HERE / name
    sys.exit("No AI/labels or AI/label folder found")


def read_timeline():
    """Rows of the "Version timeline" table: (in use from, version name), oldest first."""
    path = HERE / "prompt_versions.md"
    if not path.is_file():
        return []
    rows = re.findall(r"^\| (\d{4}-\d{2}-\d{2} \d{2}:\d{2}) \| `([\w-]+)` \|", path.read_text(), re.MULTILINE)
    return sorted((datetime.strptime(start, "%Y-%m-%d %H:%M"), version) for start, version in rows)


def version_of(path, spec, timeline):
    """The prompt version that produced a result file, and how we know."""
    if isinstance(spec.get("prompt_version"), str):
        return spec["prompt_version"], "saved in the file"
    stamp = re.search(r"__(\d{8}-\d{6})$", path.stem)
    if not stamp:
        return NO_TIME_VERSION, "no time in the file name"
    saved_at = datetime.strptime(stamp[1], "%Y%m%d-%H%M%S")
    version = UNKNOWN
    for start, name in timeline:  # the last version that started before the file was saved
        if start <= saved_at:
            version = name
    return version, "inferred from the file time" if version != UNKNOWN else "older than the timeline"


def version_order(version):
    number = re.match(r"v(\d+)", version)
    if number:
        return (1, int(number[1]), version)
    return (2, 0, version) if version == UNKNOWN else (0, 0, version)


def short(version):
    """Column heading: "v7-silhouette" -> "v7", "aistudio (v1 or v2)" -> "aistudio"."""
    return re.split(r"[- ]", version)[0]


def cell(correct, total):
    return f"{correct}/{total}" if total else "-"


def percent(correct, total):
    return f"{100 * correct / total:.0f}%" if total else "-"


def main():
    results = Path(sys.argv[1]) if len(sys.argv) > 1 else HERE / "results"
    labels = labels_dir()
    timeline = read_timeline()
    # counts[version][field] = [correct, judged]
    counts, files, basis = {}, {}, {}
    mismatches, skipped = [], []

    for path in sorted(results.glob("*.json")):
        image = path.stem.split("__")[0]
        label_path = labels / f"{image}.json"
        if not label_path.exists():
            skipped.append(f"{path.name}: no label named {image}.json")
            continue
        spec, label = json.loads(path.read_text()), json.loads(label_path.read_text())
        if read(spec, "garment_type") == MISSING:
            skipped.append(f"{path.name}: not a design spec")
            continue
        version, how = version_of(path, spec, timeline)
        files[version] = files.get(version, 0) + 1
        basis.setdefault(version, set()).add(how)
        tally = counts.setdefault(version, {field: [0, 0] for field in ALL_FIELDS})
        for field in ALL_FIELDS:
            wanted, got = read(label, field), read(spec, field)
            if MISSING in (wanted, got):  # not in the label, or not in this result: not judged
                continue
            tally[field][1] += 1
            if matches(got, wanted):
                tally[field][0] += 1
            else:
                mismatches.append(f"{image} [{version}] ({path.name}): {field} got {got!r}, label {wanted!r}")

    versions = sorted(counts, key=version_order)
    print(f"Results: {results}")
    print(f"Labels:  {labels}")
    print(f"Scored {sum(files.values())} result file(s)\n")

    print("Prompt versions")
    for version in versions:
        print(f"  {short(version):<10}{version:<22}{files[version]} file(s), version {', '.join(sorted(basis[version]))}")

    def total(version_list, fields):
        correct = sum(counts[v][f][0] for v in version_list for f in fields)
        judged = sum(counts[v][f][1] for v in version_list for f in fields)
        return correct, judged

    def table(title, fields):
        columns = [[version] for version in versions] + [versions]  # last column = every version
        print(f"\n{title:<22}" + "".join(f"{short(v):>10}" for v in versions) + f"{'All':>10}")
        for field in fields:
            print(f"{field:<22}" + "".join(f"{cell(*total(column, [field])):>10}" for column in columns))
        print(f"{'Total':<22}" + "".join(f"{cell(*total(column, fields)):>10}" for column in columns))
        print(f"{'Accuracy':<22}" + "".join(f"{percent(*total(column, fields)):>10}" for column in columns))

    table("Core fields", CORE_FIELDS)
    table("Detail fields (v10)", DETAIL_FIELDS)

    core, detail = total(versions, CORE_FIELDS), total(versions, DETAIL_FIELDS)
    print(f"\nOverall, every version together")
    print(f"  Core fields:   {cell(*core):>8}  {percent(*core)}")
    print(f"  Detail fields: {cell(*detail):>8}  {percent(*detail)}")
    print(f"  All fields:    {cell(core[0] + detail[0], core[1] + detail[1]):>8}  "
          f"{percent(core[0] + detail[0], core[1] + detail[1])}")

    print(f"\nMismatches ({len(mismatches)}):")
    for line in mismatches or ["none"]:
        print(f"  {line}")
    if skipped:
        print(f"\nSkipped ({len(skipped)}):")
        for line in skipped:
            print(f"  {line}")


if __name__ == "__main__":
    main()
