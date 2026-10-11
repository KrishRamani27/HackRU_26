"""Score saved /analyze results against hand-made labels. Offline: no Gemini calls.

Run from anywhere:
    python AI/evaluate.py               # scores every JSON in AI/results/
    python AI/evaluate.py some/folder   # scores another folder of result JSONs

A result file is matched to its label by image name. Both "test1.json" and
"test1__20261010-175000.json" (saved by the backend) use the label "test1.json".
A label value can be one value or a list of acceptable values.
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
# Shared with the backend monitor; still works when run from any directory.
sys.path.insert(0, str(HERE.parent / "backend"))
from app.scoring import FIELDS, MISSING, matches, read, score_spec


def labels_dir():
    for name in ("labels", "label"):
        if (HERE / name).is_dir():
            return HERE / name
    sys.exit("No AI/labels or AI/label folder found")


def main():
    results = Path(sys.argv[1]) if len(sys.argv) > 1 else HERE / "results"
    labels = labels_dir()
    correct = dict.fromkeys(FIELDS, 0)
    total = dict.fromkeys(FIELDS, 0)
    mismatches, skipped, scored = [], [], 0

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
        scored += 1
        scores = score_spec(spec, label)
        for field in FIELDS:
            wanted = read(label, field)
            if wanted == MISSING:  # this label does not judge this field
                continue
            got = read(spec, field)
            total[field] += 1
            if scores["fields"][field]:
                correct[field] += 1
            else:
                mismatches.append(f"{image} ({path.name}): {field} got {got!r}, label {wanted!r}")

    print(f"Results: {results}")
    print(f"Labels:  {labels}")
    print(f"Scored {scored} result file(s)\n")
    print(f"{'Field':<20}{'Correct':>9}{'Accuracy':>10}")
    for field in FIELDS:
        share = f"{100 * correct[field] / total[field]:.0f}%" if total[field] else "n/a"
        print(f"{field:<20}{f'{correct[field]}/{total[field]}':>9}{share:>10}")
    right, judged = sum(correct.values()), sum(total.values())
    overall = f"{100 * right / judged:.0f}%" if judged else "n/a"
    print(f"{'Overall':<20}{f'{right}/{judged}':>9}{overall:>10}")

    print(f"\nMismatches ({len(mismatches)}):")
    for line in mismatches or ["none"]:
        print(f"  {line}")
    if skipped:
        print(f"\nSkipped ({len(skipped)}):")
        for line in skipped:
            print(f"  {line}")


if __name__ == "__main__":
    main()
