/*
 * TRY IT ON: draws a simple fashion figure and puts it behind the builder's flat, so the
 * dress looks worn. Pure functions, SVG text in and out. Nothing here changes the spec,
 * the builder or the exported file.
 *
 * The figure uses the builder's 400 x 600 canvas and its body landmarks, so every dress
 * lines up:
 *   shoulder line y 70 · underarm y 150 · natural waist y 212 · hip y 250
 *   hems: mini 300, knee 380, midi 460, floor 560
 * Arms hang 20° out from vertical on the same axis the builder uses for sleeves, so a
 * sleeve of any length sits over the arm.
 *
 * The builder makes the whole dress wider or narrower with proportions.shoulder_width, so
 * the figure takes the same number and is sized to fit inside the dress. The few builder
 * measurements it relies on are copied in `frame` below; if Builder/buildFlat.ts changes
 * its layout(), change them here too.
 */

const CX = 200;
const SKIN = "#f2dccb";
const EDGE = "#c59d85";
const HAIR = "#3d2b23";
const BODY = `fill="${SKIN}" stroke="${EDGE}" stroke-width="1.1" stroke-linejoin="round" stroke-linecap="round"`;
const CONTOUR = `fill="none" stroke="${EDGE}" stroke-width="0.8" stroke-opacity="0.75" stroke-linecap="round"`;

type Pt = readonly [number, number];
const f = (n: number) => n.toFixed(1);
const p = ([x, y]: Pt) => `${f(x)},${f(y)}`;
const mirror = ([x, y]: Pt): Pt => [2 * CX - x, y];
const same = (pt: Pt): Pt => pt;

// A smooth curve through a list of points (Catmull-Rom, written as SVG cubic curves).
// Body shapes are given as a few landmark points and rounded off by this, which is what
// makes the figure look drawn by hand and not built from straight lines.
function smooth(points: readonly Pt[], closed: boolean): string {
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

// Body half-widths for a dress of the given shoulder width (0 to 1, 0.5 = natural).
// Builder: shoulder half-width = 50 + 40 * shoulder_width, bust = shoulder - 6, waist = bust - 16,
// and the waist seam can sit anywhere from y 175 (empire) to y 250 (dropped). The body stays
// a little inside the dress at every one of those heights.
function frame(shoulderWidth: number) {
  const sw = Number.isFinite(shoulderWidth) ? Math.min(1, Math.max(0, shoulderWidth)) : 0.5;
  const sh = 50 + 40 * sw;
  return {
    sh,
    shoulder: sh - 9,
    bust: sh - 17,
    ribs: sh - 27, // y 176, just inside an empire waist seam
    waist: sh - 33, // y 212, natural waist
    lowHip: sh - 27, // y 250, just inside a dropped waist seam
    hip: sh - 22, // y 276, fullest part
    armBase: [CX + sh - 3, 116] as Pt, // where the builder anchors a sleeve
  };
}
type Frame = ReturnType<typeof frame>;

// One arm, right side. The centre line starts where the builder anchors a sleeve and runs
// down the arm; `across` is how far a point sits to the outside (+) or inside (-) of it.
const ARM_ANGLE = (20 * Math.PI) / 180;
const DOWN: Pt = [Math.sin(ARM_ANGLE), Math.cos(ARM_ANGLE)];
const OUT: Pt = [Math.cos(ARM_ANGLE), -Math.sin(ARM_ANGLE)];

function arm(b: Frame, side: (pt: Pt) => Pt): string {
  const along = (s: number, across: number): Pt =>
    side([b.armBase[0] + DOWN[0] * s + OUT[0] * across, b.armBase[1] + DOWN[1] * s + OUT[1] * across]);
  const outline = [
    along(-30, 0), along(-18, 10), along(4, 12), // shoulder cap
    along(55, 10.5), along(104, 9), // upper arm down to the elbow
    along(132, 9), along(170, 7.2), along(202, 5.2), // forearm to the wrist
    along(216, 6.5), along(232, 5.5), along(246, 1.5), // back of the hand to the fingertips
    along(240, -3), along(222, -4.5), along(202, -5.2), // palm side back to the wrist
    along(170, -7.2), along(132, -9), along(104, -9), // inner forearm, elbow
    along(55, -10.5), along(4, -12), along(-18, -10), // inner upper arm
  ];
  return `<path d="${smooth(outline, true)}" ${BODY}/>`;
}

function leg(b: Frame, side: (pt: Pt) => Pt): string {
  // Landmarks are distances out from the centre line for hips 48 wide. The top of the leg is
  // scaled to match this body's hips exactly; from the knee down the change is limited, so a
  // narrow dress does not give stick-thin legs.
  const atHip = b.hip / 48;
  const below = Math.min(1.12, Math.max(0.84, atHip));
  const at = (x: number, y: number): Pt => {
    const t = Math.min(1, Math.max(0, (y - 276) / 110));
    return side([CX + x * (atHip + (below - atHip) * t), y]);
  };
  const outline = [
    at(36, 248), at(48, 277), at(48, 304), at(45, 345), at(41, 388), // outer thigh to the knee
    at(40.5, 415), at(41, 445), at(37, 495), at(30, 538), at(27.5, 553), // calf to the ankle
    at(30, 566), at(30.5, 579), at(26, 589), at(19, 589.5), at(16.5, 578), // foot, toes down
    at(17, 553), at(18, 538), at(19.5, 495), at(20.5, 445), // inner ankle and calf
    at(19, 415), at(18, 388), at(9, 345), at(2.5, 306), at(1, 288), // inner knee and thigh
    at(18, 262),
  ];
  const knee = `M ${p(at(24, 392))} Q ${p(at(30, 397))} ${p(at(36, 392))}`;
  return `<path d="${smooth(outline, true)}" ${BODY}/><path d="${knee}" ${CONTOUR}/>`;
}

function torso(b: Frame): string {
  // Right side from the neck down to the hip. The builder's shoulder seam drops 0.28 per px
  // out from the neck (starting 26 out, at y 70); the shoulder stays just under that line.
  const seam = (x: number) => 70 + 0.28 * (x - 26);
  const right: Pt[] = [
    [CX + 6.5, 44], [CX + 7, 58], [CX + 14, 67], [CX + 30, seam(30) + 3], // neck out to the shoulder
    [CX + b.shoulder, seam(b.shoulder) + 4], // shoulder point
    [CX + b.bust + 3, 112], [CX + b.bust, 138], [CX + b.ribs + 5, 160], // side of the bust
    [CX + b.ribs, 176], [CX + b.waist, 212], [CX + b.lowHip, 250], [CX + b.hip, 276], // waist in, hips out
  ];
  const left = right.map(mirror).reverse();
  // The fill dips below the hips so the tops of the legs join it with no gap. Only the two
  // sides get an outline, so no line is drawn across the thighs.
  const fill = `${smooth(right, false)} Q ${p([CX, 318])} ${p(left[0])} ${smooth(left, false).replace(/^M [^ ]+/, "")} Z`;
  const collarbone = (side: (pt: Pt) => Pt) =>
    `M ${p(side([CX + 5, 79]))} Q ${p(side([CX + 20, 75.5]))} ${p(side([CX + 38, 78]))}`;
  return (
    `<path d="${fill}" fill="${SKIN}" stroke="none"/>` +
    `<path d="${smooth(right, false)} ${smooth(left, false)}" fill="none" stroke="${EDGE}" stroke-width="1.1" stroke-linejoin="round" stroke-linecap="round"/>` +
    `<path d="${collarbone(same)} ${collarbone(mirror)}" ${CONTOUR}/>`
  );
}

// Chin-length hair. The back is drawn before the head and shows around it; the front is
// drawn on top as a side-swept hairline.
function hairBack(): string {
  const right: Pt[] = [[CX, 3], [CX + 13, 6], [CX + 21, 18], [CX + 22, 34], [CX + 21, 48], [CX + 16, 60], [CX + 9, 61], [CX, 57]];
  const outline = [...right, ...right.slice(1, -1).map(mirror).reverse()];
  return `<path d="${smooth(outline, true)}" fill="${HAIR}" stroke="none"/>`;
}

function head(): string {
  // Oval face that narrows to the chin.
  const right: Pt[] = [[CX, 8], [CX + 10, 11], [CX + 14.5, 22], [CX + 14, 33], [CX + 9.5, 44], [CX, 50]];
  const outline = [...right, ...right.slice(1, -1).map(mirror).reverse()];
  // A light touch of a face: closed eyes, the side of the nose, lips.
  const eye = (side: (pt: Pt) => Pt) => `M ${p(side([CX + 3.4, 28.4]))} Q ${p(side([CX + 6.4, 30]))} ${p(side([CX + 9.4, 28.2]))}`;
  const nose = `M ${p([CX + 0.3, 33])} Q ${p([CX + 1.5, 35.6])} ${p([CX - 0.4, 36.2])}`;
  const lips = `M ${p([CX - 3.4, 40.6])} Q ${p([CX, 39.2])} ${p([CX + 3.4, 40.6])} Q ${p([CX, 43])} ${p([CX - 3.4, 40.6])} Z`;
  return (
    `<path d="${smooth(outline, true)}" ${BODY}/>` +
    `<path d="${eye(same)} ${eye(mirror)}" fill="none" stroke="${HAIR}" stroke-width="0.9" stroke-linecap="round"/>` +
    `<path d="${nose}" ${CONTOUR}/>` +
    `<path d="${lips}" fill="#c9756c" stroke="none"/>`
  );
}

function hairFront(): string {
  // From the left temple over the crown to the right temple, then back along a hairline
  // that parts off-centre and sweeps across the forehead.
  const outline: Pt[] = [
    [CX - 15.5, 30], [CX - 17, 18], [CX - 10, 6], [CX + 2, 4], [CX + 13, 8], [CX + 17, 19], [CX + 15.5, 30],
    [CX + 13, 22], [CX + 7, 16], [CX - 3, 13.5], [CX - 9, 17], [CX - 13, 23],
  ];
  return `<path d="${smooth(outline, true)}" fill="${HAIR}" stroke="none"/>`;
}

function shadow(): string {
  const [cy, rx, ry] = [591, 58, 4.5];
  return (
    `<path d="M ${f(CX - rx)},${cy} A ${rx} ${ry} 0 1 0 ${f(CX + rx)},${cy} ` +
    `A ${rx} ${ry} 0 1 0 ${f(CX - rx)},${cy} Z" fill="#221d19" fill-opacity="0.08" stroke="none"/>`
  );
}

/**
 * The figure on its own, as one SVG group, sized for a dress of the given shoulder width.
 * Drawn back to front: shadow, back of the hair, arms, legs, torso, head, front of the hair.
 */
export function mannequinMarkup(shoulderWidth = 0.5): string {
  const b = frame(shoulderWidth);
  return (
    `<g id="mannequin">${shadow()}${hairBack()}${arm(b, mirror)}${arm(b, same)}` +
    `${leg(b, mirror)}${leg(b, same)}${torso(b)}${head()}${hairFront()}</g>`
  );
}

/**
 * Takes the builder's SVG text and returns it with the figure drawn behind the dress.
 * Pass the spec's proportions.shoulder_width so the figure fits the dress. The dress groups
 * are untouched, so parts stay clickable and editable.
 */
export function wearOnMannequin(flatSvg: string, shoulderWidth = 0.5): string {
  const at = flatSvg.indexOf("</defs>");
  if (at === -1) return flatSvg; // not builder output; leave it alone
  const cut = at + "</defs>".length;
  return flatSvg.slice(0, cut) + mannequinMarkup(shoulderWidth) + flatSvg.slice(cut);
}
