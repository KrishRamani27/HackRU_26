import { PART_TYPES, type SavedPart, type SavedPartInput } from "../library/libraryModel";
import { API_URL, readDetail } from "./analyze";

/** A failed library request, with a short title and a plain message for the screen. */
export class PartsError extends Error {
  readonly title: string;
  constructor(title: string, message: string) {
    super(message);
    this.title = title;
  }
}

export async function send(path: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(`${API_URL}${path}`, init);
  } catch (err) {
    if (init.signal?.aborted) throw err;
    throw new PartsError(
      "Couldn’t reach the backend",
      `Nothing answered at ${API_URL}. Check that the backend is running and allows requests from this page, then try again.`,
    );
  }
}

export async function fail(response: Response, what: string): Promise<never> {
  const detail = await readDetail(response);
  if (response.status === 401) {
    throw new PartsError("Backend needs an API key", "The backend is protected by a shared key, which this app doesn’t send yet.");
  }
  if (response.status === 422) {
    throw new PartsError("The backend rejected this part", detail ?? "The part’s settings weren’t accepted.");
  }
  if (response.status >= 500) {
    throw new PartsError("The library is unavailable", detail ?? "The backend had a problem. Try again in a moment.");
  }
  throw new PartsError(`${what} failed`, detail ?? `The backend answered with HTTP ${response.status}.`);
}

/** Only records shaped like the contract get through, so one odd row can't crash the grid. */
function isSavedPart(value: unknown): value is SavedPart {
  const p = value as Partial<SavedPart> | null;
  return (
    !!p &&
    typeof p.id === "string" &&
    typeof p.name === "string" &&
    (PART_TYPES as readonly string[]).includes(p.part_type as string) &&
    !!p.spec_settings && typeof p.spec_settings === "object" && !Array.isArray(p.spec_settings) &&
    !!p.style && typeof p.style.fill === "string" && typeof p.style.pattern === "string"
  );
}

/** GET /parts: newest first, up to the backend's maximum of 100. */
export async function listParts(signal?: AbortSignal): Promise<SavedPart[]> {
  const response = await send("/parts?limit=100", { signal });
  if (!response.ok) return fail(response, "Loading the library");
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new PartsError("Unreadable backend reply", "The backend’s response wasn’t valid JSON.");
  }
  if (!Array.isArray(body)) throw new PartsError("Unreadable backend reply", "The backend didn’t send a list of parts.");
  return body.filter(isSavedPart);
}

/** POST /parts: returns the saved record with its id. */
export async function savePart(input: SavedPartInput): Promise<SavedPart> {
  const response = await send("/parts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) return fail(response, "Saving");
  const body: unknown = await response.json().catch(() => null);
  if (!isSavedPart(body)) throw new PartsError("Unreadable backend reply", "The backend didn’t send back the saved part.");
  return body;
}

/** DELETE /parts/{id}. A part that is already gone counts as deleted. */
export async function deletePart(id: string): Promise<void> {
  const response = await send(`/parts/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!response.ok && response.status !== 404) return fail(response, "Deleting");
}

/** One readable sentence for the screen, whatever went wrong. */
export function describeError(err: unknown, fallback: string): string {
  return err instanceof PartsError ? `${err.title}. ${err.message}` : fallback;
}
