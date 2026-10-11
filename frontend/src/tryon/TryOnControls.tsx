import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import "./tryon.css";
import {
  DEFAULT_FIGURE, HAIR_COLORS, HAIR_STYLES, MEASURES, PRESETS, SKIN_TONES,
  isStandardBody, readout, type FigureOptions, type Measure,
} from "./figure";
import type { TryOn } from "./useTryOn";

interface Props {
  tryOn: TryOn;
  /** The current dress's proportions.shoulder_width, used for the centimetre readouts. */
  shoulderWidth?: number;
  disabled?: boolean;
}

/** The "Try it on" pill and, while the figure is showing, the button that opens its settings. */
export function TryOnControls({ tryOn, shoulderWidth = 0.5, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);
  const panelId = useId();
  const { on, figure, setFigure } = tryOn;

  // The panel sits beside the canvas, over the panel to its left, so it never covers the figure
  // it is changing. If there is no room there (a narrow window) it drops below the button.
  const [place, setPlace] = useState<CSSProperties | undefined>();
  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const stage = wrap.current?.closest(".stage")?.getBoundingClientRect();
      const width = 296;
      const left = stage ? stage.left - width - 8 : -1;
      setPlace(stage && left >= 8 ? { position: "fixed", left, right: "auto", top: stage.top, maxHeight: `calc(100vh - ${stage.top + 16}px)` } : undefined);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [open]);

  // The panel only exists while the figure is showing.
  useEffect(() => {
    if (!on || disabled) setOpen(false);
  }, [on, disabled]);

  // Clicking anywhere else, or pressing Escape, closes the panel.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault(); // so the canvas does not also treat it as "deselect"
      setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  const set = (patch: Partial<FigureOptions>) => setFigure({ ...figure, ...patch });
  const usePreset = (body: Partial<Record<Measure, number>>) => {
    const standard = Object.fromEntries(MEASURES.map((m) => [m.key, 1])) as Record<Measure, number>;
    setFigure({ ...figure, ...standard, ...body });
  };
  const activePreset = PRESETS.find((preset) => MEASURES.every((m) => Math.abs(figure[m.key] - (preset.body[m.key] ?? 1)) < 0.001));

  return (
    <span className="tryon" ref={wrap}>
      <button
        type="button"
        className="tryon-pill"
        aria-pressed={on}
        disabled={disabled}
        title={disabled ? "Open a design first" : on ? "Show the flat on its own" : "See the dress on a figure"}
        onClick={tryOn.toggle}
      >
        <svg className="tryon-pill__icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <circle cx="8" cy="2.6" r="1.7" fill="none" stroke="currentColor" strokeWidth="1.3" />
          <path d="M5.2 6.2 Q8 4.6 10.8 6.2 L9.9 9.2 L11.9 14.2 H4.1 L6.1 9.2 Z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
        </svg>
        <span>{on ? "On figure" : "Try it on"}</span>
        <span className="tryon-pill__dot" aria-hidden="true" />
      </button>

      {on && !disabled && (
        <button
          type="button"
          className="tryon-gear"
          aria-label="Figure settings"
          aria-expanded={open}
          aria-controls={panelId}
          title="Change the figure: size, skin and hair"
          onClick={() => setOpen((v) => !v)}
        >
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
            <path d="M2 4.5h7M12.5 4.5H14M2 11.5h1.5M7 11.5h7" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            <circle cx="10.75" cy="4.5" r="1.75" fill="none" stroke="currentColor" strokeWidth="1.4" />
            <circle cx="5.25" cy="11.5" r="1.75" fill="none" stroke="currentColor" strokeWidth="1.4" />
          </svg>
        </button>
      )}

      {open && (
        <div className="tryon-panel" id={panelId} role="dialog" aria-label="Figure settings" style={place}>
          <header className="tryon-panel__head">
            <h3 className="tryon-panel__title">Figure</h3>
            <button
              type="button"
              className="tryon-link"
              disabled={isStandardBody(figure) && figure.skin === DEFAULT_FIGURE.skin && figure.hair === DEFAULT_FIGURE.hair && figure.hairColor === DEFAULT_FIGURE.hairColor}
              onClick={() => setFigure(DEFAULT_FIGURE)}
            >
              Reset
            </button>
          </header>

          <section className="tryon-group" aria-label="Body shape">
            <h4 className="tryon-group__title">Shape</h4>
            <div className="tryon-chips">
              {PRESETS.map((preset) => (
                <button key={preset.name} type="button" className="tryon-chip" aria-pressed={activePreset?.name === preset.name} onClick={() => usePreset(preset.body)}>
                  {preset.name}
                </button>
              ))}
            </div>
          </section>

          <section className="tryon-group" aria-label="Measurements">
            <h4 className="tryon-group__title">Measurements</h4>
            {MEASURES.map((m) => (
              <label key={m.key} className="tryon-slider">
                <span className="tryon-slider__row">
                  <span className="tryon-slider__label">{m.label}</span>
                  <span className="tryon-slider__value">{readout(m.key, figure, shoulderWidth)} cm</span>
                </span>
                <input
                  type="range"
                  className="tryon-range"
                  min={m.min}
                  max={m.max}
                  step={0.01}
                  value={figure[m.key]}
                  onChange={(e) => set({ [m.key]: Number(e.target.value) })}
                />
              </label>
            ))}
            <p className="tryon-note">
              Sizes are approximate. The dress is fitted to the figure, and the figure follows the dress’s shoulder width.
            </p>
          </section>

          <section className="tryon-group" aria-label="Skin tone">
            <h4 className="tryon-group__title">Skin</h4>
            <div className="tryon-swatches">
              {SKIN_TONES.map((tone) => (
                <button key={tone} type="button" className="tryon-swatch" style={{ background: tone }} aria-label={`Skin tone ${tone}`} aria-pressed={figure.skin === tone} onClick={() => set({ skin: tone })} />
              ))}
            </div>
          </section>

          <section className="tryon-group" aria-label="Hair">
            <h4 className="tryon-group__title">Hair</h4>
            <div className="tryon-chips">
              {HAIR_STYLES.map((style) => (
                <button key={style.key} type="button" className="tryon-chip" aria-pressed={figure.hair === style.key} onClick={() => set({ hair: style.key })}>
                  {style.label}
                </button>
              ))}
            </div>
            <div className="tryon-swatches">
              {HAIR_COLORS.map((color) => (
                <button key={color} type="button" className="tryon-swatch" style={{ background: color }} aria-label={`Hair color ${color}`} aria-pressed={figure.hairColor === color} onClick={() => set({ hairColor: color })} />
              ))}
            </div>
          </section>
        </div>
      )}
    </span>
  );
}
