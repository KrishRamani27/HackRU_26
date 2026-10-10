import { useEffect, useMemo, useRef, useState } from "react";
import type { LibraryState } from "../hooks/useLibrary";
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

type Filter = "all" | LibraryPartType;

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  ...PART_TYPES.map((t) => ({ value: t as Filter, label: PART_TYPE_LABELS[t] })),
];

const NOTICE_MS = 2600;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const safeColor = (c: string) => (/^#[0-9a-f]{6}$/i.test(c) ? c : "#ffffff");

interface CardProps {
  part: SavedPart;
  canApply: boolean;
  confirming: boolean;
  busy: boolean;
  error: string | null;
  onApply: () => void;
  onAskDelete: () => void;
  onKeep: () => void;
  onConfirmDelete: () => void;
}

/** One saved part, laid out like a fabric swatch card: hairline border, lots of white space. */
function PartCard({ part, canApply, confirming, busy, error, onApply, onAskDelete, onKeep, onConfirmDelete }: CardProps) {
  const src = useMemo(() => previewSrc(part), [part]);
  return (
    <li className="pcard">
      <button
        type="button"
        className="pcard__main"
        disabled={!canApply || busy}
        onClick={onApply}
        aria-label={`Apply ${part.name} (${PART_TYPE_LABELS[part.part_type]}) to the design`}
      >
        <span className="pcard__preview">
          {src ? <img src={src} alt="" /> : <span className="pcard__nopreview">No preview</span>}
        </span>
        <span className="pcard__name">{part.name}</span>
        <span className="pcard__type">{PART_TYPE_LABELS[part.part_type]}</span>
        <span className="pcard__meta">{settingsSummary(part)}</span>
        <span className="pcard__fabric">
          <i className="pcard__dot" style={{ background: safeColor(part.style.fill) }} aria-hidden="true" />
          {cap(part.style.pattern)}
        </span>
      </button>

      <button
        type="button"
        className="icon-btn pcard__delete"
        aria-label={`Delete ${part.name}`}
        disabled={busy}
        onClick={onAskDelete}
      >
        <TrashIcon width={16} height={16} />
      </button>

      {confirming && (
        <div className="pcard__confirm" role="group" aria-label={`Confirm deleting ${part.name}`}>
          <p>Delete “{part.name}”?</p>
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
  /** False until a design is on the canvas: there is nothing to apply a part to. */
  canApply: boolean;
  onApply: (part: SavedPart) => void;
  onDelete: (part: SavedPart) => Promise<void>;
}

/** The Library tab: filter chips and a grid of saved parts. */
export function LibraryPanel({ state, onReload, canApply, onApply, onDelete }: Props) {
  const [filter, setFilter] = useState<Filter>("all");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [cardError, setCardError] = useState<{ id: string; message: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef(0);

  useEffect(() => () => window.clearTimeout(noticeTimer.current), []);

  const apply = (part: SavedPart) => {
    onApply(part);
    window.clearTimeout(noticeTimer.current);
    setNotice(`Applied “${part.name}”. Undo reverts it.`);
    noticeTimer.current = window.setTimeout(() => setNotice(null), NOTICE_MS);
  };

  const confirmDelete = async (part: SavedPart) => {
    setBusyId(part.id);
    setCardError(null);
    try {
      await onDelete(part);
      setConfirmId(null);
    } catch (err) {
      setCardError({ id: part.id, message: err instanceof Error ? err.message : "Couldn’t delete this part." });
    } finally {
      setBusyId(null);
    }
  };

  if (state.status === "idle" || state.status === "loading") {
    return (
      <div className="library-state" role="status">
        <span className="spinner" aria-hidden="true" />
        <p className="library-state__title">Loading your library…</p>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="notice notice--error" role="alert">
        <AlertIcon />
        <div>
          <p className="notice__title">{state.title}</p>
          <p>{state.message}</p>
          <button type="button" className="btn btn--ghost btn--sm notice__action" onClick={onReload}>
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (state.parts.length === 0) {
    return (
      <div className="library-state">
        <p className="library-state__title">Save parts from your designs to reuse them.</p>
        <p className="muted">Select a part on the canvas, then choose “Save to library” in the properties panel.</p>
      </div>
    );
  }

  const shown = filter === "all" ? state.parts : state.parts.filter((p) => p.part_type === filter);

  return (
    <>
      <div className="library-head">
        <ChipGroup small label="Filter by part type" options={FILTERS} value={filter} onChange={setFilter} />
        {!canApply && <p className="field__hint">Open a sketch result or the sample to apply a part.</p>}
      </div>

      {shown.length === 0 ? (
        <p className="muted">No saved {PART_TYPE_LABELS[filter as LibraryPartType]?.toLowerCase()} parts yet.</p>
      ) : (
        <ul className="cards">
          {shown.map((part) => (
            <PartCard
              key={part.id}
              part={part}
              canApply={canApply}
              confirming={confirmId === part.id}
              busy={busyId === part.id}
              error={cardError?.id === part.id ? cardError.message : null}
              onApply={() => apply(part)}
              onAskDelete={() => { setCardError(null); setConfirmId(part.id); }}
              onKeep={() => setConfirmId(null)}
              onConfirmDelete={() => void confirmDelete(part)}
            />
          ))}
        </ul>
      )}

      {/* Always rendered so screen readers announce it; takes no room until a message appears. */}
      <div className="library-toast" role="status" aria-live="polite">
        {notice && <span>{notice}</span>}
      </div>
    </>
  );
}
