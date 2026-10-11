import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { SavedDrawing } from "../api/customParts";
import { drawingPreviewSrc } from "../draw/drawings";
import type { DrawingsState, LibraryState } from "../hooks/useLibrary";
import {
  PART_TYPES,
  PART_TYPE_LABELS,
  previewSrc,
  settingsSummary,
  type LibraryPartType,
  type SavedPart,
} from "../library/libraryModel";
import { ChipGroup } from "./Controls";
import { AlertIcon, TrashIcon } from "./Icons";

type Filter = "all" | "drawings" | LibraryPartType;

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  ...PART_TYPES.map((t) => ({ value: t as Filter, label: PART_TYPE_LABELS[t] })),
  { value: "drawings", label: "Drawings" },
];

const NOTICE_MS = 2600;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const safeColor = (c: string) => (/^#[0-9a-f]{6}$/i.test(c) ? c : "#ffffff");
// The backend's list times have no zone (they are UTC); a new item's time has one. Read both as UTC.
const timeOf = (iso: string) => Date.parse(/(Z|[+-]\d\d:?\d\d)$/.test(iso) ? iso : `${iso}Z`) || 0;

interface CardProps {
  name: string;
  typeLabel: string;
  meta: string;
  extra?: ReactNode;
  preview: string | null;
  canApply: boolean;
  confirming: boolean;
  busy: boolean;
  error: string | null;
  applyLabel: string;
  onApply: () => void;
  onAskDelete: () => void;
  onKeep: () => void;
  onConfirmDelete: () => void;
}

/** One saved item, laid out like a fabric swatch card: hairline border, lots of white space. */
function LibraryCard({
  name, typeLabel, meta, extra, preview, canApply, confirming, busy, error, applyLabel, onApply, onAskDelete, onKeep, onConfirmDelete,
}: CardProps) {
  return (
    <li className="pcard">
      <button type="button" className="pcard__main" disabled={!canApply || busy} onClick={onApply} aria-label={applyLabel}>
        <span className="pcard__preview">
          {preview ? <img src={preview} alt="" /> : <span className="pcard__nopreview">No preview</span>}
        </span>
        <span className="pcard__name">{name}</span>
        <span className="pcard__type">{typeLabel}</span>
        <span className="pcard__meta">{meta}</span>
        {extra}
      </button>

      <button type="button" className="icon-btn pcard__delete" aria-label={`Delete ${name}`} disabled={busy} onClick={onAskDelete}>
        <TrashIcon width={16} height={16} />
      </button>

      {confirming && (
        <div className="pcard__confirm" role="group" aria-label={`Confirm deleting ${name}`}>
          <p>Delete “{name}”?</p>
          <div className="pcard__confirm-actions">
            <button type="button" className="btn btn--danger btn--sm" onClick={onConfirmDelete} disabled={busy}>
              {busy ? "Deleting…" : "Delete"}
            </button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={onKeep} disabled={busy} autoFocus>
              Keep
            </button>
          </div>
        </div>
      )}
      {error && <p className="pcard__error" role="alert">{error}</p>}
    </li>
  );
}

interface Props {
  state: LibraryState;
  onReload: () => void;
  drawings: DrawingsState;
  onReloadDrawings: () => void;
  /** False until a design is on the canvas: there is nothing to apply a part to. */
  canApply: boolean;
  onApply: (part: SavedPart) => void;
  /** Adds an independent copy of a saved drawing to the design. Returns a message if it couldn't. */
  onApplyDrawing: (drawing: SavedDrawing) => string | null;
  onDelete: (part: SavedPart) => Promise<void>;
  onDeleteDrawing: (drawing: SavedDrawing) => Promise<void>;
}

type Item = { kind: "part"; part: SavedPart; time: number } | { kind: "drawing"; drawing: SavedDrawing; time: number };

/** The Library tab: filter chips and a grid of saved dress parts and drawings. */
export function LibraryPanel({
  state, onReload, drawings, onReloadDrawings, canApply, onApply, onApplyDrawing, onDelete, onDeleteDrawing,
}: Props) {
  const [filter, setFilter] = useState<Filter>("all");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [cardError, setCardError] = useState<{ id: string; message: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef(0);

  useEffect(() => () => window.clearTimeout(noticeTimer.current), []);

  const show = (message: string) => {
    window.clearTimeout(noticeTimer.current);
    setNotice(message);
    noticeTimer.current = window.setTimeout(() => setNotice(null), NOTICE_MS);
  };

  const confirmDelete = async (id: string, remove: () => Promise<void>) => {
    setBusyId(id);
    setCardError(null);
    try {
      await remove();
      setConfirmId(null);
    } catch (err) {
      setCardError({ id, message: err instanceof Error ? err.message : "Couldn’t delete this." });
    } finally {
      setBusyId(null);
    }
  };

  const wantParts = filter !== "drawings";
  const wantDrawings = filter === "all" || filter === "drawings";
  const unsettled = (s: { status: string }) => s.status === "idle" || s.status === "loading";

  const partsList = state.status === "ready" ? state.parts : [];
  const drawingsList = drawings.status === "ready" ? drawings.drawings : [];
  const items: Item[] = useMemo(() => {
    const list: Item[] = [];
    if (wantParts) {
      for (const part of partsList) if (filter === "all" || part.part_type === filter) list.push({ kind: "part", part, time: timeOf(part.created_at) });
    }
    if (wantDrawings) for (const drawing of drawingsList) list.push({ kind: "drawing", drawing, time: timeOf(drawing.created_at) });
    return list.sort((a, b) => b.time - a.time);
  }, [partsList, drawingsList, filter, wantParts, wantDrawings]);

  const relevant = [...(wantParts ? [state] : []), ...(wantDrawings ? [drawings] : [])] as { status: string }[];

  // ---- loading: wait until every list this view needs has an answer
  if (relevant.some(unsettled)) {
    return (
      <div className="library-state" role="status">
        <span className="spinner" aria-hidden="true" />
        <p className="library-state__title">Loading your library…</p>
      </div>
    );
  }

  // ---- errors: if nothing can be shown, say why; if one list failed, show the other with a notice
  const errors: { title: string; message: string; retry: () => void; label: string }[] = [];
  if (wantParts && state.status === "error") errors.push({ title: state.title, message: state.message, retry: onReload, label: "dress parts" });
  if (wantDrawings && drawings.status === "error") errors.push({ title: drawings.title, message: drawings.message, retry: onReloadDrawings, label: "drawings" });
  if (errors.length === relevant.length) {
    const retryAll = () => errors.forEach((e) => e.retry());
    return (
      <div className="notice notice--error" role="alert">
        <AlertIcon />
        <div>
          <p className="notice__title">{errors[0].title}</p>
          <p>{errors[0].message}</p>
          <button type="button" className="btn btn--ghost btn--sm notice__action" onClick={retryAll}>
            Try again
          </button>
        </div>
      </div>
    );
  }

  const apply = (message: string | null, ok: string) => show(message ?? ok);
  const everythingEmpty = partsList.length === 0 && drawingsList.length === 0;

  return (
    <>
      <div className="library-head">
        <ChipGroup small label="Filter by type" options={FILTERS} value={filter} onChange={setFilter} />
        {!canApply && <p className="field__hint">Open a sketch result or the sample to apply a part or drawing.</p>}
        {errors.map((e) => (
          <div className="notice notice--error" role="alert" key={e.label}>
            <AlertIcon />
            <div>
              <p className="notice__title">Couldn’t load {e.label}</p>
              <p>{e.message}</p>
              <button type="button" className="btn btn--ghost btn--sm notice__action" onClick={e.retry}>
                Try again
              </button>
            </div>
          </div>
        ))}
      </div>

      {items.length === 0 ? (
        everythingEmpty && filter === "all" ? (
          <div className="library-state">
            <p className="library-state__title">Save parts from your designs to reuse them.</p>
            <p className="muted">Select a part or a drawing on the canvas, then choose “Save to library” in the properties panel.</p>
          </div>
        ) : filter === "drawings" ? (
          <div className="library-state">
            <p className="library-state__title">No saved drawings yet.</p>
            <p className="muted">Select a drawing (or a group) on the canvas, then choose “Save to library”.</p>
          </div>
        ) : (
          <p className="muted">No saved {filter === "all" ? "items" : `${PART_TYPE_LABELS[filter].toLowerCase()} parts`} yet.</p>
        )
      ) : (
        <ul className="cards">
          {items.map((item) =>
            item.kind === "part" ? (
              <PartItem
                key={item.part.id}
                part={item.part}
                canApply={canApply}
                confirming={confirmId === item.part.id}
                busy={busyId === item.part.id}
                error={cardError?.id === item.part.id ? cardError.message : null}
                onApply={() => { onApply(item.part); show(`Applied “${item.part.name}”. Undo reverts it.`); }}
                onAskDelete={() => { setCardError(null); setConfirmId(item.part.id); }}
                onKeep={() => setConfirmId(null)}
                onConfirmDelete={() => void confirmDelete(item.part.id, () => onDelete(item.part))}
              />
            ) : (
              <DrawingItem
                key={item.drawing.id}
                drawing={item.drawing}
                canApply={canApply}
                confirming={confirmId === item.drawing.id}
                busy={busyId === item.drawing.id}
                error={cardError?.id === item.drawing.id ? cardError.message : null}
                onApply={() => apply(onApplyDrawing(item.drawing), `Added a copy of “${item.drawing.name}”. Undo removes it.`)}
                onAskDelete={() => { setCardError(null); setConfirmId(item.drawing.id); }}
                onKeep={() => setConfirmId(null)}
                onConfirmDelete={() => void confirmDelete(item.drawing.id, () => onDeleteDrawing(item.drawing))}
              />
            ),
          )}
        </ul>
      )}

      {/* Always rendered so screen readers announce it; takes no room until a message appears. */}
      <div className="library-toast" role="status" aria-live="polite">
        {notice && <span>{notice}</span>}
      </div>
    </>
  );
}

type ItemHandlers = Pick<CardProps, "canApply" | "confirming" | "busy" | "error" | "onApply" | "onAskDelete" | "onKeep" | "onConfirmDelete">;

function PartItem({ part, ...rest }: ItemHandlers & { part: SavedPart }) {
  const preview = useMemo(() => previewSrc(part), [part]);
  return (
    <LibraryCard
      {...rest}
      name={part.name}
      typeLabel={PART_TYPE_LABELS[part.part_type]}
      meta={settingsSummary(part)}
      preview={preview}
      applyLabel={`Apply ${part.name} (${PART_TYPE_LABELS[part.part_type]}) to the design`}
      extra={
        <span className="pcard__fabric">
          <i className="pcard__dot" style={{ background: safeColor(part.style.fill) }} aria-hidden="true" />
          {cap(part.style.pattern)}
        </span>
      }
    />
  );
}

function DrawingItem({ drawing, ...rest }: ItemHandlers & { drawing: SavedDrawing }) {
  const preview = useMemo(() => drawingPreviewSrc(drawing.elements), [drawing]);
  const n = drawing.elements.length;
  const oneGroup = n > 1 && drawing.elements.every((e) => e.group_id && e.group_id === drawing.elements[0].group_id);
  return (
    <LibraryCard
      {...rest}
      name={drawing.name}
      typeLabel="Drawing"
      meta={oneGroup ? `Group of ${n}` : n === 1 ? "1 stroke" : `${n} strokes`}
      preview={preview}
      applyLabel={`Add a copy of ${drawing.name} (${n === 1 ? "1 stroke" : `${n} strokes`}) to the design`}
    />
  );
}
