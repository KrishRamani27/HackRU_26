import { useCallback, useRef, useState } from "react";
import { deletePart, listParts, PartsError, savePart } from "../api/parts";
import type { SavedPart, SavedPartInput } from "../library/libraryModel";

export type LibraryState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; parts: SavedPart[] }
  | { status: "error"; title: string; message: string };

/** The saved-parts library: loaded from the backend on first use, then kept in step with saves and deletes. */
export function useLibrary() {
  const [state, setState] = useState<LibraryState>({ status: "idle" });
  const started = useRef(false);

  const load = useCallback(async () => {
    started.current = true;
    setState({ status: "loading" });
    try {
      setState({ status: "ready", parts: await listParts() });
    } catch (err) {
      setState(
        err instanceof PartsError
          ? { status: "error", title: err.title, message: err.message }
          : { status: "error", title: "Couldn’t load the library", message: "Something went wrong. Try again." },
      );
    }
  }, []);

  /** Loads once. Safe to call from an effect that runs twice in development. */
  const ensureLoaded = useCallback(() => {
    if (!started.current) void load();
  }, [load]);

  const save = useCallback(async (input: SavedPartInput) => {
    const saved = await savePart(input);
    // If the list hasn't been loaded yet, it will include this part when it is.
    setState((s) => (s.status === "ready" ? { status: "ready", parts: [saved, ...s.parts] } : s));
    return saved;
  }, []);

  const remove = useCallback(async (id: string) => {
    await deletePart(id);
    setState((s) => (s.status === "ready" ? { status: "ready", parts: s.parts.filter((p) => p.id !== id) } : s));
  }, []);

  return { state, load, ensureLoaded, save, remove };
}
