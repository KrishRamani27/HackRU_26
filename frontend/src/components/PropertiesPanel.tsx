import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
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
import { AccordionRow, ChipGroup, ColorSwatch, RangeField, Section } from "./Controls";
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

type PanelTab = "design" | "fabric" | "layers";
const TABS: { id: PanelTab; label: string }[] = [
  { id: "design", label: "Design" },
  { id: "fabric", label: "Fabric" },
  { id: "layers", label: "Layers" },
];

/** Summaries on the collapsed rows: a depth in words, lower case after the first word, comma separated. */
const depthWord = (v: number) => (v < 0.34 ? "shallow" : v > 0.66 ? "deep" : "medium");
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const join = (parts: (string | false | null | undefined)[]) => {
  const text = parts.filter(Boolean).join(", ");
  return text.charAt(0).toUpperCase() + text.slice(1);
};

/** One block of settings: shown alone for a selected part, or as a row of the accordion. */
interface SectionDef {
  name: string;
  title: string;
  hidden: boolean;
  /** The current settings in a few words, shown on the collapsed row. */
  summary: string;
  body: ReactNode;
}

export function PropertiesPanel({ spec, canvasStatus, selection, onEdit, onCommit, onSavePart, onOpenLibrary, following, onMatchBodice, layers }: Props) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const flashTimer = useRef<number>(0);
  const tabRefs = useRef<Record<PanelTab, HTMLButtonElement | null>>({ design: null, fabric: null, layers: null });
  // The garment type is locked (it comes from the spec). It decides which controls and parts apply.
  const garment = garmentOf(spec);
  const shown = (path: string) => controlShown(path, garment);

  const [tab, setTab] = useState<PanelTab>("design");
  // With a part selected: false shows only its section (Design) or its row (Fabric), true shows all.
  const [showAll, setShowAll] = useState(false);
  // The one expanded accordion row in each tab (one at a time), or null.
  const [openSection, setOpenSection] = useState<string | null>(null);
  const [openPart, setOpenPart] = useState<PartName | null>(null);
  // Set when a part is picked; cleared once its controls have been scrolled to and highlighted.
  const pendingFlash = useRef<number | null>(null);

  // Picking a part focuses the panel on it: its section and fabric row open, and the Layers tab gives way
  // to Design so its controls are on screen. With nothing selected, every row starts collapsed.
  useEffect(() => {
    setShowAll(false);
    if (!selection) {
      setOpenSection(null);
      setOpenPart(null);
      return;
    }
    pendingFlash.current = selection.nonce;
    setOpenSection(SECTION_FOR_PART[selection.part]);
    setOpenPart(selection.part);
    setTab((t) => (t === "layers" ? "design" : t));
  }, [selection]);

  // Then scroll to its section (or fabric row) and briefly highlight it. Waits for the tab switch above.
  useEffect(() => {
    const body = bodyRef.current;
    if (!selection || !body || pendingFlash.current !== selection.nonce) return;
    const section = body.querySelector<HTMLElement>(`[data-section="${SECTION_FOR_PART[selection.part]}"]`);
    const row = body.querySelector<HTMLElement>(`[data-part-row="${selection.part}"]`);
    const targets = [section, row].filter((el): el is HTMLElement => !!el);
    if (targets.length === 0) return;
    pendingFlash.current = null;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    targets[0].scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
    const clear = () => targets.forEach((el) => el.classList.remove("is-flash"));
    targets.forEach((el) => el.classList.add("is-flash"));
    flashTimer.current = window.setTimeout(clear, FLASH_MS);
    return () => {
      window.clearTimeout(flashTimer.current);
      clear();
    };
  }, [selection, tab, showAll]);

  // `stream` marks edits that arrive many times per gesture (sliders, color picker, typing).
  const set = (path: string, value: EditAction["value"], stream = false) =>
    onEdit({ op: "set", path, value }, stream ? path : undefined);

  // Arrow keys move between tabs, as in a standard tab strip.
  const onTabKeyDown = (e: KeyboardEvent) => {
    const index = TABS.findIndex((t) => t.id === tab);
    const next =
      e.key === "ArrowRight" ? TABS[(index + 1) % TABS.length]
      : e.key === "ArrowLeft" ? TABS[(index - 1 + TABS.length) % TABS.length]
      : e.key === "Home" ? TABS[0]
      : e.key === "End" ? TABS[TABS.length - 1]
      : null;
    if (!next) return;
    e.preventDefault();
    setTab(next.id);
    tabRefs.current[next.id]?.focus();
  };

  if (!spec) {
    return (
      <aside className="panel panel--right" aria-labelledby="props-heading">
        <div className="panel__header">
          <div className="panel__heading">
            <span className="panel__index" aria-hidden="true">03</span>
            <h2 id="props-heading" className="panel__title">Properties</h2>
          </div>
        </div>
        <div className="panel__body">
          <div className="empty">
            <svg className="empty__art" viewBox="0 0 400 400" aria-hidden="true">
              <g strokeLinejoin="round" strokeLinecap="round" strokeWidth="5">
                <path d={tee.frontBody} className="empty__art-body" />
                <path d={tee.rightSleeve} className="empty__art-part" />
                <path d={tee.frontRib} fill="none" className="empty__art-line" />
              </g>
            </svg>
            <p className="empty__title">{canvasStatus === "loading" ? "Reading the sketch…" : "Nothing to edit yet"}</p>
            <p className="muted">
              {canvasStatus === "loading"
                ? "The design’s settings appear here when the analysis finishes."
                : "Upload a sketch, or open a sample or template, and its settings appear here."}
            </p>
          </div>
        </div>
      </aside>
    );
  }

  const neckOptions = optionsFor("neckline.type", garment, toOptions(NECKLINE_TYPES, NECKLINE_LABELS));
  const waistOptions = optionsFor("waist.style", garment, toOptions(WAIST_STYLES, WAIST_STYLE_LABELS));
  const collar = specValue<(typeof COLLAR_TYPES)[number]>(spec, "collar.type");
  const cuff = specValue<(typeof CUFF_TYPES)[number]>(spec, "sleeves.cuff");
  const waistStyle = specValue<(typeof WAIST_STYLES)[number]>(spec, "waist.style");
  const fullness = specValue<(typeof FULLNESS_TYPES)[number]>(spec, "skirt.fullness");
  const hem = specValue<(typeof HEM_TYPES)[number]>(spec, "skirt.hem");
  const placket = specValue<(typeof PLACKET_TYPES)[number]>(spec, "details.placket");
  const bow = specValue<(typeof BOW_TYPES)[number]>(spec, "details.bow");
  const trim = specValue<(typeof TRIM_TYPES)[number]>(spec, "details.trim");
  const darts = specValue<boolean>(spec, "details.darts");

  const sections: SectionDef[] = [
    {
      name: "neckline",
      title: "Neckline",
      hidden: !anyControlShown(garment, "neckline.", "collar."),
      summary: join([
        shown("neckline.type") && (NECKLINE_LABELS[spec.neckline.type] ?? spec.neckline.type),
        shown("neckline.depth") && depthWord(spec.neckline.depth),
        shown("collar.type") && collar !== "none" && `${lower(COLLAR_LABELS[collar])} collar`,
      ]),
      body: (
        <>
          <ChipGroup
            label="Type"
            options={neckOptions}
            hidden={!shown("neckline.type")}
            value={spec.neckline.type}
            onChange={(v) => set("neckline.type", v)}
          />
          {shown("neckline.type") && !neckOptions.some((o) => o.value === spec.neckline.type) && (
            <p className="field__hint">
              This design has a {NECKLINE_LABELS[spec.neckline.type as keyof typeof NECKLINE_LABELS] ?? spec.neckline.type} neckline, which the builder doesn’t draw yet, so the flat shows it as a scoop. The setting is kept.
            </p>
          )}
          <ChipGroup
            label="Collar"
            hidden={!shown("collar.type")}
            options={toOptions(COLLAR_TYPES, COLLAR_LABELS)}
            value={collar}
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
        </>
      ),
    },
    {
      name: "sleeves",
      title: "Sleeves",
      hidden: !anyControlShown(garment, "sleeves."),
      summary: spec.sleeves.type === "none"
        ? "Sleeveless"
        : join([
          SLEEVE_TYPE_LABELS[spec.sleeves.type],
          shown("sleeves.length") && lower(SLEEVE_LENGTH_LABELS[spec.sleeves.length]),
          shown("sleeves.cuff") && cuff !== "none" && `${lower(CUFF_LABELS[cuff])} cuff`,
        ]),
      body: (
        <>
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
            value={cuff}
            onChange={(v) => set("sleeves.cuff", v)}
          />
          <ChipGroup
            label="Shoulder"
            hidden={!shown("sleeves.shoulder")}
            options={toOptions(SHOULDER_TYPES, SHOULDER_LABELS)}
            value={specValue<(typeof SHOULDER_TYPES)[number]>(spec, "sleeves.shoulder")}
            onChange={(v) => set("sleeves.shoulder", v)}
          />
        </>
      ),
    },
    {
      name: "waist",
      title: "Waist",
      hidden: !anyControlShown(garment, "waist."),
      summary: join([
        shown("waist.seam") && (spec.waist.seam ? "seam" : "no seam"),
        shown("waist.style") && lower(WAIST_STYLE_LABELS[waistStyle]),
      ]),
      body: (
        <>
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
            options={waistOptions}
            value={waistStyle}
            onChange={(v) => set("waist.style", v)}
          />
          {shown("waist.style") && !waistOptions.some((o) => o.value === waistStyle) && (
            <p className="field__hint">
              This design has a {WAIST_STYLE_LABELS[waistStyle]} waist style, which the builder draws the same as Natural (use Waist height to move the waist). The setting is kept.
            </p>
          )}
        </>
      ),
    },
    {
      name: "skirt",
      title: garment === "top" ? "Lower part" : "Skirt",
      hidden: !anyControlShown(garment, "skirt."),
      summary: join([
        shown("skirt.silhouette") && SILHOUETTE_LABELS[spec.skirt.silhouette],
        shown("skirt.length") && lower(SKIRT_LENGTH_LABELS[spec.skirt.length]),
        shown("skirt.fullness") && fullness !== "plain" && lower(FULLNESS_LABELS[fullness]),
        shown("skirt.hem") && hem !== "plain" && `${lower(HEM_LABELS[hem])} hem`,
      ]),
      body: (
        <>
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
            value={fullness}
            onChange={(v) => set("skirt.fullness", v)}
          />
          <ChipGroup
            label="Hem"
            hidden={!shown("skirt.hem")}
            options={toOptions(HEM_TYPES, HEM_LABELS)}
            value={hem}
            onChange={(v) => set("skirt.hem", v)}
          />
          <ChipGroup
            label="Panels"
            hidden={!shown("skirt.panels")}
            options={toOptions(PANEL_TYPES, PANEL_LABELS)}
            value={specValue<(typeof PANEL_TYPES)[number]>(spec, "skirt.panels")}
            onChange={(v) => set("skirt.panels", v)}
          />
        </>
      ),
    },
    {
      name: "details",
      title: "Details",
      hidden: !anyControlShown(garment, "details."),
      summary: join([
        shown("details.pockets") && spec.details.pockets !== "none" && `${lower(POCKET_LABELS[spec.details.pockets])} pockets`,
        shown("details.buttons") && spec.details.buttons > 0 && `${spec.details.buttons} button${spec.details.buttons === 1 ? "" : "s"}`,
        shown("details.placket") && placket !== "none" && `${lower(PLACKET_LABELS[placket])} placket`,
        shown("details.darts") && darts && "darts",
        shown("details.bow") && bow !== "none" && `${lower(BOW_LABELS[bow])} bow`,
        shown("details.trim") && trim !== "none" && lower(TRIM_LABELS[trim]),
      ]) || "None",
      body: (
        <>
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
            value={placket}
            onChange={(v) => set("details.placket", v)}
          />
          <ChipGroup
            label="Darts"
            hidden={!shown("details.darts")}
            options={[{ value: true, label: "Darts" }, { value: false, label: "No darts" }]}
            value={darts}
            onChange={(v) => set("details.darts", v)}
          />
          <ChipGroup
            label="Bow"
            hidden={!shown("details.bow")}
            options={optionsFor("details.bow", garment, toOptions(BOW_TYPES, BOW_LABELS))}
            value={bow}
            onChange={(v) => set("details.bow", v)}
          />
          <ChipGroup
            label="Trim"
            hidden={!shown("details.trim")}
            options={toOptions(TRIM_TYPES, TRIM_LABELS)}
            value={trim}
            onChange={(v) => set("details.trim", v)}
          />
        </>
      ),
    },
    {
      name: "proportions",
      title: "Proportions",
      hidden: !anyControlShown(garment, "proportions."),
      summary: join([
        shown("proportions.shoulder_width") && `shoulders ${unitDisplay(spec.proportions.shoulder_width)}`,
        shown("proportions.waist_y") && `waist ${unitDisplay(spec.proportions.waist_y)}`,
      ]),
      body: (
        <>
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
        </>
      ),
    },
    {
      name: "notes",
      title: "Notes",
      hidden: false,
      summary: spec.notes.trim() || "No notes",
      body: (
        <div className="field">
          <label className="field__label" htmlFor="spec-notes">Design notes</label>
          <textarea
            id="spec-notes"
            className="textarea"
            rows={4}
            maxLength={MAX_NOTES_LENGTH}
            value={spec.notes}
            placeholder="Anything the settings can’t express"
            onChange={(e) => set("notes", e.target.value, true)}
            onBlur={onCommit}
          />
        </div>
      ),
    },
  ];

  const fabricRows = PARTS_FOR[garment].map((part) => {
    const style = { ...DEFAULT_STYLE, ...spec.style[part] };
    const filled = FILLED_PARTS.includes(part);
    const fill = String(style.fill).toLowerCase();
    return {
      part,
      fill,
      summary: PATTERN_LABELS[style.pattern as keyof typeof PATTERN_LABELS] ?? String(style.pattern),
      body: (
        <>
          <div className="field__inline">
            <label className="field__label" htmlFor={`fill-${part}`}>Color</label>
            <ColorSwatch
              id={`fill-${part}`}
              value={fill}
              disabled={!filled}
              label={`${partLabel(part, garment)} color`}
              onChange={(hex) => set(stylePath(part, "fill"), hex, true)}
              onCommit={onCommit}
            />
            <span className="field__code">{fill}</span>
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
        </>
      ),
    };
  });

  const selectedName = selection ? partLabel(selection.part, garment) : "";
  const focused = selection !== null && !showAll;
  const toggleAll = selection && (
    <p className="props-context">
      <span>{focused ? `${selectedName} only` : "All settings"}</span>
      <button type="button" className="link-btn" onClick={() => setShowAll((v) => !v)}>
        {focused ? "Show all" : `Only ${selectedName}`}
      </button>
    </p>
  );

  let content: ReactNode;
  if (tab === "layers") {
    content = <LayersSection {...layers} bare />;
  } else if (tab === "design") {
    const own = selection ? sections.find((s) => s.name === SECTION_FOR_PART[selection.part]) : undefined;
    content = focused ? (
      <>
        {toggleAll}
        {own && !own.hidden ? (
          <Section name={own.name} title={own.title}>{own.body}</Section>
        ) : (
          <p className="field__hint">{selectedName} has no settings of its own on this garment. Its color and pattern are under Fabric.</p>
        )}
      </>
    ) : (
      <>
        {toggleAll}
        <div className="accordion">
          {sections.filter((s) => !s.hidden).map((s) => (
            <AccordionRow
              key={s.name}
              name={s.name}
              title={s.title}
              summary={s.summary}
              open={openSection === s.name}
              onToggle={() => setOpenSection((o) => (o === s.name ? null : s.name))}
            >
              {s.body}
            </AccordionRow>
          ))}
        </div>
      </>
    );
  } else {
    const own = selection ? fabricRows.find((r) => r.part === selection.part) : undefined;
    content = focused && own ? (
      <>
        {toggleAll}
        <Section name="fabric" title={`${selectedName} · fabric`}>
          <div className="part" data-part-row={own.part}>{own.body}</div>
        </Section>
      </>
    ) : (
      <>
        {toggleAll}
        <div className="accordion">
          {fabricRows.map((r) => (
            <AccordionRow
              key={r.part}
              partRow={r.part}
              title={partLabel(r.part, garment)}
              summary={r.summary}
              swatch={r.fill}
              open={openPart === r.part}
              onToggle={() => setOpenPart((o) => (o === r.part ? null : r.part))}
            >
              {r.body}
            </AccordionRow>
          ))}
        </div>
      </>
    );
  }

  return (
    <aside className="panel panel--right" aria-labelledby="props-heading">
      <div className="panel__header panel__header--tabs">
        <div className="panel__heading">
          <span className="panel__index" aria-hidden="true">03</span>
          <h2 id="props-heading" className="visually-hidden">Properties</h2>
          <div className="tabs" role="tablist" aria-label="Properties" onKeyDown={onTabKeyDown}>
            {TABS.map((t) => (
              <button
                key={t.id}
                ref={(el) => { tabRefs.current[t.id] = el; }}
                id={`props-tab-${t.id}`}
                type="button"
                role="tab"
                className="tab"
                aria-selected={tab === t.id}
                aria-controls="props-tabpanel"
                tabIndex={tab === t.id ? 0 : -1}
                onClick={() => setTab(t.id)}
              >
                {t.label}
                {t.id === "layers" && layers.elements.length > 0 && <span className="tab__count">{layers.elements.length}</span>}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="panel__body panel__body--props" ref={bodyRef} role="tabpanel" id="props-tabpanel" aria-labelledby={`props-tab-${tab}`}>
        {selection && <SavePartBar key={selection.part} label={selectedName} onSave={(name) => onSavePart(selection.part, name)} onOpenLibrary={onOpenLibrary} />}
        {content}
      </div>
    </aside>
  );
}
