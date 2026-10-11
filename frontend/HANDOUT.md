# FlatSketch frontend: handout

This is the part of FlatSketch you see in the browser. You give it a photo of a hand drawn dress, it shows a clean technical drawing of that dress (a "flat"), and you can tweak the dress with controls on the right. This page explains what is built, how it works, and what is not done yet. Everything here was checked against the actual code.

## 1. What the app does, step by step

1. **Open the app.** You see an empty paper sheet that says "Begin with a sketch", with a faint dashed outline of a top. That outline is only a placeholder picture so the page does not look empty. It is not a result.
2. **Upload a sketch.** Drag a picture onto the left panel, or click "Choose file" (or the "Upload sketch" button at the top). It accepts PNG, JPG and WebP, up to 5 MB. The app checks the file before sending anything. A wrong file type or a file over 5 MB gets a clear message and nothing is sent.
3. **See your sketch.** The left panel shows a preview with the file name, the picture size and the file size. You can replace it or remove it with the X.
4. **It analyzes automatically.** As soon as a good file is picked, the picture goes to the backend. The middle sheet says "Reading your sketch" with a thin moving line under it while it waits. If the wait runs past about four seconds, a quiet line below the title softly changes through "Finding the neckline", "Measuring the skirt" and "Drafting your flat", and starts over if it keeps going. Those words are only reassurance, they do not show what the backend is really doing.
5. **The flat appears.** The backend sends back a short list of settings (neckline type, sleeve type, skirt length and so on). Our drawing code turns those settings into a clean, symmetrical flat on the paper sheet. A tag tells you whether this is a demo result or a real AI result (see section 3).
6. **Edit it.** Every control in the right panel changes one setting, and the drawing redraws right away.
7. **Save a part to the library.** Click a part of the dress. A bar appears at the top of the right panel with a "Save to library" button. Give the part a name and press Enter. It saves that part's settings (and its color and pattern) to the backend, so you can reuse it in any design.
8. **Reuse a saved part.** Open the "Library" tab at the top of the left panel. You see your saved parts as cards. Click a card to apply it to the design on the sheet. Filter chips at the top narrow the cards by part type, and the little trash icon on a card deletes it after a confirmation. Applying a part counts as one change, so one undo reverts it.
9. **Undo and redo.** Made a mistake? Press Ctrl+Z, or click the undo arrow at the top. Ctrl+Shift+Z or Ctrl+Y (or the redo arrow) brings the change back. It remembers the last 50 changes. Dragging a slider counts as one change, not one per pixel, so a single undo puts the slider back where the drag started.
10. **Click a part of the dress.** Click the bodice, a sleeve, the skirt and so on. The part glows, its name shows at the bottom of the sheet ("Selected: Bodice"), and the right panel scrolls to the matching controls and flashes them briefly. Click empty space or press Escape to let go. You can also Tab to a part and press Enter.
11. **Draw on the flat, then edit what you drew.** Next to the zoom buttons there are two tool buttons: Select (the arrow) and Pen. Turn the pen on, then press and drag on the dress to draw a freehand line, like sketching a crease, a seam or a note on top of the drawing. Press Escape to put the pen away. With the Select tool, click right on a line to select it (thin lines have an invisible wider area so they are easy to hit). The right panel then shows its name, stroke color, stroke width, an Open line or Closed shape choice, and, for a closed shape, a fill color and a fabric pattern (solid, denim, plaid or floral). Drag the selected line to move it. Press Delete or Backspace, or use the Delete button, to remove it. Every change, every drag and every delete is one undo step, and everything shows up in the exported SVG and PNG.
11b. **Select several, group them, save them.** With the Select tool, hold Shift and click to add or remove lines, or drag a box on empty canvas to select every line inside it. Dragging moves all selected lines together, and Delete removes them all, each as one undo step. With several selected, the right panel shows only stroke color, stroke width, Group or Ungroup, and Delete. Group ties the lines together, so clicking any one selects the whole group. When a line or group is selected, the "Save to library" bar appears. A group is saved as one item. In the Library tab the "Drawings" chip shows saved drawings with a small preview and name. Click a card to add a copy to your design (one undo step), or use the trash icon to delete it after a confirmation.
12. **Zoom.** Zoom buttons at the top of the sheet go from 50% to 300%, and there is a "fit" button.
13. **View sample.** On the empty sheet there is a "View sample" button. It loads a ready made dress from the builder so you can try the controls without uploading anything or running the backend. It is labeled as a sample that was not generated from a sketch, and "Hide sample" takes you back to the empty sheet. The sample is fully editable too.
14. **Export.** Once something is on the sheet, the Export button at the top turns on. Click it and pick SVG or PNG from the small menu. The file downloads with a name taken from the title, like `untitled-garment.svg`, and a short "Exported" message appears.
15. **Starting over.** Uploading a new sketch, opening the sample, or removing your sketch replaces the current design, and any edits and undo history are gone. Saved parts in the library are not affected. Whole designs are not saved anywhere yet.

## 2. The layout

The screen has a thin dark strip on the left, a top bar, and three panels.

**Dark strip on the left (navigation rail)**
* A hanger logo.
* "Workbench", which is the page you are on.
* "Workbench" and "Library". Each one switches the left panel (Workbench shows the Sketch tab, Library shows the Library tab), and the one for the open tab is lit. They stay in step with the tabs inside the left panel.

**Top bar**
* A small "Atelier / Workbench" line, then the project name "Untitled garment" in big letters with a "Draft" tag. The name is fixed for now, you cannot rename it.
* A status note that only appears after an analysis: "Mock AI mode", "Gemini", or "AI mode unknown".
* Undo and redo arrow buttons. They are greyed out when there is nothing to undo or redo.
* The "Upload sketch" button.
* The "Export" button with a small menu: SVG or PNG. It is greyed out until a sketch result or the sample is on the sheet.

**Panel 01, Sketch and Library (left)**
* Two tabs at the top: "Sketch" and "Library". The Library tab shows a small count of saved parts.
* Sketch tab: the drop zone, or the preview once you have a file, and error messages about the file.
* Library tab: filter chips by part type, then a grid of saved part cards. Each card shows a small preview, the name, the part type, a short summary of its settings, and its color and fabric. Empty library says "Save parts from your designs to reuse them."
* A short "Sketch guidance" list: front view with the garment centered, dark lines on a plain light background, shot flat without heavy shadows.

**Panel 02, Canvas (middle)**
* A toolbar with a status tag, the Select and Pen tool buttons, the zoom buttons, and "Hide sample" when the sample is showing.
* The paper sheet on a grid mat, where the dress is drawn.
* Tags on the sheet that say what you are looking at, and the "Selected" label at the bottom.

**Panel 03, Properties (right)**
* All the controls, grouped under small uppercase labels. Before anything is loaded it says "Nothing to edit yet".
* When a part is selected on the sheet, a bar at the very top shows its name and the "Save to library" button.

The status tag at the top of the canvas can say: "Placeholder, nothing loaded yet", "Sample", "Demo result", "AI result", "Result, AI mode unknown", "Analyzing", or "Error".

## 3. How it works under the hood

### Upload and /analyze
The picture stays in your browser until it passes the checks. Then it is sent to the backend at `http://localhost:8000/analyze` as an upload form with the field name "sketch". If the backend lives somewhere else, you can set `VITE_API_URL` to change the address. There are no passwords or API keys in the frontend, on purpose, because anything in the frontend can be seen by anyone.

The app makes exactly one request per upload. In development, React likes to run things twice to catch bugs, which would have sent the picture twice and cost twice if the AI charges per request. The code waits one tick before sending, so the accidental first run is cancelled before anything leaves the browser. If you upload a new picture while one is still being analyzed, the old request is cancelled.

### Demo (mock) or real AI
The backend sends back a header called `X-AI-Mode`. If it says `mock`, the backend is not really looking at your picture. It returns the same fixed sample dress every time. In that case the app labels the result clearly as a demo ("Demo result (mock AI), not real sketch recognition") so nobody is fooled. If it says `gemini`, the app calls it an AI result. If the header is missing or says something else, it says the AI mode is unknown.

### One place holds the design (the reducer)
The "design spec" is the list of settings for the dress: neckline, sleeves, waist, skirt, details, proportions, a color and pattern for each part, and a notes field. The app keeps exactly one copy of it, in one place called the reducer (`specReducer.ts`).

Every change goes through that one place, as a small instruction called an edit action. An edit action looks like: set `sleeves.type` to `puff`. It is the same shape the whole team agreed on in the project guide, and the backend uses the same shape, so clicks today and voice or AI edits later can all use it.

Before applying an edit, the reducer checks it with the same rules as the backend: the setting has to exist, the value has to be allowed, and numbers have to be in range. Bad edits are ignored. After every change it also tidies the colors and patterns so every part always has both a color and a pattern, and any color that is not a normal six digit hex color is swapped for white (this matters for safety, see the sanitizer below).

The reducer also keeps the history that powers undo and redo: a list of earlier versions of the settings (up to 50) and a list of undone ones. A new edit after an undo throws away the undone ones, like in any editor. To make a slider drag count as one step, edits that come from the same slider back to back are merged into one history entry until you let go. The same trick covers dragging in the color picker and typing in the notes box. Loading a new sketch or opening the sample starts a fresh, empty history.

The reducer also knows one styling rule. The collar band and the waistband (6 pixel strips the builder draws) copy the bodice's color and pattern by default, and keep copying it whenever the bodice changes. The first time you pick a color or a pattern on one of them, it gets its own style and stops following. The other one keeps following until you do the same to it. A small "Match bodice" button appears in the row of a collar or waistband that has its own style. Click it and that part follows the bodice again. It is one undo step. This is saved with every undo step, so undoing your edit to the collar makes it follow the bodice again. A design that already has a different collar color when it loads is treated as the collar's own choice.

The reducer starts empty. It gets filled by an analysis result or by the sample, and either one replaces whatever was there.

### How the drawing is made (buildFlat)
The frontend does not draw dresses. A teammate wrote `Builder/buildFlat.ts`. It takes the settings in and gives a drawing (SVG text) out, the same drawing every time for the same settings. It draws everything symmetrically around a center line, so the left and right sides can never drift apart. Each part of the dress is a named group in the drawing: `collar_neckline`, `bodice`, `left_sleeve`, `right_sleeve`, `waist_seam`, `skirt`, `pockets`, `buttons`. The app calls `buildFlat` again every time the settings change, which is why the drawing updates live. The idea behind the whole project is: the AI decides what the dress is, our code decides how to draw it.

### The SVG sanitizer
To make parts clickable, the drawing has to be placed directly into the page instead of shown as a picture. That is a risk: the builder copies color values into the drawing text without cleaning them, so a nasty value could sneak in code that runs in the page. So there are two safety layers. First, the reducer cleans every color before it reaches the builder. Second, the sanitizer (`sanitizeSvg.ts`) rebuilds the drawing from scratch, keeping only shapes, attributes and value formats on an approved list. Scripts, event handlers, links, styles and outside web addresses cannot get through. We tested it with hostile input, including a bad color that really did produce a live script handler from the builder, and it was stripped.

### Click to select
Once the drawing is in the page, the code works out which named group you clicked. Thin parts (the collar line, the waist seam, button dots, side seam pockets) are hard to hit, so each gets an invisible wider copy that catches clicks. The glow, the Tab focus, and the selected highlight exist only on the live page. They are never written into the drawing text. That matters later: when export is built, it must save the builder's text, not what is on screen, so no highlight ends up in an exported file.

### The component library
A saved part has four pieces, agreed in the project guide: a `name`, a `part_type` (neckline, sleeves, waist, skirt, details or proportions), `spec_settings` (just the settings of that one section, such as sleeve type and length), and a `style` (one color and one pattern). The backend adds an `id` and a date. The app talks to three backend routes: `GET /parts` to list, `POST /parts` to save and `DELETE /parts/{id}` to delete. Saved drawings use the separate `/custom-parts` routes (list, save a list of lines, delete).

The parts you click on the sheet (collar, bodice, left sleeve and so on) are not the same list as the six library types, so `libraryModel.ts` maps them: collar is neckline, bodice is proportions, either sleeve is sleeves, waist seam is waist, skirt is skirt, and pockets or buttons are details (saving pockets stores only the pockets setting, saving buttons stores only the buttons setting).

Applying a card turns the saved part into a batch of the same edit actions the controls use (for example set `sleeves.type` to `puff`, then the fill and pattern). They go through the one reducer together, so undo reverts the whole thing in one step, and invalid values are ignored like any other edit. A sleeve style is put on both sleeves. The small card previews are drawn by `buildFlat` too: a plain dress with the saved part applied, cropped to the area that part changes.

### Drawing on the flat
Hand drawn lines are "custom elements", defined in `backend/CUSTOM_ELEMENTS.md`. They are kept next to the settings in the same reducer, never inside them, so the settings stay exactly what the backend and the AI expect, and the lines are never sent to `/analyze`. Because they live in the same place, undo and redo cover them too.

With the pen on, a transparent layer sits over the dress. As you drag, it turns the pointer position into the dress's own 400 by 600 coordinates using the drawing's screen matrix, so it is exact at any zoom or scroll. While you drag you see the line grow. When you let go, the line is simplified (a few thousand pointer positions become tens or hundreds of points, never more than 0.6 units off from what you drew) and added with the contract's defaults: type stroke, not closed, color #1C1B1A, width 2, no move or resize, visible, drawn on top of the earlier ones, with a generated id and a name like "Stroke 1".

`buildFlat` draws the lines (it takes them as a second input) inside one group called `manual_drawing` on top of the dress. The app passes them to `buildFlat` both for the canvas and for export. The safe SVG filter needed no change, because the new groups and lines use only things it already allowed. Library card previews are drawn from the settings only, so they never show drawings.

With the Select tool, a drawn line only catches a click when you click right on it. Each line gets an invisible copy that is 14 pixels wide on the screen at any zoom, so it is easy to hit. Anywhere else a click goes through to the dress part underneath. Selecting a line deselects any dress part and the other way round, and a selected line gets the same soft outline as a selected part. Those extras exist only on the page, never in the drawing text, so export stays clean.

The edits follow the same contract rules as the backend, and invalid ones are ignored: a name of 1 to 120 characters, a hex color, a width above 0 up to 100, a closed shape needs at least 3 points, only closed shapes can have a fill, and a pattern other than solid needs a fill. Turning a shape back into an open line removes its fill. Moving a line changes only its x and y, never its points. A drag, a color drag and a slider drag are each one undo step. A name is applied when you press Enter or leave the box, and Escape throws the typing away.

### Export
The Export button does not copy what is on the screen. It asks `buildFlat` for a fresh drawing of the current settings and saves that text. That is why the selection glow, hover outline and focus rings can never end up in a file. The SVG gets an XML line at the top and keeps `xmlns`, `width` and `height` on the first tag, which Illustrator needs. The eight named groups, the fills and the fabric patterns are kept exactly as the builder wrote them. Before saving, a safety check refuses to write the file if it finds any code, any style leftovers, or any on screen only marker. The PNG is the same drawing at 2x size (800 by 1200) on a white background, made by the builder's own `svgToPng` helper.

### How colors and patterns travel from the panel to the drawing
1. You pick a color or a pattern chip in "Fabric & color".
2. The panel sends an edit action, for example set `style.bodice.pattern` to `denim`.
3. The reducer checks it, applies it, and tidies the style.
4. The app calls `buildFlat` with the new settings.
5. The builder's own fabric code (`fillFor`) either uses the plain color or builds a denim, plaid or floral pattern. The patterns are drawn by the builder, not by the frontend.
6. The sanitizer keeps those pattern definitions, and the page shows the result.

We checked this by measuring the picture before and after each change: every color and every pattern on every part the builder fills changes the drawing.

## 4. Every control in the Properties panel

| Control | What it changes |
| --- | --- |
| Neckline, Type | Crew, V, Scoop, or Square (`neckline.type`) |
| Neckline, Depth | Slider from 0 to 1, shallow to deep (`neckline.depth`) |
| Sleeves, Type | None, Cap, Puff, or Fitted (`sleeves.type`) |
| Sleeves, Length | Slider with three stops: Short, Elbow, Long (`sleeves.length`). Greyed out while sleeves are None, because length does not apply then. |
| Waist, Waist seam | Seam or No seam, whether the waist line is drawn (`waist.seam`) |
| Skirt, Silhouette | Straight, A line, or Flared (`skirt.silhouette`) |
| Skirt, Length | Slider with four stops: Mini, Knee, Midi, Floor (`skirt.length`) |
| Details, Pockets | None, Patch, or Side seam (`details.pockets`) |
| Details, Buttons | Slider from 0 to 8 buttons down the front (`details.buttons`) |
| Proportions, Shoulder width | Slider from 0 to 1 (`proportions.shoulder_width`) |
| Proportions, Waist height | Slider from 0 to 1 (`proportions.waist_y`). In the builder now, 0 is the empire line (high), 0.5 a natural waist, 1 a dropped waist (low). See the known limits about its labels. |
| Fabric & color, one row per part | A color swatch and four pattern chips (Solid, Denim, Plaid, Floral) for each of the 8 parts (`style.<part>.fill` and `style.<part>.pattern`). The collar and waist seam rows say "Follows the bodice until you set a color or pattern here" until you style them yourself. |
| Notes | A free text box up to 4000 characters (`notes`). It is for anything the settings cannot express, and it does not change the drawing. |

Two things you cannot edit: the garment type (it is always a dress), and anything the builder does not draw (see limits).

Sliders always show their current value next to the label. The selected chip is filled with the accent color (a deep terracotta).

## 5. Loading and error states

**In the Sketch panel**
* "Reading sketch": the file is being checked and previewed.
* "Isn't a supported image": wrong file type. Use PNG, JPG or WebP.
* "The limit is 5.0 MB": the file is too big. Shown before anything is sent.
* "Couldn't be read": the file may be damaged.

**On the Canvas**
* "Reading your sketch": waiting on the backend. After a few seconds the follow up words rotate under it, and the thin line keeps moving. With reduced motion turned on in the system, the line stays still.
* "Couldn't reach the backend": nothing answered at the backend address. Usually the backend is not running, or it is blocking this page.
* "Backend needs an API key": the backend is protected by a shared key and this app does not send one yet.
* "Sketch too large for the backend": the backend said the picture is over its limit.
* "Backend couldn't read the sketch": the backend did not accept the picture.
* "Analysis didn't finish": the AI service was unavailable or gave bad data. Try again.
* "Analysis failed" or "Unreadable backend reply": something else went wrong.
* "Couldn't draw the flat": the builder could not draw the current settings.

Each canvas error has a "Try again" button when a sketch is loaded.

**The error boundaries (the safety nets)**
There are two, one around the whole Canvas panel and one around the whole Properties panel. If something unexpected breaks while drawing or while showing the controls, the app used to show a blank white screen. Now only the broken panel is replaced by a message ("Couldn't draw the flat" or "Couldn't show the properties") with a "Try again" button. The other panel keeps working, and the net resets itself as soon as the design changes. We tested this by forcing both panels to fail on purpose and they both recovered.

**For developers only:** adding `?canvas=loading` or `?canvas=error` to the address in dev mode previews those two screens.

## 6. File map

Everything is in `frontend/`. The drawing code is not ours: it lives in `Builder/` at the top of the repo.

**Setup files**
* `package.json`: the list of tools and the run commands.
* `vite.config.ts`: the dev server settings. It allows the page to use the `Builder/` folder.
* `tsconfig.json`: the TypeScript settings.
* `index.html`: the one page the app lives in.
* `README.md`: shorter technical notes.
* `HANDOUT.md`: this file.

**`src/` at the top**
* `main.tsx`: starts the app.
* `App.tsx`: the main brain. Holds the reducer, runs the analysis, calls `buildFlat`, tracks the selected part, and puts the panels together.
* `types.ts`: the names of the screen states (what the canvas can show, what the analysis is doing).
* `styles.css`: all the looks: colors, fonts, spacing, hover and focus effects, phone sizes.

**`src/api/`**
* `analyze.ts`: sends the sketch to `/analyze`, reads the AI mode header, and turns failures into friendly messages.
* `parts.ts`: the library requests (list, save, delete) and their friendly error messages.

**`src/hooks/`**
* `useSketchUpload.ts`: checks the file (type and 5 MB), makes the preview, reads the picture size.
* `useUndoShortcuts.ts`: listens for Ctrl+Z, Ctrl+Shift+Z and Ctrl+Y. It ignores them while you are typing in a text box, so the notes box keeps its own normal undo.
* `useLibrary.ts`: loads the saved parts once, then keeps the list in step with saves and deletes.
* `useAnalysis.ts`: sends each good sketch once, cancels old requests, and loads the answer into the reducer.

**`src/state/`**
* `specSchema.ts`: the allowed values for every setting, the edit action shape, the check for a valid edit, the part names, which parts the builder fills, and the style tidy up.
* `specReducer.ts`: the one place that holds the design and applies edits.

**`src/library/`**
* `libraryModel.ts`: what a saved part is, how canvas parts map to library types, how a saved part becomes edit actions, and how the card previews are drawn.

**`src/draw/`**
* `strokes.ts`: pointer position to dress coordinates, simplifying a line, the stroke defaults and limits.

**`src/export/`**
* `exportFlat.ts`: makes the download. Builds the SVG file or the 2x PNG from the builder's drawing text and names the file from the title.

**`src/flat/`**
* `sanitizeSvg.ts`: the safety filter for the drawing.

**`src/components/`**
* `TopBar.tsx`: the header with the title, status, Upload button and the Export menu.
* `ExportMenu.tsx`: the Export button, its SVG or PNG dropdown, and the short "Exported" message.
* `NavRail.tsx`: the dark strip on the left.
* `LeftPanel.tsx`: the left panel frame with the "Sketch" and "Library" tabs.
* `UploadPanel.tsx`: the content of the Sketch tab.
* `LibraryPanel.tsx`: the content of the Library tab: filter chips, the card grid, loading, error and empty states, and the delete confirmation.
* `SavePartBar.tsx`: the "Save to library" bar that appears when a part is selected.
* `CanvasStage.tsx`: the Canvas panel, with zoom, tags, empty, loading and error screens, and the selected label.
* `DrawLayer.tsx`: the transparent layer for the pen. It turns a press and drag into a line and shows it as you draw.
* `ElementPanel.tsx`: the right panel while a drawn line is selected: name, colors, width, open or closed, fill and fabric, and Delete.
* `InlineFlat.tsx`: puts the cleaned drawing in the page and handles clicking, keyboard, and highlighting parts.
* `PropertiesPanel.tsx`: the Properties panel and the scroll and flash when a part is selected.
* `Controls.tsx`: the reusable pieces: section heading, chip group, slider.
* `ErrorBoundary.tsx`: the safety nets and their messages.
* `LoadingNote.tsx`: the follow up words that rotate under "Reading your sketch" when the wait is long.
* `PlaceholderFlat.tsx`: the dashed outline on the empty canvas.
* `garmentPaths.ts`: line art of a plain tee, used only for that placeholder and the little picture in the empty Properties panel.
* `Icons.tsx`: the small icons.

**Used from `Builder/` (a teammate's work)**
* `buildFlat.ts`: settings in, drawing out.
* `mockSpec.ts`: the ready made dress used for "View sample".
* `types.ts`: the shared definition of the settings.

## 7. How to run it

You need two things running: the backend and the frontend. In PowerShell, use `npm.cmd` instead of `npm`.

**Backend** (from the `backend` folder, needs Python 3.12 or newer)
```powershell
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements.lock
Copy-Item .env.example .env
.venv\Scripts\python -m uvicorn app.main:app --reload
```
It runs at http://localhost:8000, and http://localhost:8000/docs lets you try it. By default it is in mock mode, so no keys are needed. To use real Gemini, edit `backend/.env`: set `AI_MODE=gemini` and add your `GEMINI_API_KEY`. Never commit the `.env` file. The backend only accepts pages from http://localhost:5173 by default.

**Frontend** (from the `frontend` folder)
```powershell
npm.cmd install
npm.cmd run dev
```
Open http://localhost:5173. To check that everything compiles, run `npm.cmd run build`.

You can try the sample with only the frontend running. Uploading a sketch needs the backend.

## 8. Known limits and what is not done

**Not built yet**
* **Opening an export in Illustrator itself.** The SVG was checked as valid XML and rendered in a browser, and it has the named layers, fills and patterns. Nobody has opened it in Illustrator yet, so test one before promising it.
* **Saving designs.** Whole designs are not saved. A refresh loses the current design, including any lines you drew. Only library parts are saved, because the frontend does not use the backend's design routes yet.
* **Library limits.** Everyone who uses the same backend shares one library, because there are no user accounts. It shows the 100 newest parts. You cannot rename a saved part.
* **Library previews.** The card previews use a plain white dress as the base. Applying a saved collar or waist seam style gives that part its own style, so it stops following the bodice.
* **Layers panel.** The project guide mentions one. We have click to select instead.
* **AI suggestions, voice, and the verify loop.** The backend has routes for them. The frontend does not use them.
* **Renaming the project.** The name "Untitled garment" and the "Draft" tag are fixed.

**Things that behave in a limited way**
* **Gemini mode is untested from the frontend.** Everything was tested against the backend in mock mode. The code reads the header and handles real mode, but we have not seen it work with a real Gemini key.
* **The mock returns the same dress for any sketch.** That is why demo results are labeled.
* **The collar band and waistband are thin.** The builder fills them as 6 pixel strips, so colors show clearly but patterns are small. Floral is the hardest to see on the waistband. The waistband only exists while the waist seam is on, and the panel says so when it is off.
* **Side seam pockets cannot be colored** (they are just a line), and patterns on buttons are very small because buttons are tiny dots.
* **The "Waist height" slider labels are out of date.** The ends say "Neckline" and "Hem", but the builder now means empire line to dropped waist (0 high, 1 low). The slider itself works. Only the two end labels are wrong. The Builder notes also say the backend's Gemini prompt may still use the old meaning, so it is worth checking with the AI teammate.
* **The backend key.** If the backend turns on its shared key, the app shows "Backend needs an API key", because the frontend does not send one.
* **Upload size.** The 5 MB limit matches the backend's default. If the backend limit changes, the frontend number has to change too.
* **Dress only, front view only.** That is the scope for this event.
* **No automated tests.** The checks were done by hand with scripted browser runs. There is no test suite in the repo.
* **Built desktop first.** It adapts to small screens by stacking the panels, but it is not tuned for phones.
* **Edits and undo history are lost** when you load a new sketch or the sample.
* **Drawing, so far.** You can draw lines, select them, rename them, change color and width, close them into shapes, fill shapes with a color or fabric, move them by dragging, delete them, and undo all of it. You cannot yet resize, rotate, hide or reorder a line, attach one to a dress part, or draw a shape by clicking corners. The contract allows up to 200 lines per design and 5000 points per line. Drawing needs a mouse, finger or stylus. You can Tab to a line and press Enter to select it, but there is no keyboard way to draw or move one. On a touch screen, dragging a line may also scroll the page.

## 9. How to explain this to judges

Say it in your own voice, but this is the idea:

1. "You take a photo of a hand drawn dress and drop it in. The AI reads it and fills out a short settings sheet: what neckline, what sleeves, how long the skirt is."
2. "Then our own code, not the AI, draws a clean, symmetrical technical drawing from that settings sheet. That is why the lines are always neat: the AI decides what the dress is, and our code decides how to draw it."
3. "Every control on the right edits that one settings sheet, so the drawing changes instantly. You can also click any part of the dress and it takes you straight to that part's controls."
4. "You can change colors and fabrics like denim, plaid and floral on the parts of the dress, and it is all drawn as clean vector lines. You can download it as an SVG made for Illustrator, or as a PNG."
5. "We built safety in: files are checked before upload, the drawing is cleaned before it goes on the page, and if something breaks, one panel shows a message instead of the whole screen going blank."
6. "Right now the backend is running in demo mode, so it returns a sample dress and the app says so on screen. Real Gemini reading is the next thing to switch on and test."
