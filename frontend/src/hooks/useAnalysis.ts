import { useCallback, useEffect, useRef, useState } from "react";
import { buildFlat } from "../../../Builder/buildFlat";
import { analyzeSketch, AnalyzeError } from "../api/analyze";
import type { CanvasState } from "../types";

/**
 * Sends each valid sketch to the backend, then draws the returned DesignSpec
 * with the Builder. Returns the canvas state plus a retry action.
 */
export function useAnalysis(file: File | null, initial: CanvasState) {
  const [state, setState] = useState<CanvasState>(initial);
  const [attempt, setAttempt] = useState(0);
  const hadFile = useRef(false);

  useEffect(() => {
    if (!file) {
      // Sketch removed or being replaced: go back to the empty canvas.
      if (hadFile.current) {
        hadFile.current = false;
        setState({ status: "empty" });
      }
      return;
    }
    hadFile.current = true;

    const controller = new AbortController();
    setState({ status: "loading" });

    const send = () => analyzeSketch(file, controller.signal)
      .then(({ spec, aiMode }) => {
        try {
          setState({ status: "ready", svgMarkup: buildFlat(spec), aiMode });
        } catch {
          setState({
            status: "error",
            title: "Couldn’t draw the flat",
            message: "The backend returned a design the builder couldn’t draw.",
          });
        }
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setState(
          err instanceof AnalyzeError
            ? { status: "error", title: err.title, message: err.message }
            : { status: "error", title: "Analysis failed", message: "Something went wrong. Try again." },
        );
      });

    // Send on the next tick, not inside the effect. React StrictMode (dev) runs
    // effect → cleanup → effect back to back, so the cleanup clears this timer
    // before the first request ever leaves the browser. One upload = one call.
    const timer = setTimeout(send, 0);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [file, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { state, retry };
}
