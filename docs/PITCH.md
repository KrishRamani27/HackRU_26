# FlatSketch: pitch

For HackRU judging. Gemini track. Written from the project's own documents on October 11, 2026.
The pitch itself is at the top. Everything after "Live demo" is backup: numbers, answers to
likely questions, and what not to claim.

## One line

Take a photo of your sketch. Get a drawing a factory could use.

## The 30-second version

> Fashion students spend hours redrawing their own sketches in Illustrator, line by line,
> just to get a clean technical drawing. It's the most boring part of design.
>
> We killed it. Take a photo of your sketch, and FlatSketch gives you that drawing in
> seconds. And it isn't a picture. Click the skirt, it changes. Click the collar, it changes.
>
> You sketch it. We draw it.

## The full pitch (about 90 seconds)

Say it standing next to the screen. The lines marked **[do]** are things you do, not say.

> Raise your hand if you've ever drawn something on paper and then had to redraw it on a
> computer.
>
> That's every fashion student, every week. You sketch a dress in five minutes. Then you
> spend three hours in Illustrator tracing your own idea, just so it's clean enough to hand
> in. Nobody went to design school for that.
>
> So watch this.
>
> **[do: upload the sketch]**
>
> That's a photo of a pencil sketch. And that
>
> **[do: point at the flat]**
>
> is a technical flat. Symmetric. Clean lines. Ten seconds.
>
> Now here's the part that matters. This isn't an image. Watch.
>
> **[do: click the skirt, switch it to flared. Change the neckline. Add a collar.]**
>
> Every part of this dress is alive. That's because we don't let the AI draw. AI is bad at
> drawing: it gives you six fingers and a crooked hem. So Gemini does the one thing it's
> great at. It looks at your sketch and tells us what it sees: V-neck, puff sleeves, flared
> skirt. Then our own engine draws it, perfectly, every time.
>
> The AI is the eyes. Our code is the hand.
>
> **[do: open Templates, flip the three tabs. Click Try it on.]**
>
> Start from eighty templates. See it on a body with your measurements. Draw your own
> details on top. Then
>
> **[do: click Export]**
>
> one click, and it's a layered file ready for Illustrator.
>
> Five minutes to sketch it. Ten seconds to draw it. That's FlatSketch.

## Lines worth memorising

If you forget everything else, land these three.

- "You sketch it. We draw it."
- "The AI is the eyes. Our code is the hand."
- "This isn't an image. Watch."

## How to deliver it

- **Open with the hand-raise.** It gets the judges moving in the first five seconds.
- **Do the demo while you talk.** Never describe a click you could make.
- **Pause after "Watch."** Let the redraw happen in silence. That's the moment.
- **One person talks.** Someone else drives the laptop, so the speaker faces the judges.
- **Stop at "That's FlatSketch."** Don't add anything. Take questions.

## Live demo (about ninety seconds)

Do these in order. Each one shows a different strength.

1. **Upload a sketch.** Use one from `AI/test_sketches/`. Say: "Gemini is reading the design,
   not tracing the picture."
2. **Show the flat next to the sketch.** Point out it is symmetric and clean.
3. **Edit by clicking.** Click the skirt, switch straight to flared. Change the neckline to
   sweetheart. Add a Peter Pan collar. Say: "Each click changes one choice and redraws."
4. **Recolor.** Give the collar a contrast color and the body a plaid.
5. **Open Templates.** Flip through the Dresses, Tops and Skirts tabs.
6. **Click Try it on.** Open the figure settings, pick a body shape, drag a measurement.
7. **Export.** Download the SVG. If Illustrator or Figma is ready, open it and show the
   named layers.

If the Gemini quota is gone, start at step 3 from a template. Say so plainly: "Our free
quota is twenty calls a day, so I'll start from a template."

## Why it is technically interesting

- **A contract between the AI and the code.** The design is one small, strictly checked
  spec. The backend rejects anything outside it, so a wrong or made-up answer from the model
  cannot reach the drawing.
- **A drawing engine, not a template picker.** The flat is a pure function of the spec: the
  same choices always give the same drawing. Left and right come from one definition, so
  they cannot drift apart. It draws 8 necklines, 4 collars, sleeves with cuffs and shaped
  tops, belts, pleats, gathers, tiers, slits, seams, darts, bows and trim.
- **Tested hard.** 20,000 random combinations of every option, across dresses, tops and
  skirts, with no crash and nothing drawn off the canvas.
- **Safe by construction.** Colors from the AI are validated before they enter the SVG, and
  the app rebuilds the SVG through an allowlist before showing it.
- **Measured, not guessed.** Prompt versions are numbered and scored against hand-labelled
  sketches. An AI quality monitor records calls, speed, failures and accuracy per prompt
  version in Tiger Cloud.

## Numbers you can say

| Claim | Number | Where it comes from |
| --- | --- | --- |
| Templates | 80: 25 dresses, 27 tops, 28 skirts | `Builder/templates.ts` |
| Style options the builder draws | 8 necklines, 4 collars, and 25 detail options added in spec v10 | `Builder/buildFlat.ts` |
| Random specs tested with no failure | 20,000 | Builder sweep |
| Backend tests passing | 119 | `backend/tests` |
| Prompt versions tracked | 10 | `AI/prompt_versions.md` |
| Gemini accuracy on labelled fields | 39 of 40, then 23 of 24, then 16 of 16 in later saved runs | `AI/prompt_versions.md` |

Say the accuracy honestly: it is measured on **three** labelled test sketches and eight
labelled fields. The one repeated miss was a neckline on a sketch with a second layer under
the dress. A small test set is a limit, and saying so is stronger than hiding it.

## How we use Gemini

- **Reading the sketch** into the design spec, with a response schema so it can only choose
  allowed values.
- **Prompt engineering as an experiment.** Each prompt change is a numbered version with a
  reason and a score, so we can show what improved and what did not.
- **Also built on the backend:** comparing the flat with the sketch and proposing fixes,
  turning a typed command into edits, and suggesting improvements.

## Likely questions

**Why not have Gemini draw the SVG directly?**
It would not be symmetric, it would not be editable part by part, and it could not be
trusted to open cleanly in Illustrator. Choices are checkable. Drawings are not.

**What if Gemini gets it wrong?**
You fix it in one click, because the mistake is one wrong choice, not a wrong drawing. And
anything the spec cannot express, like an unusual trim, you draw on top with the pen.

**How accurate is it?**
On our three labelled sketches the latest saved runs match every labelled field. Three
sketches is a small set, and we would label more before claiming a general number.

**Is the figure a real fitting?**
No. It shows proportion: where the neckline, waist and hem sit on a body. It does not
simulate fabric.

**Did you use templates from somewhere?**
No. Every template is our own: a named set of the spec's options, drawn by our builder.

**What would you do next?**
Label more sketches, add a back view, and replace the shared demo key with real accounts.

## Who did what

| Role | Owns |
| --- | --- |
| AI lead | Gemini prompts, prompt versions, evaluation |
| Builder | The drawing engine, templates, the try-on figure |
| Frontend | The workbench: upload, canvas, editing, pen tool, export, library |
| Backend | The API, the spec contract, saving, the quality monitor, cloud setup |

Fill in names before presenting.

## Do not claim these unless you have checked them that day

These were not verified as working when this was written. Each is fine to mention as
"built" or "next" only in the way the note says.

- **Verify, text commands and suggestions in the app.** The backend routes exist. The team
  status document says the frontend does not call them. Say "the backend supports" or leave
  them out.
- **Voice control.** Not built.
- **Deployed on Cloud Run.** Not deployed when this was written. The backend runs locally.
- **Images in Google Cloud Storage.** The bucket exists, but the app does not upload images.
- **"Opens in Illustrator" as a tested fact.** The export is a valid layered SVG with named
  groups, checked in browsers. Open it in Illustrator yourself before saying it live.
- **Real sketch reading on your own laptop.** It needs a Gemini key and `AI_MODE=gemini`.
  Without them the app shows a demo dress and says "Mock AI mode" on screen.
- **Tops and skirts from a sketch.** Sketch reading returns dresses. Tops and skirts come
  from templates.
