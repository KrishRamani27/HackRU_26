import type { DesignSpec, PartName } from "../../../Builder/types";
import type { AiMode } from "../types";
import { FOLLOWER_PARTS, isValidEdit, normalizeStyles, sameStyle, type EditAction } from "./specSchema";

/** Where the current spec came from. Drives the labels on the canvas. */
export type SpecSource = { source: "analysis"; aiMode: AiMode } | { source: "sample" };

/** How many undo steps are kept. Older ones are dropped. */
export const MAX_HISTORY = 50;

/**
 * Everything undo has to bring back together: the spec, and which follower parts
 * (collar, waistband) currently have a style of their own.
 */
interface Snapshot {
  spec: DesignSpec;
  detached: PartName[];
}

export interface SpecState {
  /** The one current design spec. null until a sketch is analyzed or the sample is opened. */
  spec: DesignSpec | null;
  /**
   * Follower parts the user has given their own color or pattern. Every other follower
   * copies the bodice's style, and keeps copying it when the bodice changes.
   */
  detached: PartName[];
  meta: SpecSource | null;
  /** Earlier states, oldest first. Undo steps back through these. */
  past: Snapshot[];
  /** States that were undone, nearest first. Redo steps forward through these. */
  future: Snapshot[];
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
  /** Makes a collar or waistband that has its own style follow the bodice again. One undo step. */
  | { type: "follow"; part: PartName }
  /** Drop the spec and its history. With `source`, only if it came from that source. */
  | { type: "clear"; source?: SpecSource["source"] };

export const initialSpecState: SpecState = { spec: null, detached: [], meta: null, past: [], future: [], openKey: null };

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

/** Followers that already differ from the bodice when a design is loaded keep their own style. */
function detachedAtLoad(spec: DesignSpec): PartName[] {
  return FOLLOWER_PARTS.filter((part) => !sameStyle(spec.style[part], spec.style.bodice));
}

/** Follower parts the user explicitly gave a color or pattern in these edits. */
function styledFollowers(actions: EditAction[]): PartName[] {
  return FOLLOWER_PARTS.filter((part) =>
    actions.some((a) => isValidEdit(a) && (a.path === `style.${part}.fill` || a.path === `style.${part}.pattern`)),
  );
}

/** Copies the bodice's style onto every follower that doesn't have its own. */
function followBodice(spec: DesignSpec, detached: PartName[]): DesignSpec {
  const bodice = spec.style.bodice;
  if (!bodice) return spec;
  const style = { ...spec.style };
  let changed = false;
  for (const part of FOLLOWER_PARTS) {
    if (detached.includes(part) || sameStyle(style[part], bodice)) continue;
    style[part] = { fill: bodice.fill, pattern: bodice.pattern };
    changed = true;
  }
  return changed ? { ...spec, style } : spec;
}

export function specReducer(state: SpecState, action: SpecAction): SpecState {
  switch (action.type) {
    case "load": {
      const spec = normalizeStyles(action.spec);
      return { ...initialSpecState, spec, detached: detachedAtLoad(spec), meta: action.meta };
    }

    case "apply": {
      if (!state.spec) return state;
      // An edit like style.bodice.pattern must not leave that part without a fill (or vice versa).
      const edited = normalizeStyles(action.actions.reduce(applyOne, state.spec));
      // A color or pattern set on the collar or waistband gives it a style of its own from now on;
      // the followers that are left copy the bodice, including any bodice change in this same edit.
      const detached = FOLLOWER_PARTS.filter((p) => state.detached.includes(p) || styledFollowers(action.actions).includes(p));
      const next = followBodice(edited, detached);
      if (sameSpec(next, state.spec)) return state; // e.g. clicking the option that is already chosen

      const key = action.coalesce ?? null;
      if (key !== null && key === state.openKey) {
        // Same drag still going: update the spec, keep the history step that was already started.
        return { ...state, spec: next, detached };
      }
      return {
        ...state,
        spec: next,
        detached,
        past: [...state.past, { spec: state.spec, detached: state.detached }].slice(-MAX_HISTORY),
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
        spec: previous.spec,
        detached: previous.detached,
        past: state.past.slice(0, -1),
        future: [{ spec: state.spec, detached: state.detached }, ...state.future],
        openKey: null,
      };
    }

    case "redo": {
      if (!state.spec || state.future.length === 0) return state;
      const [following, ...rest] = state.future;
      return {
        ...state,
        spec: following.spec,
        detached: following.detached,
        past: [...state.past, { spec: state.spec, detached: state.detached }].slice(-MAX_HISTORY),
        future: rest,
        openKey: null,
      };
    }

    case "follow": {
      // Only a follower that currently has its own style can be handed back to the bodice.
      if (!state.spec || !state.detached.includes(action.part)) return state;
      const detached = state.detached.filter((p) => p !== action.part);
      return {
        ...state,
        spec: followBodice(state.spec, detached), // copies the bodice's color and pattern onto it
        detached,
        // Counts as a step even if the look doesn't change, because what happens on the next bodice edit does.
        past: [...state.past, { spec: state.spec, detached: state.detached }].slice(-MAX_HISTORY),
        future: [],
        openKey: null,
      };
    }

    case "clear":
      if (action.source && state.meta?.source !== action.source) return state;
      return initialSpecState;
  }
}
