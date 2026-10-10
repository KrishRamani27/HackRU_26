import { FLAT_SIZE } from "../../../Builder/buildFlat";
import { svgToPng } from "../../../Builder/svgToPng";

export type ExportFormat = "svg" | "png";

const SVG_NS = "http://www.w3.org/2000/svg";
const PNG_SCALE = 2;

/**
 * Anything that exists only for the on-screen view (selection, hover, keyboard
 * focus, hit areas) or that could run code. The builder never emits these, so
 * finding one means something upstream is wrong and we refuse to write the file.
 */
const FORBIDDEN = /<script|<foreignObject|\son[a-z]+\s*=|javascript:|data-part|data-selected|data-ui|tabindex|aria-|\srole=/i;

/** "Untitled garment" -> "untitled-garment.svg" */
export function fileNameFor(title: string, format: ExportFormat): string {
  const slug = title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug || "garment"}.${format}`;
}

/**
 * Turns the builder's SVG text into a file body that Illustrator reads cleanly:
 * an XML declaration, and xmlns, width and height on the root (added only if the
 * builder ever stops providing them). Everything else, including the named part
 * groups, fills and fabric patterns, is the builder's text exactly as it was.
 */
export function prepareSvg(markup: string): string {
  if (FORBIDDEN.test(markup)) {
    throw new Error("The drawing contains something that shouldn’t be exported, so nothing was saved.");
  }
  const doc = new DOMParser().parseFromString(markup, "image/svg+xml");
  const root = doc.documentElement;
  if (!root || root.localName !== "svg" || doc.getElementsByTagName("parsererror").length > 0) {
    throw new Error("The drawing isn’t valid SVG, so nothing was saved.");
  }

  const complete = root.getAttribute("xmlns") === SVG_NS && root.hasAttribute("width") && root.hasAttribute("height");
  let body = markup.trim();
  if (!complete) {
    root.setAttribute("xmlns", SVG_NS);
    if (!root.hasAttribute("width")) root.setAttribute("width", String(FLAT_SIZE.width));
    if (!root.hasAttribute("height")) root.setAttribute("height", String(FLAT_SIZE.height));
    body = new XMLSerializer().serializeToString(root);
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n${body}\n`;
}

function download(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Give the browser time to start the download before the URL is released.
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Downloads the flat. `markup` must be the string buildFlat returned, never the
 * on-screen DOM, so no selection or hover styling can reach the file.
 * PNG is 2x (800 by 1200) on a white background. Returns the file name.
 */
export async function exportFlat(markup: string, title: string, format: ExportFormat): Promise<string> {
  const svg = prepareSvg(markup);
  const fileName = fileNameFor(title, format);
  if (format === "svg") {
    download(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }), fileName);
  } else {
    download(await svgToPng(markup, PNG_SCALE), fileName);
  }
  return fileName;
}
