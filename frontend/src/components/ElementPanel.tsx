import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { CustomElement } from "../../../Builder/buildFlat";
import type { ElementPatch } from "../state/specReducer";
import { PATTERNS } from "../state/specSchema";
import { ChipGroup, ColorSwatch, RangeField, Section } from "./Controls";
import { TrashIcon } from "./Icons";
import { SavePartBar } from "./SavePartBar";
import { LayersSection, type LayersProps } from "./LayersSection";
import { setAroundCenter, MAX_SCALE, MIN_SCALE } from "../draw/transform";

const PATTERN_LABELS = { solid: "Solid", denim: "Denim", plaid: "Plaid", floral: "Floral" } as const;
const MAX_NAME = 120; // the contract's limit
// What "Add fill" starts with: a soft paper tone, so the new fill is visible on the white sheet.
const NEW_FILL = "#e8e2d6";

interface Props {
  element: CustomElement;
  /** `coalesce` merges a stream of changes (a slider, a color drag, typing) into one undo step. */
  onUpdate: (patch: ElementPatch, coalesce?: string) => void;
  /** A drag or typing session ended. */
  onCommit: () => void;
  onDelete: () => void;
  /** Saves this drawing to the library under a name. */
  onSave: (name: string) => Promise<void>;
  onOpenLibrary: () => void;
  layers: LayersProps;
}

type NumberKey = "scale_x" | "scale_y" | "rotation";
const NUMBER_FIELDS: { key: NumberKey; label: string; min: number; max: number; step: number }[] = [
  { key: "scale_x", label: "Scale X", min: MIN_SCALE, max: MAX_SCALE, step: 0.05 },
  { key: "scale_y", label: "Scale Y", min: MIN_SCALE, max: MAX_SCALE, step: 0.05 },
  { key: "rotation", label: "Rotation", min: -360, max: 360, step: 1 },
];

/** An exact number box: applied on Enter or leaving it, Escape and a bad value put the old number back. */
function NumberBox({ id, label, value, min, max, step, onApply }: {
  id: string; label: string; value: number; min: number; max: number; step: number; onApply: (n: number) => void;
}) {
  const shown = String(Math.round(value * 100) / 100);
  const [draft, setDraft] = useState(shown);
  const cancelled = useRef(false);
  useEffect(() => setDraft(shown), [shown, id]);
  const finish = () => {
    if (cancelled.current) { cancelled.current = false; setDraft(shown); return; }
    const n = Number(draft);
    if (draft.trim() === "" || !Number.isFinite(n) || n < min || n > max) setDraft(shown);
    else if (n !== value) onApply(n);
  };
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>{label}</label>
      <input
        id={id}
        className="input"
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={step}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={finish}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); }
          else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); cancelled.current = true; e.currentTarget.blur(); }
        }}
      />
    </div>
  );
}

/** The properties panel while a hand drawn element is selected. */
export function ElementPanel({ element, onUpdate, onCommit, onDelete, onSave, onOpenLibrary, layers }: Props) {
  // The name is edited in a local draft and applied when you press Enter or leave the box, so it
  // can be empty for a moment while typing and Escape can simply throw the draft away.
  const [name, setName] = useState(element.name);
  useEffect(() => setName(element.name), [element.id, element.name]);
  const cancelled = useRef(false);

  const key = (field: string) => `element:${element.id}:${field}`;
  const canClose = element.points.length >= 3;

  const applyName = () => {
    const next = name.trim();
    if (!next) setName(element.name); // an empty name isn't allowed: keep the old one
    else if (next !== element.name) onUpdate({ name: next }); // one rename is one undo step
  };
  const onNameBlur = () => {
    if (cancelled.current) cancelled.current = false;
    else applyName();
  };
  const onNameKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.currentTarget.blur(); // applies the name
    } else if (e.key === "Escape") {
      // Throw the draft away; don't also let go of the selected element.
      e.preventDefault();
      cancelled.current = true;
      setName(element.name);
      e.currentTarget.blur();
    }
  };

  return (
    <aside className="panel panel--right" aria-labelledby="props-heading">
      <div className="panel__header">
        <div className="panel__heading">
          <span className="panel__index" aria-hidden="true">03</span>
          <h2 id="props-heading" className="panel__title">Properties</h2>
        </div>
      </div>
      <div className="panel__body">
        <SavePartBar key={element.id} label={element.name} onSave={onSave} onOpenLibrary={onOpenLibrary} />
        <Section name="drawing" title="Drawing">
          <div className="field">
            <label className="field__label" htmlFor="element-name">Name</label>
            <input
              id="element-name"
              className="input"
              type="text"
              value={name}
              maxLength={MAX_NAME}
              onChange={(e) => setName(e.target.value)}
              onBlur={onNameBlur}
              onKeyDown={onNameKeyDown}
            />
          </div>

          <div className="field">
            <div className="field__row">
              <label className="field__label" htmlFor="element-stroke">Stroke color</label>
              <ColorSwatch
                id="element-stroke"
                value={element.stroke.toLowerCase()}
                label="Stroke color"
                onChange={(hex) => onUpdate({ stroke: hex }, key("stroke"))}
                onCommit={onCommit}
              />
            </div>
          </div>

          <RangeField
            label="Stroke width"
            min={0.5}
            max={20}
            step={0.5}
            value={Math.min(20, element.stroke_width)}
            display={String(element.stroke_width)}
            onChange={(v) => onUpdate({ stroke_width: v }, key("stroke_width"))}
            onCommit={onCommit}
          />

          <ChipGroup
            label="Shape"
            options={[
              { value: false, label: "Open line" },
              { value: true, label: "Closed shape", disabled: !canClose },
            ]}
            value={element.closed}
            onChange={(closed) => onUpdate({ closed })}
          />
          {!canClose && <p className="field__hint">A closed shape needs at least 3 points.</p>}
        </Section>

        <Section name="transform" title="Size and angle">
          <div className="field--pair">
            {NUMBER_FIELDS.map((f) => (
              <NumberBox
                key={f.key}
                id={`element-${f.key}`}
                label={f.label}
                value={element.transform[f.key]}
                min={f.min}
                max={f.max}
                step={f.step}
                // Applied around the line's own center, so it stays where it is.
                onApply={(n) => onUpdate({ transform: setAroundCenter(element, { [f.key]: n }) })}
              />
            ))}
          </div>
          <p className="field__hint">Or drag the corner handles on the canvas to resize (Shift keeps proportions) and the round handle to turn it (Shift snaps to 15 degrees).</p>
        </Section>

        {element.closed && (
          <Section name="fill" title="Fill">
            {element.fill === null ? (
              <>
                <p className="field__hint">This shape has no fill. Add one to color it or give it a fabric.</p>
                <button type="button" className="btn btn--ghost btn--sm match-btn" onClick={() => onUpdate({ fill: NEW_FILL })}>
                  Add fill
                </button>
              </>
            ) : (
              <>
                <div className="field">
                  <div className="field__row">
                    <label className="field__label" htmlFor="element-fill">Fill color</label>
                    <ColorSwatch
                      id="element-fill"
                      value={element.fill.toLowerCase()}
                      label="Fill color"
                      onChange={(hex) => onUpdate({ fill: hex }, key("fill"))}
                      onCommit={onCommit}
                    />
                  </div>
                </div>
                <ChipGroup
                  label="Pattern"
                  options={PATTERNS.map((p) => ({ value: p, label: PATTERN_LABELS[p] }))}
                  value={element.pattern}
                  onChange={(pattern) => onUpdate({ pattern })}
                />
                <button type="button" className="btn btn--ghost btn--sm match-btn" onClick={() => onUpdate({ fill: null })}>
                  Remove fill
                </button>
              </>
            )}
          </Section>
        )}

        <LayersSection {...layers} />

        <Section name="remove" title="Remove">
          <p className="field__hint">Drag the line on the canvas to move it. Press Delete or Backspace, or use the button, to remove it. Undo brings it back.</p>
          <button type="button" className="btn btn--danger btn--sm match-btn" onClick={onDelete}>
            <TrashIcon width={16} height={16} />
            <span>Delete</span>
          </button>
        </Section>
      </div>
    </aside>
  );
}
