import { useCallback, useEffect, useRef, useState } from "react";
import type { SketchState } from "../types";

export const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp"];
export const ACCEPT_ATTR = ".png,.jpg,.jpeg,.webp";
// Matches the backend's default upload limit (max_upload_bytes = 5 MB).
export const MAX_BYTES = 5 * 1024 * 1024;

function decodeImage(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("decode"));
    img.src = url;
  });
}

/** Local-only sketch intake: validates, previews, and reports dimensions. */
export function useSketchUpload() {
  const [state, setState] = useState<SketchState>({ status: "empty" });
  const urlRef = useRef<string | null>(null);
  const tokenRef = useRef(0);

  const revoke = () => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
  };

  useEffect(() => revoke, []);

  const accept = useCallback(async (file: File) => {
    const token = ++tokenRef.current;
    revoke();

    if (!ACCEPTED_TYPES.includes(file.type)) {
      setState({
        status: "error",
        message: `“${file.name}” isn’t a supported image. Use PNG, JPG, or WebP.`,
      });
      return;
    }
    if (file.size > MAX_BYTES) {
      setState({
        status: "error",
        message: `“${file.name}” is ${formatBytes(file.size)}. The limit is ${formatBytes(MAX_BYTES)}.`,
      });
      return;
    }

    setState({ status: "loading", fileName: file.name });
    const url = URL.createObjectURL(file);
    urlRef.current = url;
    try {
      const { width, height } = await decodeImage(url);
      if (token !== tokenRef.current) return;
      setState({ status: "ready", file, url, width, height });
    } catch {
      if (token !== tokenRef.current) return;
      revoke();
      setState({
        status: "error",
        message: `“${file.name}” couldn’t be read. The file may be damaged.`,
      });
    }
  }, []);

  const clear = useCallback(() => {
    tokenRef.current++;
    revoke();
    setState({ status: "empty" });
  }, []);

  return { state, accept, clear };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
