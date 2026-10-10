import type { DesignSpec } from "../../../Builder/types";
import type { AiMode } from "../types";

// Override with VITE_API_URL if the backend runs elsewhere. Never put keys here:
// anything in the frontend bundle is public.
export const API_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:8000").replace(/\/$/, "");

export class AnalyzeError extends Error {
  readonly title: string;
  constructor(title: string, message: string) {
    super(message);
    this.title = title;
  }
}

function toAiMode(header: string | null): AiMode {
  const value = header?.trim().toLowerCase();
  return value === "mock" || value === "gemini" ? value : "unknown";
}

/** FastAPI errors are `{detail: string}` or `{detail: [{msg}, ...]}`. */
export async function readDetail(response: Response): Promise<string | null> {
  try {
    const body = await response.json();
    if (typeof body?.detail === "string") return body.detail;
    if (Array.isArray(body?.detail)) {
      return body.detail.map((d: { msg?: string }) => d.msg).filter(Boolean).join("; ") || null;
    }
  } catch {
    // Body wasn't JSON; fall through to a generic message.
  }
  return null;
}

/** POST the sketch to /analyze. The browser sets the multipart Content-Type itself. */
export async function analyzeSketch(
  file: File,
  signal: AbortSignal,
): Promise<{ spec: DesignSpec; aiMode: AiMode }> {
  const form = new FormData();
  form.append("sketch", file);

  let response: Response;
  try {
    response = await fetch(`${API_URL}/analyze`, { method: "POST", body: form, signal });
  } catch (err) {
    if (signal.aborted) throw err;
    throw new AnalyzeError(
      "Couldn’t reach the backend",
      `Nothing answered at ${API_URL}. Check that the backend is running and allows requests from this page, then try again.`,
    );
  }

  if (!response.ok) {
    const detail = await readDetail(response);
    switch (response.status) {
      case 401:
        throw new AnalyzeError(
          "Backend needs an API key",
          "The backend is protected by a shared key, which this app doesn’t send yet.",
        );
      case 413:
        throw new AnalyzeError("Sketch too large for the backend", detail ?? "Try a smaller image.");
      case 415:
      case 422:
        throw new AnalyzeError("Backend couldn’t read the sketch", detail ?? "Try a different image.");
      case 502:
      case 503:
        throw new AnalyzeError("Analysis didn’t finish", detail ?? "The AI service is unavailable. Try again.");
      default:
        throw new AnalyzeError("Analysis failed", detail ?? `The backend answered with HTTP ${response.status}.`);
    }
  }

  let spec: DesignSpec;
  try {
    spec = (await response.json()) as DesignSpec;
  } catch {
    throw new AnalyzeError("Unreadable backend reply", "The backend’s response wasn’t valid JSON.");
  }
  return { spec, aiMode: toAiMode(response.headers.get("X-AI-Mode")) };
}
