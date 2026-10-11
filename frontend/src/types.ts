// UI-only state types. These deliberately do NOT describe the garment
// design-spec, edit-action, or saved-part contracts — those are owned
// elsewhere and will be wired in once they exist.

export type SketchState =
  | { status: "empty" }
  | { status: "loading"; fileName: string }
  | { status: "ready"; file: File; url: string; width: number; height: number }
  | { status: "error"; message: string };

/** Value of the backend's X-AI-Mode header; "unknown" if it was missing or unrecognized. */
export type AiMode = "mock" | "gemini" | "unknown";

/**
 * What the center canvas is showing. `svgMarkup` is opaque SVG text from the
 * garment builder; the canvas only displays it, it never parses it.
 */
export type CanvasState =
  | { status: "empty" }
  | { status: "loading" }
  | { status: "ready"; source: "analysis"; svgMarkup: string; aiMode: AiMode }
  | { status: "ready"; source: "sample"; svgMarkup: string }
  | { status: "ready"; source: "saved"; svgMarkup: string }
  | { status: "error"; message: string; title?: string };

/** Progress of the /analyze request. The resulting spec itself lives in the spec reducer. */
export type AnalysisStatus =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; title: string; message: string };
