import type { DesignSpec, PartName, PartStyle } from "./types";

/*
 * FLAT BUILDER: spec in, SVG string out. Pure function, no React, no state.
 *
 * COORDINATE SYSTEM
 *   Canvas is 400 x 600 (viewBox "0 0 400 600"). x grows right, y grows DOWN.
 *   CX = 200 is the center line of the dress. Everything is symmetric around it.
 *   NECK_Y = 70 is the shoulder/neck line. The hem y depends on skirt length.
 *
 * HOW SYMMETRY WORKS
 *   - Body outlines (bodice, skirt) are built from RIGHT-side points; the left
 *     side is the same point mirrored: mx(x) = 2*CX - x.
 *   - Sleeves and pockets are drawn ONCE for the right side. The left copy is
 *     the same path inside a group with a mirror transform (flip around CX).
 *
 * FILL vs OUTLINE
 *   Each shape is drawn twice: a closed path for the fill (no stroke) and an open
 *   path for the outline. That way the bodice/skirt boundary only shows a line
 *   when spec.waist.seam is true (the waist_seam group draws it).
 */

const W = 400;
const H = 600;
const CX = W / 2;
const NECK_Y = 70;
const HEM_Y = { mini: 300, knee: 380, midi: 460, floor: 560 } as const;
const SLEEVE_LEN = { short: 50, elbow: 120, long: 195 } as const;
const ARM_ANGLE = (20 * Math.PI) / 180; // sleeves hang 20° out from vertical
const SHOULDER_SLOPE = 0.28; // shoulder seam drop per px of width (~16°)
const COLLAR_BAND = 6; // width of the fillable collar band
const WAIST_BAND = 6; // height of the fillable waistband

// Line styles (set as attributes, not CSS, so Illustrator keeps them)
const INK = "#1a1a1a";
const LINE = `stroke="${INK}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"`; // for filled shapes
const OUTLINE = `${LINE} fill="none"`;
const DETAIL = `stroke="${INK}" stroke-width="0.9" fill="none" stroke-linecap="round"`;
const STITCH = `stroke="${INK}" stroke-width="0.7" fill="none" stroke-dasharray="3 2"`;

type Pt = { x: number; y: number };
const pt = (x: number, y: number): Pt => ({ x, y });
const mirror = (p: Pt): Pt => pt(2 * CX - p.x, p.y);
const s = (p: Pt) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
// A value that is not a real number (NaN, missing) falls back to the low end instead of spreading NaN.
const clamp = (v: number, lo: number, hi: number) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : lo);
// Table lookup for a spec option; an unknown option falls back to a default instead of undefined.
const pick = <T extends object>(table: T, key: string, fallback: keyof T): T[keyof T] =>
  table[Object.hasOwn(table, key) ? (key as keyof T) : fallback];
const add = (a: Pt, b: Pt, k = 1): Pt => pt(a.x + b.x * k, a.y + b.y * k);
const mid = (a: Pt, b: Pt): Pt => pt((a.x + b.x) / 2, (a.y + b.y) / 2);
const MIRROR_TRANSFORM = `transform="matrix(-1 0 0 1 ${W} 0)"`;

// ---------- 1. Layout: every key measurement, computed once from the spec ----------

function layout(spec: DesignSpec) {
  const nType = spec.neckline.type;
  const depth = clamp(spec.neckline.depth, 0, 1);
  const neckHalf = pick({ crew: 26, v: 28, scoop: 36, square: 30 }, nType, "crew");
  const neckDepth = nType === "crew" ? 8 + 22 * depth : 15 + 75 * depth;

  const shoulderHalf = 50 + 40 * clamp(spec.proportions.shoulder_width, 0, 1); // 50..90
  const shoulderDrop = SHOULDER_SLOPE * (shoulderHalf - neckHalf); // same slope at any shoulder or neck width
  const bustHalf = shoulderHalf - 6;
  const waistHalf = bustHalf - 16;
  const armY = NECK_Y + 80;
  const hemY = pick(HEM_Y, spec.skirt.length, "knee");

  // Contract: waist_y 0 = empire line, 0.5 = natural waist, 1 = dropped waist at the hip.
  // Fixed scale (175..250), so the waist stays put when the skirt length changes.
  const empireY = armY + 25; // highest waist the bodice can take
  const dropY = HEM_Y.mini - 50; // lowest waist that still leaves a mini skirt
  const waistY = empireY + clamp(spec.proportions.waist_y, 0, 1) * (dropY - empireY);

  return {
    hemY,
    waistY,
    neckDepth,
    neckHalf,
    waistHalf,
    neckR: pt(CX + neckHalf, NECK_Y),
    shoulderR: pt(CX + shoulderHalf, NECK_Y + shoulderDrop),
    armR: pt(CX + bustHalf, armY),
    armCtrlR: pt(CX + bustHalf - 6, armY - 38), // pulls the armhole curve inward
    sideCtrlR: pt(CX + waistHalf + 3, armY + 0.55 * (waistY - armY)), // side seam curves in to the waist
    waistR: pt(CX + waistHalf, waistY),
  };
}
type Layout = ReturnType<typeof layout>;

// ---------- 2. Neckline: one path from the LEFT neck point to the RIGHT one ----------
// dir = -1 traces the same shape right-to-left (used to close the collar band).

function necklinePath(type: DesignSpec["neckline"]["type"], half: number, top: number, d: number, dir = 1) {
  const L = pt(CX - dir * half, top);
  const R = pt(CX + dir * half, top);
  switch (type) {
    case "v":
      return `L ${s(pt(CX, top + d))} L ${s(R)}`;
    case "square":
      return `L ${s(pt(L.x, top + d))} L ${s(pt(R.x, top + d))} L ${s(R)}`;
    default: // crew + scoop: U-curve. Control points at 1.33*d make the bottom land at ~d.
      return `C ${s(pt(L.x, top + d * 1.33))} ${s(pt(R.x, top + d * 1.33))} ${s(R)}`;
  }
}

// ---------- 3. Bodice ----------

function bodice(spec: DesignSpec, g: Layout, fill: string) {
  const { neckR, shoulderR, armR, armCtrlR, sideCtrlR, waistR } = g;
  const [neckL, shoulderL, armL, armCtrlL, sideCtrlL, waistL] = [neckR, shoulderR, armR, armCtrlR, sideCtrlR, waistR].map(mirror);
  const neck = necklinePath(spec.neckline.type, g.neckHalf, NECK_Y, g.neckDepth);

  // waist L -> up left side -> armhole -> shoulder -> neckline -> right shoulder -> armhole -> waist R
  const outline =
    `M ${s(waistL)} Q ${s(sideCtrlL)} ${s(armL)} Q ${s(armCtrlL)} ${s(shoulderL)} L ${s(neckL)} ` +
    `${neck} L ${s(shoulderR)} Q ${s(armCtrlR)} ${s(armR)} Q ${s(sideCtrlR)} ${s(waistR)}`;

  return group("bodice", [
    `<path d="${outline} Z" fill="${fill}" stroke="none"/>`,
    `<path d="${outline}" ${OUTLINE}/>`,
  ]);
}

// The neckline shape pushed k px into the garment, staying parallel to the neck edge.
// Its ends sit on the shoulder seams.
function neckOffset(type: DesignSpec["neckline"]["type"], neckHalf: number, neckDepth: number, k: number) {
  // A V's edges are slanted, so widening and deepening by k alone would not stay parallel.
  const slant = type === "v" ? Math.hypot(neckHalf, neckDepth) : 0;
  const half = neckHalf + (type === "v" ? (k * slant) / neckDepth : k);
  const drop = type === "v" ? (k * slant) / neckHalf : k; // how much lower its deepest point is
  const y = NECK_Y + SHOULDER_SLOPE * (half - neckHalf);
  return { half, y, drop, depth: neckDepth + drop - (y - NECK_Y) };
}

function collarNeckline(spec: DesignSpec, g: Layout, fill: string) {
  // Collar band: a 6px strip along the neck edge with a topstitch line inside it. The band
  // takes its own fill, so a contrast collar is possible.
  const type = spec.neckline.type;
  const top = `M ${s(mirror(g.neckR))} ${necklinePath(type, g.neckHalf, NECK_Y, g.neckDepth)}`;
  const edge = neckOffset(type, g.neckHalf, g.neckDepth, COLLAR_BAND);
  const st = neckOffset(type, g.neckHalf, g.neckDepth, COLLAR_BAND - 2);
  // Closed band: along the neck edge left to right, then back along the band's outer edge right to left.
  const band = `${top} L ${s(pt(CX + edge.half, edge.y))} ${necklinePath(type, edge.half, edge.y, edge.depth, -1)} Z`;
  const stitch = `M ${s(pt(CX - st.half, st.y))} ${necklinePath(type, st.half, st.y, st.depth)}`;
  return group("collar_neckline", [
    `<path d="${band}" fill="${fill}" stroke="none"/>`,
    `<path d="${top}" ${OUTLINE}/>`,
    `<path d="${stitch}" ${STITCH}/>`,
  ]);
}

// ---------- 4. Skirt ----------

function skirtShape(spec: DesignSpec, g: Layout) {
  const len = g.hemY - g.waistY;
  const sil = spec.skirt.silhouette;
  const wanted =
    sil === "straight" ? g.waistHalf + 16 : sil === "a_line" ? g.waistHalf + 0.38 * len : g.waistHalf + 0.65 * len;
  const hemHalf = Math.min(wanted, CX - 20); // long flared skirts would run off the canvas
  const hemR = pt(CX + hemHalf, g.hemY);

  // One quadratic per side; the control point sets the silhouette's character.
  const sideCtrlR =
    sil === "straight"
      ? pt(CX + hemHalf, g.waistY + 40) // bulges to hip width fast, then straight down
      : sil === "a_line"
        ? pt(CX + (g.waistHalf + hemHalf) / 2 + 4, g.waistY + len / 2) // nearly straight diagonal
        : pt(CX + g.waistHalf + 10, g.waistY + 0.55 * len); // stays narrow, then flares out

  const hemDip = sil === "straight" ? 0 : sil === "a_line" ? 8 : 18; // curved hem for wider skirts
  return { hemR, sideCtrlR, hemDip, hemHalf, len };
}

function skirt(spec: DesignSpec, g: Layout, fill: string) {
  const { hemR, sideCtrlR, hemDip, hemHalf, len } = skirtShape(spec, g);
  const [waistL, hemL, sideCtrlL] = [g.waistR, hemR, sideCtrlR].map(mirror);

  // waist R -> down right side -> hem -> up left side -> waist L (top edge left open)
  const outline =
    `M ${s(g.waistR)} Q ${s(sideCtrlR)} ${s(hemR)} ` +
    `Q ${s(pt(CX, g.hemY + hemDip))} ${s(hemL)} Q ${s(sideCtrlL)} ${s(waistL)}`;

  const parts = [`<path d="${outline} Z" fill="${fill}" stroke="none"/>`, `<path d="${outline}" ${OUTLINE}/>`];

  // Flared skirts get fold lines so the volume reads on a flat drawing.
  if (spec.skirt.silhouette === "flared") {
    for (const f of [0.25, 0.6]) {
      const top = pt(CX + g.waistHalf * f, g.waistY + 0.35 * len);
      const bottom = pt(CX + hemHalf * f, g.hemY + (hemDip * (1 - f * f)) / 2); // lands exactly on the curved hem
      parts.push(`<path d="M ${s(top)} L ${s(bottom)}" ${DETAIL}/>`);
      parts.push(`<path d="M ${s(mirror(top))} L ${s(mirror(bottom))}" ${DETAIL}/>`);
    }
  }
  return group("skirt", parts);
}

// Point on a quadratic curve (p0 to p1, control c) at height y. Used to find where a
// horizontal line meets the skirt's side seam.
function quadAtY(p0: Pt, c: Pt, p1: Pt, y: number): Pt {
  const a = p0.y - 2 * c.y + p1.y;
  const b = 2 * (c.y - p0.y);
  const k = p0.y - y;
  const t = Math.abs(a) < 1e-6 ? -k / b : (-b + Math.sqrt(b * b - 4 * a * k)) / (2 * a);
  return pt((1 - t) * (1 - t) * p0.x + 2 * t * (1 - t) * c.x + t * t * p1.x, y);
}

function waistSeam(spec: DesignSpec, g: Layout, fill: string) {
  if (!spec.waist.seam) return group("waist_seam", []); // empty group keeps layer names stable
  // Waistband: a 6px strip below the waist line with a topstitch line inside it and its ends
  // on the skirt's side seams. It takes its own fill, so a contrast waistband is possible.
  const { hemR, sideCtrlR } = skirtShape(spec, g);
  const bandR = quadAtY(g.waistR, sideCtrlR, hemR, g.waistY + WAIST_BAND);
  const stitchR = quadAtY(g.waistR, sideCtrlR, hemR, g.waistY + WAIST_BAND - 2);
  const [waistL, bandL, stitchL] = [g.waistR, bandR, stitchR].map(mirror);
  return group("waist_seam", [
    `<path d="M ${s(waistL)} L ${s(g.waistR)} L ${s(bandR)} L ${s(bandL)} Z" fill="${fill}" stroke="none"/>`,
    // The fill covers the inner half of the skirt's side outline, so the two short ends are redrawn.
    `<path d="M ${s(waistL)} L ${s(bandL)} M ${s(g.waistR)} L ${s(bandR)}" ${OUTLINE}/>`,
    `<path d="M ${s(waistL)} L ${s(g.waistR)}" ${OUTLINE}/>`,
    `<path d="M ${s(pt(stitchL.x + 2, stitchL.y))} L ${s(pt(stitchR.x - 2, stitchR.y))}" ${STITCH}/>`,
  ]);
}

// ---------- 5. Sleeves: right sleeve defined once, left = mirrored copy ----------

function rightSleevePaths(spec: DesignSpec, g: Layout, fill: string): string[] {
  const { type, length } = spec.sleeves;
  if (type === "none") return [];

  const { shoulderR: top, armR: pit, armCtrlR } = g;
  const u = pt(Math.sin(ARM_ANGLE), Math.cos(ARM_ANGLE)); // down the arm
  const n = pt(Math.cos(ARM_ANGLE), -Math.sin(ARM_ANGLE)); // across the arm, pointing outward
  const base = mid(top, pit);

  const L = type === "cap" ? 26 : pick(SLEEVE_LEN, length, "short");
  const cuffHalf =
    type === "cap"
      ? 34
      : pick(type === "puff" ? { short: 26, elbow: 20, long: 16 } : { short: 30, elbow: 24, long: 18 }, length, "short");

  const end = add(base, u, L);
  const outer = add(end, n, cuffHalf);
  // Underarm edge never crosses inside the armpit, or it would hook out from behind the bodice.
  const pitAcross = (pit.x - end.x) * n.x + (pit.y - end.y) * n.y;
  const inner = add(end, n, Math.max(-cuffHalf, pitAcross));
  const cuffMid = mid(outer, inner);
  const armhole = `Q ${s(armCtrlR)} ${s(top)}`; // reuses the bodice armhole curve exactly

  let outerEdge: string;
  let cuffEdge: string;
  if (type === "puff") {
    // Balloon out on the outer edge, gather into a band at the cuff.
    const bulge = add(add(top, n, 34), u, L * 0.35);
    outerEdge = `Q ${s(bulge)} ${s(outer)}`;
    cuffEdge = `L ${s(inner)}`;
  } else if (type === "cap") {
    outerEdge = `L ${s(outer)}`;
    cuffEdge = `Q ${s(add(cuffMid, u, 6))} ${s(inner)}`; // soft curved hem
  } else {
    outerEdge = `L ${s(outer)}`;
    cuffEdge = `L ${s(inner)}`;
  }

  const shape = `M ${s(top)} ${outerEdge} ${cuffEdge} L ${s(pit)} ${armhole}`;
  const paths = [`<path d="${shape} Z" fill="${fill}" stroke="none"/>`, `<path d="${shape}" ${OUTLINE}/>`];

  if (type === "puff") {
    // Cuff band + gather marks
    const bandOuter = add(outer, u, 8);
    const bandInner = add(inner, u, 8);
    paths.push(
      `<path d="M ${s(outer)} L ${s(bandOuter)} L ${s(bandInner)} L ${s(inner)} Z" fill="${fill}" ${LINE}/>`,
    );
    for (const t of [-0.5, 0, 0.5]) {
      const a = add(cuffMid, pt(outer.x - cuffMid.x, outer.y - cuffMid.y), t);
      paths.push(`<path d="M ${s(a)} L ${s(add(a, u, -10))}" ${DETAIL}/>`);
    }
  } else if (type === "fitted" && length !== "short") {
    paths.push(`<path d="M ${s(add(outer, u, -6))} L ${s(add(inner, u, -6))}" ${STITCH}/>`); // cuff hem stitch
  } else {
    paths.push(`<path d="M ${s(add(outer, u, -4))} L ${s(add(inner, u, -4))}" ${STITCH}/>`);
  }
  return paths;
}

// ---------- 6. Details ----------

function buttons(spec: DesignSpec, g: Layout, fill: string) {
  const collar = neckOffset(spec.neckline.type, g.neckHalf, g.neckDepth, COLLAR_BAND);
  const top = NECK_Y + g.neckDepth + collar.drop + 3; // just below the collar band
  const bottom = g.waistY - 6;
  // A deep neckline over a high waist leaves little room: draw only as many buttons as fit (8px each).
  const fits = Math.max(0, Math.floor((bottom - top) / 8));
  const count = Math.min(clamp(Math.round(spec.details.buttons), 0, 8), fits);
  if (count === 0) return group("buttons", []);
  const parts = [
    `<path d="M ${s(pt(CX - 6, top))} L ${s(pt(CX - 6, bottom))} M ${s(pt(CX + 6, top))} L ${s(pt(CX + 6, bottom))}" ${DETAIL}/>`,
  ];
  const step = (bottom - top) / count;
  for (let i = 0; i < count; i++) {
    const y = top + step * (i + 0.5);
    parts.push(`<circle cx="${CX}" cy="${y.toFixed(1)}" r="3.2" fill="${fill}" stroke="${INK}" stroke-width="0.9"/>`);
  }
  return group("buttons", parts);
}

function pockets(spec: DesignSpec, g: Layout, fill: string, leftFill: string) {
  const type = spec.details.pockets;
  if (type === "none") return group("pockets", []);
  const len = g.hemY - g.waistY;
  let draw: (f: string) => string[]; // one pocket; called once per side with that side's fill

  if (type === "patch") {
    // Pocket shrinks on short or narrow skirts so it always sits inside the skirt.
    const h = Math.min(38, len - 24);
    const y = Math.min(g.waistY + 35, g.hemY - h - 12);
    // The skirt is only waist-wide at the top and widens below, so a higher pocket gets less room.
    const sideLimit = g.waistHalf + Math.min(8, (y - g.waistY) * 0.2);
    const w = Math.min(34, sideLimit - 8);
    // Centered on its half of the skirt, at least 8px from center front, never past the side seam.
    const x = clamp(CX + g.waistHalf * 0.5 + 14 - w / 2, CX + 8, CX + sideLimit - w);
    const r = 6;
    const d =
      `M ${x},${y} L ${x + w},${y} L ${x + w},${y + h - r} Q ${x + w},${y + h} ${x + w - r},${y + h} ` +
      `L ${x + r},${y + h} Q ${x},${y + h} ${x},${y + h - r} Z`;
    draw = (f) => [
      `<path d="${d}" fill="${f}" ${LINE}/>`,
      `<path d="M ${x + 3},${y + 5} L ${x + w - 3},${y + 5}" ${STITCH}/>`,
    ];
  } else {
    // side_seam: slanted opening near the side seam, just below the waist
    const k = Math.min(1, (len - 12) / 58); // shorter opening on short skirts
    const a = pt(CX + g.waistHalf + 4, g.waistY + 16 * k);
    const b = pt(CX + g.waistHalf - 10, g.waistY + 58 * k);
    draw = () => [`<path d="M ${s(a)} Q ${s(pt(a.x - 14, a.y + 14))} ${s(b)}" ${DETAIL}/>`];
  }
  return group("pockets", [
    `<g id="pocket_right">${draw(fill).join("")}</g>`,
    `<g id="pocket_left" ${MIRROR_TRANSFORM}>${draw(leftFill).join("")}</g>`,
  ]);
}

// ---------- 7. Fabric fills (pure SVG patterns, no images — safe for PNG export) ----------

const DEFAULT_STYLE: PartStyle = { fill: "#ffffff", pattern: "solid" };
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

// `mirrored` is for parts drawn inside a mirrored group (left sleeve, left pocket): the pattern is
// flipped back, so the fabric lines up with the rest of the dress instead of running the other way.
function fillFor(part: PartName, spec: DesignSpec, defs: string[], mirrored = false): string {
  const style = spec.style?.[part] ?? DEFAULT_STYLE;
  // The fill is pasted into the SVG markup, so only a plain 6-digit hex color is allowed through.
  const fill = HEX_COLOR.test(style.fill) ? style.fill : DEFAULT_STYLE.fill;
  const pattern = style.pattern;
  if (pattern !== "denim" && pattern !== "plaid" && pattern !== "floral") return fill; // solid, or unknown

  const id = `fabric_${part}${mirrored ? "_mirrored" : ""}`;
  const flip = mirrored ? ` patternTransform="matrix(-1 0 0 1 ${W} 0)"` : "";
  // One square tile: base color first, then the marks. Every pattern uses both light and dark
  // marks so it shows on any base color, including white.
  const tile = (size: number, marks: string) =>
    `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${size}" height="${size}"${flip}>` +
    `<rect width="${size}" height="${size}" fill="${fill}"/>${marks}</pattern>`;

  const body = {
    // Twill diagonals. The short corner pieces continue each line into the next tile;
    // without them the line is clipped at the tile corners and looks dashed.
    denim: tile(
      6,
      `<path d="M-1,1 L1,-1 M0,6 L6,0 M5,7 L7,5" stroke="#fff" stroke-opacity="0.22" stroke-width="1"/>` +
        `<path d="M-1,4 L4,-1 M2,7 L7,2" stroke="#000" stroke-opacity="0.1" stroke-width="1"/>`,
    ),
    plaid: tile(
      24,
      `<rect y="8" width="24" height="6" fill="#000" fill-opacity="0.18"/>` +
        `<rect x="8" width="6" height="24" fill="#000" fill-opacity="0.18"/>` +
        `<path d="M0,20 L24,20 M20,0 L20,24" stroke="#fff" stroke-opacity="0.35" stroke-width="1"/>`,
    ),
    floral: tile(
      22,
      [0, 72, 144, 216, 288]
        .map((deg) => {
          const r = (deg * Math.PI) / 180;
          const [cx, cy] = [11 + 3 * Math.cos(r), 11 + 3 * Math.sin(r)];
          return `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="2.2" fill="#fff" fill-opacity="0.6" stroke="#000" stroke-opacity="0.25" stroke-width="0.4"/>`;
        })
        .join("") + `<circle cx="11" cy="11" r="1.6" fill="#000" fill-opacity="0.25"/>`,
    ),
  }[pattern];
  defs.push(body);
  return `url(#${id})`;
}

// ---------- 8. Assemble ----------

function group(name: PartName, children: string[], extra = "") {
  return `<g id="${name}" ${extra}>${children.join("")}</g>`;
}

export function buildFlat(spec: DesignSpec): string {
  const g = layout(spec);
  const defs: string[] = [];
  const rightSleeve = rightSleevePaths(spec, g, fillFor("right_sleeve", spec, defs));
  const leftSleeve = rightSleevePaths(spec, g, fillFor("left_sleeve", spec, defs, true)); // same definition...

  // Draw order = stacking order: sleeves behind the bodice so the armhole seam shows.
  const groups = [
    group("left_sleeve", leftSleeve, MIRROR_TRANSFORM), // ...flipped around the center line
    group("right_sleeve", rightSleeve),
    skirt(spec, g, fillFor("skirt", spec, defs)),
    bodice(spec, g, fillFor("bodice", spec, defs)),
    waistSeam(spec, g, fillFor("waist_seam", spec, defs)),
    collarNeckline(spec, g, fillFor("collar_neckline", spec, defs)),
    pockets(spec, g, fillFor("pockets", spec, defs), fillFor("pockets", spec, defs, true)),
    buttons(spec, g, fillFor("buttons", spec, defs)),
  ];

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">` +
    `<defs>${defs.join("")}</defs>${groups.join("")}</svg>`
  );
}

export const FLAT_SIZE = { width: W, height: H };
