// UI-only state types. These deliberately do NOT describe the garment
// design-spec, edit-action, or saved-part contracts — those are owned
// elsewhere and will be wired in once they exist.

export type SketchState =
  | { status: "empty" }
  | { status: "loading"; fileName: string }
  | { status: "ready"; file: File; url: string; width: number; height: number }
  | { status: "error"; message: string };

/**
 * What the center canvas is showing. `svgMarkup` is opaque SVG text from the
 * garment builder; the canvas only displays it, it never parses it.
 */
export type CanvasState =
  | { status: "empty" }
  | { status: "loading" }
  | { status: "ready"; svgMarkup: string }
  | { status: "error"; message: string };
