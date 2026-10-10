import type { DesignSpec } from "../../../Builder/types";
import type { AiMode } from "../types";
import { isValidEdit, normalizeStyles, type EditAction } from "./specSchema";

/** Where the current spec came from. Drives the labels on the canvas. */
export type SpecSource = { source: "analysis"; aiMode: AiMode } | { source: "sample" };

export interface SpecState {
  /** The one current design spec. null until a sketch is analyzed or the sample is opened. */
  spec: DesignSpec | null;
  meta: SpecSource | null;
}

export type SpecAction =
  /** Replace the whole spec (new /analyze result, or the sample). Discards earlier edits. */
  | { type: "load"; spec: DesignSpec; meta: SpecSource }
  /** Apply edit actions, in order. Invalid ones are ignored, as the backend would reject them. */
  | { type: "apply"; actions: EditAction[] }
  /** Drop the spec. With `source`, only if it came from that source. */
  | { type: "clear"; source?: SpecSource["source"] };

export const initialSpecState: SpecState = { spec: null, meta: null };

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

export function specReducer(state: SpecState, action: SpecAction): SpecState {
  switch (action.type) {
    case "load":
      return { spec: normalizeStyles(action.spec), meta: action.meta };
    case "apply": {
      if (!state.spec) return state;
      const edited = action.actions.reduce(applyOne, state.spec);
      // An edit like style.bodice.pattern must not leave that part without a fill (or vice versa).
      return edited === state.spec ? state : { ...state, spec: normalizeStyles(edited) };
    }
    case "clear":
      if (action.source && state.meta?.source !== action.source) return state;
      return initialSpecState;
  }
}
