import { useId, type ReactNode } from "react";

/** Small uppercase label that groups related controls. */
export function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <section className="prop-section" aria-labelledby={id}>
      <h3 id={id} className="eyebrow">{title}</h3>
      <div className="prop-section__body">{children}</div>
    </section>
  );
}

interface ChipOption<T> {
  value: T;
  label: string;
}

interface ChipGroupProps<T extends string | boolean> {
  label: string;
  options: readonly ChipOption<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  small?: boolean;
}

/** Segmented chips: one option selected at a time, selected shown in the accent color. */
export function ChipGroup<T extends string | boolean>({
  label,
  options,
  value,
  onChange,
  disabled,
  small,
}: ChipGroupProps<T>) {
  return (
    <div className={`field${small ? " field--compact" : ""}`}>
      <span className="field__label">{label}</span>
      <div className={`chips${small ? " chips--small" : ""}`} role="group" aria-label={label}>
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            className="chip-btn"
            aria-pressed={o.value === value}
            disabled={disabled}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

interface RangeFieldProps {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  /** Text shown beside the label and announced to screen readers. */
  display: string;
  onChange: (value: number) => void;
  disabled?: boolean;
  /** Short captions under the two ends of the track. */
  ends?: [string, string];
  hint?: string;
}

/** Slider with its current value always visible. */
export function RangeField({ label, min, max, step, value, display, onChange, disabled, ends, hint }: RangeFieldProps) {
  const id = useId();
  return (
    <div className="field">
      <div className="field__row">
        <label className="field__label" htmlFor={id}>{label}</label>
        <output className="field__value" htmlFor={id}>{display}</output>
      </div>
      <input
        id={id}
        className="range"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-valuetext={display}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {ends && (
        <div className="range__ends" aria-hidden="true">
          <span>{ends[0]}</span>
          <span>{ends[1]}</span>
        </div>
      )}
      {hint && <p className="field__hint">{hint}</p>}
    </div>
  );
}
