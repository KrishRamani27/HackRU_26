import { useCallback, useMemo, useState } from "react";
import { cleanFigure, DEFAULT_FIGURE, type FigureOptions } from "./figure";
import { wearOnMannequin } from "./mannequin";

const STORAGE_KEY = "tryon.figure";

function savedFigure(): FigureOptions {
  try {
    return cleanFigure(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") ?? undefined);
  } catch {
    return DEFAULT_FIGURE;
  }
}

/**
 * All the state for the try-on feature, so the app only needs one line to hold it.
 * The figure settings are remembered in this browser; whether try-on is showing is not.
 */
export function useTryOn() {
  const [on, setOn] = useState(false);
  const [figure, setFigureState] = useState<FigureOptions>(savedFigure);

  const setFigure = useCallback((next: FigureOptions) => {
    const clean = cleanFigure(next);
    setFigureState(clean);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
    } catch {
      // Private browsing or a full disk: the settings just last for this visit.
    }
  }, []);
  const toggle = useCallback(() => setOn((v) => !v), []);

  /** The builder's SVG, with the figure wearing it when try-on is showing. */
  const wear = useCallback(
    (flatSvg: string, shoulderWidth: number) => (on ? wearOnMannequin(flatSvg, shoulderWidth, figure) : flatSvg),
    [on, figure],
  );

  return useMemo(() => ({ on, toggle, figure, setFigure, wear }), [on, toggle, figure, setFigure, wear]);
}

export type TryOn = ReturnType<typeof useTryOn>;
