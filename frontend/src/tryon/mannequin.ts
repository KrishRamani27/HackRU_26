/*
 * TRY IT ON: draws a fashion figure and puts the builder's flat on it, so the dress looks
 * worn. Pure functions, SVG text in and out. Nothing here changes the spec, the builder or
 * the exported file.
 *
 * HOW THE FIGURE FITS THE DRESS
 *   The figure uses the builder's 400 x 600 canvas and its body landmarks:
 *     shoulder line y 70 · underarm y 150 · natural waist y 212 · hip y 276 · floor y 590
 *   The builder makes the whole dress wider or narrower with proportions.shoulder_width, so
 *   the standard figure takes that number and is sized to sit just inside the dress. The few
 *   builder measurements this relies on are in `build` below; if Builder/buildFlat.ts changes
 *   its layout(), change them here too.
 *
 * HOW CUSTOM MEASUREMENTS WORK
 *   Each body setting (see figure.ts) scales one part of that standard figure. The dress is
 *   then fitted to the body: it is made as wide as the body's largest measurement needs, and
 *   as long as the torso, by putting one transform on each of the builder's part groups. The
 *   builder's own output is not redrawn.
 *
 * HOW IT IS DRAWN
 *   Every body part is a short list of landmark points rounded into a curve by `smooth`.
 *   All parts are drawn twice: first with a thick outline, then again as plain fills on top.
 *   The fills hide every line that falls inside the body, so only one outline around the
 *   whole figure is left and the parts read as a single body.
 */

import { cleanFigure, type FigureOptions, type HairStyle } from "./figure";

const CX = 200;
const FLOOR = 590;
const SHOULDER_LINE = 70;
const HIP_LINE = 276;

type Pt = readonly [number, number];
type Side = (pt: Pt) => Pt;
const f = (n: number) => String(Number(n.toFixed(1)));
const p = ([x, y]: Pt) => `${f(x)},${f(y)}`;
const mirror: Side = ([x, y]) => [2 * CX - x, y];
const same: Side = (pt) => pt;
// The head, face and hair are laid out on a small reference head (top y 8, chin y 50, 29 wide)
// and enlarged by this, so the figure is about nine and a half heads tall like a fashion
// drawing. A smaller head makes the body look stretched and unnatural. The top of the head
// goes a little above the canvas, which the on-screen canvas allows.
const HEAD_X = 1.5;
const HEAD_Y = 60 / 42;
const CHIN = 52;
const onHead: Side = ([x, y]) => [CX + (x - CX) * HEAD_X, CHIN + (y - 50) * HEAD_Y];
/** A list of right-side points made into a closed outline by adding the mirrored left side. */
const bothSides = (right: readonly Pt[]) => [...right, ...right.slice(1, -1).map(mirror).reverse()];

// A smooth curve through a list of points (Catmull-Rom, written as SVG cubic curves).
function smooth(points: readonly Pt[], closed = true): string {
  const n = points.length;
  const at = (i: number) => (closed ? points[((i % n) + n) % n] : points[Math.min(n - 1, Math.max(0, i))]);
  let d = `M ${p(points[0])}`;
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C ${p(c1)} ${p(c2)} ${p(p2)}`;
  }
  return closed ? `${d} Z` : d;
}

// Mixes two hex colors. Used for the outline (skin, darkened) and the lips.
function mix(a: string, b: string, amount: number): string {
  const ch = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  return `#${[0, 1, 2].map((i) => Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * amount).toString(16).padStart(2, "0")).join("")}`;
}

// ---------- 1. Measurements: everything the drawing needs, worked out once ----------

function build(shoulderWidth: number, o: FigureOptions) {
  const sw = Number.isFinite(shoulderWidth) ? Math.min(1, Math.max(0, shoulderWidth)) : 0.5;
  // Builder: shoulder half-width = 50 + 40 * shoulder_width, bust = shoulder - 6, waist = bust - 16,
  // and the waist seam can sit anywhere from y 175 (empire) to y 250 (dropped). The standard
  // body stays a little inside the dress at every one of those heights.
  const sh = 50 + 40 * sw;

  // Longer legs take their length from the torso, so the shoulder line and the floor stay put.
  const torso = (FLOOR - SHOULDER_LINE - (FLOOR - HIP_LINE) * o.leg) / (HIP_LINE - SHOULDER_LINE);
  const yTorso = (y: number) => (y <= SHOULDER_LINE ? y : SHOULDER_LINE + (y - SHOULDER_LINE) * torso);
  const yLeg = (y: number) => FLOOR - (FLOOR - y) * o.leg;

  const shoulder = (sh - 9) * o.shoulders;
  // The dress as fitted to this body: wide enough for the largest measurement, as long as the torso.
  const dressX = Math.max(o.shoulders, o.bust, o.waist, o.hips);
  return {
    yTorso,
    yLeg,
    neck: 8.6 * o.neck,
    shoulder,
    shoulderY: yTorso(SHOULDER_LINE + 0.28 * (sh - 9 - 26) + 4), // just under the builder's shoulder seam
    bust: (sh - 17) * o.bust,
    ribs: (sh - 27) * ((o.bust + o.waist) / 2), // y 176, inside an empire waist seam
    waist: (sh - 33) * o.waist, // y 212, natural waist
    lowHip: (sh - 27) * ((o.waist + o.hips) / 2), // y 250, inside a dropped waist seam
    hip: (sh - 22) * o.hips, // y 276, fullest part
    // Arms start where the fitted dress has its sleeves, so a sleeve always sits on its arm.
    armBase: [CX + (sh - 3) * dressX, yTorso(116)] as Pt,
    armLength: o.arm,
    limb: Math.sqrt((o.bust + o.waist + o.hips) / 3), // arms and legs thicken a little with the body
    dressX,
    dressY: torso,
    height: o.height,
  };
}
type Body = ReturnType<typeof build>;

// ---------- 2. Body parts: each returns the outline of one closed shape ----------

// Arms hang 20° out from vertical, on the line the builder uses for sleeves.
const ARM_ANGLE = (20 * Math.PI) / 180;
const DOWN: Pt = [Math.sin(ARM_ANGLE), Math.cos(ARM_ANGLE)];
const OUT: Pt = [Math.cos(ARM_ANGLE), -Math.sin(ARM_ANGLE)];

/** A point `s` down the arm from the shoulder and `across` to the outside (+) or inside (-). */
function onArm(b: Body, side: Side) {
  return (s: number, across: number): Pt => {
    const along = s > 0 ? s * b.armLength : s;
    const wide = across * b.limb;
    return side([b.armBase[0] + DOWN[0] * along + OUT[0] * wide, b.armBase[1] + DOWN[1] * along + OUT[1] * wide]);
  };
}

function arm(b: Body, side: Side): string {
  const a = onArm(b, side);
  return smooth([
    a(-37, -3), a(-33, 5), a(-23, 10.5), a(4, 12), // shoulder cap, rounding out from the shoulder point
    a(55, 10.5), a(104, 9), // upper arm down to the elbow
    a(132, 9), a(170, 7.2), a(202, 5.2), // forearm to the wrist
    a(214, 6.8), a(230, 6), a(248, 1.5), // back of the hand to the fingertips
    a(243, -3), a(228, -5), a(221, -9.5), a(213, -8.5), a(202, -5.2), // palm side, thumb, back to the wrist
    a(170, -7.2), a(132, -9), a(104, -9), // inner forearm, elbow
    a(55, -10.5), a(4, -12), a(-20, -11), // inner upper arm
  ]);
}

/** Leg landmarks are distances out from the centre line for hips 48 wide and standard legs. */
function onLeg(b: Body, side: Side) {
  // The top of the leg matches this body's hips exactly; from the knee down the change is
  // limited, so narrow hips do not give stick-thin legs.
  const atHip = b.hip / 48;
  const below = Math.min(1.25, Math.max(0.84, atHip)) * (0.5 + 0.5 * b.limb);
  return (x: number, y: number): Pt => {
    const t = Math.min(1, Math.max(0, (y - HIP_LINE) / 110));
    return side([CX + x * (atHip + (below - atHip) * t), b.yLeg(y)]);
  };
}

function leg(b: Body, side: Side): string {
  const at = onLeg(b, side);
  return smooth([
    at(36, 248), at(48, 277), at(48, 304), at(45, 345), at(41, 388), // outer thigh to the knee
    at(40.5, 415), at(41, 445), at(37, 495), at(30, 538), at(27.5, 553), // calf to the ankle
    at(31, 567), at(32.5, 580), at(28.5, 589.5), at(21, 591), at(15.5, 588.5), at(14.5, 577), // foot, toes down
    at(17, 553), at(18, 538), at(19.5, 495), at(20.5, 445), // inner ankle and calf
    at(19, 415), at(18, 388), at(9, 345), at(2.5, 306), at(1, 288), // inner knee and thigh
    at(18, 262),
  ]);
}

function torso(b: Body): string {
  const y = b.yTorso;
  const hipY = y(HIP_LINE);
  return smooth(
    bothSides([
      [CX, 46], [CX + b.neck, 48], [CX + b.neck + 0.5, 60], // neck
      [CX + b.neck + 6, 68], [CX + Math.max(b.neck + 13, b.shoulder * 0.52), b.shoulderY - 8.5], // slope out to the shoulder
      [CX + b.shoulder, b.shoulderY],
      [CX + b.bust + 3, y(112)], [CX + b.bust, y(138)], [CX + b.ribs + 5, y(160)], // side of the bust
      [CX + b.ribs, y(176)], [CX + b.waist, y(212)], [CX + b.lowHip, y(250)], [CX + b.hip, hipY], // waist in, hips out
      [CX + b.hip - 3, hipY + 14], [CX + b.hip * 0.45, hipY + 24], [CX, hipY + 24], // under the hips, hidden by the legs
    ]),
  );
}

function head(): string {
  // Oval face that narrows to the chin.
  const right: Pt[] = [[CX, 8], [CX + 10, 11], [CX + 14.5, 22], [CX + 14, 33], [CX + 9.5, 44], [CX, 50]];
  return smooth(bothSides(right.map(onHead)));
}

// ---------- 3. Hair ----------

const circle = ([x, y]: Pt, r: number, fill: string) => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${fill}"/>`;

/** Hair behind the head. Drawn first, so it only shows around the face and neck. */
function hairBack(style: HairStyle, color: string): string {
  if (style === "curly") {
    // A ring of overlapping curls around the head.
    const curls: Pt[] = [];
    for (let deg = 155; deg <= 385; deg += 23) {
      const r = (deg * Math.PI) / 180;
      curls.push(onHead([CX + 19 * Math.cos(r), 27 + 21 * Math.sin(r)]));
    }
    return curls.map((c) => circle(c, 14, color)).join("") + circle(onHead([CX, 22]), 25, color);
  }
  const shapes: Record<Exclude<HairStyle, "curly">, Pt[]> = {
    bob: [[CX, 3], [CX + 13, 6], [CX + 21, 18], [CX + 22, 34], [CX + 21, 48], [CX + 16, 60], [CX + 9, 61], [CX, 57]],
    long: [[CX, 3], [CX + 13, 6], [CX + 21, 18], [CX + 23, 36], [CX + 24, 58], [CX + 27, 84], [CX + 24, 104], [CX, 108]],
    short: [[CX, 4], [CX + 12, 6.5], [CX + 17.5, 17], [CX + 17, 30], [CX + 13, 40], [CX, 44]],
  };
  return `<path d="${smooth(bothSides(shapes[style].map(onHead)))}" fill="${color}" stroke="none"/>`;
}

/** The hairline, drawn over the top of the head: parted off-centre and swept across. */
function hairFront(style: HairStyle, color: string): string {
  const hairline: Pt[] = [
    [CX - 15.5, 30], [CX - 17, 18], [CX - 10, 6], [CX + 2, 4], [CX + 13, 8], [CX + 17, 19], [CX + 15.5, 30],
    [CX + 13, 22], [CX + 7, 16], [CX - 3, 13.5], [CX - 9, 17], [CX - 13, 23],
  ];
  const base = `<path d="${smooth(hairline.map(onHead))}" fill="${color}" stroke="none"/>`;
  if (style !== "curly") return base;
  const top: Pt[] = [[CX - 11, 12], [CX - 3, 8.5], [CX + 6, 9], [CX + 13, 14]];
  return base + top.map((c) => circle(onHead(c), 9, color)).join("");
}

/** Long hair falls in front of the shoulders, so this part is drawn over the dress. */
function hairOverDress(style: HairStyle, color: string, b: Body): string {
  if (style !== "long") return "";
  const end = b.yTorso(134);
  const strand: Pt[] = [
    [CX + 22, 24], [CX + 31, 44], [CX + 34, 66], [CX + 37, 92], [CX + 36, end - 14], [CX + 29, end],
    [CX + 22, end - 12], [CX + 23, 96], [CX + 20.5, 74], [CX + 19.5, 48],
  ];
  const lock = (side: Side) => smooth(strand.map(side));
  return `<path d="${lock(same)}" fill="${color}" stroke="none"/><path d="${lock(mirror)}" fill="${color}" stroke="none"/>`;
}

// ---------- 4. Details that make it read as a person ----------

function details(b: Body, edge: string, lips: string, hair: string): string {
  const y = b.yTorso;
  const line = `fill="none" stroke="${edge}" stroke-width="0.8" stroke-opacity="0.8" stroke-linecap="round"`;
  const pair = (draw: (side: Side) => string) => `${draw(same)} ${draw(mirror)}`;
  const q = (side: Side, a: Pt, c: Pt, e: Pt) => `M ${p(side(a))} Q ${p(side(c))} ${p(side(e))}`;

  const collarbone = pair((s) => q(s, [CX + 5, 79], [CX + 20, 75.5], [CX + 38, 78]));
  const bustLine = pair((s) => q(s, [CX + 7, y(151)], [CX + b.bust * 0.55, y(161)], [CX + b.bust - 7, y(149)]));
  const navel = `M ${p([CX - 1.5, y(236)])} Q ${p([CX, y(239)])} ${p([CX + 1.5, y(236)])}`;
  const knee = pair((s) => {
    const at = onLeg(b, s);
    return `M ${p(at(24, 392))} Q ${p(at(30, 397))} ${p(at(36, 392))}`;
  });
  const fingers = pair((s) => {
    const a = onArm(b, s);
    return `M ${p(a(230, 3))} L ${p(a(243, 1.8))} M ${p(a(230, 0))} L ${p(a(244, -0.6))} M ${p(a(229, -2.8))} L ${p(a(240, -2.6))}`;
  });

  // Face, laid out on the reference head: brows, lowered eyes with lashes, the side of the nose,
  // lips and a little colour on the cheeks. Kept light, like a fashion illustration.
  const h = (x: number, y: number) => onHead([CX + x, y]);
  const face = (draw: (sign: number) => string) => `${draw(1)} ${draw(-1)}`;
  const brow = face((k) => `M ${p(h(k * 3.2, 24.6))} Q ${p(h(k * 6.6, 22.9))} ${p(h(k * 10.4, 24.8))}`);
  const eye = face((k) => `M ${p(h(k * 3.6, 28.2))} Q ${p(h(k * 6.6, 30.1))} ${p(h(k * 9.8, 27.9))}`);
  const lash = face((k) => `M ${p(h(k * 9.8, 27.9))} L ${p(h(k * 10.9, 27.2))}`);
  const nose = `M ${p(h(0.4, 31.5))} Q ${p(h(1.7, 35.2))} ${p(h(-0.5, 36))} M ${p(h(-1.7, 36.3))} Q ${p(h(0, 37))} ${p(h(1.7, 36.3))}`;
  const upperLip = `M ${p(h(-3.6, 40.4))} Q ${p(h(-1.6, 39))} ${p(h(0, 39.8))} Q ${p(h(1.6, 39))} ${p(h(3.6, 40.4))} Q ${p(h(0, 41))} ${p(h(-3.6, 40.4))} Z`;
  const lowerLip = `M ${p(h(-3.6, 40.4))} Q ${p(h(0, 41))} ${p(h(3.6, 40.4))} Q ${p(h(0, 43.8))} ${p(h(-3.6, 40.4))} Z`;
  const cheek = (k: number) => `<circle cx="${f(h(k * 8.6, 34.4)[0])}" cy="${f(h(k * 8.6, 34.4)[1])}" r="4.2" fill="#e0707a" fill-opacity="0.16"/>`;
  // A soft shadow under the chin separates the head from the neck.
  const chinShadow = `M ${p([CX - b.neck, CHIN - 2])} Q ${p([CX, CHIN + 9])} ${p([CX + b.neck, CHIN - 2])} Q ${p([CX, CHIN + 3])} ${p([CX - b.neck, CHIN - 2])} Z`;

  return (
    `<path d="${chinShadow}" fill="#000000" fill-opacity="0.1" stroke="none"/>` +
    `<path d="${collarbone} ${bustLine} ${navel} ${knee} ${fingers} ${nose}" ${line}/>` +
    `${cheek(1)}${cheek(-1)}` +
    `<path d="${brow}" fill="none" stroke="${hair}" stroke-width="1.3" stroke-linecap="round"/>` +
    `<path d="${eye} ${lash}" fill="none" stroke="#2a1d18" stroke-width="1.1" stroke-linecap="round"/>` +
    `<path d="${upperLip}" fill="${mix(lips, "#5a1f24", 0.25)}" stroke="none"/><path d="${lowerLip}" fill="${lips}" stroke="none"/>`
  );
}

// Under a top or a skirt the figure wears a plain bodysuit, from the bust to the hips, so
// the part of the body the garment leaves bare is still dressed.
function bodysuit(b: Body): string {
  const y = b.yTorso;
  const hipY = y(HIP_LINE);
  const outline = smooth(
    bothSides([
      [CX, y(118)], [CX + b.bust * 0.55, y(112)], [CX + b.bust + 2, y(120)], [CX + b.bust, y(138)], [CX + b.ribs + 5, y(160)],
      [CX + b.ribs, y(176)], [CX + b.waist, y(212)], [CX + b.lowHip, y(250)], [CX + b.hip, hipY],
      [CX + b.hip - 3, hipY + 12], [CX + b.hip * 0.45, hipY + 22], [CX, hipY + 24],
    ]),
  );
  return `<path d="${outline}" fill="#ece7df" stroke="#b9ad9d" stroke-width="0.9" stroke-linejoin="round"/>`;
}

function shadow(): string {
  const [cy, rx, ry] = [FLOOR + 1, 58, 4.5];
  return (
    `<path d="M ${f(CX - rx)},${cy} A ${rx} ${ry} 0 1 0 ${f(CX + rx)},${cy} ` +
    `A ${rx} ${ry} 0 1 0 ${f(CX - rx)},${cy} Z" fill="#221d19" fill-opacity="0.08" stroke="none"/>`
  );
}

// ---------- 5. Assemble ----------

type Matrix = readonly [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];
const multiply = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];
const isIdentity = (m: Matrix) => m.every((v, i) => Math.abs(v - IDENTITY[i]) < 1e-6);
const attr = (m: Matrix) => `transform="matrix(${m.map((v) => Number(v.toFixed(5))).join(" ")})"`;

/** Height: the whole scene grows or shrinks around the spot where the figure stands. */
function heightMatrix(b: Body): Matrix {
  return [b.height, 0, 0, b.height, CX * (1 - b.height), FLOOR * (1 - b.height)];
}

/** The dress fitted to the body: widened around the centre line, lengthened from the shoulder line. */
function dressMatrix(b: Body): Matrix {
  const fit: Matrix = [b.dressX, 0, 0, b.dressY, CX * (1 - b.dressX), SHOULDER_LINE * (1 - b.dressY)];
  return multiply(heightMatrix(b), fit);
}

function figureParts(shoulderWidth: number, options?: Partial<FigureOptions>, garment = "dress") {
  const o = cleanFigure(options);
  const b = build(shoulderWidth, o);
  const edge = mix(o.skin, "#3a1f12", 0.3);
  const lips = mix(o.skin, "#b23f48", 0.55);
  const shapes = [arm(b, mirror), arm(b, same), leg(b, mirror), leg(b, same), torso(b), head()];
  // Outlines first, plain fills on top: only the outline around the whole body survives.
  const outlines = shapes.map((d) => `<path d="${d}" fill="${o.skin}" stroke="${edge}" stroke-width="2.2" stroke-linejoin="round"/>`).join("");
  const fills = shapes.map((d) => `<path d="${d}" fill="${o.skin}" stroke="none"/>`).join("");
  const stand = isIdentity(heightMatrix(b)) ? "" : ` ${attr(heightMatrix(b))}`;
  const over = hairOverDress(o.hair, o.hairColor, b);
  return {
    body: b,
    under:
      `<g id="mannequin"${stand}>${shadow()}${hairBack(o.hair, o.hairColor)}${outlines}${fills}` +
      `${details(b, edge, lips, mix(o.hairColor, "#1a1410", 0.35))}${garment === "dress" ? "" : bodysuit(b)}${hairFront(o.hair, o.hairColor)}</g>`,
    over: over ? `<g id="mannequin_over"${stand}>${over}</g>` : "",
  };
}

/** The figure on its own, as SVG groups, for a dress of the given shoulder width. */
export function mannequinMarkup(shoulderWidth = 0.5, options?: Partial<FigureOptions>, garment = "dress"): string {
  const { under, over } = figureParts(shoulderWidth, options, garment);
  return under + over;
}

// The groups buildFlat puts directly inside <svg>. Each gets the fitting transform itself, so
// they stay top-level and the canvas can still find and select them.
const DRESS_GROUP =
  /<g id="(left_sleeve|right_sleeve|skirt|bodice|waist_seam|collar_neckline|pockets|buttons|manual_drawing)"(?: transform="matrix\(([^)]*)\)")?\s*>/g;

/**
 * Takes the builder's SVG text and returns it with the figure wearing the dress.
 * Pass the spec's proportions.shoulder_width so the figure fits the dress, and the figure
 * settings if the user has changed any. The dress groups keep their ids and stay clickable.
 * `garment` is the spec's garment_type: under a top or a skirt the figure wears a bodysuit.
 */
export function wearOnMannequin(flatSvg: string, shoulderWidth = 0.5, options?: Partial<FigureOptions>, garment = "dress"): string {
  const start = flatSvg.indexOf("</defs>");
  const end = flatSvg.lastIndexOf("</svg>");
  if (start === -1 || end === -1) return flatSvg; // not builder output; leave it alone
  const cut = start + "</defs>".length;
  const { body, under, over } = figureParts(shoulderWidth, options, garment);

  let dress = flatSvg.slice(cut, end);
  const fit = dressMatrix(body);
  if (!isIdentity(fit)) {
    dress = dress.replace(DRESS_GROUP, (_all, id: string, existing?: string) => {
      const own = existing ? (existing.trim().split(/[\s,]+/).map(Number) as unknown as Matrix) : IDENTITY;
      const valid = own.length === 6 && own.every(Number.isFinite);
      return `<g id="${id}" ${attr(multiply(fit, valid ? own : IDENTITY))}>`;
    });
  }
  return flatSvg.slice(0, cut) + under + dress + over + flatSvg.slice(end);
}
