import type { CustomElement } from "../../../Builder/buildFlat";
import { validElement } from "../state/specReducer";
import { fail, PartsError, send } from "./parts";

// Saved drawings: the backend's /custom-parts routes (backend/CUSTOM_ELEMENTS.md). A saved drawing is
// a name and a list of 1 to 200 strokes. Not the dress parts library (/parts); that is a different thing.

export interface SavedDrawing {
  id: string;
  name: string;
  elements: CustomElement[];
  created_at: string;
}

export interface SavedDrawingInput {
  name: string;
  elements: CustomElement[];
}

/** Only records that really are drawings (every stroke passing the contract) get through. */
function isSavedDrawing(value: unknown): value is SavedDrawing {
  const d = value as Partial<SavedDrawing> | null;
  return (
    !!d &&
    typeof d.id === "string" &&
    typeof d.name === "string" &&
    Array.isArray(d.elements) &&
    d.elements.length >= 1 &&
    d.elements.every((e) => validElement(e as CustomElement))
  );
}

/** GET /custom-parts: newest first, up to the backend's maximum of 100. */
export async function listDrawings(signal?: AbortSignal): Promise<SavedDrawing[]> {
  const response = await send("/custom-parts?limit=100", { signal });
  if (!response.ok) return fail(response, "Loading drawings");
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new PartsError("Unreadable backend reply", "The backend’s response wasn’t valid JSON.");
  }
  if (!Array.isArray(body)) throw new PartsError("Unreadable backend reply", "The backend didn’t send a list of drawings.");
  return body.filter(isSavedDrawing);
}

/** POST /custom-parts: one library item holding all of these strokes. */
export async function saveDrawing(input: SavedDrawingInput): Promise<SavedDrawing> {
  const response = await send("/custom-parts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) return fail(response, "Saving");
  const body: unknown = await response.json().catch(() => null);
  if (!isSavedDrawing(body)) throw new PartsError("Unreadable backend reply", "The backend didn’t send back the saved drawing.");
  return body;
}

/** DELETE /custom-parts/{id}. One that is already gone counts as deleted. */
export async function deleteDrawing(id: string): Promise<void> {
  const response = await send(`/custom-parts/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!response.ok && response.status !== 404) return fail(response, "Deleting");
}
