import { readDetail } from "./analyze";
import { PartsError, send } from "./parts";

// Reuse a completed/in-flight upload when Save is clicked again or the design save fails.
// File objects stay only in this tab; no credentials or image data go into localStorage.
const uploads = new WeakMap<File, Promise<string>>();

export function uploadSketch(file: File): Promise<string> {
  const existing = uploads.get(file);
  if (existing) return existing;
  const pending = (async () => {
    const form = new FormData();
    form.append("image", file);
    const response = await send("/assets", { method: "POST", body: form });
    if (!response.ok) {
      const detail = await readDetail(response);
      throw new PartsError("Sketch upload failed", detail ?? "Couldn’t store the sketch. Check cloud access, then save again.");
    }
    const body: unknown = await response.json().catch(() => null);
    if (!body || typeof body !== "object" || !("id" in body) || typeof body.id !== "string" || !body.id) {
      throw new PartsError("Sketch upload failed", "The backend didn’t return an image ID.");
    }
    return body.id;
  })();
  uploads.set(file, pending);
  void pending.catch(() => uploads.delete(file));
  return pending;
}
