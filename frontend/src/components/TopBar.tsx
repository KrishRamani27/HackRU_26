import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { ExportFormat } from "../export/exportFlat";
import type { SaveStatus } from "../hooks/useDesignFile";
import { ExportMenu } from "./ExportMenu";
import { AlertIcon, RedoIcon, UndoIcon, UploadIcon } from "./Icons";

interface Props {
  projectName: string;
  /** False until a design is on the canvas: there is nothing to name or save yet. */
  designOpen: boolean;
  onRename: (name: string) => void;
  /** The design has been saved to the backend at least once (or was opened from it). */
  saved: boolean;
  /** Edits since the last save or open. */
  dirty: boolean;
  saveStatus: SaveStatus;
  /** A message that is not an error, such as lines that could not be loaded. */
  notice: string | null;
  onSave: () => void;
  onReload: () => void;
  onDismiss: () => void;
  onOpenDesign: () => void;
  onUpload: () => void;
  exportEnabled: boolean;
  onExport: (format: ExportFormat) => Promise<string>;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  /** Short backend status, shown once an analysis has returned. */
  status: string | null;
}

const MAX_NAME = 120; // the contract's limit

/** The design's name, editable in place: Enter or leaving the box keeps it, Escape puts the old one back. */
function ProjectName({ name, editable, onRename }: { name: string; editable: boolean; onRename: (name: string) => void }) {
  const [draft, setDraft] = useState(name);
  const cancelled = useRef(false);
  useEffect(() => setDraft(name), [name]);

  if (!editable) return <h1 className="topbar__project">{name}</h1>;

  const finish = () => {
    if (cancelled.current) {
      cancelled.current = false;
      setDraft(name);
      return;
    }
    const next = draft.trim();
    if (next && next !== name) onRename(next);
    else setDraft(name); // empty is not allowed, and nothing changed otherwise
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.currentTarget.blur();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      cancelled.current = true;
      e.currentTarget.blur();
    }
  };

  return (
    <h1 className="topbar__project topbar__project--edit">
      <input
        className="topbar__name"
        type="text"
        aria-label="Design name"
        title="Click to rename this design"
        value={draft}
        maxLength={MAX_NAME}
        style={{ width: `${Math.min(40, Math.max(8, draft.length + 1))}ch` }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={finish}
        onKeyDown={onKeyDown}
      />
    </h1>
  );
}

export function TopBar({
  projectName, designOpen, onRename, saved, dirty, saveStatus, notice, onSave, onReload, onDismiss, onOpenDesign,
  onUpload, exportEnabled, onExport, canUndo, canRedo, onUndo, onRedo, status,
}: Props) {
  const saving = saveStatus.kind === "saving";
  return (
    <header className="topbar">
      <div className="topbar__titles">
        <span className="topbar__crumb">Atelier <span aria-hidden="true">/</span> Workbench</span>
        <div className="topbar__title-row">
          <ProjectName name={projectName} editable={designOpen} onRename={onRename} />
          <span className="chip">{saved ? "Saved design" : "Draft"}</span>
          {dirty && (
            <span className="unsaved" role="status">
              <i className="unsaved__dot" aria-hidden="true" />
              Unsaved changes
            </span>
          )}
        </div>
        {saveStatus.kind === "conflict" && (
          <div className="save-note save-note--error" role="alert">
            <AlertIcon width={16} height={16} />
            <span>This design changed somewhere else. Reload to get the latest.</span>
            <button type="button" className="btn btn--ghost btn--sm" onClick={onReload}>Reload</button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={onDismiss}>Dismiss</button>
          </div>
        )}
        {saveStatus.kind === "error" && (
          <div className="save-note save-note--error" role="alert">
            <AlertIcon width={16} height={16} />
            <span>{saveStatus.message}</span>
            <button type="button" className="btn btn--ghost btn--sm" onClick={onDismiss}>Dismiss</button>
          </div>
        )}
        {notice && saveStatus.kind !== "conflict" && saveStatus.kind !== "error" && (
          <div className="save-note" role="status">
            <span>{notice}</span>
            <button type="button" className="btn btn--ghost btn--sm" onClick={onDismiss}>Dismiss</button>
          </div>
        )}
      </div>

      <div className="topbar__actions">
        {status && (
          <span className="status">
            <span className="status__dot" aria-hidden="true" />
            {status}
          </span>
        )}
        <div className="history" role="group" aria-label="History">
          <button type="button" className="icon-btn" onClick={onUndo} disabled={!canUndo} aria-label="Undo" title="Undo (Ctrl+Z)">
            <UndoIcon />
          </button>
          <button type="button" className="icon-btn" onClick={onRedo} disabled={!canRedo} aria-label="Redo" title="Redo (Ctrl+Shift+Z)">
            <RedoIcon />
          </button>
        </div>
        <button type="button" className="btn btn--ghost" onClick={onUpload} aria-label="Upload sketch">
          <UploadIcon />
          <span>Upload sketch</span>
        </button>
        <button type="button" className="btn btn--ghost" onClick={onOpenDesign} aria-haspopup="dialog">
          <span>Open</span>
        </button>
        <span className="save-flash" role="status" aria-live="polite">{saveStatus.kind === "saved" ? "Saved" : ""}</span>
        <button
          type="button"
          className="btn btn--primary"
          onClick={onSave}
          disabled={!designOpen || saving}
          title="Save design (Ctrl+S)"
        >
          <span>{saving ? "Saving…" : "Save design"}</span>
        </button>
        <ExportMenu enabled={exportEnabled} onExport={onExport} />
      </div>
    </header>
  );
}
