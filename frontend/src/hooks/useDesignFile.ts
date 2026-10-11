import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch } from "react";
import type { DesignSpec } from "../../../Builder/types";
import type { CustomElement } from "../../../Builder/buildFlat";
import { ConflictError, createDesign, getDesign, updateDesign, type SavedDesign } from "../api/designs";
import { describeError } from "../api/parts";
import { MAX_ELEMENTS } from "../draw/strokes";
import { validElement, type SpecAction, type SpecState } from "../state/specReducer";

export const DEFAULT_NAME = "Untitled garment";
export const MAX_NAME = 120; // the contract's limit
const SAVED_MS = 2500;

export type SaveStatus =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved" }
  /** The server has a newer version: nothing was overwritten. */
  | { kind: "conflict" }
  | { kind: "error"; message: string };

interface Base {
  spec: DesignSpec;
  elements: CustomElement[];
  name: string;
  key: string;
}

const keyOf = (spec: DesignSpec, elements: CustomElement[], name: string) => JSON.stringify([spec, elements, name]);

/** The main parts of a spec, so something that is not a design at all is refused instead of crashing the builder. */
function looksLikeSpec(spec: unknown): spec is DesignSpec {
  const s = spec as Record<string, unknown> | null;
  return (
    !!s && typeof s === "object" &&
    ["neckline", "sleeves", "waist", "skirt", "details", "proportions"].every((k) => !!s[k] && typeof s[k] === "object")
  );
}

/**
 * Saving and opening whole designs. Keeps the design's server identity (id and version), its name, and a
 * snapshot taken at the last save or load, so "unsaved changes" means "differs from that snapshot".
 */
export function useDesignFile(design: SpecState, dispatch: Dispatch<SpecAction>) {
  const [name, setNameState] = useState(DEFAULT_NAME);
  const [file, setFile] = useState<{ id: string; version: number } | null>(null);
  const [base, setBase] = useState<Base | null>(null);
  const [status, setStatus] = useState<SaveStatus>({ kind: "idle" });
  const [notice, setNotice] = useState<string | null>(null);
  const pendingOpen = useRef<{ id: string; version: number; name: string; skipped: number } | null>(null);
  const busy = useRef(false);
  const savedTimer = useRef(0);
  // Counts the designs shown so far. A save or reload that finishes after a different design has appeared
  // (a new sketch, the sample, New design, Open) belongs to the old one and must not touch the new one's
  // identity, or the new design's first save would update the old design instead of creating its own.
  const generation = useRef(0);

  const latest = useRef({ design, name, file });
  latest.current = { design, name, file };

  // A different design appeared (a sketch result, the sample, an opened design, or nothing): start over.
  useEffect(() => {
    const opened = pendingOpen.current;
    pendingOpen.current = null;
    generation.current += 1;
    window.clearTimeout(savedTimer.current);
    setStatus({ kind: "idle" });
    if (!design.spec) {
      setFile(null);
      setNameState(DEFAULT_NAME);
      setBase(null);
      setNotice(null);
      return;
    }
    const n = opened?.name ?? DEFAULT_NAME;
    setFile(opened ? { id: opened.id, version: opened.version } : null);
    setNameState(n);
    setNotice(
      opened && opened.skipped > 0
        ? `${opened.skipped} drawn ${opened.skipped === 1 ? "line" : "lines"} in this design couldn’t be loaded because ${opened.skipped === 1 ? "it doesn’t" : "they don’t"} match the drawing rules.`
        : null,
    );
    setBase({ spec: design.spec, elements: design.customElements, name: n, key: keyOf(design.spec, design.customElements, n) });
  }, [design.meta]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = useMemo(() => {
    if (!design.spec || !base) return false;
    if (base.spec === design.spec && base.elements === design.customElements && base.name === name) return false;
    return keyOf(design.spec, design.customElements, name) !== base.key;
  }, [design.spec, design.customElements, name, base]);

  const setName = useCallback((next: string) => {
    const trimmed = next.trim().slice(0, MAX_NAME);
    if (trimmed) setNameState(trimmed);
  }, []);

  const save = useCallback(async (): Promise<boolean> => {
    const { design: d, name: n, file: f } = latest.current;
    if (!d.spec || busy.current) return false;
    busy.current = true;
    window.clearTimeout(savedTimer.current);
    setStatus({ kind: "saving" });
    const gen = generation.current;
    const spec = d.spec;
    const elements = d.customElements;
    try {
      const input = { name: n, spec, custom_elements: elements };
      const saved = f ? await updateDesign(f.id, input, f.version) : await createDesign(input);
      if (gen !== generation.current) return true; // saved, but it was the previous design: leave the new one alone
      setFile({ id: saved.id, version: saved.version });
      // The snapshot is what was sent, so anything edited while the save was in flight still counts as unsaved.
      setBase({ spec, elements, name: n, key: keyOf(spec, elements, n) });
      setStatus({ kind: "saved" });
      savedTimer.current = window.setTimeout(() => setStatus({ kind: "idle" }), SAVED_MS);
      return true;
    } catch (err) {
      if (gen !== generation.current) return false;
      setStatus(err instanceof ConflictError ? { kind: "conflict" } : { kind: "error", message: describeError(err, "Couldn’t save this design.") });
      return false;
    } finally {
      busy.current = false;
    }
  }, []);

  /** Replaces the current design with a saved one, as a fresh undo history. */
  const openSaved = useCallback(
    (saved: SavedDesign) => {
      if (!looksLikeSpec(saved.spec)) throw new Error("This saved design doesn’t have a readable spec.");
      const all = Array.isArray(saved.custom_elements) ? saved.custom_elements : [];
      const elements = all.filter(validElement).slice(0, MAX_ELEMENTS);
      pendingOpen.current = { id: saved.id, version: saved.version, name: saved.name || DEFAULT_NAME, skipped: all.length - elements.length };
      dispatch({ type: "load", spec: saved.spec, customElements: elements, meta: { source: "saved" } });
    },
    [dispatch],
  );

  /** After a 409: fetch the latest version and replace what is on screen with it. */
  const reload = useCallback(async () => {
    const f = latest.current.file;
    if (!f) return;
    setStatus({ kind: "saving" });
    const gen = generation.current;
    try {
      const latestDesign = await getDesign(f.id);
      if (gen !== generation.current) return; // a different design is on screen now
      openSaved(latestDesign);
    } catch (err) {
      if (gen !== generation.current) return;
      setStatus({ kind: "error", message: describeError(err, "Couldn’t reload this design.") });
    }
  }, [openSaved]);

  const dismiss = useCallback(() => {
    setStatus({ kind: "idle" });
    setNotice(null);
  }, []);

  // Ctrl+S (Cmd+S on a Mac) saves instead of the browser's save dialog.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== "s") return;
      e.preventDefault();
      if (!latest.current.design.spec) return;
      // A box being typed in (the name, a layer name, a number) applies its text when it loses focus; wait for that.
      const active = document.activeElement;
      if (active instanceof HTMLElement && active !== document.body && active.matches("input, textarea")) active.blur();
      window.setTimeout(() => void save(), 0);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [save]);

  // Closing the tab with unsaved changes asks first.
  useEffect(() => {
    if (!dirty) return;
    const onUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [dirty]);

  useEffect(() => () => window.clearTimeout(savedTimer.current), []);

  return { name, setName, saved: file !== null, dirty, status, notice, save, reload, dismiss, openSaved };
}
