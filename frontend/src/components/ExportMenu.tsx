import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import type { ExportFormat } from "../export/exportFlat";
import { ChevronDownIcon, ExportIcon } from "./Icons";

interface Props {
  enabled: boolean;
  /** Does the export and resolves with the saved file name. Rejects with a readable message. */
  onExport: (format: ExportFormat) => Promise<string>;
}

const OPTIONS: { format: ExportFormat; label: string; detail: string }[] = [
  { format: "svg", label: "SVG", detail: "Vector, opens in Illustrator" },
  { format: "png", label: "PNG", detail: "2x size, white background" },
];

const MESSAGE_MS = 2800;

/** The Export button with a small SVG / PNG dropdown and a brief "Exported" message. */
export function ExportMenu({ enabled, onExport }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const messageTimer = useRef(0);
  const menuId = useId();
  const hintId = useId();

  // Close when nothing is left to export, when clicking elsewhere, or when focus leaves.
  useEffect(() => {
    if (!enabled) setOpen(false);
  }, [enabled]);

  useEffect(() => {
    if (!open) return;
    itemRefs.current[0]?.focus();
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  useEffect(() => () => window.clearTimeout(messageTimer.current), []);

  const show = (text: string, error = false) => {
    window.clearTimeout(messageTimer.current);
    setMessage({ text, error });
    messageTimer.current = window.setTimeout(() => setMessage(null), error ? MESSAGE_MS * 2 : MESSAGE_MS);
  };

  const choose = async (format: ExportFormat) => {
    setOpen(false);
    buttonRef.current?.focus();
    setBusy(true);
    try {
      const fileName = await onExport(format);
      show(`Exported ${fileName}`);
    } catch (err) {
      show(err instanceof Error ? err.message : "Export failed.", true);
    } finally {
      setBusy(false);
    }
  };

  const onMenuKeyDown = (e: KeyboardEvent) => {
    const items = itemRefs.current.filter((el): el is HTMLButtonElement => !!el);
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "ArrowDown") items[(index + 1) % items.length]?.focus();
    else if (e.key === "ArrowUp") items[(index - 1 + items.length) % items.length]?.focus();
    else if (e.key === "Home") items[0]?.focus();
    else if (e.key === "End") items[items.length - 1]?.focus();
    else if (e.key === "Escape") {
      setOpen(false);
      buttonRef.current?.focus();
    } else if (e.key === "Tab") setOpen(false);
    else return;
    if (e.key !== "Tab") e.preventDefault();
  };

  return (
    <div className="export" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="btn btn--primary"
        disabled={!enabled || busy}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-describedby={enabled ? undefined : hintId}
        title={enabled ? undefined : "Nothing to export yet"}
        onClick={() => setOpen((o) => !o)}
      >
        <ExportIcon />
        <span>{busy ? "Exporting…" : "Export"}</span>
        <ChevronDownIcon width={16} height={16} />
      </button>
      {!enabled && (
        <span id={hintId} className="visually-hidden">
          Nothing to export yet. Upload a sketch or choose a sample first.
        </span>
      )}

      {open && (
        <div id={menuId} className="export__menu" role="menu" aria-label="Export format" onKeyDown={onMenuKeyDown}>
          {OPTIONS.map((o, i) => (
            <button
              key={o.format}
              ref={(el) => { itemRefs.current[i] = el; }}
              type="button"
              role="menuitem"
              className="export__item"
              onClick={() => void choose(o.format)}
            >
              <span className="export__item-label">{o.label}</span>
              <span className="export__item-detail">{o.detail}</span>
            </button>
          ))}
        </div>
      )}

      {/* Always rendered so screen readers announce changes to it. */}
      <div className="export__message-slot" role="status" aria-live="polite">
        {message && (
          <span className={`export__message${message.error ? " export__message--error" : ""}`}>{message.text}</span>
        )}
      </div>
    </div>
  );
}
