import type { DesignSpec } from "../../../Builder/types";
import type { AiMode } from "../types";
import { isValidEdit, normalizeStyles, type EditAction } from "./specSchema";

/** Where the current spec came from. Drives the labels on the canvas. */
export type SpecSource = { source: "analysis"; aiMode: AiMode } | { source: "sample" };

/** How many undo steps are kept. Older ones are dropped. */
export const MAX_HISTORY = 50;

export interface SpecState {
  /** The one current design spec. null until a sketch is analyzed or the sample is opened. */
  spec: DesignSpec | null;
  meta: SpecSource | null;
  /** Earlier specs, oldest first. Undo steps back through these. */
  past: DesignSpec[];
  /** Specs that were undone, nearest first. Redo steps forward through these. */
  future: DesignSpec[];
  /**
   * The control currently being dragged or typed into. While it stays the same, new
   * edits merge into the history step already started, so one slider drag is one step.
   */
  openKey: string | null;
}

export type SpecAction =
  /** Replace the whole spec (new /analyze result, or the sample). Starts a fresh history. */
  | { type: "load"; spec: DesignSpec; meta: SpecSource }
  /**
   * Apply edit actions, in order. Invalid ones are ignored, as the backend would reject them.
   * Pass `coalesce` (a control's name) for edits that arrive in a stream, like a slider drag:
   * back to back edits with the same key become one undo step until `commit`.
   */
  | { type: "apply"; actions: EditAction[]; coalesce?: string }
  /** The drag or typing ended (pointer released, focus left). The next edit starts a new step. */
  | { type: "commit" }
  | { type: "undo" }
  | { type: "redo" }
  /** Drop the spec and its history. With `source`, only if it came from that source. */
  | { type: "clear"; source?: SpecSource["source"] };

export const initialSpecState: SpecState = { spec: null, meta: null, past: [], future: [], openKey: null };

function setPath(node: unknown, keys: string[], value: unknown): unknown {
  const [key, ...rest] = keys;
  const base = (node ?? {}) as Record<string, unknown>;
  return { ...base, [key]: rest.length ? setPath(base[key], rest, value) : value };
}

function applyOne(spec: DesignSpec, action: EditAction): DesignSpec {
  if (!isValidEdit(action)) {
    console.warn("Ignored invalid edit action", action);
    return spec;
  }
  return setPath(spec, action.path.split("."), action.value) as DesignSpec;
}

// Specs are small plain data, so comparing their JSON is cheap and exact.
const sameSpec = (a: DesignSpec, b: DesignSpec) => JSON.stringify(a) === JSON.stringify(b);

export function specReducer(state: SpecState, action: SpecAction): SpecState {
  switch (action.type) {
    case "load":
      return { ...initialSpecState, spec: normalizeStyles(action.spec), meta: action.meta };

    case "apply": {
      if (!state.spec) return state;
      // An edit like style.bodice.pattern must not leave that part without a fill (or vice versa).
      const next = normalizeStyles(action.actions.reduce(applyOne, state.spec));
      if (sameSpec(next, state.spec)) return state; // e.g. clicking the option that is already chosen

      const key = action.coalesce ?? null;
      if (key !== null && key === state.openKey) {
        // Same drag still going: update the spec, keep the history step that was already started.
        return { ...state, spec: next };
      }
      return {
        ...state,
        spec: next,
        past: [...state.past, state.spec].slice(-MAX_HISTORY),
        future: [], // a new edit ends the redo trail
        openKey: key,
      };
    }

    case "commit":
      return state.openKey === null ? state : { ...state, openKey: null };

    case "undo": {
      if (!state.spec || state.past.length === 0) return state;
      const previous = state.past[state.past.length - 1];
      return {
        ...state,
        spec: previous,
        past: state.past.slice(0, -1),
        future: [state.spec, ...state.future],
        openKey: null,
      };
    }

    case "redo": {
      if (!state.spec || state.future.length === 0) return state;
      const [following, ...rest] = state.future;
      return {
        ...state,
        spec: following,
        past: [...state.past, state.spec].slice(-MAX_HISTORY),
        future: rest,
        openKey: null,
      };
    }

    case "clear":
      if (action.source && state.meta?.source !== action.source) return state;
      return initialSpecState;
  }
}
