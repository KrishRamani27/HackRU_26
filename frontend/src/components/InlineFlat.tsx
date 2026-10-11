import { useLayoutEffect, useRef, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";
import type { PartName } from "../../../Builder/types";
import type { CustomElement } from "../../../Builder/buildFlat";
import { sanitizeSvg } from "../flat/sanitizeSvg";
import { clientToCanvas, COORD_LIMIT } from "../draw/strokes";
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

function applySelection(svg: SVGSVGElement, selected: PartName | null, selectedElement: string | null) {
  for (const group of svg.querySelectorAll("[data-part]")) {
    const on = group.getAttribute("data-part") === selected;
    group.toggleAttribute("data-selected", on);
    group.setAttribute("aria-pressed", String(on));
  }
  for (const group of svg.querySelectorAll("[data-element]")) {
    const on = group.getAttribute("data-element") === selectedElement;
    group.toggleAttribute("data-selected", on);
    group.setAttribute("aria-pressed", String(on));
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
  id: string;
  pointerId: number;
  /** Where the press began, in canvas units. */
  start: [number, number];
  /** The element's x and y when the press began. */
  origin: [number, number];
  from: [number, number];
  moved: boolean;
}

interface Props {
  /** The builder's SVG text. Never mutated. */
  markup: string;
  label: string;
  selected: PartName | null;
  onSelect: (part: PartName | null) => void;
  /** The hand drawn elements, so their groups in the SVG can be made clickable. */
  elements: readonly CustomElement[];
  selectedElement: string | null;
  onSelectElement: (id: string | null) => void;
  /** Moves an element to this translation. Called repeatedly during one drag. */
  onMoveElement: (id: string, x: number, y: number) => void;
  /** The drag ended, so the next change starts a new undo step. */
  onMoveEnd: () => void;
}

export function InlineFlat({
  markup, label, selected, onSelect, elements, selectedElement, onSelectElement, onMoveElement, onMoveEnd,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const latest = useRef({ selected, onSelect, elements, selectedElement, onSelectElement, onMoveElement, onMoveEnd });
  latest.current = { selected, onSelect, elements, selectedElement, onSelectElement, onMoveElement, onMoveEnd };
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
    else applySelection(svg, current.selected, current.selectedElement);
    host.replaceChildren(svg);
  }, [markup, label]);

  useLayoutEffect(() => {
    const svg = hostRef.current?.firstElementChild;
    if (!svg) return;
    applySelection(svg as SVGSVGElement, selected, selectedElement);
    applyNames(svg as SVGSVGElement, elements);
  }, [selected, selectedElement, elements]);

  const currentSvg = () => hostRef.current?.querySelector("svg") ?? null;

  // A press on a hand drawn line selects it, and dragging moves it. The pointer is captured on the
  // container, not on the line, because the SVG is rebuilt on every move and would drop a capture.
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    swallowClick.current = false;
    if (e.button !== 0) return;
    const id = elementFrom(e.target);
    const element = id ? latest.current.elements.find((x) => x.id === id) : undefined;
    const svg = currentSvg();
    const start = svg ? clientToCanvas(svg, e.clientX, e.clientY) : null;
    if (!id || !element || !start) return;
    swallowClick.current = true; // the click that follows must not also deselect
    latest.current.onSelectElement(id);
    drag.current = { id, pointerId: e.pointerId, start, origin: [element.transform.x, element.transform.y], from: [e.clientX, e.clientY], moved: false };
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
    latest.current.onMoveElement(d.id, round2(clamp(d.origin[0] + p[0] - d.start[0])), round2(clamp(d.origin[1] + p[1] - d.start[1])));
  };

  const endDrag = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    drag.current = null;
    if (d.moved) latest.current.onMoveEnd(); // one drag is one undo step
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
    if (element) onSelectElement(element);
    else onSelect(part);
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
