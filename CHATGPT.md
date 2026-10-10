# FlatSketch: project guide

HackRU Fall 2026. Hacking ends 10:00 AM Sunday Oct 11; judging 1:00 PM.
Track: Gemini. Superlatives: Best Use of Gemini API, Best UI/UX, ElevenLabs, .Tech.

## What it does
A fashion student photographs a hand-drawn garment sketch. Gemini reads the design intent
into a structured design spec. Our code builds a clean, symmetric technical flat from that
spec using a parametric component library. Gemini compares the built flat to the original
sketch and refines the spec. The student edits by clicking or by voice; every edit changes
the spec and the flat is rebuilt. Export is a layered SVG that opens in Adobe Illustrator.

## Core rule
Gemini decides WHAT the design is. Our code decides HOW to draw it.
Never ask Gemini to output SVG coordinates or path geometry.

## MVP scope
- One garment type: dresses.
- 3-4 options per component (listed in the spec below).
- Front view only. Back view is a stretch goal.

## Architecture
- Frontend: React + Vite + TypeScript.
  - Holds the current design spec in state.
  - Flat builder lives here: spec in, SVG out, rebuilt on every change.
  - Editor UI: layers panel (one per part), property controls, fabric/color fills.
  - Export: serialize the current SVG with one named group per part.
- Backend: Python + FastAPI. Only talks to Gemini and ElevenLabs.
  - POST /analyze: sketch image -> design spec.
  - POST /verify: sketch image + rendered flat PNG + current spec -> list of edit actions.
  - POST /command: transcribed text + current spec -> list of edit actions.
- Keys in a backend .env file (GEMINI_API_KEY, ELEVENLABS_API_KEY). Never commit them.

## Design spec (the shared contract; all teams build against this)
Every field has a fixed set of allowed values. Gemini must only use these values.

- garment_type: "dress"
- neckline.type: "crew" | "v" | "scoop" | "square"
- neckline.depth: number 0-1 (shallow to deep)
- sleeves.type: "none" | "cap" | "puff" | "fitted"
- sleeves.length: "short" | "elbow" | "long" (ignored when type is "none")
- waist.seam: true | false
- skirt.silhouette: "straight" | "a_line" | "flared"
- skirt.length: "mini" | "knee" | "midi" | "floor"
- details.pockets: "none" | "patch" | "side_seam"
- details.buttons: integer 0-8 (front placket)
- proportions.shoulder_width: number 0-1 (relative to figure width)
- proportions.waist_y: number 0-1 (vertical position, 0 = neckline, 1 = hem)
- style: per part, fill color (hex) and fabric pattern ("solid" | "denim" | "plaid" | "floral")
- notes: free text from Gemini about anything it saw that the spec cannot express

## Edit action (the second contract)
One edit = { op: "set", path: "<dotted spec path>", value: <allowed value> }
Example: set "sleeves.type" to "puff". Clicked edits, voice edits, and verify-loop
corrections all produce this same shape. The frontend applies them and rebuilds.

## Saved part (third contract: the component library)
A saved part = { name, part_type, spec_settings, style }.
Example: name "my puff sleeve", part_type "sleeves", spec_settings { type: "puff",
length: "elbow" }, style { fill: "#1f2a44", pattern: "denim" }.
Students save parts from one design and drop them into another.

## Parts and SVG group names
collar_neckline, bodice, left_sleeve, right_sleeve, waist_seam, skirt, pockets, buttons.
Left and right parts are always mirrored from one definition.

## Build order
1. Write a hand-made mock spec so the frontend builder can start immediately.
2. /analyze working on one real sketch.
3. Builder draws every component option; real spec replaces the mock (target ~8 PM).
4. Editor controls + export.
5. Component library (save, browse, reuse parts), then /verify loop.
   ElevenLabs voice + /command is a STRETCH goal, decided at the 2 AM sync.
6. Freeze at 7 AM. Video, Devpost, README with MIT license.

## Evaluation (for the slides)
Hand-label 10-15 test sketches with their true spec. Report per-field accuracy of
/analyze (e.g. neckline type 13/15) and how often /verify improves it.

## Team rule
Everyone must be able to explain the code they ship. No unexplained magic at judging.
