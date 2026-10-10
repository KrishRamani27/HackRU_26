import { FLAT_SIZE } from "./buildFlat";

// Browser-only: turns the builder's SVG string into a PNG Blob for POST /verify.
// Works because our fabric patterns are pure SVG (no external images to taint the canvas).
export async function svgToPng(svg: string, scale = 2): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("SVG failed to load as an image"));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = FLAT_SIZE.width * scale;
    canvas.height = FLAT_SIZE.height * scale;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff"; // white background, like paper
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG export failed"))), "image/png"),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
