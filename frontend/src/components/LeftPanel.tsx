import { useRef, type KeyboardEvent, type ReactNode } from "react";

export type LeftTab = "sketch" | "library";

const TABS: { id: LeftTab; label: string }[] = [
  { id: "sketch", label: "Sketch" },
  { id: "library", label: "Library" },
];

interface Props {
  tab: LeftTab;
  onTabChange: (tab: LeftTab) => void;
  /** Number of saved parts, shown beside the Library tab once known. */
  libraryCount: number | null;
  children: ReactNode;
}

/** The left panel: a "Sketch" | "Library" tab strip above whichever tab is open. */
export function LeftPanel({ tab, onTabChange, libraryCount, children }: Props) {
  const tabRefs = useRef<Record<LeftTab, HTMLButtonElement | null>>({ sketch: null, library: null });

  // Arrow keys move between tabs, as in a standard tab strip.
  const onKeyDown = (e: KeyboardEvent) => {
    const index = TABS.findIndex((t) => t.id === tab);
    const next =
      e.key === "ArrowRight" ? TABS[(index + 1) % TABS.length]
      : e.key === "ArrowLeft" ? TABS[(index - 1 + TABS.length) % TABS.length]
      : e.key === "Home" ? TABS[0]
      : e.key === "End" ? TABS[TABS.length - 1]
      : null;
    if (!next) return;
    e.preventDefault();
    onTabChange(next.id);
    tabRefs.current[next.id]?.focus();
  };

  return (
    <aside className="panel panel--left" aria-label="Sketch and library">
      <div className="panel__header panel__header--tabs">
        <div className="panel__heading">
          <span className="panel__index" aria-hidden="true">01</span>
          <div className="tabs" role="tablist" aria-label="Left panel" onKeyDown={onKeyDown}>
            {TABS.map((t) => (
              <button
                key={t.id}
                ref={(el) => { tabRefs.current[t.id] = el; }}
                id={`tab-${t.id}`}
                type="button"
                role="tab"
                className="tab"
                aria-selected={tab === t.id}
                aria-controls={`tabpanel-${t.id}`}
                tabIndex={tab === t.id ? 0 : -1}
                onClick={() => onTabChange(t.id)}
              >
                {t.label}
                {t.id === "library" && libraryCount !== null && libraryCount > 0 && <span className="tab__count">{libraryCount}</span>}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="panel__body" role="tabpanel" id={`tabpanel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {children}
      </div>
    </aside>
  );
}
