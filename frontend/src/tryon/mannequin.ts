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
const SKIN = "#eadfd2";
const EDGE = "#b7a996";
const BODY = `fill="${SKIN}" stroke="${EDGE}" stroke-width="1.2" stroke-linejoin="round" stroke-linecap="round"`;

type Pt = readonly [number, number];
const f = (n: number) => n.toFixed(1);
const p = ([x, y]: Pt) => `${f(x)},${f(y)}`;
const mirror = ([x, y]: Pt): Pt => [2 * CX - x, y];

// Body half-widths for a dress of the given shoulder width (0 to 1, 0.5 = natural).
// Builder: shoulder half-width = 50 + 40 * shoulder_width, bust = shoulder - 6, waist = bust - 16,
// straight-skirt hip = waist + 16. The body sits a little inside each of those.
function frame(shoulderWidth: number) {
  const sw = Number.isFinite(shoulderWidth) ? Math.min(1, Math.max(0, shoulderWidth)) : 0.5;
  const sh = 50 + 40 * sw;
  return {
    shoulder: sh - 6,
    underarm: sh - 14,
    waist: sh - 30,
    hip: sh - 20,
    armBase: [CX + sh - 3, 116] as Pt, // where the builder anchors a sleeve
  };
}
type Frame = ReturnType<typeof frame>;

// One arm, right side. The centre line starts where the builder anchors a sleeve and runs
// down the arm; `across` is the half width at each distance along it.
const ARM_ANGLE = (20 * Math.PI) / 180;
const DOWN: Pt = [Math.sin(ARM_ANGLE), Math.cos(ARM_ANGLE)];
const OUT: Pt = [Math.cos(ARM_ANGLE), -Math.sin(ARM_ANGLE)];

function arm(b: Frame, side: (pt: Pt) => Pt): string {
  const along = (s: number, across: number): Pt =>
    side([b.armBase[0] + DOWN[0] * s + OUT[0] * across, b.armBase[1] + DOWN[1] * s + OUT[1] * across]);
  // shoulder cap, upper arm, elbow, wrist, then a tapered hand
  return (
    `<path d="M ${p(along(-30, 9))} Q ${p(along(-16, 13))} ${p(along(0, 12))} ` +
    `L ${p(along(105, 10.5))} L ${p(along(205, 7.5))} L ${p(along(228, 7))} ` +
    `Q ${p(along(243, 6))} ${p(along(242, 0))} Q ${p(along(243, -5))} ${p(along(228, -5))} ` +
    `L ${p(along(205, -7.5))} L ${p(along(105, -10.5))} L ${p(along(0, -12))} ` +
    `Q ${p(along(-16, -13))} ${p(along(-30, -9))} Z" ${BODY}/>`
  );
}

function leg(b: Frame, side: (pt: Pt) => Pt): string {
  // Drawn for a hip half-width of 50, then squeezed or stretched sideways to this body's hips.
  // The top of the leg matches the hips exactly; from the knee down the change is limited, so
  // a narrow dress does not give stick-thin legs.
  const atHip = b.hip / 50;
  const below = Math.min(1.12, Math.max(0.82, atHip));
  const q = ([x, y]: Pt) => {
    const t = Math.min(1, Math.max(0, (y - 262) / 130));
    return p(side([CX + (x - CX) * (atHip + (below - atHip) * t), y]));
  };
  return (
    `<path d="M ${q([250, 262])} C ${q([252, 318])} ${q([241, 360])} ${q([237, 392])} ` + // outer thigh to knee
    `C ${q([240, 432])} ${q([236, 484])} ${q([224, 548])} ` + // calf to ankle
    `L ${q([229, 578])} Q ${q([223, 590])} ${q([212, 584])} L ${q([212, 548])} ` + // foot
    `C ${q([214, 484])} ${q([214, 432])} ${q([211, 392])} ` + // inner calf up to knee
    `C ${q([212, 350])} ${q([206, 312])} ${q([201, 286])} Z" ${BODY}/>`
  );
}

function torso(b: Frame): string {
  // Right side from the neck down to the hip; the left side is the same points mirrored.
  const neckTop: Pt = [208, 44];
  const neckBase: Pt = [209, 63];
  // The builder's shoulder seam drops 0.28 per px out from the neck; the body stays just under it.
  const shoulder: Pt = [CX + b.shoulder, 70 + 0.28 * (b.shoulder - 26) + 5];
  const underarm: Pt = [CX + b.underarm, 150];
  const waist: Pt = [CX + b.waist, 212];
  const hip: Pt = [CX + b.hip, 262];
  const slope: Pt = [CX + 26, 72]; // neck curving out to the shoulder
  const ribs: Pt = [CX + b.waist + 9, 186];
  const flank: Pt = [CX + b.waist + 3, 240];
  const right = `L ${p(neckBase)} Q ${p(slope)} ${p(shoulder)} L ${p(underarm)} Q ${p(ribs)} ${p(waist)} Q ${p(flank)} ${p(hip)}`;
  const left =
    `Q ${p(mirror(flank))} ${p(mirror(waist))} Q ${p(mirror(ribs))} ${p(mirror(underarm))} ` +
    `L ${p(mirror(shoulder))} Q ${p(mirror(slope))} ${p(mirror(neckBase))} L ${p(mirror(neckTop))}`;
  // The fill dips below the hips so the tops of the legs join it with no gap. Only the sides
  // and the neck get an outline, so no line is drawn across the thighs.
  const fill = `M ${p(neckTop)} ${right} Q ${p([CX, 322])} ${p(mirror(hip))} ${left} Z`;
  return (
    `<path d="${fill}" fill="${SKIN}" stroke="none"/>` +
    `<path d="M ${p(neckTop)} ${right} M ${p(mirror(hip))} ${left}" fill="none" stroke="${EDGE}" stroke-width="1.2" stroke-linejoin="round" stroke-linecap="round"/>`
  );
}

function head(): string {
  const [cy, rx, ry] = [29, 15, 20];
  return (
    `<path d="M ${f(CX - rx)},${cy} A ${rx} ${ry} 0 1 0 ${f(CX + rx)},${cy} ` +
    `A ${rx} ${ry} 0 1 0 ${f(CX - rx)},${cy} Z" ${BODY}/>`
  );
}

function shadow(): string {
  const [cy, rx, ry] = [589, 62, 5];
  return (
    `<path d="M ${f(CX - rx)},${cy} A ${rx} ${ry} 0 1 0 ${f(CX + rx)},${cy} ` +
    `A ${rx} ${ry} 0 1 0 ${f(CX - rx)},${cy} Z" fill="#221d19" fill-opacity="0.08" stroke="none"/>`
  );
}

/**
 * The figure on its own, as one SVG group, sized for a dress of the given shoulder width.
 * Drawn back to front: shadow, arms, legs, torso, head.
 */
export function mannequinMarkup(shoulderWidth = 0.5): string {
  const b = frame(shoulderWidth);
  const same = (pt: Pt) => pt;
  return `<g id="mannequin">${shadow()}${arm(b, mirror)}${arm(b, same)}${leg(b, mirror)}${leg(b, same)}${torso(b)}${head()}</g>`;
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
