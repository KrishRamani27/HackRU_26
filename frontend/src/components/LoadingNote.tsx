import { useEffect, useState } from "react";

const FOLLOW_UPS = ["Finding the neckline…", "Measuring the skirt…", "Drafting your flat…"];
const FIRST_AFTER_MS = 4000; // stay quiet for a few seconds; most analyses are done by then
const EACH_MS = 3200; // how long each follow up stays
const FADE_MS = 400; // fade out before the next one fades in

/**
 * Quiet progress words shown under "Reading your sketch…" once the wait runs long.
 * They only reassure; they are not tied to what the backend is actually doing, so they
 * are hidden from screen readers (the main message already says it is working).
 * Mounted only while an analysis runs, so every new analysis starts the clock again.
 */
export function LoadingNote() {
  const [shown, setShown] = useState<{ index: number; out: boolean } | null>(null);

  useEffect(() => {
    let timer = 0;
    let index = -1;
    const show = () => {
      index = (index + 1) % FOLLOW_UPS.length;
      setShown({ index, out: false });
      timer = window.setTimeout(hide, EACH_MS);
    };
    const hide = () => {
      setShown((s) => (s ? { ...s, out: true } : s));
      timer = window.setTimeout(show, FADE_MS);
    };
    timer = window.setTimeout(show, FIRST_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <p className="loading-note" aria-hidden="true">
      {shown && (
        <span key={shown.index} className={`loading-note__text${shown.out ? " is-out" : ""}`}>
          {FOLLOW_UPS[shown.index]}
        </span>
      )}
    </p>
  );
}
