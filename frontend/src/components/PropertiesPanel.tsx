import { useEffect, useRef } from "react";
import type { DesignSpec, PartName } from "../../../Builder/types";
import type { CanvasState } from "../types";
import {
  BOW_TYPES,
  COLLAR_TYPES,
  CUFF_TYPES,
  DEFAULT_STYLE,
  FULLNESS_TYPES,
  HEM_TYPES,
  PANEL_TYPES,
  PLACKET_TYPES,
  SHOULDER_TYPES,
  TRIM_TYPES,
  WAIST_STYLES,
  specValue,
  FILLED_PARTS,
  FOLLOWER_PARTS,
  MAX_NOTES_LENGTH,
  NECKLINE_TYPES,
  PARTS_FOR,
  anyControlShown,
  controlShown,
  garmentOf,
  optionsFor,
  partLabel,
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
import { LayersSection, type LayersProps } from "./LayersSection";
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
  /** Hands a collar or waistband with its own style back to the bodice's color and pattern. */
  onMatchBodice: (part: PartName) => void;
  layers: LayersProps;
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
  sweetheart: "Sweetheart", off_shoulder: "Off shoulder", halter: "Halter", high: "High",
};
const COLLAR_LABELS: Record<(typeof COLLAR_TYPES)[number], string> = {
  none: "None", shirt: "Shirt", peter_pan: "Peter Pan", band: "Band", mandarin: "Mandarin",
};
const CUFF_LABELS: Record<(typeof CUFF_TYPES)[number], string> = {
  none: "None", band: "Band", ruffle: "Ruffle", elastic: "Elastic",
};
const SHOULDER_LABELS: Record<(typeof SHOULDER_TYPES)[number], string> = {
  set_in: "Set in", puff_top: "Puff top", off_shoulder: "Off shoulder",
};
const WAIST_STYLE_LABELS: Record<(typeof WAIST_STYLES)[number], string> = {
  natural: "Natural", empire: "Empire", dropped: "Dropped", belted: "Belted",
};
const FULLNESS_LABELS: Record<(typeof FULLNESS_TYPES)[number], string> = {
  plain: "Plain", gathered: "Gathered", pleated: "Pleated",
};
const HEM_LABELS: Record<(typeof HEM_TYPES)[number], string> = {
  plain: "Plain", ruffle: "Ruffle", tiered: "Tiered", slit: "Slit",
};
const PANEL_LABELS: Record<(typeof PANEL_TYPES)[number], string> = {
  none: "None", front_seam: "Front seam", princess_seams: "Princess seams",
};
const PLACKET_LABELS: Record<(typeof PLACKET_TYPES)[number], string> = {
  none: "None", bodice: "Bodice", full: "Full length",
};
const BOW_LABELS: Record<(typeof BOW_TYPES)[number], string> = {
  none: "None", neckline: "Neckline", waist: "Waist",
};
const TRIM_LABELS: Record<(typeof TRIM_TYPES)[number], string> = {
  none: "None", piping: "Piping", lace: "Lace",
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

export function PropertiesPanel({ spec, canvasStatus, selection, onEdit, onCommit, onSavePart, onOpenLibrary, following, onMatchBodice, layers }: Props) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const flashTimer = useRef<number>(0);
  // The garment type is locked (it comes from the spec). It decides which controls and parts apply.
  const garment = garmentOf(spec);
  const shown = (path: string) => controlShown(path, garment);

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
            <LayersSection {...layers} />
            {selection && <SavePartBar key={selection.part} label={partLabel(selection.part, garment)} onSave={(name) => onSavePart(selection.part, name)} onOpenLibrary={onOpenLibrary} />}
            <Section name="neckline" title="Neckline" hidden={!anyControlShown(garment, "neckline.", "collar.")}>
              <ChipGroup
                label="Type"
                options={optionsFor("neckline.type", garment, toOptions(NECKLINE_TYPES, NECKLINE_LABELS))}
                hidden={!shown("neckline.type")}
                value={spec.neckline.type}
                onChange={(v) => set("neckline.type", v)}
              />
              {shown("neckline.type") && !optionsFor("neckline.type", garment, toOptions(NECKLINE_TYPES, NECKLINE_LABELS)).some((o) => o.value === spec.neckline.type) && (
                <p className="field__hint">
                  This design has a {NECKLINE_LABELS[spec.neckline.type as keyof typeof NECKLINE_LABELS] ?? spec.neckline.type} neckline, which the builder doesn’t draw yet, so the flat shows it as a scoop. The setting is kept.
                </p>
              )}
              <ChipGroup
                label="Collar"
                hidden={!shown("collar.type")}
                options={toOptions(COLLAR_TYPES, COLLAR_LABELS)}
                value={specValue<(typeof COLLAR_TYPES)[number]>(spec, "collar.type")}
                onChange={(v) => set("collar.type", v)}
              />
              <RangeField
                onCommit={onCommit}
                label="Depth"
                hidden={!shown("neckline.depth")}
                min={0} max={1} step={0.05}
                value={spec.neckline.depth}
                display={unitDisplay(spec.neckline.depth)}
                ends={["Shallow", "Deep"]}
                onChange={(v) => set("neckline.depth", round2(v), true)}
              />
            </Section>

            <Section name="sleeves" title="Sleeves" hidden={!anyControlShown(garment, "sleeves.")}>
              <ChipGroup
                label="Type"
                options={toOptions(SLEEVE_TYPES, SLEEVE_TYPE_LABELS)}
                hidden={!shown("sleeves.type")}
                value={spec.sleeves.type}
                onChange={(v) => set("sleeves.type", v)}
              />
              <RangeField
                onCommit={onCommit}
                label="Length"
                min={0} max={SLEEVE_LENGTHS.length - 1} step={1}
                value={SLEEVE_LENGTHS.indexOf(spec.sleeves.length)}
                display={SLEEVE_LENGTH_LABELS[spec.sleeves.length]}
                hidden={!shown("sleeves.length")}
                ends={["Short", "Long"]}
                disabled={spec.sleeves.type === "none"}
                hint={spec.sleeves.type === "none" ? "Sleeve length applies when sleeves are present." : undefined}
                onChange={(i) => set("sleeves.length", SLEEVE_LENGTHS[i], true)}
              />
              <ChipGroup
                label="Cuff"
                hidden={!shown("sleeves.cuff")}
                options={toOptions(CUFF_TYPES, CUFF_LABELS)}
                value={specValue<(typeof CUFF_TYPES)[number]>(spec, "sleeves.cuff")}
                onChange={(v) => set("sleeves.cuff", v)}
              />
              <ChipGroup
                label="Shoulder"
                hidden={!shown("sleeves.shoulder")}
                options={toOptions(SHOULDER_TYPES, SHOULDER_LABELS)}
                value={specValue<(typeof SHOULDER_TYPES)[number]>(spec, "sleeves.shoulder")}
                onChange={(v) => set("sleeves.shoulder", v)}
              />
            </Section>

            <Section name="waist" title="Waist" hidden={!anyControlShown(garment, "waist.")}>
              <ChipGroup
                label="Waist seam"
                hidden={!shown("waist.seam")}
                options={[{ value: true, label: "Seam" }, { value: false, label: "No seam" }]}
                value={spec.waist.seam}
                onChange={(v) => set("waist.seam", v)}
              />
              <ChipGroup
                label="Waist style"
                hidden={!shown("waist.style")}
                options={optionsFor("waist.style", garment, toOptions(WAIST_STYLES, WAIST_STYLE_LABELS))}
                value={specValue<(typeof WAIST_STYLES)[number]>(spec, "waist.style")}
                onChange={(v) => set("waist.style", v)}
              />
              {shown("waist.style") && !optionsFor("waist.style", garment, toOptions(WAIST_STYLES, WAIST_STYLE_LABELS)).some((o) => o.value === specValue(spec, "waist.style")) && (
                <p className="field__hint">
                  This design has a {WAIST_STYLE_LABELS[specValue<(typeof WAIST_STYLES)[number]>(spec, "waist.style")]} waist style, which the builder draws the same as Natural (use Waist height to move the waist). The setting is kept.
                </p>
              )}
            </Section>

            <Section name="skirt" title={garment === "top" ? "Lower part" : "Skirt"} hidden={!anyControlShown(garment, "skirt.")}>
              <ChipGroup
                label="Silhouette"
                hidden={!shown("skirt.silhouette")}
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
                hidden={!shown("skirt.length")}
                ends={["Mini", "Floor"]}
                onChange={(i) => set("skirt.length", SKIRT_LENGTHS[i], true)}
              />
              <ChipGroup
                label="Fullness"
                hidden={!shown("skirt.fullness")}
                options={toOptions(FULLNESS_TYPES, FULLNESS_LABELS)}
                value={specValue<(typeof FULLNESS_TYPES)[number]>(spec, "skirt.fullness")}
                onChange={(v) => set("skirt.fullness", v)}
              />
              <ChipGroup
                label="Hem"
                hidden={!shown("skirt.hem")}
                options={toOptions(HEM_TYPES, HEM_LABELS)}
                value={specValue<(typeof HEM_TYPES)[number]>(spec, "skirt.hem")}
                onChange={(v) => set("skirt.hem", v)}
              />
              <ChipGroup
                label="Panels"
                hidden={!shown("skirt.panels")}
                options={toOptions(PANEL_TYPES, PANEL_LABELS)}
                value={specValue<(typeof PANEL_TYPES)[number]>(spec, "skirt.panels")}
                onChange={(v) => set("skirt.panels", v)}
              />
            </Section>

            <Section name="details" title="Details" hidden={!anyControlShown(garment, "details.")}>
              <ChipGroup
                label="Pockets"
                hidden={!shown("details.pockets")}
                options={toOptions(POCKET_TYPES, POCKET_LABELS)}
                value={spec.details.pockets}
                onChange={(v) => set("details.pockets", v)}
              />
              <RangeField
                onCommit={onCommit}
                label="Buttons"
                hidden={!shown("details.buttons")}
                min={0} max={8} step={1}
                value={spec.details.buttons}
                display={String(spec.details.buttons)}
                onChange={(v) => set("details.buttons", v, true)}
              />
              <ChipGroup
                label="Placket"
                hidden={!shown("details.placket")}
                options={toOptions(PLACKET_TYPES, PLACKET_LABELS)}
                value={specValue<(typeof PLACKET_TYPES)[number]>(spec, "details.placket")}
                onChange={(v) => set("details.placket", v)}
              />
              <ChipGroup
                label="Darts"
                hidden={!shown("details.darts")}
                options={[{ value: true, label: "Darts" }, { value: false, label: "No darts" }]}
                value={specValue<boolean>(spec, "details.darts")}
                onChange={(v) => set("details.darts", v)}
              />
              <ChipGroup
                label="Bow"
                hidden={!shown("details.bow")}
                options={optionsFor("details.bow", garment, toOptions(BOW_TYPES, BOW_LABELS))}
                value={specValue<(typeof BOW_TYPES)[number]>(spec, "details.bow")}
                onChange={(v) => set("details.bow", v)}
              />
              <ChipGroup
                label="Trim"
                hidden={!shown("details.trim")}
                options={toOptions(TRIM_TYPES, TRIM_LABELS)}
                value={specValue<(typeof TRIM_TYPES)[number]>(spec, "details.trim")}
                onChange={(v) => set("details.trim", v)}
              />
            </Section>

            <Section name="proportions" title="Proportions" hidden={!anyControlShown(garment, "proportions.")}>
              <RangeField
                onCommit={onCommit}
                label="Shoulder width"
                hidden={!shown("proportions.shoulder_width")}
                min={0} max={1} step={0.05}
                value={spec.proportions.shoulder_width}
                display={unitDisplay(spec.proportions.shoulder_width)}
                onChange={(v) => set("proportions.shoulder_width", round2(v), true)}
              />
              <RangeField
                onCommit={onCommit}
                label="Waist height"
                hidden={!shown("proportions.waist_y")}
                min={0} max={1} step={0.05}
                value={spec.proportions.waist_y}
                display={unitDisplay(spec.proportions.waist_y)}
                ends={["Empire", "Dropped"]}
                onChange={(v) => set("proportions.waist_y", round2(v), true)}
              />
            </Section>

            <Section name="fabric" title="Fabric & color">
              <div className="parts">
                {PARTS_FOR[garment].map((part) => {
                  const style = { ...DEFAULT_STYLE, ...spec.style[part] };
                  const filled = FILLED_PARTS.includes(part);
                  return (
                    <div className="part" key={part} data-part-row={part}>
                      <div className="field__row">
                        <label className="field__label" htmlFor={`fill-${part}`}>{partLabel(part, garment)}</label>
                        <ColorSwatch
                          id={`fill-${part}`}
                          value={String(style.fill).toLowerCase()}
                          disabled={!filled}
                          label={`${partLabel(part, garment)} color`}
                          onChange={(hex) => set(stylePath(part, "fill"), hex, true)}
                          onCommit={onCommit}
                        />
                      </div>
                      <ChipGroup
                        small
                        label={`${partLabel(part, garment)} pattern`}
                        options={toOptions(PATTERNS, PATTERN_LABELS)}
                        value={style.pattern}
                        disabled={!filled}
                        onChange={(v) => set(stylePath(part, "pattern"), v)}
                      />
                      {!filled && <p className="field__hint">The builder doesn’t fill this part yet.</p>}
                      {garment !== "skirt" && FOLLOWER_PARTS.includes(part) && !following.includes(part) && (
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm match-btn"
                          aria-label={`Make ${partLabel(part, garment)} follow the bodice again`}
                          onClick={() => onMatchBodice(part)}
                        >
                          Match bodice
                        </button>
                      )}
                      {garment !== "skirt" && following.includes(part) && (
                        <p className="field__hint">Follows the bodice until you set a color or pattern here.</p>
                      )}
                      {part === "waist_seam" && garment !== "skirt" && !spec.waist.seam && (
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
