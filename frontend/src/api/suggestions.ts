import type { DesignSpec } from "../../../Builder/types";
import { isValidEdit, type EditAction } from "../state/specSchema";
import type { AiMode } from "../types";
import { readDetail } from "./analyze";
import { PartsError, send } from "./parts";

// Design suggestions: the backend's POST /suggestions (backend/README.md).
// Request:  { spec }
// Response: { suggestions: [{ explanation, actions: [{ op: "set", path, value }] }], end_goal }
// The backend returns up to three suggestions, each with exactly one edit action.

/** One suggested change: an edit action in the shared contract, and one sentence on why. */
export interface Suggestion {
  reason: string;
  action: EditAction;
}

/** A failed suggestions request, with a short title and a plain message for the screen. */
export class SuggestionsError extends Error {
  readonly title: string;
  constructor(title: string, message: string) {
    super(message);
    this.title = title;
  }
}

/** Only suggestions shaped like the contract, with an edit this app can apply, get through. */
function toSuggestion(value: unknown): Suggestion | null {
  const item = value as { explanation?: unknown; actions?: unknown } | null;
  if (!item || typeof item.explanation !== "string" || !Array.isArray(item.actions)) return null;
  const first = item.actions[0] as { op?: unknown; path?: unknown; value?: unknown } | undefined;
  if (!first || first.op !== "set" || typeof first.path !== "string") return null;
  if (typeof first.value !== "string" && typeof first.value !== "number" && typeof first.value !== "boolean") return null;
  const action: EditAction = { op: "set", path: first.path, value: first.value };
  const reason = item.explanation.trim();
  return reason && isValidEdit(action) ? { reason, action } : null;
}

/**
 * POST /suggestions with the current spec. Each call is one AI request, so only call this
 * when the user asks for suggestions.
 */
export async function fetchSuggestions(
  spec: DesignSpec,
  signal: AbortSignal,
): Promise<{ suggestions: Suggestion[]; aiMode: AiMode }> {
  let response: Response;
  try {
    response = await send("/suggestions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ spec }),
      signal,
    });
  } catch (err) {
    if (err instanceof PartsError) throw new SuggestionsError(err.title, err.message);
    throw err; // the request was cancelled
  }

  if (!response.ok) {
    const detail = await readDetail(response);
    switch (response.status) {
      case 401:
        throw new SuggestionsError("Backend needs an API key", "The backend is protected by a shared key, which this app doesn’t send yet.");
      case 422:
        throw new SuggestionsError("The backend didn’t accept this design", detail ?? "The design’s settings weren’t accepted.");
      case 502:
      case 503:
        throw new SuggestionsError("Suggestions didn’t finish", detail ?? "The AI service is unavailable. Try again.");
      default:
        throw new SuggestionsError("Suggestions failed", detail ?? `The backend answered with HTTP ${response.status}.`);
    }
  }

  const body = (await response.json().catch(() => null)) as { suggestions?: unknown } | null;
  if (!body || !Array.isArray(body.suggestions)) {
    throw new SuggestionsError("Unreadable backend reply", "The backend didn’t send a list of suggestions.");
  }
  const mode = response.headers.get("X-AI-Mode")?.trim().toLowerCase();
  return {
    suggestions: body.suggestions.map(toSuggestion).filter((s): s is Suggestion => s !== null).slice(0, 3),
    aiMode: mode === "mock" || mode === "gemini" ? mode : "unknown",
  };
}
