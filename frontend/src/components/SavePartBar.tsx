import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { BookmarkIcon } from "./Icons";

const MAX_NAME = 120; // the backend's limit
const MESSAGE_MS = 6000;

interface Props {
  /** What is being saved, e.g. "Bodice", "Sleeve crease" or "3 drawings". */
  label: string;
  /** Saves it with this name. Rejects with a readable message. */
  onSave: (name: string) => Promise<void>;
  onOpenLibrary: () => void;
}

/** Shown while something is selected on the canvas: asks for a name, then saves it to the library. */
export function SavePartBar({ label, onSave, onOpenLibrary }: Props) {
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const messageTimer = useRef(0);

  useEffect(() => { if (naming) inputRef.current?.focus(); }, [naming]);
  useEffect(() => () => window.clearTimeout(messageTimer.current), []);

  const trimmed = name.trim();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!trimmed || saving) return;
    setSaving(true);
    setMessage(null);
    window.clearTimeout(messageTimer.current);
    try {
      await onSave(trimmed);
      setNaming(false);
      setName("");
      setMessage({ text: `Saved “${trimmed}”`, error: false });
      messageTimer.current = window.setTimeout(() => setMessage(null), MESSAGE_MS);
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : "Couldn’t save this part.", error: true });
    } finally {
      setSaving(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== "Escape") return;
    // Only close the name box; don't also let go of the selected part.
    e.preventDefault();
    setNaming(false);
  };

  return (
    <div className="savebar">
      <div className="savebar__row">
        <p className="savebar__title">
          <span className="eyebrow">Selected</span>
          <span className="savebar__part">{label}</span>
        </p>
        {!naming && (
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => { setMessage(null); setNaming(true); }}>
            <BookmarkIcon width={16} height={16} />
            <span>Save to library</span>
          </button>
        )}
      </div>

      {naming && (
        <form className="savebar__form" onSubmit={(e) => void submit(e)} onKeyDown={onKeyDown}>
          <label className="visually-hidden" htmlFor="save-part-name">Name for this part</label>
          <input
            ref={inputRef}
            id="save-part-name"
            className="input"
            type="text"
            value={name}
            maxLength={MAX_NAME}
            placeholder="Name this part, e.g. My puff sleeve"
            disabled={saving}
            onChange={(e) => setName(e.target.value)}
          />
          <div className="savebar__actions">
            <button type="submit" className="btn btn--primary btn--sm" disabled={!trimmed || saving}>
              {saving ? "Saving…" : "Save"}
            </button>
            <button type="button" className="btn btn--ghost btn--sm" disabled={saving} onClick={() => setNaming(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="savebar__message" role="status" aria-live="polite">
        {message && (
          <p className={message.error ? "savebar__error" : "savebar__ok"}>
            {message.text}
            {!message.error && (
              <>
                {" "}
                <button type="button" className="link-btn" onClick={onOpenLibrary}>View library</button>
              </>
            )}
          </p>
        )}
      </div>
    </div>
  );
}
