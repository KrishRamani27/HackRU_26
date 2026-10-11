import { useCallback, useRef, useState } from "react";
import { deleteDrawing, listDrawings, saveDrawing, type SavedDrawing, type SavedDrawingInput } from "../api/customParts";
import { deletePart, listParts, PartsError, savePart } from "../api/parts";
import type { SavedPart, SavedPartInput } from "../library/libraryModel";

export type LibraryState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; parts: SavedPart[] }
  | { status: "error"; title: string; message: string };

export type DrawingsState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; drawings: SavedDrawing[] }
  | { status: "error"; title: string; message: string };

const failure = (err: unknown, fallback: string) =>
  err instanceof PartsError
    ? { status: "error" as const, title: err.title, message: err.message }
    : { status: "error" as const, title: fallback, message: "Something went wrong. Try again." };

/**
 * The library has two lists that load, fail and refresh on their own: dress parts (/parts) and saved
 * drawings (/custom-parts). Both are loaded the first time the Library tab opens, then kept in step
 * with saves and deletes.
 */
export function useLibrary() {
  const [state, setState] = useState<LibraryState>({ status: "idle" });
  const [drawings, setDrawings] = useState<DrawingsState>({ status: "idle" });
  const started = useRef(false);

  const load = useCallback(async () => {
    started.current = true;
    setState({ status: "loading" });
    try {
      setState({ status: "ready", parts: await listParts() });
    } catch (err) {
      setState(failure(err, "Couldn’t load the library"));
    }
  }, []);

  const loadDrawings = useCallback(async () => {
    started.current = true;
    setDrawings({ status: "loading" });
    try {
      setDrawings({ status: "ready", drawings: await listDrawings() });
    } catch (err) {
      setDrawings(failure(err, "Couldn’t load the drawings"));
    }
  }, []);

  /** Loads both lists once. Safe to call from an effect that runs twice in development. */
  const ensureLoaded = useCallback(() => {
    if (started.current) return;
    void load();
    void loadDrawings();
  }, [load, loadDrawings]);

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

  const saveDrawingItem = useCallback(async (input: SavedDrawingInput) => {
    const saved = await saveDrawing(input);
    setDrawings((s) => (s.status === "ready" ? { status: "ready", drawings: [saved, ...s.drawings] } : s));
    return saved;
  }, []);

  const removeDrawing = useCallback(async (id: string) => {
    await deleteDrawing(id);
    setDrawings((s) => (s.status === "ready" ? { status: "ready", drawings: s.drawings.filter((d) => d.id !== id) } : s));
  }, []);

  return { state, load, drawings, loadDrawings, ensureLoaded, save, remove, saveDrawingItem, removeDrawing };
}
