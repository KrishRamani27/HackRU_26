# Frontend: Flat Workbench

React + Vite + TypeScript workbench for viewing and editing fashion technical flats.

## Run (PowerShell)

```powershell
cd frontend
npm.cmd install
npm.cmd run dev        # http://localhost:5173
```

Other scripts: `npm.cmd run build`, `npm.cmd run preview`, `npm.cmd run typecheck`.

## Current scope

- UI shell only. **There is no backend connection yet.** The canvas shows a labeled placeholder, not generated output.
- Sketch upload runs only in the browser: it checks the file type and size, shows a preview, and reads the image dimensions. Nothing is sent anywhere.
- The properties panel defines no garment fields. Those will come from the shared design-spec contract once it exists.
- `CanvasState` in `src/types.ts` holds only UI state. Builder SVG is passed through as opaque text and rendered through an `<img>`, so no script inside it can run.

## Sample preview

The empty canvas has a **View sample** button. It renders the Builder's `buildFlat(mockSpec)` output (`src/components/SampleFlat.tsx`), always labeled "Sample preview—not generated from a sketch". The sample never enables Export and has nothing to do with uploaded sketches.

## Previewing states (dev only)

- `http://localhost:5173/?canvas=loading`: canvas loading state
- `http://localhost:5173/?canvas=error`: canvas error state
- To see the upload error state, upload a non-image file or one larger than 5 MB.
