import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { SAMPLES, type SampleDesign } from "../samples";
import { ChevronDownIcon, EyeIcon } from "./Icons";

interface Props {
  /** The chosen sample. The caller decides whether to ask about unsaved changes first. */
  onChoose: (sample: SampleDesign) => void;
  /** The primary look is used on the empty canvas; the quieter one inside the sketch panel. */
  variant?: "primary" | "ghost";
  /** Where the menu lines up with its button. */
  align?: "left" | "right";
}

/** A "Samples" button with a small menu of ready made designs. */
export function SamplesMenu({ onChoose, variant = "ghost", align = "left" }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    itemRefs.current[0]?.focus();
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const choose = (sample: SampleDesign) => {
    setOpen(false);
    buttonRef.current?.focus();
    onChoose(sample);
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
    <div className="export samples" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className={`btn ${variant === "primary" ? "btn--primary" : "btn--ghost"}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        <EyeIcon />
        <span>Samples</span>
        <ChevronDownIcon width={16} height={16} />
      </button>
      {open && (
        <div id={menuId} className={`export__menu samples__menu samples__menu--${align}`} role="menu" aria-label="Sample designs" onKeyDown={onMenuKeyDown}>
          {SAMPLES.map((s, i) => (
            <button
              key={s.id}
              ref={(el) => { itemRefs.current[i] = el; }}
              type="button"
              role="menuitem"
              className="export__item"
              data-sample={s.id}
              onClick={() => choose(s)}
            >
              <span className="export__item-label">{s.name}</span>
              <span className="export__item-detail">{s.blurb}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
