import { useEffect, useRef } from "react";

interface Props {
  /** What will happen, in a few words, e.g. "Uploading this sketch". */
  what: string;
  onReplace: () => void;
  /** "Keep editing": nothing changes. */
  onKeep: () => void;
}

/** Asks before something replaces the design on the canvas while it has unsaved changes. */
export function ReplaceDialog({ what, onReplace, onKeep }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const keepRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    keepRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onKeep();
      } else if (e.key === "Tab" && dialogRef.current) {
        const items = [...dialogRef.current.querySelectorAll<HTMLElement>("button:not(:disabled)")];
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
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
  }, [onKeep]);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onKeep()}>
      <div className="modal modal--small" role="alertdialog" aria-modal="true" aria-labelledby="replace-title" aria-describedby="replace-text" ref={dialogRef}>
        <h2 id="replace-title" className="modal__title">Replace unsaved changes?</h2>
        <p id="replace-text" className="muted">
          You have unsaved changes. {what} replaces the design on the canvas, and the edits and undo history are lost. Save first with Ctrl+S to keep them.
        </p>
        <div className="pcard__confirm-actions">
          <button type="button" className="btn btn--danger btn--sm" onClick={onReplace}>Replace</button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={onKeep} ref={keepRef}>Keep editing</button>
        </div>
      </div>
    </div>
  );
}
