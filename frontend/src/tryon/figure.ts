/*
 * The figure's settings: body measurements, skin tone and hair. Plain data, no drawing.
 *
 * Every body setting is a scale, where 1 is the standard figure. The standard figure is
 * sized from the dress (see mannequin.ts), so these adjust it from there. `readout` turns
 * the scales into approximate centimetres for the panel.
 */

export type HairStyle = "bob" | "long" | "short" | "curly";

export interface FigureOptions {
  /** Overall height. 1 is about 170 cm. */
  height: number;
  shoulders: number;
  bust: number;
  waist: number;
  hips: number;
  neck: number;
  /** Arm and leg length. Longer legs mean a shorter torso; the height stays the same. */
  arm: number;
  leg: number;
  skin: string;
  hair: HairStyle;
  hairColor: string;
}

export type Measure = "height" | "shoulders" | "bust" | "waist" | "hips" | "neck" | "arm" | "leg";

export const DEFAULT_FIGURE: FigureOptions = {
  height: 1,
  shoulders: 1,
  bust: 1,
  waist: 1,
  hips: 1,
  neck: 1,
  arm: 1,
  leg: 1,
  skin: "#f2dccb",
  hair: "bob",
  hairColor: "#3d2b23",
};

/** The sliders, in panel order. `cm` is what the standard figure measures. */
export const MEASURES: readonly { key: Measure; label: string; cm: number; min: number; max: number }[] = [
  { key: "height", label: "Height", cm: 170, min: 0.88, max: 1.06 },
  { key: "shoulders", label: "Shoulders", cm: 38, min: 0.85, max: 1.25 },
  { key: "bust", label: "Bust", cm: 86, min: 0.85, max: 1.35 },
  { key: "waist", label: "Waist", cm: 66, min: 0.85, max: 1.45 },
  { key: "hips", label: "Hips", cm: 92, min: 0.85, max: 1.35 },
  { key: "neck", label: "Neck", cm: 32, min: 0.8, max: 1.3 },
  { key: "arm", label: "Arm length", cm: 58, min: 0.9, max: 1.1 },
  { key: "leg", label: "Leg length", cm: 78, min: 0.9, max: 1.1 },
];

export const PRESETS: readonly { name: string; body: Partial<Record<Measure, number>> }[] = [
  { name: "Standard", body: {} },
  { name: "Petite", body: { height: 0.92, leg: 0.97, shoulders: 0.95, bust: 0.95, waist: 0.95, hips: 0.95 } },
  { name: "Tall", body: { height: 1.05, leg: 1.05, arm: 1.04 } },
  { name: "Curvy", body: { bust: 1.14, waist: 1.06, hips: 1.2 } },
  { name: "Athletic", body: { shoulders: 1.12, bust: 1.05, waist: 1.1, hips: 0.98, neck: 1.08 } },
  { name: "Plus", body: { shoulders: 1.08, bust: 1.26, waist: 1.34, hips: 1.3, neck: 1.15 } },
];

export const SKIN_TONES: readonly string[] = ["#f8e6d8", "#f2dccb", "#e5bd9b", "#c9946a", "#9c6a46", "#6e4832"];
export const HAIR_COLORS: readonly string[] = ["#1f1a17", "#3d2b23", "#7a4a2b", "#a4502f", "#d6ad66", "#9b9b9b"];
export const HAIR_STYLES: readonly { key: HairStyle; label: string }[] = [
  { key: "bob", label: "Bob" },
  { key: "long", label: "Long" },
  { key: "short", label: "Short" },
  { key: "curly", label: "Curly" },
];

const clamp = (v: unknown, lo: number, hi: number, fallback: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;
const HEX = /^#[0-9a-fA-F]{6}$/;

/** Fills in anything missing and keeps every value inside its slider's range. */
export function cleanFigure(options: Partial<FigureOptions> | undefined): FigureOptions {
  const o = options ?? {};
  const body = Object.fromEntries(MEASURES.map((m) => [m.key, clamp(o[m.key], m.min, m.max, 1)])) as Record<Measure, number>;
  return {
    ...body,
    skin: typeof o.skin === "string" && HEX.test(o.skin) ? o.skin : DEFAULT_FIGURE.skin,
    hair: HAIR_STYLES.some((h) => h.key === o.hair) ? (o.hair as HairStyle) : DEFAULT_FIGURE.hair,
    hairColor: typeof o.hairColor === "string" && HEX.test(o.hairColor) ? o.hairColor : DEFAULT_FIGURE.hairColor,
  };
}

/**
 * Approximate size in centimetres for one measure. Widths also follow the dress: the figure
 * is sized from the dress's shoulder width (0 to 1, 0.5 = natural), so a wider dress means a
 * wider figure. Lengths and widths both grow with height.
 */
export function readout(measure: Measure, figure: FigureOptions, shoulderWidth = 0.5): number {
  const m = MEASURES.find((x) => x.key === measure)!;
  if (measure === "height") return Math.round(m.cm * figure.height);
  const follows = measure === "arm" || measure === "leg" || measure === "neck" ? 1 : (50 + 40 * shoulderWidth) / 70;
  return Math.round(m.cm * figure[measure] * figure.height * follows);
}

/** True when no body slider has been moved (skin and hair don't count). */
export function isStandardBody(figure: FigureOptions): boolean {
  return MEASURES.every((m) => Math.abs(figure[m.key] - 1) < 0.001);
}
