import { useCallback, useEffect, useRef, useState } from "react";
import { getDesign, listDesigns, type SavedDesign } from "../api/designs";
import { describeError } from "../api/parts";
import { AlertIcon, CloseIcon } from "./Icons";

interface Props {
  /** True when opening would throw away edits that were never saved. */
  dirty: boolean;
  onClose: () => void;
  /** Gets the chosen design on the canvas. Throws a readable error if it can't. */
  onOpen: (design: SavedDesign) => void;
}

type ListState = { status: "loading" } | { status: "ready"; designs: SavedDesign[] } | { status: "error"; title: string; message: string };

// The backend's list times have no zone (they are UTC); read both kinds as UTC.
const timeOf = (iso: string) => new Date(/(Z|[+-]\d\d:?\d\d)$/.test(iso) ? iso : `${iso}Z`);
const when = (iso: string) => {
  const d = timeOf(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
};

/** A dialog listing the saved designs (name and last updated time). Choosing one asks first if edits would be lost. */
export function OpenDialog({ dirty, onClose, onOpen }: Props) {
  const [list, setList] = useState<ListState>({ status: "loading" });
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    const controller = new AbortController();
    setList({ status: "loading" });
    listDesigns(controller.signal)
      .then((designs) => setList({ status: "ready", designs }))
      .catch((err) => {
        if (controller.signal.aborted) return;
        const title = err && typeof err === "object" && "title" in err ? String((err as { title: unknown }).title) : "Couldn’t load designs";
        setList({ status: "error", title, message: describeError(err, "Couldn’t load the saved designs.") });
      });
    return () => controller.abort();
  }, []);
  useEffect(() => load(), [load]);

  // Focus moves into the dialog, Escape closes it, and Tab stays inside it.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      } else if (e.key === "Tab" && dialogRef.current) {
        const items = [...dialogRef.current.querySelectorAll<HTMLElement>("button:not(:disabled)")];
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      previous?.focus?.();
    };
  }, [onClose]);

  const open = async (id: string) => {
    setBusyId(id);
    setProblem(null);
    try {
      onOpen(await getDesign(id)); // the latest version, not whatever the list showed
      onClose();
    } catch (err) {
      setProblem(describeError(err, "Couldn’t open this design."));
      setConfirmId(null);
    } finally {
      setBusyId(null);
    }
  };

  const choose = (id: string) => (dirty ? setConfirmId(id) : void open(id));

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="open-title" tabIndex={-1} ref={dialogRef}>
        <div className="modal__head">
          <h2 id="open-title" className="modal__title">Open a saved design</h2>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            <CloseIcon width={16} height={16} />
          </button>
        </div>

        {problem && (
          <p className="modal__problem" role="alert">
            <AlertIcon width={16} height={16} /> {problem}
          </p>
        )}

        {list.status === "loading" && (
          <div className="library-state" role="status">
            <span className="spinner" aria-hidden="true" />
            <p className="library-state__title">Loading your designs…</p>
          </div>
        )}
        {list.status === "error" && (
          <div className="notice notice--error" role="alert">
            <AlertIcon />
            <div>
              <p className="notice__title">{list.title}</p>
              <p>{list.message}</p>
              <button type="button" className="btn btn--ghost btn--sm notice__action" onClick={load}>Try again</button>
            </div>
          </div>
        )}
        {list.status === "ready" && list.designs.length === 0 && (
          <div className="library-state">
            <p className="library-state__title">No saved designs yet.</p>
            <p className="muted">Use “Save design” in the top bar (or Ctrl+S) to keep the one you are working on.</p>
          </div>
        )}
        {list.status === "ready" && list.designs.length > 0 && (
          <ul className="dlist" aria-label="Saved designs">
            {list.designs.map((d) => (
              <li key={d.id} className="dlist__item">
                <button type="button" className="dlist__row" disabled={busyId !== null} onClick={() => choose(d.id)} aria-label={`Open ${d.name}`}>
                  <span className="dlist__name">{d.name}</span>
                  <span className="dlist__time">Updated {when(d.updated_at)}</span>
                </button>
                {confirmId === d.id && (
                  <div className="dlist__confirm" role="group" aria-label={`Confirm opening ${d.name}`}>
                    <p>You have unsaved changes. Opening “{d.name}” replaces them.</p>
                    <div className="pcard__confirm-actions">
                      <button type="button" className="btn btn--danger btn--sm" disabled={busyId !== null} onClick={() => void open(d.id)}>
                        {busyId === d.id ? "Opening…" : "Replace and open"}
                      </button>
                      <button type="button" className="btn btn--ghost btn--sm" onClick={() => setConfirmId(null)} autoFocus>
                        Keep editing
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
