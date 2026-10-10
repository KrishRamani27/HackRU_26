import { useEffect } from "react";

// Inputs where Ctrl+Z means "undo my typing", which the browser handles itself.
const NON_TEXT_INPUTS = new Set(["range", "color", "checkbox", "radio", "button", "submit", "reset", "file", "image"]);

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target.tagName === "TEXTAREA" || target.tagName === "SELECT") return true;
  return target instanceof HTMLInputElement && !NON_TEXT_INPUTS.has(target.type);
}

interface Handlers {
  enabled: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

/**
 * Ctrl+Z undoes. Ctrl+Shift+Z or Ctrl+Y redoes (Cmd works too on a Mac).
 * Does nothing while typing in a text box, so the notes field keeps its own undo.
 */
export function useUndoShortcuts({ enabled, onUndo, onRedo }: Handlers) {
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || isTyping(e.target)) return;
      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey) onUndo();
      else if ((key === "z" && e.shiftKey) || key === "y") onRedo();
      else return;
      e.preventDefault();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [enabled, onUndo, onRedo]);
}
