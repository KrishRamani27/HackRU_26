import type { DesignSpec } from "./types";

// Hand-made spec so the builder and UI can work before /analyze is live.
export const mockSpec: DesignSpec = {
  garment_type: "dress",
  neckline: { type: "crew", depth: 0.3 },
  sleeves: { type: "none", length: "short" },
  waist: { seam: true },
  skirt: { silhouette: "straight", length: "knee" },
  details: { pockets: "none", buttons: 0 },
  proportions: { shoulder_width: 0.5, waist_y: 0.5 },
  style: {},
  notes: "",
};
