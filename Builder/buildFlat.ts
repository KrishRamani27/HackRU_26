import type { DesignSpec, PartName, PartStyle, Pattern } from "./types";
// Manual drawing contract, owned by the backend. Types only, so nothing from backend/ is bundled.
import type { CustomElement } from "../backend/contracts/custom-elements";

/*
 * FLAT BUILDER: spec in, SVG string out. Pure function, no React, no state.
 * Hand-drawn custom elements (optional second argument) are drawn on top of the dress.
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

type Neckline = DesignSpec["neckline"]["type"];
// Necklines whose top edge sits below the shoulders or leaves them bare. Collars don't apply to them.
const isBareShoulder = (type: Neckline) => type === "off_shoulder" || type === "halter";
const takesCollar = (type: Neckline) => type === "crew" || type === "v" || type === "scoop" || type === "square";

function layout(spec: DesignSpec) {
  const nType = spec.neckline.type;
  const depth = clamp(spec.neckline.depth, 0, 1);

  const shoulderHalf = 50 + 40 * clamp(spec.proportions.shoulder_width, 0, 1); // 50..90
  const bustHalf = shoulderHalf - 6;
  const waistHalf = bustHalf - 16;
  const armY = NECK_Y + 80;
  const hemY = pick(HEM_Y, spec.skirt.length, "knee");

  // Neck opening: how wide it is at the top, how deep, and where its top edge sits.
  let neckHalf = pick({ crew: 26, v: 28, scoop: 36, square: 30, sweetheart: 34, off_shoulder: 0, halter: 13, high: 17 }, nType, "crew");
  const neckDepth =
    nType === "crew" ? 8 + 22 * depth
    : nType === "high" ? 3 + 5 * depth
    : nType === "off_shoulder" ? 4 + 14 * depth
    : nType === "sweetheart" ? 24 + 50 * depth
    : 15 + 75 * depth;
  let neckTop = NECK_Y;
  let shoulderR = pt(CX + shoulderHalf, NECK_Y + SHOULDER_SLOPE * (shoulderHalf - neckHalf)); // same slope at any width
  let armCtrlR = pt(CX + bustHalf - 6, armY - 38); // pulls the armhole curve inward
  if (nType === "off_shoulder") {
    // The top edge runs straight across the upper chest, from arm to arm, below bare shoulders.
    neckTop = NECK_Y + 40;
    neckHalf = bustHalf + 3;
    shoulderR = pt(CX + neckHalf + 2, neckTop + 3);
    armCtrlR = pt(CX + bustHalf - 1, armY - 18);
  } else if (nType === "halter") {
    // Narrow at the neck; the armhole is cut away in one long diagonal down to the underarm.
    shoulderR = pt(CX + neckHalf + 9, NECK_Y + 3);
    armCtrlR = pt(CX + bustHalf * 0.5, armY - 26);
  }

  // Contract: waist_y 0 = empire line, 0.5 = natural waist, 1 = dropped waist at the hip.
  // Fixed scale (175..250), so the waist stays put when the skirt length changes.
  const empireY = armY + 25; // highest waist the bodice can take
  const dropY = HEM_Y.mini - 50; // lowest waist that still leaves a mini skirt
  const waistY = empireY + clamp(spec.proportions.waist_y, 0, 1) * (dropY - empireY);

  return {
    hemY,
    waistY,
    armY,
    neckTop,
    neckDepth,
    neckHalf,
    bustHalf,
    waistHalf,
    neckR: pt(CX + neckHalf, neckTop),
    shoulderR,
    armR: pt(CX + bustHalf, armY),
    armCtrlR,
    sideCtrlR: pt(CX + waistHalf + 3, armY + 0.55 * (waistY - armY)), // side seam curves in to the waist
    waistR: pt(CX + waistHalf, waistY),
    // The waistband is taller when the dress is belted.
    bandHeight: spec.waist.style === "belted" ? 11 : WAIST_BAND,
    hasBand: spec.waist.seam === true || spec.waist.style === "belted",
  };
}
type Layout = ReturnType<typeof layout>;

// ---------- 2. Neckline: one path from the LEFT neck point to the RIGHT one ----------
// dir = -1 traces the same shape right-to-left (used to close the collar band).

function necklinePath(type: Neckline, half: number, top: number, d: number, dir = 1) {
  const x = (k: number) => CX + dir * k * half; // -1 = where the path starts, +1 = where it ends
  const R = pt(x(1), top);
  switch (type) {
    case "v":
    case "halter":
      return `L ${s(pt(CX, top + d))} L ${s(R)}`;
    case "square":
      return `L ${s(pt(x(-1), top + d))} L ${s(pt(x(1), top + d))} L ${s(R)}`;
    case "sweetheart":
      // The top of a heart: straight down the strap, a curve rising over each side of the bust,
      // and a point dipping at the centre front.
      return (
        `L ${s(pt(x(-1), top + d * 0.5))} C ${s(pt(x(-0.78), top + d * 0.22))} ${s(pt(x(-0.28), top + d * 0.3))} ${s(pt(CX, top + d))} ` +
        `C ${s(pt(x(0.28), top + d * 0.3))} ${s(pt(x(0.78), top + d * 0.22))} ${s(pt(x(1), top + d * 0.5))} L ${s(R)}`
      );
    default: // crew, scoop, high, off shoulder: U-curve. Control points at 1.33*d make the bottom land at ~d.
      return `C ${s(pt(x(-1), top + d * 1.33))} ${s(pt(x(1), top + d * 1.33))} ${s(R)}`;
  }
}

// The lowest point of the neck opening on the centre line.
const neckBottom = (g: Layout) => g.neckTop + g.neckDepth;

// ---------- 3. Bodice ----------

function bodice(spec: DesignSpec, g: Layout, fill: string) {
  const { neckR, shoulderR, armR, armCtrlR, sideCtrlR, waistR } = g;
  const [neckL, shoulderL, armL, armCtrlL, sideCtrlL, waistL] = [neckR, shoulderR, armR, armCtrlR, sideCtrlR, waistR].map(mirror);
  const neck = necklinePath(spec.neckline.type, g.neckHalf, g.neckTop, g.neckDepth);

  // waist L -> up left side -> armhole -> shoulder -> neckline -> right shoulder -> armhole -> waist R
  const outline =
    `M ${s(waistL)} Q ${s(sideCtrlL)} ${s(armL)} Q ${s(armCtrlL)} ${s(shoulderL)} L ${s(neckL)} ` +
    `${neck} L ${s(shoulderR)} Q ${s(armCtrlR)} ${s(armR)} Q ${s(sideCtrlR)} ${s(waistR)}`;

  const parts = [`<path d="${outline} Z" fill="${fill}" stroke="none"/>`, `<path d="${outline}" ${OUTLINE}/>`];

  // Darts: two narrow stitched folds rising from the waist toward the bust.
  if (spec.details.darts === true) {
    const x = g.waistHalf * 0.5;
    const tip = pt(CX + x + 3, g.waistY - 0.55 * (g.waistY - g.armY) - 4);
    const dart = `M ${s(pt(CX + x - 2.5, g.waistY))} L ${s(tip)} L ${s(pt(CX + x + 2.5, g.waistY))}`;
    const [a, b, c] = [pt(CX + x - 2.5, g.waistY), tip, pt(CX + x + 2.5, g.waistY)].map(mirror);
    parts.push(`<path d="${dart} M ${s(a)} L ${s(b)} L ${s(c)}" ${DETAIL}/>`);
  }
  // Princess seams: the top half of two long curved seams, continued by the skirt.
  if (spec.skirt.panels === "princess_seams") {
    const start = isBareShoulder(spec.neckline.type) || spec.neckline.type === "sweetheart"
      ? pt(CX + g.bustHalf * 0.5, neckBottom(g) + 6)
      : mid(neckR, shoulderR);
    const bust = pt(CX + g.bustHalf * 0.72, g.armY + 2);
    const end = pt(CX + g.waistHalf * 0.5, g.waistY);
    const seam = (side: (p: Pt) => Pt) => `M ${s(side(start))} Q ${s(side(bust))} ${s(side(end))}`;
    parts.push(`<path d="${seam((p) => p)} ${seam(mirror)}" ${DETAIL}/>`);
  }
  return group("bodice", parts);
}

// The neckline shape pushed k px into the garment, staying parallel to the neck edge.
// Its ends sit on the shoulder seams.
function neckOffset(type: Neckline, g: Layout, k: number) {
  const { neckHalf, neckDepth, neckTop } = g;
  // Across bare shoulders there is no seam to follow: the whole edge just moves down by k.
  if (type === "off_shoulder") return { half: neckHalf, y: neckTop + k, drop: k, depth: neckDepth };
  // A V's edges are slanted, so widening and deepening by k alone would not stay parallel.
  const pointed = type === "v" || type === "halter";
  const slant = pointed ? Math.hypot(neckHalf, neckDepth) : 0;
  const half = neckHalf + (pointed ? (k * slant) / neckDepth : k);
  const drop = pointed ? (k * slant) / neckHalf : k; // how much lower its deepest point is
  const y = neckTop + SHOULDER_SLOPE * (half - neckHalf);
  return { half, y, drop, depth: neckDepth + drop - (y - neckTop) };
}

// A bow: two loops, a knot and two tails. Used at the neckline and at the waist.
function bow(cx: number, cy: number, k: number, fill: string): string[] {
  const loop = (sign: number) =>
    `M ${s(pt(cx, cy))} C ${s(pt(cx + sign * 6 * k, cy - 9 * k))} ${s(pt(cx + sign * 17 * k, cy - 8 * k))} ${s(pt(cx + sign * 16 * k, cy))} ` +
    `C ${s(pt(cx + sign * 17 * k, cy + 8 * k))} ${s(pt(cx + sign * 6 * k, cy + 9 * k))} ${s(pt(cx, cy))} Z`;
  const tail = (sign: number) =>
    `M ${s(pt(cx, cy))} L ${s(pt(cx + sign * 9 * k, cy + 17 * k))} L ${s(pt(cx + sign * 3.5 * k, cy + 18 * k))} Z`;
  const thin = `stroke="${INK}" stroke-width="0.9" stroke-linejoin="round"`;
  return [
    `<path d="${tail(-1)} ${tail(1)}" fill="${fill}" ${thin}/>`,
    `<path d="${loop(-1)}" fill="${fill}" ${thin}/>`,
    `<path d="${loop(1)}" fill="${fill}" ${thin}/>`,
    `<circle cx="${cx}" cy="${cy.toFixed(1)}" r="${(2.8 * k).toFixed(1)}" fill="${fill}" stroke="${INK}" stroke-width="0.9"/>`,
  ];
}

// A collar is a separate piece sewn around the neckline. One side is defined; the other mirrors it.
function collarPieces(spec: DesignSpec, g: Layout, fill: string): string[] {
  const type = spec.collar?.type ?? "none";
  const neck = spec.neckline.type;
  if (type === "none" || type === "band" || !takesCollar(neck)) return []; // "band" is drawn as a wider neck band
  const nh = g.neckHalf;
  const bottom = neckBottom(g);
  const leaf = (sign: number) => {
    const X = (dx: number) => CX + sign * dx;
    const neckPoint = pt(X(nh), NECK_Y);
    const front = pt(X(1.5), bottom + 1);
    // The inner edge runs back up the neck opening from the centre front to the neck point.
    const inner = neck === "square" ? `L ${s(pt(X(nh), bottom))} L ${s(neckPoint)}` : `Q ${s(pt(X(nh * 0.95), NECK_Y + g.neckDepth * 0.75))} ${s(neckPoint)}`;
    if (type === "shirt") {
      // Pointed leaf: out past the neck point, down to a point, back in to the centre front.
      return `M ${s(pt(X(nh + 2), NECK_Y - 3))} L ${s(pt(X(nh * 0.75 + 5), bottom + 18))} L ${s(front)} ${inner} Z`;
    }
    if (type === "peter_pan") {
      // Flat leaf with a rounded end, lying on the shoulder.
      return (
        `M ${s(pt(X(nh + 1), NECK_Y - 2))} C ${s(pt(X(nh + 20), NECK_Y + g.neckDepth * 0.35 + 6))} ${s(pt(X(nh * 0.9 + 11), bottom + 23))} ${s(pt(X(8), bottom + 16))} ` +
        `Q ${s(pt(X(2), bottom + 12))} ${s(front)} ${inner} Z`
      );
    }
    // mandarin: a short upright stand, open at the centre front
    return (
      `M ${s(pt(X(2.5), bottom + 0.5))} L ${s(pt(X(3.5), bottom - 11))} Q ${s(pt(X(nh * 0.75), NECK_Y - 9))} ${s(pt(X(nh + 1), NECK_Y - 11))} ` +
      `L ${s(neckPoint)} ${neck === "square" ? `L ${s(pt(X(nh), bottom))}` : `Q ${s(pt(X(nh * 0.95), NECK_Y + g.neckDepth * 0.75))}`} ${s(pt(X(2.5), bottom + 0.5))} Z`
    );
  };
  return [`<path d="${leaf(-1)}" fill="${fill}" ${LINE}/>`, `<path d="${leaf(1)}" fill="${fill}" ${LINE}/>`];
}

function collarNeckline(spec: DesignSpec, g: Layout, fill: string) {
  const type = spec.neckline.type;
  const top = `M ${s(mirror(g.neckR))} ${necklinePath(type, g.neckHalf, g.neckTop, g.neckDepth)}`;
  const parts: string[] = [];

  if (type === "high") {
    // A stand that rises up the neck from the neckline, with a fold line.
    const nh = g.neckHalf;
    const [L, R] = [pt(CX - nh, NECK_Y), pt(CX + nh, NECK_Y)];
    const stand =
      `M ${s(L)} L ${s(pt(CX - nh + 1.5, NECK_Y - 15))} Q ${s(pt(CX, NECK_Y - 19))} ${s(pt(CX + nh - 1.5, NECK_Y - 15))} ` +
      `L ${s(R)} ${necklinePath(type, nh, NECK_Y, g.neckDepth, -1)} Z`;
    parts.push(`<path d="${stand}" fill="${fill}" ${LINE}/>`);
    parts.push(`<path d="M ${s(pt(CX - nh + 1, NECK_Y - 7))} Q ${s(pt(CX, NECK_Y - 10))} ${s(pt(CX + nh - 1, NECK_Y - 7))}" ${STITCH}/>`);
  } else {
    // Neck band: a strip along the neck edge with a topstitch line inside it. It takes its own
    // fill, so a contrast neckline is possible. A band collar is the same strip, wider, with a
    // solid outer edge and a button.
    const banded = spec.collar?.type === "band" && takesCollar(type);
    const width = banded ? 10 : COLLAR_BAND;
    const edge = neckOffset(type, g, width);
    const st = neckOffset(type, g, width - 2);
    // Closed band: along the neck edge left to right, then back along the band's outer edge right to left.
    const band = `${top} L ${s(pt(CX + edge.half, edge.y))} ${necklinePath(type, edge.half, edge.y, edge.depth, -1)} Z`;
    const stitch = `M ${s(pt(CX - st.half, st.y))} ${necklinePath(type, st.half, st.y, st.depth)}`;
    parts.push(`<path d="${band}" fill="${fill}" stroke="none"/>`, `<path d="${top}" ${OUTLINE}/>`, `<path d="${stitch}" ${STITCH}/>`);
    if (banded) {
      parts.push(`<path d="M ${s(pt(CX - edge.half, edge.y))} ${necklinePath(type, edge.half, edge.y, edge.depth)}" ${DETAIL}/>`);
      parts.push(`<circle cx="${CX}" cy="${(neckBottom(g) + 5).toFixed(1)}" r="1.9" fill="#ffffff" stroke="${INK}" stroke-width="0.8"/>`);
    }
    // Piping: a thin solid cord just inside the neck edge.
    if (spec.details.trim === "piping") {
      const cord = neckOffset(type, g, 2.4);
      parts.push(`<path d="M ${s(pt(CX - cord.half, cord.y))} ${necklinePath(type, cord.half, cord.y, cord.depth)}" ${DETAIL}/>`);
    }
  }

  parts.push(...collarPieces(spec, g, fill));
  if (spec.details.bow === "neckline") parts.push(...bow(CX, neckBottom(g) + (type === "high" ? -2 : 6), 0.85, fill));
  return group("collar_neckline", parts);
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
        : pt(CX + g.waistHalf + 0.62 * (hemHalf - g.waistHalf), g.waistY + 0.3 * len); // bell: full from the waist down

  const hemDip = sil === "straight" ? 0 : sil === "a_line" ? 8 : 18; // curved hem for wider skirts
  // How far out the side seam is at height y, and how low the curved hem is at a fraction f across.
  const halfAt = (y: number) => quadAtY(g.waistR, sideCtrlR, hemR, clamp(y, g.waistY, g.hemY)).x - CX;
  const hemAt = (f: number) => g.hemY + (hemDip * (1 - f * f)) / 2;
  return { hemR, sideCtrlR, hemDip, hemHalf, len, halfAt, hemAt };
}

// Short lines that fan out below a seam: fabric gathered into it.
function gathers(y: number, half: number, count: number, length: number): string {
  let d = "";
  for (let i = 0; i < count; i++) {
    const f = count === 1 ? 0 : (i / (count - 1)) * 2 - 1; // -1..1 across the seam
    const x = CX + half * 0.9 * f;
    d += `M ${s(pt(x, y))} L ${s(pt(x + f * 1.6, y + length * (i % 2 ? 0.65 : 1)))} `;
  }
  return d.trim();
}

function skirt(spec: DesignSpec, g: Layout, fill: string) {
  const shape = skirtShape(spec, g);
  const { hemR, sideCtrlR, hemDip, hemHalf, len, halfAt, hemAt } = shape;
  const [waistL, hemL, sideCtrlL] = [g.waistR, hemR, sideCtrlR].map(mirror);
  const fullness = spec.skirt.fullness ?? "plain";
  const hem = spec.skirt.hem ?? "plain";
  const top = g.waistY + (g.hasBand ? g.bandHeight + 1.5 : 2); // just under the waistband

  // waist R -> down right side -> hem -> up left side -> waist L (top edge left open)
  const outline =
    `M ${s(g.waistR)} Q ${s(sideCtrlR)} ${s(hemR)} ` +
    `Q ${s(pt(CX, g.hemY + hemDip))} ${s(hemL)} Q ${s(sideCtrlL)} ${s(waistL)}`;

  const parts = [`<path d="${outline} Z" fill="${fill}" stroke="none"/>`, `<path d="${outline}" ${OUTLINE}/>`];
  const line = (a: Pt, b: Pt) => `M ${s(a)} L ${s(b)}`;
  const both = (a: Pt, b: Pt) => `${line(a, b)} ${line(mirror(a), mirror(b))}`;
  // A seam running across the skirt at height y, following the hem's curve.
  const across = (y: number) => {
    const half = halfAt(y);
    return `M ${s(pt(CX - half, y))} Q ${s(pt(CX, y + hemDip * 0.8))} ${s(pt(CX + half, y))}`;
  };

  if (fullness === "pleated") {
    // Pressed folds: straight lines from the waist to the hem, fanning out with the skirt.
    const folds = [0.22, 0.45, 0.68, 0.88].map((f) => both(pt(CX + g.waistHalf * f, top), pt(CX + hemHalf * f, hemAt(f))));
    parts.push(`<path d="${line(pt(CX, top), pt(CX, hemAt(0)))} ${folds.join(" ")}" ${DETAIL}/>`);
  } else if (spec.skirt.silhouette === "flared" && hem !== "tiered") {
    // Flared skirts get fold lines so the volume reads on a flat drawing.
    const folds = [0.25, 0.6].map((f) => both(pt(CX + g.waistHalf * f, g.waistY + 0.14 * len), pt(CX + hemHalf * f, hemAt(f))));
    parts.push(`<path d="${folds.join(" ")}" ${DETAIL}/>`);
  }
  if (fullness === "gathered") parts.push(`<path d="${gathers(top, g.waistHalf, 11, 11)}" ${DETAIL}/>`);

  if (hem === "ruffle" && len > 60) {
    // A gathered strip along the hem: its seam, and the gathers falling from it.
    const y = g.hemY - Math.min(26, len * 0.22);
    parts.push(`<path d="${across(y)}" ${DETAIL}/>`, `<path d="${gathers(y + hemDip * 0.4, halfAt(y), 13, 9)}" ${DETAIL}/>`);
  } else if (hem === "tiered" && len > 70) {
    // Two or three stacked tiers, each gathered onto the one above.
    for (const f of len > 130 ? [0.36, 0.68] : [0.5]) {
      const y = g.waistY + len * f;
      parts.push(`<path d="${across(y)}" ${DETAIL}/>`, `<path d="${gathers(y + hemDip * 0.4, halfAt(y), 11, 9)}" ${DETAIL}/>`);
    }
  } else if (hem === "slit") {
    // An opening running up from the hem, drawn as a narrow wedge.
    const f = 0.42;
    const x = CX + hemHalf * f;
    const open = pt(x - 2, g.hemY - Math.min(len * 0.4, 95));
    parts.push(`<path d="M ${s(pt(x - 5, hemAt(f)))} L ${s(open)} L ${s(pt(x + 4, hemAt(f)))}" ${DETAIL}/>`);
  }

  if (spec.skirt.panels === "front_seam") parts.push(`<path d="${line(pt(CX, top), pt(CX, hemAt(0)))}" ${DETAIL}/>`);
  if (spec.skirt.panels === "princess_seams") {
    parts.push(`<path d="${both(pt(CX + g.waistHalf * 0.5, g.waistY), pt(CX + hemHalf * 0.5, hemAt(0.5)))}" ${DETAIL}/>`);
  }

  if (spec.details.trim === "piping") {
    // A thin cord just above the hem.
    parts.push(`<path d="M ${s(pt(CX - hemHalf + 1.5, g.hemY - 3))} Q ${s(pt(CX, g.hemY + hemDip - 3))} ${s(pt(CX + hemHalf - 1.5, g.hemY - 3))}" ${DETAIL}/>`);
  } else if (spec.details.trim === "lace") {
    // A row of scallops hanging below the hem.
    const count = Math.max(6, Math.round((2 * hemHalf) / 9));
    let d = `M ${s(pt(CX - hemHalf, hemAt(1)))}`;
    for (let i = 1; i <= count; i++) {
      const [f0, f1] = [((i - 1) / count) * 2 - 1, (i / count) * 2 - 1];
      d += ` Q ${s(pt(CX + hemHalf * ((f0 + f1) / 2), hemAt((f0 + f1) / 2) + 6))} ${s(pt(CX + hemHalf * f1, hemAt(f1)))}`;
    }
    parts.push(`<path d="${d}" ${DETAIL}/>`);
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
  const parts: string[] = [];
  if (g.hasBand) {
    // Waistband: a strip below the waist line with a topstitch line inside it and its ends on
    // the skirt's side seams. It takes its own fill, so a contrast waistband is possible.
    const { halfAt } = skirtShape(spec, g);
    const h = g.bandHeight;
    const bandR = pt(CX + halfAt(g.waistY + h), g.waistY + h);
    const stitchR = pt(CX + halfAt(g.waistY + h - 2), g.waistY + h - 2);
    const [waistL, bandL, stitchL] = [g.waistR, bandR, stitchR].map(mirror);
    parts.push(
      `<path d="M ${s(waistL)} L ${s(g.waistR)} L ${s(bandR)} L ${s(bandL)} Z" fill="${fill}" stroke="none"/>`,
      // The fill covers the inner half of the skirt's side outline, so the two short ends are redrawn.
      `<path d="M ${s(waistL)} L ${s(bandL)} M ${s(g.waistR)} L ${s(bandR)}" ${OUTLINE}/>`,
      `<path d="M ${s(waistL)} L ${s(g.waistR)}" ${OUTLINE}/>`,
    );
    if (spec.waist.style === "belted") {
      // A belt: a solid lower edge and a buckle at the centre front.
      const y = g.waistY;
      parts.push(
        `<path d="M ${s(bandL)} L ${s(bandR)}" ${OUTLINE}/>`,
        `<path d="M ${CX - 8},${(y + 1.5).toFixed(1)} L ${CX + 8},${(y + 1.5).toFixed(1)} L ${CX + 8},${(y + h - 1.5).toFixed(1)} L ${CX - 8},${(y + h - 1.5).toFixed(1)} Z" fill="#ffffff" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/>`,
        `<path d="M ${CX - 1},${(y + h / 2).toFixed(1)} L ${CX + 8},${(y + h / 2).toFixed(1)}" ${DETAIL}/>`,
      );
    } else {
      parts.push(`<path d="M ${s(pt(stitchL.x + 2, stitchL.y))} L ${s(pt(stitchR.x - 2, stitchR.y))}" ${STITCH}/>`);
    }
  }
  if (spec.details.bow === "waist") parts.push(...bow(CX, g.waistY + (g.hasBand ? g.bandHeight / 2 : 0), 1, fill));
  return group("waist_seam", parts); // an empty group keeps layer names stable
}

// ---------- 5. Sleeves: right sleeve defined once, left = mirrored copy ----------

function rightSleevePaths(spec: DesignSpec, g: Layout, fill: string): string[] {
  const { type, length } = spec.sleeves;
  if (type === "none" || spec.neckline.type === "halter") return []; // a halter has no shoulder to hang a sleeve on
  const cuff = spec.sleeves.cuff ?? "none";
  const head = spec.sleeves.shoulder ?? "set_in";

  const { armR: pit, armCtrlR } = g;
  // Point a fraction t along the armhole curve, from the shoulder (0) to the underarm (1).
  const onArmhole = (t: number) =>
    pt(
      (1 - t) * (1 - t) * g.shoulderR.x + 2 * t * (1 - t) * armCtrlR.x + t * t * pit.x,
      (1 - t) * (1 - t) * g.shoulderR.y + 2 * t * (1 - t) * armCtrlR.y + t * t * pit.y,
    );
  // An off-shoulder sleeve starts partway down the armhole, on the upper arm.
  const dropped = head === "off_shoulder" && spec.neckline.type !== "off_shoulder";
  const top = dropped ? onArmhole(0.42) : g.shoulderR;
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
  const armhole = dropped ? `L ${s(top)}` : `Q ${s(armCtrlR)} ${s(top)}`; // reuses the bodice armhole curve exactly
  const across = pt(outer.x - cuffMid.x, outer.y - cuffMid.y); // from the middle of the cuff to its outer end

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
    // A puffed top stands up from the shoulder before the sleeve falls straight.
    outerEdge = head === "puff_top" ? `Q ${s(add(add(top, n, 17), u, L * 0.22))} ${s(outer)}` : `L ${s(outer)}`;
    cuffEdge = `L ${s(inner)}`;
  }

  const shape = `M ${s(top)} ${outerEdge} ${cuffEdge} L ${s(pit)} ${armhole}`;
  const paths = [`<path d="${shape} Z" fill="${fill}" stroke="none"/>`, `<path d="${shape}" ${OUTLINE}/>`];
  const ticks = (from: number) => {
    // Gather marks running up the sleeve from the cuff.
    let d = "";
    for (const t of [-0.5, 0, 0.5]) {
      const a = add(add(cuffMid, across, t), u, from);
      d += `M ${s(a)} L ${s(add(a, u, -10))} `;
    }
    return `<path d="${d.trim()}" ${DETAIL}/>`;
  };

  if (head === "puff_top" && type !== "cap") {
    // Gathers at the sleeve head, fanning out from the armhole.
    let d = "";
    for (const t of [0.12, 0.26, 0.4]) {
      const a = add(onArmhole(t), n, 2.5);
      d += `M ${s(a)} L ${s(add(add(a, n, 6), u, 2))} `;
    }
    paths.push(`<path d="${d.trim()}" ${DETAIL}/>`);
  }

  // How the sleeve ends. A puff sleeve always gathers into something, so with no cuff named it gets a band.
  const finish = type === "cap" ? "none" : cuff === "none" && type === "puff" ? "band" : cuff;
  if (finish === "band") {
    const [bandOuter, bandInner] = [add(outer, u, 8), add(inner, u, 8)];
    paths.push(`<path d="M ${s(outer)} L ${s(bandOuter)} L ${s(bandInner)} L ${s(inner)} Z" fill="${fill}" ${LINE}/>`);
    if (type === "puff") paths.push(ticks(0));
  } else if (finish === "ruffle") {
    // A frill: flares out past the sleeve and ends in a wavy edge.
    const [a, b] = [add(add(outer, u, 13), n, 5), add(add(inner, u, 13), n, -5)];
    const wave = [1, 2, 3].map((i) => {
      const [m0, m1] = [add(a, pt(b.x - a.x, b.y - a.y), (i - 0.5) / 3), add(a, pt(b.x - a.x, b.y - a.y), i / 3)];
      return `Q ${s(add(m0, u, 4))} ${s(m1)}`;
    });
    paths.push(`<path d="M ${s(outer)} L ${s(a)} ${wave.join(" ")} L ${s(inner)} Z" fill="${fill}" ${LINE}/>`, ticks(10));
  } else if (finish === "elastic") {
    // Pulled in by elastic: a stitched channel, gathers above it and a small frill below.
    paths.push(`<path d="M ${s(add(outer, u, -7))} L ${s(add(inner, u, -7))}" ${STITCH}/>`, ticks(-8));
  } else if (type === "fitted" && length !== "short") {
    paths.push(`<path d="M ${s(add(outer, u, -6))} L ${s(add(inner, u, -6))}" ${STITCH}/>`); // cuff hem stitch
  } else {
    paths.push(`<path d="M ${s(add(outer, u, -4))} L ${s(add(inner, u, -4))}" ${STITCH}/>`);
  }
  return paths;
}

// ---------- 6. Details ----------

function buttons(spec: DesignSpec, g: Layout, fill: string) {
  const wanted = clamp(Math.round(spec.details.buttons), 0, 8);
  // The placket is the strip the dress opens along. Specs from before the field existed drew one
  // whenever there were buttons, so a missing value keeps doing that.
  const placket = spec.details.placket ?? (wanted > 0 ? "bodice" : "none");
  const collar = neckOffset(spec.neckline.type, g, COLLAR_BAND);
  const underBow = spec.details.bow === "neckline" ? 16 : 0;
  const top = neckBottom(g) + collar.drop + 3 + underBow; // just below the neck band
  const bottom = placket === "full" ? skirtShape(spec, g).hemAt(0) - 8 : g.waistY - 6;
  // A deep neckline over a high waist leaves little room: draw only as many buttons as fit (8px each).
  const fits = Math.max(0, Math.floor((bottom - top) / 8));
  const count = Math.min(wanted, fits);
  if (fits === 0 || (count === 0 && placket === "none")) return group("buttons", []);

  const parts: string[] = [];
  if (placket !== "none") {
    parts.push(`<path d="M ${s(pt(CX - 6, top))} L ${s(pt(CX - 6, bottom))} M ${s(pt(CX + 6, top))} L ${s(pt(CX + 6, bottom))}" ${DETAIL}/>`);
  }
  const step = (bottom - top) / Math.max(1, count);
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
  const flip = mirrored ? ` patternTransform="matrix(-1 0 0 1 ${W} 0)"` : "";
  return paint(`fabric_${part}${mirrored ? "_mirrored" : ""}`, style.fill, style.pattern, defs, flip);
}

// Turns a color + pattern into a value for an SVG fill attribute. Solid gives the hex color;
// a fabric adds a <pattern> to defs under the given id and gives url(#id).
function paint(id: string, color: unknown, pattern: unknown, defs: string[], flip = ""): string {
  // The fill is pasted into the SVG markup, so only a plain 6-digit hex color is allowed through.
  const fill = typeof color === "string" && HEX_COLOR.test(color) ? color : DEFAULT_STYLE.fill;
  if (pattern !== "denim" && pattern !== "plaid" && pattern !== "floral") return fill; // solid, or unknown

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
  }[pattern as Exclude<Pattern, "solid">];
  defs.push(body);
  return `url(#${id})`;
}

// ---------- 8. Custom elements: hand-drawn strokes and closed shapes (manual drawing) ----------
// Contract: backend/CUSTOM_ELEMENTS.md. Points are in the same 400 x 600 canvas as the dress.
// Elements are drawn on top of the dress, lowest layer_order first, and are never mirrored.

const ELEMENT_ID = /^[A-Za-z0-9_-]{1,64}$/;
const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
const n2 = (v: number) => String(Number(v.toFixed(2))); // short numbers: long drawings have thousands of points

function customElement(el: CustomElement, index: number, defs: string[]): string {
  // The id goes into the markup, so anything but letters, digits, _ and - is replaced.
  const id = `custom_${typeof el.id === "string" && ELEMENT_ID.test(el.id) ? el.id : `element_${index}`}`;

  const points = (Array.isArray(el.points) ? el.points : [])
    .filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]))
    .map((p) => `${n2(clamp(p[0], -10000, 10000))},${n2(clamp(p[1], -10000, 10000))}`);
  if (points.length < 2) return ""; // nothing to draw
  const closed = el.closed === true && points.length >= 3;
  const d = `M ${points.join(" L ")}${closed ? " Z" : ""}`;

  // Only closed shapes can be filled; a fabric pattern needs a fill color to sit on.
  const fill = closed && typeof el.fill === "string" && HEX_COLOR.test(el.fill)
    ? paint(`fabric_${id}`, el.fill, el.pattern, defs)
    : "none";
  const stroke = typeof el.stroke === "string" && HEX_COLOR.test(el.stroke) ? el.stroke : "#222222";
  const rawWidth = num(el.stroke_width, 2);
  const width = rawWidth > 0 ? Math.min(rawWidth, 100) : 2; // contract: above 0, at most 100

  // Contract order: scale, then rotate around the canvas origin, then move. Written as one
  // matrix, which is the same thing as translate(x y) rotate(r) scale(sx sy).
  const tr = el.transform ?? ({} as Partial<CustomElement["transform"]>);
  const r = (clamp(num(tr.rotation, 0), -360, 360) * Math.PI) / 180;
  const sx = clamp(num(tr.scale_x, 1), 0.0001, 100);
  const sy = clamp(num(tr.scale_y, 1), 0.0001, 100);
  const m = [sx * Math.cos(r), sx * Math.sin(r), -sy * Math.sin(r), sy * Math.cos(r), num(tr.x, 0), num(tr.y, 0)];
  const transform = `transform="matrix(${m.map((v) => Number(v.toFixed(6))).join(" ")})"`;

  return (
    `<g id="${id}" ${transform}>` +
    `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${n2(width)}" stroke-linejoin="round" stroke-linecap="round"/>` +
    `</g>`
  );
}

// Markup for all visible custom elements, plus any fabric patterns they need.
// Use this to draw the elements on their own; buildFlat(spec, elements) already includes them.
export function buildCustomElements(elements: readonly CustomElement[] = []): { defs: string; markup: string } {
  const defs: string[] = [];
  const groups = (Array.isArray(elements) ? elements : [])
    .map((el, index) => ({ el, index }))
    .filter(({ el }) => el && el.visible !== false)
    .sort((a, b) => num(a.el.layer_order, 0) - num(b.el.layer_order, 0) || a.index - b.index)
    .map(({ el, index }) => customElement(el, index, defs))
    .filter(Boolean);
  const markup = groups.length ? `<g id="manual_drawing">${groups.join("")}</g>` : "";
  return { defs: defs.join(""), markup };
}

// ---------- 9. Assemble ----------

function group(name: PartName, children: string[], extra = "") {
  return `<g id="${name}" ${extra}>${children.join("")}</g>`;
}

// customElements is optional: without it the output is exactly the generated dress.
export function buildFlat(spec: DesignSpec, customElements: readonly CustomElement[] = []): string {
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

  const custom = buildCustomElements(customElements); // drawn last, so on top of the dress
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">` +
    `<defs>${defs.join("")}${custom.defs}</defs>${groups.join("")}${custom.markup}</svg>`
  );
}

export const FLAT_SIZE = { width: W, height: H };
export type { CustomElement };
