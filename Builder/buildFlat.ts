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
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const add = (a: Pt, b: Pt, k = 1): Pt => pt(a.x + b.x * k, a.y + b.y * k);
const mid = (a: Pt, b: Pt): Pt => pt((a.x + b.x) / 2, (a.y + b.y) / 2);
const MIRROR_TRANSFORM = `transform="matrix(-1 0 0 1 ${W} 0)"`;

// ---------- 1. Layout: every key measurement, computed once from the spec ----------

function layout(spec: DesignSpec) {
  const nType = spec.neckline.type;
  const depth = clamp(spec.neckline.depth, 0, 1);
  const neckHalf = { crew: 26, v: 28, scoop: 36, square: 30 }[nType];
  const neckDepth = nType === "crew" ? 8 + 22 * depth : 15 + 75 * depth;

  const shoulderHalf = 50 + 40 * clamp(spec.proportions.shoulder_width, 0, 1); // 50..90
  const shoulderDrop = 0.28 * (shoulderHalf - neckHalf); // same ~16° slope at any shoulder or neck width
  const bustHalf = shoulderHalf - 6;
  const waistHalf = bustHalf - 16;
  const armY = NECK_Y + 80;
  const hemY = HEM_Y[spec.skirt.length];

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

function necklinePath(type: DesignSpec["neckline"]["type"], half: number, top: number, d: number) {
  const L = pt(CX - half, top);
  const R = pt(CX + half, top);
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

function collarNeckline(spec: DesignSpec, g: Layout) {
  // Neck edge drawn again on top + a topstitch line 5px inside it.
  const top = `M ${s(mirror(g.neckR))} ${necklinePath(spec.neckline.type, g.neckHalf, NECK_Y, g.neckDepth)}`;
  const inner = `M ${s(pt(CX - g.neckHalf, NECK_Y + 5))} ${necklinePath(spec.neckline.type, g.neckHalf, NECK_Y + 5, g.neckDepth)}`;
  return group("collar_neckline", [`<path d="${top}" ${OUTLINE}/>`, `<path d="${inner}" ${STITCH}/>`]);
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

function waistSeam(spec: DesignSpec, g: Layout) {
  if (!spec.waist.seam) return group("waist_seam", []); // empty group keeps layer names stable
  const L = mirror(g.waistR);
  return group("waist_seam", [
    `<path d="M ${s(L)} L ${s(g.waistR)}" ${OUTLINE}/>`,
    `<path d="M ${s(pt(L.x + 2, g.waistY + 4))} L ${s(pt(g.waistR.x - 2, g.waistY + 4))}" ${STITCH}/>`,
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

  const L = type === "cap" ? 26 : SLEEVE_LEN[length];
  const cuffHalf =
    type === "cap" ? 34 : type === "puff" ? { short: 26, elbow: 20, long: 16 }[length] : { short: 30, elbow: 24, long: 18 }[length];

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

function buttons(spec: DesignSpec, g: Layout) {
  const count = clamp(Math.round(spec.details.buttons), 0, 8);
  if (count === 0) return group("buttons", []);
  const top = NECK_Y + g.neckDepth + 4;
  const bottom = g.waistY - 6;
  const parts = [
    `<path d="M ${s(pt(CX - 6, top))} L ${s(pt(CX - 6, bottom))} M ${s(pt(CX + 6, top))} L ${s(pt(CX + 6, bottom))}" ${DETAIL}/>`,
  ];
  const step = (bottom - top) / count;
  for (let i = 0; i < count; i++) {
    const y = top + step * (i + 0.5);
    parts.push(`<circle cx="${CX}" cy="${y.toFixed(1)}" r="3.2" fill="#ffffff" stroke="${INK}" stroke-width="0.9"/>`);
  }
  return group("buttons", parts);
}

function pockets(spec: DesignSpec, g: Layout, fill: string) {
  const type = spec.details.pockets;
  if (type === "none") return group("pockets", []);
  let right: string[];

  if (type === "patch") {
    const w = 34;
    const h = 38;
    const y = clamp(g.waistY + 35, g.waistY + 10, g.hemY - h - 12);
    // Gap at center front, but never past the side seam on narrow skirts.
    const x = Math.min(CX + g.waistHalf * 0.5 + 14 - w / 2, CX + g.waistHalf + 8 - w);
    const r = 6;
    const d =
      `M ${x},${y} L ${x + w},${y} L ${x + w},${y + h - r} Q ${x + w},${y + h} ${x + w - r},${y + h} ` +
      `L ${x + r},${y + h} Q ${x},${y + h} ${x},${y + h - r} Z`;
    right = [
      `<path d="${d}" fill="${fill}" ${LINE}/>`,
      `<path d="M ${x + 3},${y + 5} L ${x + w - 3},${y + 5}" ${STITCH}/>`,
    ];
  } else {
    // side_seam: slanted opening near the side seam, just below the waist
    const a = pt(CX + g.waistHalf + 4, g.waistY + 16);
    const b = pt(CX + g.waistHalf - 10, g.waistY + 58);
    right = [`<path d="M ${s(a)} Q ${s(pt(a.x - 14, a.y + 14))} ${s(b)}" ${DETAIL}/>`];
  }
  return group("pockets", [
    `<g id="pocket_right">${right.join("")}</g>`,
    `<g id="pocket_left" ${MIRROR_TRANSFORM}>${right.join("")}</g>`,
  ]);
}

// ---------- 7. Fabric fills (pure SVG patterns, no images — safe for PNG export) ----------

const DEFAULT_STYLE: PartStyle = { fill: "#ffffff", pattern: "solid" };

function fillFor(part: PartName, spec: DesignSpec, defs: string[]): string {
  const { fill, pattern } = spec.style[part] ?? DEFAULT_STYLE;
  if (pattern === "solid") return fill;
  const id = `fabric_${part}`;
  const base = `<rect width="100%" height="100%" fill="${fill}"/>`;
  const body = {
    denim:
      `<pattern id="${id}" patternUnits="userSpaceOnUse" width="6" height="6">${base}` +
      `<path d="M0,6 L6,0" stroke="#ffffff" stroke-opacity="0.22" stroke-width="1"/></pattern>`,
    plaid:
      `<pattern id="${id}" patternUnits="userSpaceOnUse" width="24" height="24">${base}` +
      `<rect y="8" width="24" height="6" fill="#000" fill-opacity="0.18"/>` +
      `<rect x="8" width="6" height="24" fill="#000" fill-opacity="0.18"/>` +
      `<path d="M0,20 L24,20 M20,0 L20,24" stroke="#fff" stroke-opacity="0.35" stroke-width="1"/></pattern>`,
    floral:
      `<pattern id="${id}" patternUnits="userSpaceOnUse" width="22" height="22">${base}` +
      [0, 72, 144, 216, 288]
        .map((deg) => {
          const r = (deg * Math.PI) / 180;
          return `<circle cx="${(11 + 3 * Math.cos(r)).toFixed(1)}" cy="${(11 + 3 * Math.sin(r)).toFixed(1)}" r="2.2" fill="#fff" fill-opacity="0.6"/>`;
        })
        .join("") +
      `<circle cx="11" cy="11" r="1.6" fill="#000" fill-opacity="0.25"/></pattern>`,
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
  const leftSleeve = rightSleevePaths(spec, g, fillFor("left_sleeve", spec, defs)); // same definition...

  // Draw order = stacking order: sleeves behind the bodice so the armhole seam shows.
  const groups = [
    group("left_sleeve", leftSleeve, MIRROR_TRANSFORM), // ...flipped around the center line
    group("right_sleeve", rightSleeve),
    skirt(spec, g, fillFor("skirt", spec, defs)),
    bodice(spec, g, fillFor("bodice", spec, defs)),
    waistSeam(spec, g),
    collarNeckline(spec, g),
    pockets(spec, g, fillFor("pockets", spec, defs)),
    buttons(spec, g),
  ];

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">` +
    `<defs>${defs.join("")}</defs>${groups.join("")}</svg>`
  );
}

export const FLAT_SIZE = { width: W, height: H };
