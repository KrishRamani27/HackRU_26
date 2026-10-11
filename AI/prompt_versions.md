# Analyze prompt versions

A log of every prompt used to turn a dress sketch into a design spec: what changed,
why, and what it produced. Scores come from `python AI/evaluate.py`, which compares
8 fields per result against the hand labels in `AI/label/`.

Test set: `test1.jpg`, `test2.jpg`, `test3.jpg` in `AI/test_sketches/`. Three sketches
is a small set; treat the scores as a smoke test, not a measurement.

Note on labels: the `test2` label was widened on October 10 to accept `a_line` or
`flared` for the skirt silhouette and `knee` or `midi` for the length. All scores below
use the current labels.

## Version names

Each analyze prompt version has a short name. The current one is stored in
`PROMPT_VERSION` in `backend/app/ai.py`:

```python
PROMPT_VERSION = "v10-detailed"
```

**Whenever `ANALYZE_PROMPT` changes, bump `PROMPT_VERSION` and add an entry here with
the same name.** This covers the prompt text and anything that changes what Gemini is
asked to return for `/analyze`, such as a new field in `GeminiDesignSpec`. Use the next
number and one or two words for the change, for example `v11-neckline-layers`.

`PROMPT_VERSION` covers the analyze prompt only. The edit prompts further down
(`EDIT_GUIDE`, `VERIFY_RULES`) are not versioned by it.

## Version timeline

Each live `/analyze` result saved in `AI/results/` now records its own
`prompt_version`. Older result files do not, so `AI/evaluate.py` reads this table and
gives each of them the last version that started before the time in its file name.
Times are local (Eastern), October 10, 2026. **Add a row when you bump
`PROMPT_VERSION`.**

| In use from | Version | How we know |
| --- | --- | --- |
| 2026-10-10 18:04 | `v5-neckline` | Commit `f4a892a` at 18:04. No results were saved under this version |
| 2026-10-10 18:46 | `v6-waist-y` | Commit `769efcf` at 18:46. Runs at 19:02 and 19:03 |
| 2026-10-10 19:05 | `v7-silhouette` | Edited between the 19:03 run and the 19:10 run; committed later with `v8` |
| 2026-10-10 19:36 | `v8-accents` | Commit `962d220` at 19:36. Runs at 19:39 and 22:23 |
| 2026-10-10 22:29 | `v9-collar-accent` | Commit `b9519e7` at 22:29. Run at 22:32 |
| 2026-10-10 23:00 | `v10-detailed` | Edited between 22:44 and the first run with detail fields at 23:13; committed at 23:18 |

Limits of this table:

- A commit time is when the prompt was committed, not when the server loaded it. Each
  boundary falls in a gap with no saved results, so the existing files are not affected.
- It assumes the running server had reloaded the prompt that was on disk.
- Results saved before 18:04 would be `unknown`. None exist: `v3` and `v4` runs were
  printed, not saved.
- `test1.json`, `test2.json` and `test3.json` have no time in their name. They are the
  AI Studio results and are grouped as `aistudio (v1 or v2)`.

## Summary

| Name | Version | Where it ran | Runs scored | Score | Misses |
| --- | --- | --- | --- | --- | --- |
| `v1-aistudio` | AI Studio v1 | AI Studio | not recorded | not recorded | not recorded |
| `v2-aistudio-layering` | AI Studio v2 (layering rule) | AI Studio | not recorded | not recorded | not recorded |
| `v1` or `v2`, unknown | AI Studio results in the repository | AI Studio | 3 | 24/24 | none |
| `v3-backend-starter` | Backend starter prompt | Backend, live | 5 | 39/40 | `test3` neckline |
| `v4-full-prompt` | Backend full prompt | Backend, live | 5 | 39/40 | `test3` neckline |
| `v5-neckline` | + neckline fix | Backend | 0 | not tested yet | |
| `v6-waist-y` | + new waist_y scale | Backend, live | 2 | 16/16 | none (`test3` not run) |
| `v7-silhouette` | + skirt silhouette definitions | Backend, live | 3 | 23/24 | `test3` neckline (`v`) |
| `v8-accents` | + accents | Backend, live | 2 | 16/16 | none (`test2` not run) |
| `v9-collar-accent` | + collar accent rule | Backend | 0 | not recorded here | |
| `v10-detailed` (current) | + 11 detail fields, 4 neckline types | Backend | 0 | not tested yet | |

## v1-aistudio: AI Studio v1

- **Prompt:** written and run in Google AI Studio. The text is not saved in this
  repository. _Paste it here._
- **Results:** not recorded here. _Add them if you still have them._

## v2-aistudio-layering: AI Studio v2 with the layering rule

- **What changed:** added a rule for sketches with visible layers.
- **Why:** _add the reason and the sketch that showed the problem._
- **Prompt:** not saved in this repository. _Paste it here._
- **Results:** not recorded here.

### AI Studio results saved in the repository

`AI/results/test1.json`, `test2.json` and `test3.json` were committed with the AI folder
setup, before the backend prompt work. They score 24/24. The repository does not say
whether v1 or v2 produced them. _Confirm which one and move this line under it._

## v3-backend-starter: Backend starter prompt

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

## v4-full-prompt: Backend full prompt

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

## v5-neckline: Backend full prompt + neckline fix

- **Where:** `ANALYZE_PROMPT` in `backend/app/ai.py`.
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

## v6-waist-y: Backend full prompt + new waist_y scale

- **Where:** `ANALYZE_PROMPT` in `backend/app/ai.py`.
- **What changed:** the `proportions.waist_y` explanation. Old: 0 = neckline, 1 = hem,
  measured against the dress length. New: 0 = empire line just under the bust,
  0.5 = natural waist, 1 = dropped waist at the hip, independent of skirt length.
- **Why:** the builder changed the contract in `CHATGPT.md` and `Builder/buildFlat.ts`
  on October 10. With the old wording, Gemini's values (about 0.3 to 0.4 for a natural
  waist) would be drawn as a raised waist.
- **Results:** two live runs are saved in `AI/results/` from about 7:02 PM on
  October 10 (`test1` and `test2`). Both returned `waist_y` 0.5, the natural waist on
  the new scale, and both score 8/8 on the labelled fields. `test3` has not been run,
  so the neckline fix is still untested. `waist_y` is not one of the 8 scored fields.

## v7-silhouette: Backend full prompt + skirt silhouette definitions

- **Where:** `ANALYZE_PROMPT` in `backend/app/ai.py`.
- **What changed:** the three `skirt.silhouette` definitions.
  - `straight`: falls nearly straight down from the waist with little or no widening.
  - `a_line`: widens gently and evenly from waist to hem, even if the skirt is gathered
    or pleated at the waist.
  - `flared`: dramatically full at the hem, like a circle or bell skirt.
  - New rule: "Gathers or pleats at the waist alone do not make a skirt flared; judge
    by how wide the hem is compared with the waist."
- **Why:** the old wording defined `flared` as "clear fullness: gathers, pleats, folds",
  so any gathered waist was read as flared. `test2`, a shirt dress gathered at the
  waist, came back `flared` in every run with the full prompt (three runs), although
  its hem is only moderately wider than its waist. The label accepts both values, so
  the score did not show it.
- **Also changed:** the short silhouette descriptions in `EDIT_GUIDE` now use the same
  wording, so `/verify` does not "correct" a gathered A-line skirt back to flared.
- **Results:** saved runs from 7:10 to 7:26 PM on October 10, after this change (this
  assumes the server had reloaded the new prompt):
  - `test2`: `a_line`, where the three earlier runs said `flared`.
  - `test1`: still `flared`.
  - `test3`: `a_line` and `knee`, both correct, but `neckline.type` came back `v`
    (label `scoop`). Before the neckline fix it was `crew`, so the fix changed the
    answer without making it right.
  - Score for these three runs: 23/24.
- **What to check:** `test2` should now return `a_line`, and `test1` (a very full
  floor-length skirt) should stay `flared`.

## v8-accents: Backend full prompt + accents

- **Where:** `ANALYZE_PROMPT` and `spread_style` in `backend/app/ai.py`;
  `GeminiAccent` in `backend/app/ai_schemas.py`.
- **What changed:**
  - Gemini still returns one `main_style`, and can now also return `accents`: a list
    of up to 3 items, each with `part` (one of the 8 SVG group names) and `fill`
    (6-digit hex).
  - The code copies `main_style` to all 8 parts, then sets each accent's fill on its
    part. The pattern stays the main pattern. Only the first 3 accents are used.
  - New prompt line: "Use accents only for parts whose color clearly differs from the
    main color, such as contrast buttons or a contrast collar."
- **Why:** with a single main style, color-blocking was lost. On `test3`, the black
  buttons came back the same off-white as the dress. Asking Gemini for all 8 part
  styles was tried first and made replies slow, so accents add only the exceptions.
- **Results:** two saved live runs from 10:23 PM on October 10, both 8/8:
  - `test3`: `buttons` came back near-black (`#1b1919`) while the other seven parts
    stayed off-white, so the buttons accent works. `neckline.type` was `scoop`, correct
    for the first time on this sketch.
  - `test3` did not get an accent for the black yoke at the neck, although the notes
    describe "a contrasting black high-neck turtleneck yoke/underlayer". This led to
    `v9-collar-accent`.
  - `test1`: no accents, one floral style on all parts, as expected.
  - `test2` was not run. A `test1` run saved at 7:39 PM (also 8/8, no accents) is
    counted under this version: the accents change was committed at 7:36 PM.
- **Builder note:** when this version was written, the builder drew `collar_neckline`
  and `waist_seam` without a fill. It now fills both as 6 px bands, so an accent on
  either part does show on the flat.

## v9-collar-accent: Backend full prompt + collar accent rule

- **Where:** `ANALYZE_PROMPT` in `backend/app/ai.py`.
- **What changed:** one sentence added to the `accents` field description:
  "If the neckline or top area is a clearly different color from the main dress, for
  example a contrasting yoke, collar or neckband, add an accent for collar_neckline
  with that color."
- **Why:** on `test3` with `v8-accents`, Gemini noticed the black yoke at the neck and
  wrote it in the notes, but returned an accent only for the buttons. The spec has no
  yoke part; `collar_neckline` is the closest part, and the builder draws it as a
  filled band along the neck edge.
- **Results:** not tested yet; no live calls were made for this change.
- **What to check:**
  - `test3` should return two accents: `buttons` and `collar_neckline`, both dark.
  - `test3` `neckline.type` should stay `scoop`. The neckline rule says to ignore a
    different-color layer underneath when choosing the type; this rule asks Gemini to
    report that same layer's color. Watch that the two do not pull against each other.
  - `test1` and `test2` should still return an empty list.

## v10-detailed: Backend full prompt + detail fields (current)

- **Where:** `ANALYZE_PROMPT` and `EDIT_GUIDE` in `backend/app/ai.py`;
  `backend/app/ai_schemas.py` (Gemini-facing, every field required);
  `backend/app/schemas.py` (strict contract, every new field has a default).
- **What changed:** the spec can now describe construction details that used to go
  into `notes` or were lost.

  | Field | Values | Default for old specs |
  | --- | --- | --- |
  | `neckline.type` | adds `sweetheart`, `off_shoulder`, `halter`, `high` | unchanged (`crew`) |
  | `collar.type` | `none`, `shirt`, `peter_pan`, `band`, `mandarin` | `none` |
  | `sleeves.cuff` | `none`, `band`, `ruffle`, `elastic` | `none` |
  | `sleeves.shoulder` | `set_in`, `puff_top`, `off_shoulder` | `set_in` |
  | `waist.style` | `natural`, `empire`, `dropped`, `belted` | `natural` |
  | `skirt.fullness` | `plain`, `gathered`, `pleated` | `plain` |
  | `skirt.hem` | `plain`, `ruffle`, `tiered`, `slit` | `plain` |
  | `skirt.panels` | `none`, `front_seam`, `princess_seams` | `none` |
  | `details.placket` | `none`, `bodice`, `full` | `none` |
  | `details.darts` | `true`, `false` | `false` |
  | `details.bow` | `none`, `neckline`, `waist` | `none` |
  | `details.trim` | `none`, `piping`, `lace` | `none` |

  - `ANALYZE_PROMPT` explains every new field and value in plain English. A test now
    fails if any field or value of the Gemini model is missing from the prompt.
  - New rule: use the plain value (`none`, `plain`, `set_in`, `natural` or `false`)
    unless the detail is clearly drawn.
  - `"high"` is defined as a high neck on the dress itself, not on a layer underneath,
    so it does not undo the `v5-neckline` rule.
  - `EDIT_GUIDE` lists the new paths and values, so `/verify`, `/command` and
    `/suggestions` can set them.
  - All existing fields, values and defaults are unchanged.
- **Why:** Gemini's notes kept describing things the spec could not hold: a shirt
  collar and full button placket on `test2`, a ruffled hem tier and cuffs on `test1`,
  pleats on `test3`.
- **Results:** not tested yet; no live calls were made for this change.
- **What to check:**
  - The schema sent to Gemini is larger (19 enums, 73 values). It has not been sent to
    live Gemini, so the first call will show whether Gemini accepts it and how much
    slower replies are.
  - `test1`: `skirt.hem` `ruffle` or `tiered`, `sleeves.cuff` `band`.
  - `test2`: `collar.type` `shirt`, `details.placket` `full`, `skirt.fullness` `gathered`.
  - `test3`: `skirt.fullness` `pleated`, and `neckline.type` should not become `high`.
  - The 8 scored fields should not get worse. The new fields are not in the labels
    or in `AI/evaluate.py` yet.
- **Known limits:**
  - The builder and the frontend do not know the new fields yet. `Builder/types.ts`,
    `frontend/src/state/specSchema.ts` and `CHATGPT.md` still describe the old spec.
    The builder ignores the new fields, and draws the four new neckline types as a
    round neck.
  - The frontend ignores edit actions that use a new path or value.

# Edit prompts (/verify, /command, /suggestions)

These routes return edit actions (`set` a path to a value) instead of a full spec.

## Starter edit prompts

- **Prompt:** the system prompt plus one task line and the current spec as JSON.
  - `/verify`: "Compare original sketch (first image) with flat (second image).
    Return only corrections that better match the sketch."
  - `/command`: "Apply this student command: <text>"
  - `/suggestions`: "Suggest improvements. Goal: <goal>"
- **Results (one live call each, `gemini-3.8-flash`, October 10):**
  - `/command` ("make puff sleeves, floor length, and add 4 buttons"): 3 correct actions.
  - `/suggestions`: 3 valid suggestions.
  - `/verify`: failed. Gemini returned `sleeves.type = "bishop"`,
    `skirt.silhouette = "gathered"` and `skirt.length = "maxi"`, which the strict
    contract rejected (502). The test used a blank white image as the flat, which
    pushed Gemini to correct everything.

## Edit prompts + EDIT_GUIDE and VERIFY_RULES

- **Where:** `EDIT_GUIDE` and `VERIFY_RULES` in `backend/app/ai.py` (current version).
- **What changed:**
  - `EDIT_GUIDE` is added to all three prompts. It lists every editable path with its
    allowed values and a short meaning, and says: never invent a value, use the closest
    listed one, give the right type, return an empty list when nothing should change.
  - `VERIFY_RULES` is added to `/verify` only. It says the flat is a simplified
    drawing, so ignore style and pose, and correct a field only when the sketch clearly
    shows a different listed option.
- **Why:** an edit action's value can be any text, so the response schema cannot tell
  Gemini which values belong to which path. Nothing in the old prompt listed them.
- **Results:** not tested yet. The quota was still exhausted at 6:47 PM on October 10.
- **To test `/verify` fairly:** use a real flat from the builder, not a blank image.
