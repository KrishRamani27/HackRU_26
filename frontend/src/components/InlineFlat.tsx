import { useLayoutEffect, useRef, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";
import type { PartName } from "../../../Builder/types";
import type { CustomElement } from "../../../Builder/buildFlat";
import { sanitizeSvg } from "../flat/sanitizeSvg";
import { clientToCanvas, COORD_LIMIT } from "../draw/strokes";
import { toggleUnit, unitOf } from "../draw/groups";
import { PART_LABELS, PART_NAMES } from "../state/specSchema";

/*
 * Inline, clickable view of the builder's SVG.
 *
 * Everything added here (data-part, data-element, tabindex, aria-*, selection flags, hit
 * areas) exists only on this live DOM copy. The markup string in app state,
 * the one an exporter must serialize, is never modified, so selection and
 * hover styling can never leak into an exported file.
 */

// Parts drawn only with thin unfilled strokes get an invisible wider copy to click.
const HIT_STROKE = 10;
const HIT_RADIUS_PAD = 5;
// Hand drawn lines are thin, so each gets an invisible copy that is this many SCREEN pixels wide
// (vector-effect keeps it that wide at any zoom).
const ELEMENT_HIT_PX = 14;
// A press that moves less than this is a click, not a drag.
const DRAG_THRESHOLD_PX = 3;

function isPart(id: string): id is PartName {
  return (PART_NAMES as readonly string[]).includes(id);
}

function topLevelParts(svg: SVGSVGElement): SVGGElement[] {
  return Array.from(svg.children).filter(
    (el): el is SVGGElement => el.localName === "g" && isPart(el.id) && el.childElementCount > 0,
  );
}

function addHitAreas(group: SVGGElement) {
  for (const el of Array.from(group.querySelectorAll("path, circle"))) {
    if (el.localName === "path" && el.getAttribute("fill") !== "none") continue; // filled shapes are already clickable
    const hit = el.cloneNode(false) as SVGElement;
    for (const name of ["id", "stroke-dasharray", "stroke-opacity", "fill-opacity"]) hit.removeAttribute(name);
    hit.setAttribute("data-ui", "hit");
    hit.setAttribute("fill", "none");
    hit.setAttribute("stroke", "#000");
    hit.setAttribute("stroke-opacity", "0");
    if (el.localName === "circle") {
      hit.setAttribute("r", String(Number(el.getAttribute("r") ?? 0) + HIT_RADIUS_PAD));
      hit.setAttribute("pointer-events", "all");
    } else {
      hit.setAttribute("stroke-width", String(HIT_STROKE));
      hit.setAttribute("pointer-events", "stroke");
    }
    el.after(hit);
  }
}

/** The groups the builder drew for hand drawn elements, matched to their data by id. */
function elementGroups(svg: SVGSVGElement, elements: readonly CustomElement[]): [SVGGElement, CustomElement][] {
  const byId = new Map(elements.map((e) => [e.id, e]));
  const found: [SVGGElement, CustomElement][] = [];
  for (const group of svg.querySelectorAll<SVGGElement>("#manual_drawing > g")) {
    const element = byId.get(group.id.replace(/^custom_/, ""));
    if (element) found.push([group, element]);
  }
  return found;
}

/**
 * Hand drawn lines only catch clicks right on them. The line's own paint is clickable, plus a
 * wide invisible copy so a thin stroke is easy to hit. Everywhere else a click passes through
 * to the dress part underneath (the manual_drawing group itself ignores the pointer).
 */
function makeElementInteractive(group: SVGGElement, element: CustomElement) {
  group.setAttribute("data-element", element.id);
  group.setAttribute("tabindex", "0");
  group.setAttribute("role", "button");
  group.setAttribute("aria-label", `Select ${element.name}`);
  const path = group.querySelector("path");
  if (!path) return;
  path.setAttribute("pointer-events", "visiblePainted");
  const hit = path.cloneNode(false) as SVGPathElement;
  for (const name of ["id", "fill-opacity", "stroke-dasharray"]) hit.removeAttribute(name);
  hit.setAttribute("data-ui", "hit");
  hit.setAttribute("fill", "none");
  hit.setAttribute("stroke", "#000");
  hit.setAttribute("stroke-opacity", "0");
  hit.setAttribute("stroke-width", String(ELEMENT_HIT_PX));
  hit.setAttribute("vector-effect", "non-scaling-stroke");
  hit.setAttribute("pointer-events", "stroke");
  path.after(hit);
}

function makeInteractive(svg: SVGSVGElement, label: string, elements: readonly CustomElement[]) {
  svg.setAttribute("role", "group");
  svg.setAttribute("aria-label", label);
  for (const group of topLevelParts(svg)) {
    const part = group.id as PartName;
    group.setAttribute("data-part", part);
    group.setAttribute("tabindex", "0");
    group.setAttribute("role", "button");
    group.setAttribute("aria-label", `Select ${PART_LABELS[part]}`);
    addHitAreas(group);
  }
  for (const [group, element] of elementGroups(svg, elements)) makeElementInteractive(group, element);
}

function applySelection(svg: SVGSVGElement, selected: PartName | null, selectedElements: readonly string[]) {
  for (const group of svg.querySelectorAll("[data-part]")) {
    const on = group.getAttribute("data-part") === selected;
    group.toggleAttribute("data-selected", on);
    group.setAttribute("aria-pressed", String(on));
  }
  for (const group of svg.querySelectorAll("[data-element]")) {
    const on = selectedElements.includes(group.getAttribute("data-element") ?? "");
    group.toggleAttribute("data-selected", on);
    group.setAttribute("aria-pressed", String(on));
  }
}

/** Hides dress parts on the live canvas only. The markup string (and so the export) is never touched. */
function applyHidden(svg: SVGSVGElement, hidden: readonly PartName[]) {
  for (const group of svg.querySelectorAll("[data-part]")) {
    group.toggleAttribute("data-hidden", hidden.includes(group.getAttribute("data-part") as PartName));
  }
}

/** Keeps each drawn line's accessible name in step with its name, which is not part of the builder's markup. */
function applyNames(svg: SVGSVGElement, elements: readonly CustomElement[]) {
  const byId = new Map(elements.map((e) => [e.id, e.name]));
  for (const group of svg.querySelectorAll("[data-element]")) {
    const name = byId.get(group.getAttribute("data-element") ?? "");
    if (name !== undefined) group.setAttribute("aria-label", `Select ${name}`);
  }
}

function partFrom(target: EventTarget | null): PartName | null {
  const id = (target as Element | null)?.closest?.("[data-part]")?.getAttribute("data-part");
  return id && isPart(id) ? id : null;
}

function elementFrom(target: EventTarget | null): string | null {
  return (target as Element | null)?.closest?.("[data-element]")?.getAttribute("data-element") ?? null;
}

const clamp = (n: number) => Math.max(-COORD_LIMIT, Math.min(COORD_LIMIT, n));
const round2 = (n: number) => Math.round(n * 100) / 100;

interface Drag {
  /** Everything that moves together: the whole selection, or the pressed element's group. */
  ids: string[];
  pointerId: number;
  /** Where the press began, in canvas units. */
  start: [number, number];
  /** Each moving element's x and y when the press began. */
  origins: Map<string, [number, number]>;
  from: [number, number];
  moved: boolean;
  /** Pressed on one of several selected elements without Shift: a click (no drag) then picks just that one. */
  collapseTo: string[] | null;
}

interface Props {
  /** The builder's SVG text. Never mutated. */
  markup: string;
  label: string;
  selected: PartName | null;
  onSelect: (part: PartName | null) => void;
  /** The hand drawn elements, so their groups in the SVG can be made clickable. */
  elements: readonly CustomElement[];
  /** The selected hand drawn elements (a group is always selected whole). */
  selectedElements: readonly string[];
  onSelectElements: (ids: string[]) => void;
  /** Moves elements to these translations. Called repeatedly during one drag. */
  onMoveElements: (moves: { id: string; x: number; y: number }[]) => void;
  /** The drag ended, so the next change starts a new undo step. */
  onMoveEnd: () => void;
  /** Dress parts hidden on the canvas (still in the export). */
  hiddenParts: readonly PartName[];
}

export function InlineFlat({
  markup, label, selected, onSelect, elements, selectedElements, onSelectElements, onMoveElements, onMoveEnd, hiddenParts,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const latest = useRef({ selected, onSelect, elements, selectedElements, onSelectElements, onMoveElements, onMoveEnd, hiddenParts });
  latest.current = { selected, onSelect, elements, selectedElements, onSelectElements, onMoveElements, onMoveEnd, hiddenParts };
  const drag = useRef<Drag | null>(null);
  const swallowClick = useRef(false);

  // Rebuild the live copy whenever the builder output changes.
  useLayoutEffect(() => {
    const host = hostRef.current!;
    const svg = sanitizeSvg(markup);
    if (!svg) {
      host.replaceChildren();
      throw new Error("The drawing couldn’t be displayed because the builder’s SVG wasn’t usable.");
    }
    const current = latest.current;
    makeInteractive(svg, label, current.elements);
    // An edit can remove the selected part (e.g. pockets → none); then drop the selection.
    if (current.selected && !topLevelParts(svg).some((g) => g.id === current.selected)) current.onSelect(null);
    else applySelection(svg, current.selected, current.selectedElements);
    applyHidden(svg, current.hiddenParts);
    host.replaceChildren(svg);
  }, [markup, label]);

  useLayoutEffect(() => {
    const svg = hostRef.current?.firstElementChild;
    if (!svg) return;
    applySelection(svg as SVGSVGElement, selected, selectedElements);
    applyNames(svg as SVGSVGElement, elements);
    applyHidden(svg as SVGSVGElement, hiddenParts);
  }, [selected, selectedElements, elements, hiddenParts]);

  const currentSvg = () => hostRef.current?.querySelector("svg") ?? null;

  // A press on a hand drawn line selects it (and its whole group), Shift adds or removes it, and
  // dragging moves everything selected together. The pointer is captured on the container, not on the
  // line, because the SVG is rebuilt on every move and would drop a capture.
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    swallowClick.current = false;
    if (e.button !== 0) return;
    const id = elementFrom(e.target);
    const { elements: all, selectedElements: current, onSelectElements: select } = latest.current;
    const svg = currentSvg();
    const start = svg ? clientToCanvas(svg, e.clientX, e.clientY) : null;
    if (!id || !all.some((x) => x.id === id) || !start) return; // not on a drawn line: the canvas may start a box
    e.stopPropagation(); // so the canvas doesn't also start a box selection
    swallowClick.current = true; // the click that follows must not also deselect
    if (e.shiftKey) {
      select(toggleUnit(current, id, all));
      return;
    }
    const alreadySelected = current.includes(id);
    const unit = unitOf(id, all);
    const ids = alreadySelected ? [...current] : unit;
    if (!alreadySelected) select(unit);
    const origins = new Map(ids.map((i): [string, [number, number]] => {
      const t = all.find((x) => x.id === i)!.transform;
      return [i, [t.x, t.y]];
    }));
    drag.current = {
      ids, pointerId: e.pointerId, start, origins, from: [e.clientX, e.clientY], moved: false,
      collapseTo: alreadySelected && current.length > unit.length ? unit : null,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    if (!d.moved && Math.hypot(e.clientX - d.from[0], e.clientY - d.from[1]) < DRAG_THRESHOLD_PX) return;
    d.moved = true;
    const svg = currentSvg();
    const p = svg ? clientToCanvas(svg, e.clientX, e.clientY) : null;
    if (!p) return;
    const dx = p[0] - d.start[0];
    const dy = p[1] - d.start[1];
    latest.current.onMoveElements(d.ids.map((id) => {
      const [ox, oy] = d.origins.get(id)!;
      return { id, x: round2(clamp(ox + dx)), y: round2(clamp(oy + dy)) };
    }));
  };

  const endDrag = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    drag.current = null;
    if (d.moved) latest.current.onMoveEnd(); // one drag is one undo step
    else if (d.collapseTo) latest.current.onSelectElements(d.collapseTo); // a plain click on one of several: pick just that one
  };

  const onClick = (e: MouseEvent) => {
    if (swallowClick.current) {
      swallowClick.current = false;
      e.stopPropagation();
      return;
    }
    const part = partFrom(e.target);
    if (!part) return; // empty canvas: let the stage deselect
    e.stopPropagation();
    onSelect(part);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const element = elementFrom(e.target);
    const part = element ? null : partFrom(e.target);
    if (!element && !part) return;
    e.preventDefault();
    if (element) {
      const { elements: all, selectedElements: current, onSelectElements: select } = latest.current;
      select(e.shiftKey ? toggleUnit(current, element, all) : unitOf(element, all));
    } else onSelect(part);
  };

  return (
    <div
      ref={hostRef}
      className="flat-inline"
      onClick={onClick}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    />
  );
}
