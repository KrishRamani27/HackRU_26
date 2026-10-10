# Analyze prompt versions

A log of every prompt used to turn a dress sketch into a design spec: what changed,
why, and what it produced. Scores come from `python AI/evaluate.py`, which compares
8 fields per result against the hand labels in `AI/label/`.

Test set: `test1.jpg`, `test2.jpg`, `test3.jpg` in `AI/test_sketches/`. Three sketches
is a small set; treat the scores as a smoke test, not a measurement.

Note on labels: the `test2` label was widened on October 10 to accept `a_line` or
`flared` for the skirt silhouette and `knee` or `midi` for the length. All scores below
use the current labels.

## Summary

| Version | Where it ran | Runs scored | Score | Misses |
| --- | --- | --- | --- | --- |
| AI Studio v1 | AI Studio | not recorded | not recorded | not recorded |
| AI Studio v2 (layering rule) | AI Studio | not recorded | not recorded | not recorded |
| AI Studio, version unknown | AI Studio | 3 | 24/24 | none |
| Backend starter prompt | Backend, live | 5 | 39/40 | `test3` neckline |
| Backend full prompt | Backend, live | 5 | 39/40 | `test3` neckline |
| Backend full prompt + neckline fix | Backend | 0 | not tested yet | |

## AI Studio v1

- **Prompt:** written and run in Google AI Studio. The text is not saved in this
  repository. _Paste it here._
- **Results:** not recorded here. _Add them if you still have them._

## AI Studio v2: layering rule

- **What changed:** added a rule for sketches with visible layers.
- **Why:** _add the reason and the sketch that showed the problem._
- **Prompt:** not saved in this repository. _Paste it here._
- **Results:** not recorded here.

### AI Studio results saved in the repository

`AI/results/test1.json`, `test2.json` and `test3.json` were committed with the AI folder
setup, before the backend prompt work. They score 24/24. The repository does not say
whether v1 or v2 produced them. _Confirm which one and move this line under it._

## Backend starter prompt

- **Where:** `backend/app/ai.py`, before the full prompt.
- **Prompt:** the system prompt `SYSTEM` plus one task line:
  `Read this sketch into a dress design spec.`
- **What changed:** first prompt run through the real backend instead of AI Studio.
  The allowed values reached Gemini only through the response schema; nothing explained
  what the fields mean.
- **Results (model `gemini-3.8-flash`):** 5 successful runs, 39/40.
  - `test1` twice: all 8 fields correct both times.
  - `test2` twice: all correct under the current label, but the two runs disagreed
    with each other (`flared` + `midi`, then `a_line` + `knee`).
  - `test3` once: `neckline.type` came back `crew`; the label says `scoop`.
- **Other runs failed for reasons unrelated to the prompt:** timeouts at 60 s and 120 s.
- **Caveat:** these runs were printed during testing, not saved to `AI/results/`, and
  the settings changed between them (thinking level, image size, single main style).

## Backend full prompt

- **Where:** `ANALYZE_PROMPT` in `backend/app/ai.py`.
- **What changed:**
  - Explains every field in plain English, including `neckline.depth` 0 vs 1,
    `shoulder_width`, `waist_y`, and `straight` vs `a_line` vs `flared`.
  - Adds four rules: judge construction, not pose; describe the outermost garment and
    put underlayers and color-blocking in notes; pick the closest allowed value when
    unclear and explain it in notes; describe only what is visible.
- **Why:** the starter prompt gave different answers for the same sketch, and Gemini
  had no definition of the number scales or the skirt silhouettes.
- **Results (model `gemini-3.8-flash`, low thinking, each sketch run twice):**
  5 successful runs, 39/40.
  - `test1` twice: all correct, same answer both times.
  - `test2` twice: `flared` + `knee` both times. Correct under the current label; under
    the original label (`a_line` + `midi`) both would have been misses.
  - `test3` once: `neckline.type` `crew` instead of `scoop`. Gemini's notes describe a
    black high-neck layer under the white dress. The second run failed on the daily
    quota (429), not on the prompt.
- **Takeaway:** same score as the starter prompt, but the answers stopped changing
  between runs. The layering rule alone did not fix the `test3` neckline.

## Backend full prompt + neckline fix

- **Where:** `ANALYZE_PROMPT` in `backend/app/ai.py` (current version).
- **What changed:** one added rule:
  "neckline.type describes the neckline edge of the outermost dress. If a high-neck
  layer of a different color sits underneath, ignore it for neckline.type and mention
  it in notes."
- **Why:** on `test3`, Gemini read the neckline of the black underlayer (`crew`)
  instead of the white dress on top (`scoop`), with both earlier backend prompts.
- **Results:** not tested yet. The Gemini free-tier quota (20 requests per day) ran out
  on October 10 before this version could run.
- **To test:** run `/analyze` on the three sketches. The backend now saves each live
  result to `AI/results/<image>__<time>.json`. Then run `python AI/evaluate.py`.

## Backend full prompt + new waist_y scale

- **Where:** `ANALYZE_PROMPT` in `backend/app/ai.py` (current version).
- **What changed:** the `proportions.waist_y` explanation. Old: 0 = neckline, 1 = hem,
  measured against the dress length. New: 0 = empire line just under the bust,
  0.5 = natural waist, 1 = dropped waist at the hip, independent of skirt length.
- **Why:** the builder changed the contract in `CHATGPT.md` and `Builder/buildFlat.ts`
  on October 10. With the old wording, Gemini's values (about 0.3 to 0.4 for a natural
  waist) would be drawn as a raised waist.
- **Results:** not tested yet (quota). `waist_y` is not one of the 8 scored fields, so
  check it by eye on the built flat.
