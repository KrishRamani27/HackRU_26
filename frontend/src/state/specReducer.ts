import type { DesignSpec, PartName } from "../../../Builder/types";
import type { CustomElement } from "../../../Builder/buildFlat";
import { COORD_LIMIT, MAX_ELEMENTS, MAX_POINTS, STROKE_COLOR, STROKE_WIDTH, type Point } from "../draw/strokes";
import type { AiMode } from "../types";
import { FOLLOWER_PARTS, PART_NAMES, isValidEdit, normalizeStyles, sameStyle, type EditAction } from "./specSchema";

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

/** What can change on a drawn element. The id, type and points are not editable here; layer order changes only through the reorder action. group_id is how elements are grouped. */
export type ElementPatch = Partial<Pick<CustomElement, "name" | "stroke" | "stroke_width" | "closed" | "fill" | "pattern" | "group_id" | "visible">> & {
  transform?: Partial<CustomElement["transform"]>;
};

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
  /**
   * Changes a drawn element (name, colors, width, closed, fill, pattern, or its move). Checked against
   * the contract; an invalid change is ignored. `coalesce` merges a stream of changes (a slider or a
   * drag) into one undo step until `commit`.
   */
  | { type: "update"; id: string; patch: ElementPatch; coalesce?: string }
  /** Removes a drawn element. One undo step. */
  | { type: "delete"; id: string }
  /**
   * Changes several drawn elements at once (a multi selection: color, width, moving, grouping). All or
   * nothing: if any change would break the contract, none is applied. One undo step.
   */
  | { type: "updateMany"; changes: { id: string; patch: ElementPatch }[]; coalesce?: string }
  /** Removes several drawn elements. One undo step. */
  | { type: "deleteMany"; ids: string[] }
  /**
   * Moves a drawn element, or a whole group (pass all its ids), one step up or down in the stacking order
   * by rewriting layer_order. Groups stay together. A no-op at the top or bottom. One undo step.
   */
  | { type: "reorder"; ids: string[]; direction: "up" | "down" }
  /** Adds ready made elements (a copy from the library). All or nothing, one undo step. */
  | { type: "insert"; elements: CustomElement[] }
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
    group_id: null,
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

const EDITABLE = ["name", "stroke", "stroke_width", "closed", "fill", "pattern", "group_id", "visible"] as const;
const ELEMENT_ID = /^[a-zA-Z0-9_-]{1,64}$/;
const HEX = /^#[0-9a-fA-F]{6}$/;
const FABRICS = ["solid", "denim", "plaid", "floral"];
const within = (n: unknown, lo: number, hi: number) => typeof n === "number" && Number.isFinite(n) && n >= lo && n <= hi;

/** The contract's rules for one element (backend/app/custom_schemas.py). */
export function validElement(el: CustomElement): boolean {
  const t = el?.transform;
  if (!el || !t || typeof el.id !== "string" || !ELEMENT_ID.test(el.id) || el.type !== "stroke") return false;
  const pointsOk =
    Array.isArray(el.points) && el.points.length >= 2 && el.points.length <= MAX_POINTS &&
    el.points.every((p) => Array.isArray(p) && p.length === 2 && within(p[0], -COORD_LIMIT, COORD_LIMIT) && within(p[1], -COORD_LIMIT, COORD_LIMIT));
  return (
    pointsOk &&
    (el.group_id === null || el.group_id === undefined || (typeof el.group_id === "string" && ELEMENT_ID.test(el.group_id))) &&
    (el.parent_part === null || (PART_NAMES as readonly string[]).includes(el.parent_part)) &&
    typeof el.visible === "boolean" && typeof el.closed === "boolean" &&
    Number.isInteger(el.layer_order) && el.layer_order >= 0 && el.layer_order <= 10000 &&
    typeof el.name === "string" && el.name.trim().length >= 1 && el.name.length <= 120 &&
    HEX.test(el.stroke) &&
    within(el.stroke_width, 0, 100) && el.stroke_width > 0 &&
    (!el.closed || el.points.length >= 3) && // a closed shape needs at least three points
    (el.fill === null || (el.closed && HEX.test(el.fill))) && // only closed shapes can be filled
    FABRICS.includes(el.pattern) && (el.pattern === "solid" || el.fill !== null) && // a pattern needs a fill
    within(t.x, -COORD_LIMIT, COORD_LIMIT) && within(t.y, -COORD_LIMIT, COORD_LIMIT) &&
    within(t.scale_x, 0, 100) && t.scale_x > 0 && within(t.scale_y, 0, 100) && t.scale_y > 0 &&
    within(t.rotation, -360, 360)
  );
}

/** Puts new elements in the list as one history step (or, mid drag, into the step already started). */
function commitElements(state: SpecState, customElements: CustomElement[], key: string | null): SpecState {
  if (JSON.stringify(customElements) === JSON.stringify(state.customElements)) return state; // nothing changed
  if (key !== null && key === state.openKey) return { ...state, customElements };
  return {
    ...state,
    customElements,
    past: [...state.past, snapshotOf(state)].slice(-MAX_HISTORY),
    future: [], // a new edit ends the redo trail
    openKey: key,
  };
}

/** Applies a patch, or returns null if the result would break the contract. */
function patchElement(el: CustomElement, patch: ElementPatch): CustomElement | null {
  // Only these fields can change. The id, type, points and layer order stay as they are, even if a
  // caller passes them, so an element's identity can never be rewritten by an edit.
  const next: CustomElement = { ...el, transform: { ...el.transform, ...patch.transform } };
  for (const field of EDITABLE) if (patch[field] !== undefined) (next as unknown as Record<string, unknown>)[field] = patch[field];
  // An open line can't hold a fill; removing a fill leaves nothing for a pattern to sit on.
  if (patch.closed === false) { next.fill = null; next.pattern = "solid"; }
  if (patch.fill === null) next.pattern = "solid";
  return validElement(next) ? next : null;
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

    case "update": {
      if (!state.spec) return state;
      const index = state.customElements.findIndex((e) => e.id === action.id);
      if (index < 0) return state;
      const before = state.customElements[index];
      const after = patchElement(before, action.patch);
      if (!after) {
        console.warn("Ignored invalid change to a drawn element", action.patch);
        return state;
      }
      // Same drag or typing still going: commitElements keeps the undo step that was already started.
      return commitElements(state, state.customElements.map((e, i) => (i === index ? after : e)), action.coalesce ?? null);
    }

    case "delete": {
      if (!state.spec || !state.customElements.some((e) => e.id === action.id)) return state;
      return commitElements(state, state.customElements.filter((e) => e.id !== action.id), null);
    }

    case "updateMany": {
      if (!state.spec || action.changes.length === 0) return state;
      const patches = new Map<string, ElementPatch>();
      for (const c of action.changes) patches.set(c.id, c.patch);
      if ([...patches.keys()].some((id) => !state.customElements.some((e) => e.id === id))) return state; // unknown id: all or nothing
      const next: CustomElement[] = [];
      for (const e of state.customElements) {
        const patch = patches.get(e.id);
        const after = patch ? patchElement(e, patch) : e;
        if (!after) {
          console.warn("Ignored an invalid change to a group of drawn elements", patch);
          return state;
        }
        next.push(after);
      }
      return commitElements(state, next, action.coalesce ?? null);
    }

    case "deleteMany": {
      const gone = new Set(action.ids);
      if (!state.spec || !state.customElements.some((e) => gone.has(e.id))) return state;
      return commitElements(state, state.customElements.filter((e) => !gone.has(e.id)), null);
    }

    case "reorder": {
      if (!state.spec || action.ids.length === 0) return state;
      const first = state.customElements.find((e) => e.id === action.ids[0]);
      if (!first) return state;
      // Stack from bottom to top; a group counts as one unit, placed where its lowest member is.
      const sorted = state.customElements
        .map((e, i) => ({ e, i }))
        .sort((a, b) => a.e.layer_order - b.e.layer_order || a.i - b.i)
        .map(({ e }) => e);
      const units: string[][] = [];
      const byGroup = new Map<string, string[]>();
      for (const e of sorted) {
        if (!e.group_id) { units.push([e.id]); continue; }
        let unit = byGroup.get(e.group_id);
        if (!unit) { unit = []; byGroup.set(e.group_id, unit); units.push(unit); }
        unit.push(e.id);
      }
      const at = units.findIndex((u) => u.includes(first.id));
      const to = action.direction === "up" ? at + 1 : at - 1;
      if (at < 0 || to < 0 || to >= units.length) return state;
      [units[at], units[to]] = [units[to], units[at]];
      const layer = new Map(units.flat().map((id, i): [string, number] => [id, i]));
      return commitElements(state, state.customElements.map((e) => ({ ...e, layer_order: layer.get(e.id) ?? e.layer_order })), null);
    }

    case "insert": {
      if (!state.spec || action.elements.length === 0) return state;
      const ids = new Set(state.customElements.map((e) => e.id));
      for (const e of action.elements) {
        if (!validElement(e) || ids.has(e.id)) return state; // invalid or a duplicate id: nothing is added
        ids.add(e.id);
      }
      if (state.customElements.length + action.elements.length > MAX_ELEMENTS) return state;
      return commitElements(state, [...state.customElements, ...action.elements], null);
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
