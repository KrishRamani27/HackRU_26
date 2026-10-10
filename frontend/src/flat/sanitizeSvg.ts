// Turns builder SVG text into a DOM tree that is safe to insert inline.
//
// It does not try to remove bad things from the parsed document. It builds a
// NEW tree and copies over only allowlisted elements, allowlisted attributes,
// and attribute values in an expected format. Scripts, event handlers, styles,
// links, external references and text nodes therefore cannot survive.
//
// The allowlist matches what Builder/buildFlat.ts emits today. If the builder
// starts using another element or attribute, add it here on purpose.

const SVG_NS = "http://www.w3.org/2000/svg";
const MAX_MARKUP_LENGTH = 500_000;
const MAX_DEPTH = 12;

const ELEMENTS = new Set(["svg", "g", "defs", "path", "rect", "circle", "pattern"]);

const NUMBER = /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?%?$/i;
const NUMBER_LIST = /^[\d\s.,eE+-]*$/;
const PAINT = /^(none|#[0-9a-f]{3,8}|url\(#[A-Za-z][\w-]*\))$/i;

const VALUE_RULES: Record<string, RegExp> = {
  id: /^[A-Za-z][\w-]*$/,
  d: /^[MmLlHhVvCcSsQqTtAaZz\d\s.,eE+-]*$/,
  viewBox: NUMBER_LIST,
  transform: /^matrix\([\d\s.,eE+-]+\)$/,
  fill: PAINT,
  stroke: PAINT,
  "stroke-width": NUMBER,
  "stroke-opacity": NUMBER,
  "fill-opacity": NUMBER,
  "stroke-dasharray": NUMBER_LIST,
  "stroke-linejoin": /^(miter|round|bevel)$/,
  "stroke-linecap": /^(butt|round|square)$/,
  patternUnits: /^(userSpaceOnUse|objectBoundingBox)$/,
  x: NUMBER,
  y: NUMBER,
  cx: NUMBER,
  cy: NUMBER,
  r: NUMBER,
  width: NUMBER,
  height: NUMBER,
};

const ATTRIBUTES: Record<string, ReadonlySet<string>> = {
  svg: new Set(["viewBox"]), // width/height dropped: the canvas sizes the SVG
  g: new Set(["id", "transform"]),
  defs: new Set(),
  pattern: new Set(["id", "patternUnits", "width", "height"]),
  path: new Set(["id", "d", "fill", "stroke", "stroke-width", "stroke-opacity", "fill-opacity", "stroke-dasharray", "stroke-linejoin", "stroke-linecap", "transform"]),
  rect: new Set(["x", "y", "width", "height", "fill", "stroke", "stroke-width", "fill-opacity", "stroke-opacity", "transform"]),
  circle: new Set(["cx", "cy", "r", "fill", "stroke", "stroke-width", "fill-opacity", "stroke-opacity", "transform"]),
};

function copySafe(source: Element, depth: number): Element | null {
  if (depth > MAX_DEPTH) return null;
  // Local names only count in the SVG namespace; anything else is dropped.
  if (source.namespaceURI !== SVG_NS || !ELEMENTS.has(source.localName)) return null;

  const target = document.createElementNS(SVG_NS, source.localName);
  const allowed = ATTRIBUTES[source.localName];
  for (const attr of Array.from(source.attributes)) {
    if (attr.namespaceURI || !allowed.has(attr.name)) continue; // drops on*, href, style, xmlns:…
    if (!VALUE_RULES[attr.name]?.test(attr.value)) continue;
    target.setAttribute(attr.name, attr.value);
  }

  // Elements only; text nodes, comments and processing instructions are not copied.
  for (const child of Array.from(source.children)) {
    const safe = copySafe(child, depth + 1);
    if (safe) target.appendChild(safe);
  }
  return target;
}

/** Returns a sanitized <svg> element, or null if the markup isn't usable SVG. */
export function sanitizeSvg(markup: string): SVGSVGElement | null {
  if (markup.length > MAX_MARKUP_LENGTH) return null;
  // image/svg+xml parsing never runs scripts or loads resources.
  const doc = new DOMParser().parseFromString(markup, "image/svg+xml");
  const root = doc.documentElement;
  if (!root || root.localName !== "svg" || doc.getElementsByTagName("parsererror").length > 0) return null;

  const safe = copySafe(root, 0);
  return safe && safe.localName === "svg" ? (safe as SVGSVGElement) : null;
}
