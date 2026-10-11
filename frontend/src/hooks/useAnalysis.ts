import { useCallback, useEffect, useRef, useState, type Dispatch } from "react";
import { analyzeSketch, AnalyzeError } from "../api/analyze";
import type { SpecAction } from "../state/specReducer";
import type { AnalysisStatus } from "../types";

/**
 * Sends each valid sketch to the backend and loads the returned DesignSpec into
 * the spec reducer. Returns only the request status plus a retry action.
 */
export function useAnalysis(
  file: File | null,
  dispatch: Dispatch<SpecAction>,
  initial: AnalysisStatus,
) {
  const [status, setStatus] = useState<AnalysisStatus>(initial);
  const [attempt, setAttempt] = useState(0);
  const hadFile = useRef(false);

  useEffect(() => {
    if (!file) {
      // Sketch removed or being replaced: drop its result and return to idle.
      if (hadFile.current) {
        hadFile.current = false;
        setStatus({ status: "idle" });
        dispatch({ type: "clear", source: "analysis" });
      }
      return;
    }
    hadFile.current = true;

    const controller = new AbortController();
    setStatus({ status: "loading" });

    const send = () => analyzeSketch(file, controller.signal)
      .then(({ spec, aiMode }) => {
        if (controller.signal.aborted) return;
        // Both updates land in one render, so the canvas never shows a gap.
        dispatch({ type: "load", spec, meta: { source: "analysis", aiMode, sketchFile: file } });
        setStatus({ status: "idle" });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setStatus(
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
  }, [file, attempt, dispatch]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { status, retry };
}
