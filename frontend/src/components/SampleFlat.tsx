import { useEffect, useState } from "react";
import { buildFlat } from "../../../Builder/buildFlat";
import { mockSpec } from "../../../Builder/mockSpec";

/**
 * Sample preview: the Builder's own output for its hand-made mock spec.
 * It is not derived from an uploaded sketch and is only shown behind an
 * explicit "View sample" action, with the label added by CanvasStage.
 */
export function SampleFlat() {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const next = URL.createObjectURL(new Blob([buildFlat(mockSpec)], { type: "image/svg+xml" }));
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, []);

  if (!url) return null;
  return (
    <img
      className="sample-flat"
      src={url}
      alt="Sample technical flat of a dress, built from the Builder's mock spec. Not generated from a sketch."
    />
  );
}
