import { useEffect, useRef } from "react";
import type { DesignSpec, PartName } from "../../../Builder/types";
import type { CanvasState } from "../types";
import {
  DEFAULT_STYLE,
  FILLED_PARTS,
  MAX_NOTES_LENGTH,
  NECKLINE_TYPES,
  PART_NAMES,
  PART_LABELS,
  PATTERNS,
  POCKET_TYPES,
  SILHOUETTES,
  SKIRT_LENGTHS,
  SLEEVE_LENGTHS,
  SLEEVE_TYPES,
  stylePath,
  type EditAction,
} from "../state/specSchema";
import { ChipGroup, ColorSwatch, RangeField, Section } from "./Controls";
import { SavePartBar } from "./SavePartBar";
import { tee } from "./garmentPaths";

interface Props {
  /** The current spec, or null when nothing is loaded (or it can't be edited right now). */
  spec: DesignSpec | null;
  canvasStatus: CanvasState["status"];
  /** The part picked on the canvas. A new `nonce` on every click, so re-clicking re-highlights. */
  selection: { part: PartName; nonce: number } | null;
  /** `coalesce` names a control that streams changes (a slider drag), so they merge into one undo step. */
  onEdit: (action: EditAction, coalesce?: string) => void;
  /** A drag or typing session ended. */
  onCommit: () => void;
  /** Saves the selected part's settings to the library under this name. */
  onSavePart: (part: PartName, name: string) => Promise<void>;
  onOpenLibrary: () => void;
  /** Trim parts (collar, waistband) that currently copy the bodice's color and pattern. */
  following: readonly PartName[];
}

// Which section holds the controls for each canvas part. The bodice has no
// settings of its own: its shape comes from the proportions.
const SECTION_FOR_PART: Record<PartName, string> = {
  collar_neckline: "neckline",
  bodice: "proportions",
  left_sleeve: "sleeves",
  right_sleeve: "sleeves",
  waist_seam: "waist",
  skirt: "skirt",
  pockets: "details",
  buttons: "details",
};

const FLASH_MS = 1400;

const NECKLINE_LABELS: Record<(typeof NECKLINE_TYPES)[number], string> = {
  crew: "Crew", v: "V", scoop: "Scoop", square: "Square",
};
const SLEEVE_TYPE_LABELS: Record<(typeof SLEEVE_TYPES)[number], string> = {
  none: "None", cap: "Cap", puff: "Puff", fitted: "Fitted",
};
const SLEEVE_LENGTH_LABELS: Record<(typeof SLEEVE_LENGTHS)[number], string> = {
  short: "Short", elbow: "Elbow", long: "Long",
};
const SILHOUETTE_LABELS: Record<(typeof SILHOUETTES)[number], string> = {
  straight: "Straight", a_line: "A-line", flared: "Flared",
};
const SKIRT_LENGTH_LABELS: Record<(typeof SKIRT_LENGTHS)[number], string> = {
  mini: "Mini", knee: "Knee", midi: "Midi", floor: "Floor",
};
const POCKET_LABELS: Record<(typeof POCKET_TYPES)[number], string> = {
  none: "None", patch: "Patch", side_seam: "Side seam",
};
const PATTERN_LABELS: Record<(typeof PATTERNS)[number], string> = {
  solid: "Solid", denim: "Denim", plaid: "Plaid", floral: "Floral",
};
const toOptions = <T extends string>(values: readonly T[], labels: Record<T, string>) =>
  values.map((value) => ({ value, label: labels[value] }));

const unitDisplay = (v: number) => v.toFixed(2);
// Avoid float noise like 0.30000000000000004 reaching the spec.
const round2 = (v: number) => Math.round(v * 100) / 100;

export function PropertiesPanel({ spec, canvasStatus, selection, onEdit, onCommit, onSavePart, onOpenLibrary, following }: Props) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const flashTimer = useRef<number>(0);

  // Selecting a part scrolls to its section and briefly highlights it and its fabric row.
  useEffect(() => {
    const body = bodyRef.current;
    if (!selection || !body) return;
    const section = body.querySelector<HTMLElement>(`[data-section="${SECTION_FOR_PART[selection.part]}"]`);
    const row = body.querySelector<HTMLElement>(`[data-part-row="${selection.part}"]`);
    if (!section) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    section.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });

    const targets = [section, row].filter((el): el is HTMLElement => !!el);
    const clear = () => targets.forEach((el) => el.classList.remove("is-flash"));
    targets.forEach((el) => el.classList.add("is-flash"));
    flashTimer.current = window.setTimeout(clear, FLASH_MS);
    return () => {
      window.clearTimeout(flashTimer.current);
      clear();
    };
  }, [selection]);

  // `stream` marks edits that arrive many times per gesture (sliders, color picker, typing).
  const set = (path: string, value: EditAction["value"], stream = false) =>
    onEdit({ op: "set", path, value }, stream ? path : undefined);

  return (
    <aside className="panel panel--right" aria-labelledby="props-heading">
      <div className="panel__header">
        <div className="panel__heading">
          <span className="panel__index" aria-hidden="true">03</span>
          <h2 id="props-heading" className="panel__title">Properties</h2>
        </div>
      </div>
      <div className="panel__body" ref={bodyRef}>
        {spec ? (
          <>
            {selection && <SavePartBar key={selection.part} part={selection.part} onSave={onSavePart} onOpenLibrary={onOpenLibrary} />}
            <Section name="neckline" title="Neckline">
              <ChipGroup
                label="Type"
                options={toOptions(NECKLINE_TYPES, NECKLINE_LABELS)}
                value={spec.neckline.type}
                onChange={(v) => set("neckline.type", v)}
              />
              <RangeField
                onCommit={onCommit}
                label="Depth"
                min={0} max={1} step={0.05}
                value={spec.neckline.depth}
                display={unitDisplay(spec.neckline.depth)}
                ends={["Shallow", "Deep"]}
                onChange={(v) => set("neckline.depth", round2(v), true)}
              />
            </Section>

            <Section name="sleeves" title="Sleeves">
              <ChipGroup
                label="Type"
                options={toOptions(SLEEVE_TYPES, SLEEVE_TYPE_LABELS)}
                value={spec.sleeves.type}
                onChange={(v) => set("sleeves.type", v)}
              />
              <RangeField
                onCommit={onCommit}
                label="Length"
                min={0} max={SLEEVE_LENGTHS.length - 1} step={1}
                value={SLEEVE_LENGTHS.indexOf(spec.sleeves.length)}
                display={SLEEVE_LENGTH_LABELS[spec.sleeves.length]}
                ends={["Short", "Long"]}
                disabled={spec.sleeves.type === "none"}
                hint={spec.sleeves.type === "none" ? "Sleeve length applies when sleeves are present." : undefined}
                onChange={(i) => set("sleeves.length", SLEEVE_LENGTHS[i], true)}
              />
            </Section>

            <Section name="waist" title="Waist">
              <ChipGroup
                label="Waist seam"
                options={[{ value: true, label: "Seam" }, { value: false, label: "No seam" }]}
                value={spec.waist.seam}
                onChange={(v) => set("waist.seam", v)}
              />
            </Section>

            <Section name="skirt" title="Skirt">
              <ChipGroup
                label="Silhouette"
                options={toOptions(SILHOUETTES, SILHOUETTE_LABELS)}
                value={spec.skirt.silhouette}
                onChange={(v) => set("skirt.silhouette", v)}
              />
              <RangeField
                onCommit={onCommit}
                label="Length"
                min={0} max={SKIRT_LENGTHS.length - 1} step={1}
                value={SKIRT_LENGTHS.indexOf(spec.skirt.length)}
                display={SKIRT_LENGTH_LABELS[spec.skirt.length]}
                ends={["Mini", "Floor"]}
                onChange={(i) => set("skirt.length", SKIRT_LENGTHS[i], true)}
              />
            </Section>

            <Section name="details" title="Details">
              <ChipGroup
                label="Pockets"
                options={toOptions(POCKET_TYPES, POCKET_LABELS)}
                value={spec.details.pockets}
                onChange={(v) => set("details.pockets", v)}
              />
              <RangeField
                onCommit={onCommit}
                label="Buttons"
                min={0} max={8} step={1}
                value={spec.details.buttons}
                display={String(spec.details.buttons)}
                onChange={(v) => set("details.buttons", v, true)}
              />
            </Section>

            <Section name="proportions" title="Proportions">
              <RangeField
                onCommit={onCommit}
                label="Shoulder width"
                min={0} max={1} step={0.05}
                value={spec.proportions.shoulder_width}
                display={unitDisplay(spec.proportions.shoulder_width)}
                onChange={(v) => set("proportions.shoulder_width", round2(v), true)}
              />
              <RangeField
                onCommit={onCommit}
                label="Waist height"
                min={0} max={1} step={0.05}
                value={spec.proportions.waist_y}
                display={unitDisplay(spec.proportions.waist_y)}
                ends={["Empire", "Dropped"]}
                onChange={(v) => set("proportions.waist_y", round2(v), true)}
              />
            </Section>

            <Section name="fabric" title="Fabric & color">
              <div className="parts">
                {PART_NAMES.map((part) => {
                  const style = { ...DEFAULT_STYLE, ...spec.style[part] };
                  const filled = FILLED_PARTS.includes(part);
                  return (
                    <div className="part" key={part} data-part-row={part}>
                      <div className="field__row">
                        <label className="field__label" htmlFor={`fill-${part}`}>{PART_LABELS[part]}</label>
                        <ColorSwatch
                          id={`fill-${part}`}
                          value={String(style.fill).toLowerCase()}
                          disabled={!filled}
                          label={`${PART_LABELS[part]} color`}
                          onChange={(hex) => set(stylePath(part, "fill"), hex, true)}
                          onCommit={onCommit}
                        />
                      </div>
                      <ChipGroup
                        small
                        label={`${PART_LABELS[part]} pattern`}
                        options={toOptions(PATTERNS, PATTERN_LABELS)}
                        value={style.pattern}
                        disabled={!filled}
                        onChange={(v) => set(stylePath(part, "pattern"), v)}
                      />
                      {!filled && <p className="field__hint">The builder doesn’t fill this part yet.</p>}
                      {following.includes(part) && (
                        <p className="field__hint">Follows the bodice until you set a color or pattern here.</p>
                      )}
                      {part === "waist_seam" && !spec.waist.seam && (
                        <p className="field__hint">The waistband only shows when the waist seam is on.</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </Section>

            <Section name="notes" title="Notes">
              <div className="field">
                <label className="field__label" htmlFor="spec-notes">Design notes</label>
                <textarea
                  id="spec-notes"
                  className="textarea"
                  rows={4}
                  maxLength={MAX_NOTES_LENGTH}
                  value={spec.notes}
                  placeholder="Anything the settings above can’t express"
                  onChange={(e) => set("notes", e.target.value, true)}
                  onBlur={onCommit}
                />
              </div>
            </Section>
          </>
        ) : (
          <div className="empty">
            <svg className="empty__art" viewBox="0 0 400 400" aria-hidden="true">
              <g strokeLinejoin="round" strokeLinecap="round" strokeWidth="5">
                <path d={tee.frontBody} className="empty__art-body" />
                <path d={tee.rightSleeve} className="empty__art-part" />
                <path d={tee.frontRib} fill="none" className="empty__art-line" />
              </g>
            </svg>
            <p className="empty__title">Nothing to edit yet</p>
            <p className="muted">
              {canvasStatus === "loading"
                ? "Waiting for the analysis to finish."
                : "Upload a sketch, or view the sample, and its properties will appear here."}
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}
