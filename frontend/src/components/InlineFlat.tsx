import { useLayoutEffect, useRef, type KeyboardEvent, type MouseEvent } from "react";
import type { PartName } from "../../../Builder/types";
import { sanitizeSvg } from "../flat/sanitizeSvg";
import { PART_LABELS, PART_NAMES } from "../state/specSchema";

/*
 * Inline, clickable view of the builder's SVG.
 *
 * Everything added here (data-part, tabindex, aria-*, selection flags, hit
 * areas) exists only on this live DOM copy. The markup string in app state,
 * the one an exporter must serialize, is never modified, so selection and
 * hover styling can never leak into an exported file.
 */

// Parts drawn only with thin unfilled strokes get an invisible wider copy to click.
const HIT_STROKE = 10;
const HIT_RADIUS_PAD = 5;

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

function makeInteractive(svg: SVGSVGElement, label: string) {
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
}

function applySelection(svg: SVGSVGElement, selected: PartName | null) {
  for (const group of svg.querySelectorAll("[data-part]")) {
    const on = group.getAttribute("data-part") === selected;
    group.toggleAttribute("data-selected", on);
    group.setAttribute("aria-pressed", String(on));
  }
}

function partFrom(target: EventTarget | null): PartName | null {
  const id = (target as Element | null)?.closest?.("[data-part]")?.getAttribute("data-part");
  return id && isPart(id) ? id : null;
}

interface Props {
  /** The builder's SVG text. Never mutated. */
  markup: string;
  label: string;
  selected: PartName | null;
  onSelect: (part: PartName | null) => void;
}

export function InlineFlat({ markup, label, selected, onSelect }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const latest = useRef({ selected, onSelect });
  latest.current = { selected, onSelect };

  // Rebuild the live copy whenever the builder output changes.
  useLayoutEffect(() => {
    const host = hostRef.current!;
    const svg = sanitizeSvg(markup);
    if (!svg) {
      host.replaceChildren();
      throw new Error("The drawing couldn’t be displayed because the builder’s SVG wasn’t usable.");
    }
    makeInteractive(svg, label);
    const { selected: current, onSelect: select } = latest.current;
    // An edit can remove the selected part (e.g. pockets → none); then drop the selection.
    if (current && !topLevelParts(svg).some((g) => g.id === current)) select(null);
    else applySelection(svg, current);
    host.replaceChildren(svg);
  }, [markup, label]);

  useLayoutEffect(() => {
    const svg = hostRef.current?.firstElementChild;
    if (svg) applySelection(svg as SVGSVGElement, selected);
  }, [selected]);

  const onClick = (e: MouseEvent) => {
    const part = partFrom(e.target);
    if (!part) return; // empty canvas: let the stage deselect
    e.stopPropagation();
    onSelect(part);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const part = partFrom(e.target);
    if (!part) return;
    e.preventDefault();
    onSelect(part);
  };

  return <div ref={hostRef} className="flat-inline" onClick={onClick} onKeyDown={onKeyDown} />;
}
