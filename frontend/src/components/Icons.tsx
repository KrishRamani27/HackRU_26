import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement>;
const base = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export const UploadIcon = (p: P) => (
  <svg {...base} {...p}><path d="M12 15V4M7 9l5-5 5 5M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3" /></svg>
);
export const UndoIcon = (p: P) => (
  <svg {...base} {...p}><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></svg>
);
export const RedoIcon = (p: P) => (
  <svg {...base} {...p}><path d="m15 14 5-5-5-5" /><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" /></svg>
);
export const TrashIcon = (p: P) => (
  <svg {...base} {...p}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a1.5 1.5 0 0 0 1.5 1.4h7A1.5 1.5 0 0 0 17 19l1-12M9 7V4.5h6V7" /></svg>
);
export const BookmarkIcon = (p: P) => (
  <svg {...base} {...p}><path d="M7 4h10a1 1 0 0 1 1 1v15l-6-4-6 4V5a1 1 0 0 1 1-1Z" /></svg>
);
export const ChevronDownIcon = (p: P) => (
  <svg {...base} {...p}><path d="m6 9 6 6 6-6" /></svg>
);
export const ExportIcon = (p: P) => (
  <svg {...base} {...p}><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>
);
export const ImageIcon = (p: P) => (
  <svg {...base} {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="1.6" /><path d="m21 16-5-5-9 9" /></svg>
);
export const AlertIcon = (p: P) => (
  <svg {...base} {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5M12 16.5h.01" /></svg>
);
export const CloseIcon = (p: P) => (
  <svg {...base} {...p}><path d="M6 6l12 12M18 6 6 18" /></svg>
);
export const ZoomInIcon = (p: P) => (
  <svg {...base} {...p}><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2M11 8.5v5M8.5 11h5" /></svg>
);
export const ZoomOutIcon = (p: P) => (
  <svg {...base} {...p}><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2M8.5 11h5" /></svg>
);
export const FitIcon = (p: P) => (
  <svg {...base} {...p}><path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4" /></svg>
);
export const HangerIcon = (p: P) => (
  <svg {...base} {...p}><path d="M12 7.5a2 2 0 1 1 2-2c0 1-1 1.6-2 2.3v1.4L3.6 15a1.3 1.3 0 0 0 .8 2.4h15.2a1.3 1.3 0 0 0 .8-2.4L12 9.2" /></svg>
);
export const WorkbenchIcon = (p: P) => (
  <svg {...base} {...p}><rect x="3.5" y="4" width="17" height="16" rx="2" /><path d="M9 4v16M15 4v16" /></svg>
);
export const LibraryIcon = (p: P) => (
  <svg {...base} {...p}><path d="M5 4h3v16H5zM10 4h3v16h-3zM15.5 4.8l2.9-.8 3.1 15.4-2.9.6z" /></svg>
);
export const EyeIcon = (p: P) => (
  <svg {...base} {...p}><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="2.8" /></svg>
);
export const CheckIcon = (p: P) => (
  <svg {...base} {...p}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
);
export const SlidersIcon = (p: P) => (
  <svg {...base} {...p}><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></svg>
);
