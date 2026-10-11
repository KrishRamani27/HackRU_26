import { useCallback, useEffect, useRef, useState } from "react";
import type { DesignSpec } from "../../../Builder/types";
import { fetchSuggestions, SuggestionsError, type Suggestion } from "../api/suggestions";
import type { AiMode } from "../types";

export type SuggestState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; suggestions: Suggestion[]; aiMode: AiMode }
  | { status: "error"; title: string; message: string };

/**
 * Design suggestions for the current design. Nothing is requested until `request` is called
 * (each request is one AI call). `designKey` changes when a different design is loaded; the old
 * suggestions are dropped then, and a request still on its way is cancelled.
 */
export function useSuggestions(designKey: unknown) {
  const [state, setState] = useState<SuggestState>({ status: "idle" });
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    setState({ status: "idle" });
    return () => controller.current?.abort();
  }, [designKey]);

  const request = useCallback((spec: DesignSpec) => {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setState({ status: "loading" });
    fetchSuggestions(spec, current.signal).then(
      (result) => {
        if (!current.signal.aborted) setState({ status: "ready", ...result });
      },
      (err: unknown) => {
        if (current.signal.aborted) return;
        setState(
          err instanceof SuggestionsError
            ? { status: "error", title: err.title, message: err.message }
            : { status: "error", title: "Suggestions failed", message: "Something went wrong. Try again." },
        );
      },
    );
  }, []);

  return { state, request };
}
