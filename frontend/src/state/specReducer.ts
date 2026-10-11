import type { DesignSpec, PartName } from "../../../Builder/types";
import type { CustomElement } from "../../../Builder/buildFlat";
import { COORD_LIMIT, MAX_ELEMENTS, MAX_POINTS, STROKE_COLOR, STROKE_WIDTH, type Point } from "../draw/strokes";
import type { AiMode } from "../types";
import { FOLLOWER_PARTS, isValidEdit, normalizeStyles, sameStyle, type EditAction } from "./specSchema";

/** Where the current spec came from. Drives the labels on the canvas. */
export type SpecSource = { source: "analysis"; aiMode: AiMode } | { source: "sample" };

/** How many undo steps are kept. Older ones are dropped. */
export const MAX_HISTORY = 50;

/**
 * Everything undo has to bring back together: the spec, which follower parts (collar,
 * waistband) have a style of their own, and the hand drawn elements.
 */
interface Snapshot {
  spec: DesignSpec;
  detached: PartName[];
  customElements: CustomElement[];
}

export interface SpecState {
  /** The one current design spec. null until a sketch is analyzed or the sample is opened. */
  spec: DesignSpec | null;
  /**
   * Hand drawn elements (manual drawing). Kept beside the spec, never inside it, so the spec
   * stays exactly the dress contract that goes to /analyze. Undo and redo cover them too.
   */
  customElements: CustomElement[];
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
  /** Adds a freehand stroke (already simplified points in 400 by 600 canvas units). One undo step. */
  | { type: "draw"; id: string; points: Point[] }
  /** Makes a collar or waistband that has its own style follow the bodice again. One undo step. */
  | { type: "follow"; part: PartName }
  /** Drop the spec and its history. With `source`, only if it came from that source. */
  | { type: "clear"; source?: SpecSource["source"] };

export const initialSpecState: SpecState = {
  spec: null,
  customElements: [],
  detached: [],
  meta: null,
  past: [],
  future: [],
  openKey: null,
};

/** The state undo can return to: the spec, trim follow state, and the drawing. */
function snapshotOf(state: SpecState): Snapshot {
  return { spec: state.spec as DesignSpec, detached: state.detached, customElements: state.customElements };
}

/** Points that satisfy the contract, or null: at least 2, finite, within limits. */
function validPoints(points: Point[]): Point[] | null {
  if (!Array.isArray(points) || points.length < 2 || points.length > MAX_POINTS) return null;
  const ok = points.every(
    (p) => Array.isArray(p) && p.length === 2 && p.every((n) => Number.isFinite(n) && Math.abs(n) <= COORD_LIMIT),
  );
  return ok ? points.map((p): Point => [p[0], p[1]]) : null;
}

/** A new stroke with the contract's defaults: named "Stroke N", on top of the others. */
function newStroke(existing: CustomElement[], id: string, points: Point[]): CustomElement {
  const numbers = existing.map((e) => /^Stroke (\d+)$/.exec(e.name)).map((m) => (m ? Number(m[1]) : 0));
  const topLayer = existing.reduce((max, e) => Math.max(max, e.layer_order), 0);
  return {
    id,
    name: `Stroke ${Math.max(0, ...numbers) + 1}`,
    type: "stroke",
    parent_part: null,
    points,
    closed: false,
    stroke: STROKE_COLOR,
    stroke_width: STROKE_WIDTH,
    fill: null,
    pattern: "solid",
    transform: { x: 0, y: 0, scale_x: 1, scale_y: 1, rotation: 0 },
    visible: true,
    layer_order: topLayer + 1,
  };
}

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
        past: [...state.past, snapshotOf(state)].slice(-MAX_HISTORY),
        future: [], // a new edit ends the redo trail
        openKey: key,
      };
    }

    case "draw": {
      if (!state.spec || state.customElements.length >= MAX_ELEMENTS) return state;
      const points = validPoints(action.points);
      if (!points || state.customElements.some((e) => e.id === action.id)) return state;
      return {
        ...state,
        customElements: [...state.customElements, newStroke(state.customElements, action.id, points)],
        past: [...state.past, snapshotOf(state)].slice(-MAX_HISTORY),
        future: [],
        openKey: null,
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
        customElements: previous.customElements,
        past: state.past.slice(0, -1),
        future: [snapshotOf(state), ...state.future],
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
        customElements: following.customElements,
        past: [...state.past, snapshotOf(state)].slice(-MAX_HISTORY),
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
        past: [...state.past, snapshotOf(state)].slice(-MAX_HISTORY),
        future: [],
        openKey: null,
      };
    }

    case "clear":
      if (action.source && state.meta?.source !== action.source) return state;
      return initialSpecState;
  }
}
