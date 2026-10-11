import type { DesignSpec, PartName, PartStyle, Pattern } from "../../Builder/types";

// Ready made sample designs, defined here in the frontend (Builder/mockSpec.ts is the builder team's and is
// left alone). They only use settings the builder draws: the four necklines it has, sleeves, waist seam,
// skirt silhouette and length, pockets and buttons, and a color and pattern for each of the eight parts.
// A collar or waistband whose style differs from the bodice keeps its own style, which is how the
// "contrast collar and waistband" in the plaid dress works.

export interface SampleDesign {
  id: string;
  name: string;
  /** One line shown under the name in the menu. */
  blurb: string;
  spec: DesignSpec;
}

const style = (fill: string, pattern: Pattern = "solid"): PartStyle => ({ fill, pattern });

/** The same style on several parts. */
const paint = (parts: readonly PartName[], s: PartStyle): Partial<Record<PartName, PartStyle>> =>
  Object.fromEntries(parts.map((p) => [p, { ...s }]));

const ALL: readonly PartName[] = ["collar_neckline", "bodice", "left_sleeve", "right_sleeve", "waist_seam", "skirt", "pockets", "buttons"];

export const SAMPLES: readonly SampleDesign[] = [
  {
    id: "little-black-dress",
    name: "Little black dress",
    blurb: "Black, scoop neck, sleeveless, knee length",
    spec: {
      garment_type: "dress",
      neckline: { type: "scoop", depth: 0.4 },
      sleeves: { type: "none", length: "short" },
      waist: { seam: true },
      skirt: { silhouette: "straight", length: "knee" },
      details: { pockets: "none", buttons: 0 },
      proportions: { shoulder_width: 0.5, waist_y: 0.5 },
      style: paint(ALL, style("#17161a")),
      notes: "Sample design: little black dress.",
    },
  },
  {
    id: "denim-day-dress",
    name: "Denim day dress",
    blurb: "Denim, crew neck, short sleeves, patch pockets, buttons",
    spec: {
      garment_type: "dress",
      neckline: { type: "crew", depth: 0.25 },
      sleeves: { type: "fitted", length: "short" },
      waist: { seam: true },
      skirt: { silhouette: "a_line", length: "knee" },
      details: { pockets: "patch", buttons: 5 },
      proportions: { shoulder_width: 0.5, waist_y: 0.5 },
      style: {
        ...paint(["collar_neckline", "bodice", "left_sleeve", "right_sleeve", "waist_seam", "skirt"], style("#5b7fae", "denim")),
        pockets: style("#3d5a85", "denim"),
        buttons: style("#efe4c8"),
      },
      notes: "Sample design: denim day dress.",
    },
  },
  {
    id: "garden-party",
    name: "Garden party",
    blurb: "Solid green bodice, V neck, flared floral skirt",
    spec: {
      garment_type: "dress",
      neckline: { type: "v", depth: 0.45 },
      sleeves: { type: "cap", length: "short" },
      waist: { seam: true },
      skirt: { silhouette: "flared", length: "midi" },
      details: { pockets: "none", buttons: 0 },
      proportions: { shoulder_width: 0.5, waist_y: 0.45 },
      style: {
        ...paint(["collar_neckline", "bodice", "left_sleeve", "right_sleeve", "waist_seam", "pockets", "buttons"], style("#2f6b57")),
        skirt: style("#f3cdd3", "floral"),
      },
      notes: "Sample design: garden party dress.",
    },
  },
  {
    id: "plaid-midi",
    name: "Plaid midi",
    blurb: "Plaid skirt, contrast collar and waistband, long sleeves",
    spec: {
      garment_type: "dress",
      neckline: { type: "crew", depth: 0.25 },
      sleeves: { type: "fitted", length: "long" },
      waist: { seam: true },
      skirt: { silhouette: "a_line", length: "midi" },
      details: { pockets: "none", buttons: 0 },
      proportions: { shoulder_width: 0.5, waist_y: 0.5 },
      style: {
        ...paint(["bodice", "left_sleeve", "right_sleeve", "pockets", "buttons"], style("#efe6d2")),
        skirt: style("#a23b3b", "plaid"),
        collar_neckline: style("#1f3a5f"),
        waist_seam: style("#1f3a5f"),
      },
      notes: "Sample design: plaid midi dress.",
    },
  },
];
