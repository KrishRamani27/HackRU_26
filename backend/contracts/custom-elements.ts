// Shared manual-edit contract. Frontend and builder may import/copy these types.
// This file defines data only; the backend does not implement a drawing UI.
export type DressPartName =
  | "collar_neckline" | "bodice" | "left_sleeve" | "right_sleeve"
  | "waist_seam" | "skirt" | "pockets" | "buttons";

export interface ElementTransform {
  x: number;
  y: number;
  scale_x: number;
  scale_y: number;
  rotation: number;
}

export interface CustomElement {
  id: string;
  group_id?: string | null;
  name: string;
  type: "stroke";
  parent_part: DressPartName | null;
  points: [number, number][];
  closed: boolean;
  stroke: string;
  stroke_width: number;
  fill: string | null;
  pattern: "solid" | "denim" | "plaid" | "floral";
  transform: ElementTransform;
  visible: boolean;
  layer_order: number;
}

// Creation needs a name and points. The backend fills the remaining defaults.
export type CustomElementCreate = Pick<CustomElement, "name" | "points"> &
  Partial<Omit<CustomElement, "name" | "points">>;

export type CustomElementPatch = Partial<Omit<CustomElement, "id" | "type" | "transform">> & {
  transform?: Partial<ElementTransform>;
};

// Add to the existing saved-design response, not to Gemini's DesignSpec.
export interface ManualDrawingDocument {
  custom_elements: CustomElement[];
  version: number;
}

export interface CustomPartWrite {
  name: string;
  elements: CustomElementCreate[];
}

export interface CustomPart {
  id: string;
  name: string;
  elements: CustomElement[];
  created_at: string;
  // Legacy single-stroke alias; absent for grouped templates.
  element?: CustomElement;
}
