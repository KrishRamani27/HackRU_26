import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { DesignSpec, GarmentType } from "../../../Builder/types";
import { buildFlat } from "../../../Builder/buildFlat";
import "./templates.css";
import { TEMPLATE_SECTIONS, templatesFor } from "./templates";

// Each card is cropped to its garment, so a top or a skirt fills its card the way a dress does.
const CROP: Record<GarmentType, string> = { dress: "20 40 360 540", top: "70 40 260 390", skirt: "60 165 280 420" };
const thumbnail = (spec: DesignSpec) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    buildFlat(spec).replace(/viewBox="[^"]*" width="\d+" height="\d+"/, `viewBox="${CROP[spec.garment_type] ?? CROP.dress}"`),
  )}`;

interface Props {
  /** Called with a fresh copy of the chosen design. */
  onPick: (spec: DesignSpec) => void;
}

/** A toolbar button that opens a picture gallery of starter designs. */
export function TemplatesButton({ onPick }: Props) {
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<GarmentType>("dress");

  // Each card shows the real builder drawing of its spec. An <img> cannot run anything inside
  // the SVG, so the builder's text is safe to use this way. Drawn when a section is first shown.
  const cards = useMemo(() => (open ? templatesFor(section).map((t) => ({ ...t, src: thumbnail(t.spec) })) : []), [open, section]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault(); // so the canvas does not also treat it as "deselect"
      setOpen(false);
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open]);

  return (
    <>
      <button type="button" className="tpl-button" aria-haspopup="dialog" title="Start from a ready-made dress" onClick={() => setOpen(true)}>
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <rect x="2" y="2" width="5" height="5" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.3" />
          <rect x="9" y="2" width="5" height="5" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.3" />
          <rect x="2" y="9" width="5" height="5" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.3" />
          <rect x="9" y="9" width="5" height="5" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.3" />
        </svg>
        <span>Templates</span>
      </button>

      {open &&
        createPortal(
          <div className="tpl-backdrop" onClick={() => setOpen(false)}>
            <div className="tpl-dialog" role="dialog" aria-modal="true" aria-label="Templates" onClick={(e) => e.stopPropagation()}>
              <header className="tpl-head">
                <div>
                  <h2 className="tpl-title">Templates</h2>
                  <p className="tpl-sub">Pick a design to start from. Everything about it stays editable.</p>
                </div>
                <button type="button" className="tpl-close" aria-label="Close templates" onClick={() => setOpen(false)}>
                  <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
                    <path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>
              </header>
              <div className="tpl-tabs" role="tablist" aria-label="Garment type">
                {TEMPLATE_SECTIONS.map((s) => (
                  <button key={s.key} type="button" role="tab" className="tpl-tab" aria-selected={section === s.key} onClick={() => setSection(s.key)}>
                    {s.label}
                    <span className="tpl-count">{templatesFor(s.key).length}</span>
                  </button>
                ))}
              </div>
              <ul className="tpl-grid" key={section}>
                {cards.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      className="tpl-card"
                      onClick={() => {
                        setOpen(false);
                        onPick(structuredClone(t.spec));
                      }}
                    >
                      <span className="tpl-thumb">
                        <img src={t.src} alt="" loading="lazy" />
                      </span>
                      <span className="tpl-name">{t.name}</span>
                      <span className="tpl-note">{t.note}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
