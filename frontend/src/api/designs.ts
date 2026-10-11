import type { DesignSpec } from "../../../Builder/types";
import type { CustomElement } from "../../../Builder/buildFlat";
import { readDetail } from "./analyze";
import { PartsError, send } from "./parts";

// Saved designs: the backend's /designs routes (backend/CUSTOM_ELEMENTS.md and backend/README.md).
// A design is a name, the full spec and the hand drawn elements, with a version that goes up on every save.

export interface DesignInput {
  name: string;
  spec: DesignSpec;
  /** Always sent in full (an empty list clears them on the server; leaving it out would keep the old ones). */
  custom_elements: CustomElement[];
}

export interface SavedDesign {
  id: string;
  name: string;
  spec: DesignSpec;
  custom_elements: CustomElement[];
  version: number;
  created_at: string;
  updated_at: string;
}

/** The design on the server has a newer version than the one this page last saw or loaded (HTTP 409). */
export class ConflictError extends Error {
  constructor() {
    super("This design changed somewhere else. Reload to get the latest.");
  }
}

function looksLikeDesign(value: unknown): value is SavedDesign {
  const d = value as Partial<SavedDesign> | null;
  return (
    !!d &&
    typeof d.id === "string" &&
    typeof d.name === "string" &&
    !!d.spec && typeof d.spec === "object" &&
    Number.isInteger(d.version) &&
    typeof d.updated_at === "string"
  );
}

async function failDesign(response: Response, what: string): Promise<never> {
  const detail = await readDetail(response);
  if (response.status === 401) {
    throw new PartsError("Backend needs an API key", "The backend is protected by a shared key, which this app doesn’t send yet.");
  }
  if (response.status === 404) throw new PartsError("Design not found", "This design isn’t on the server any more.");
  if (response.status === 422) throw new PartsError("The backend rejected this design", detail ?? "The design didn’t match the contract.");
  if (response.status >= 500) throw new PartsError("Saving is unavailable", detail ?? "The backend had a problem. Try again in a moment.");
  throw new PartsError(`${what} failed`, detail ?? `The backend answered with HTTP ${response.status}.`);
}

async function readDesign(response: Response): Promise<SavedDesign> {
  const body: unknown = await response.json().catch(() => null);
  if (!looksLikeDesign(body)) throw new PartsError("Unreadable backend reply", "The backend didn’t send back a design.");
  return { ...body, custom_elements: Array.isArray(body.custom_elements) ? body.custom_elements : [] };
}

const json = (method: string, input: DesignInput): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(input),
});

/** First save: POST /designs. */
export async function createDesign(input: DesignInput): Promise<SavedDesign> {
  const response = await send("/designs", json("POST", input));
  if (!response.ok) return failDesign(response, "Saving");
  return readDesign(response);
}

/** Later saves: PUT /designs/{id}?expected_version=N. A stale version is a 409 and nothing is overwritten. */
export async function updateDesign(id: string, input: DesignInput, expectedVersion: number): Promise<SavedDesign> {
  const response = await send(`/designs/${encodeURIComponent(id)}?expected_version=${expectedVersion}`, json("PUT", input));
  if (response.status === 409) throw new ConflictError();
  if (!response.ok) return failDesign(response, "Saving");
  return readDesign(response);
}

/** GET /designs/{id}: the latest saved version. */
export async function getDesign(id: string): Promise<SavedDesign> {
  const response = await send(`/designs/${encodeURIComponent(id)}`, {});
  if (!response.ok) return failDesign(response, "Opening");
  return readDesign(response);
}

/** GET /designs: most recently updated first. */
export async function listDesigns(signal?: AbortSignal): Promise<SavedDesign[]> {
  const response = await send("/designs?limit=50", { signal });
  if (!response.ok) return failDesign(response, "Loading designs");
  const body: unknown = await response.json().catch(() => null);
  if (!Array.isArray(body)) throw new PartsError("Unreadable backend reply", "The backend didn’t send a list of designs.");
  return body.filter(looksLikeDesign);
}
