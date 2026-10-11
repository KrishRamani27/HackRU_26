import { useEffect, useId, useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react";
import type { PartName } from "../../../Builder/types";
import type { CustomElement } from "../../../Builder/buildFlat";
import { PARTS_FOR, partLabel, type GarmentKind } from "../state/specSchema";
import { ArrowDownIcon, ArrowUpIcon, ChevronDownIcon, EyeIcon, EyeOffIcon } from "./Icons";

export interface LayersProps {
  elements: readonly CustomElement[];
  selectedElements: readonly string[];
  selectedPart: PartName | null;
  /** Dress parts hidden on the canvas (not in the export). */
  hiddenParts: readonly PartName[];
  /** Which dress parts exist depends on the garment: a skirt has no collar, bodice or sleeves. */
  garment: GarmentKind;
  onSelectElements: (ids: string[]) => void;
  onSelectPart: (part: PartName) => void;
  onSetVisible: (ids: string[], visible: boolean) => void;
  onTogglePart: (part: PartName) => void;
  onReorder: (ids: string[], direction: "up" | "down") => void;
  onRename: (id: string, name: string) => void;
}

const STORAGE_KEY = "flatsketch.layers.open";
const MAX_NAME = 120;

function readOpen(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== "closed";
  } catch {
    return true;
  }
}

// The right panel is a different component for a dress part, one drawing and several drawings, so the list
// remounts when the selection changes. Whether it is open and which groups are expanded live here instead.
const view = { open: readOpen(), expanded: new Set<string>() };
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
let snapshot = { open: view.open, expanded: view.expanded };
const publish = () => {
  snapshot = { open: view.open, expanded: new Set(view.expanded) };
  listeners.forEach((fn) => fn());
};
const useView = () => useSyncExternalStore(subscribe, () => snapshot);

/** One row per loose element or per group, top of the stack first. */
function stackRows(elements: readonly CustomElement[]): { key: string; members: CustomElement[] }[] {
  const sorted = elements
    .map((e, i) => ({ e, i }))
    .sort((a, b) => b.e.layer_order - a.e.layer_order || b.i - a.i)
    .map(({ e }) => e);
  const rows: { key: string; members: CustomElement[] }[] = [];
  const byGroup = new Map<string, CustomElement[]>();
  for (const e of sorted) {
    if (!e.group_id) {
      rows.push({ key: e.id, members: [e] });
      continue;
    }
    let members = byGroup.get(e.group_id);
    if (!members) {
      members = [];
      byGroup.set(e.group_id, members);
      rows.push({ key: `group:${e.group_id}`, members });
    }
    members.push(e);
  }
  return rows;
}

/**
 * The Layers list: drawn elements and groups on top, then the dress parts. Collapsible under its own heading,
 * or `bare` (always open, no heading) when it fills the Properties panel's Layers tab.
 */
export function LayersSection({ bare = false, ...p }: LayersProps & { bare?: boolean }) {
  const headingId = useId();
  const view$ = useView();
  const expanded = view$.expanded;
  const open = bare || view$.open;
  const rows = stackRows(p.elements);

  const toggleOpen = () => {
    view.open = !open;
    publish();
    try {
      window.localStorage.setItem(STORAGE_KEY, open ? "closed" : "open");
    } catch {
      /* remembering the choice is optional */
    }
  };
  const toggleGroup = (key: string) => {
    if (!view.expanded.delete(key)) view.expanded.add(key);
    publish();
  };

  return (
    <section className={`prop-section layers${bare ? " layers--bare" : ""}`} data-section="layers" aria-labelledby={headingId}>
      <h3 id={headingId} className={bare ? "visually-hidden" : "eyebrow layers__heading"}>
        {bare ? "Layers" : (
          <button type="button" className="layers__toggle" aria-expanded={open} aria-controls={`${headingId}-body`} onClick={toggleOpen}>
            <ChevronDownIcon width={14} height={14} className={open ? "" : "is-closed"} />
            <span>Layers</span>
            <span className="layers__count">{p.elements.length + PARTS_FOR[p.garment].length}</span>
          </button>
        )}
      </h3>
      {open && (
        <div id={`${headingId}-body`} className="layers__body">
          {rows.length === 0 ? (
            <p className="field__hint">Nothing drawn yet. Lines and shapes you draw are listed here, top layer first.</p>
          ) : (
            <ul className="layers__list" aria-label="Drawn elements, top layer first">
              {rows.map((row, index) => {
                const ids = row.members.map((m) => m.id);
                const isGroup = !!row.members[0].group_id;
                const on = ids.every((id) => p.selectedElements.includes(id));
                const shown = row.members.every((m) => m.visible !== false);
                const isExpanded = expanded.has(row.key);
                const noun = isGroup ? "group" : row.members[0].name;
                return (
                  <li key={row.key} className="layers__item">
                    <div className={`layer${on ? " is-selected" : ""}${shown ? "" : " is-hidden"}`} data-layer={row.key}>
                      {isGroup ? (
                        <button
                          type="button"
                          className="icon-btn layer__fold"
                          aria-label={`${isExpanded ? "Collapse" : "Expand"} group of ${row.members.length}`}
                          aria-expanded={isExpanded}
                          onClick={() => toggleGroup(row.key)}
                        >
                          <ChevronDownIcon width={14} height={14} className={isExpanded ? "" : "is-closed"} />
                        </button>
                      ) : (
                        <span className="layer__fold" aria-hidden="true" />
                      )}
                      {isGroup ? (
                        <button type="button" className="layer__name" aria-pressed={on} onClick={() => p.onSelectElements(ids)}>
                          Group of {row.members.length}
                        </button>
                      ) : (
                        <LayerName element={row.members[0]} on={on} onSelect={() => p.onSelectElements(ids)} onRename={p.onRename} />
                      )}
                      <EyeButton shown={shown} label={noun} onClick={() => p.onSetVisible(ids, !shown)} />
                      <button type="button" className="icon-btn" aria-label={`Move ${noun} up`} disabled={index === 0} onClick={() => p.onReorder(ids, "up")}>
                        <ArrowUpIcon width={14} height={14} />
                      </button>
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label={`Move ${noun} down`}
                        disabled={index === rows.length - 1}
                        onClick={() => p.onReorder(ids, "down")}
                      >
                        <ArrowDownIcon width={14} height={14} />
                      </button>
                    </div>
                    {isGroup && isExpanded && (
                      <ul className="layers__children" aria-label="Members of the group">
                        {[...row.members].sort((a, b) => b.layer_order - a.layer_order).map((m) => {
                          const childOn = p.selectedElements.includes(m.id);
                          return (
                            <li key={m.id} className={`layer layer--child${childOn ? " is-selected" : ""}${m.visible === false ? " is-hidden" : ""}`} data-layer={m.id}>
                              <span className="layer__fold" aria-hidden="true" />
                              <LayerName element={m} on={childOn} onSelect={() => p.onSelectElements(ids)} onRename={p.onRename} />
                              <EyeButton shown={m.visible !== false} label={m.name} onClick={() => p.onSetVisible([m.id], m.visible === false)} />
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <p className="layers__sub">Dress parts</p>
          <ul className="layers__list" aria-label="Dress parts">
            {PARTS_FOR[p.garment].map((part) => {
              const hidden = p.hiddenParts.includes(part);
              return (
                <li key={part} className={`layer${p.selectedPart === part ? " is-selected" : ""}${hidden ? " is-hidden" : ""}`} data-layer={part}>
                  <span className="layer__fold" aria-hidden="true" />
                  <button type="button" className="layer__name" aria-pressed={p.selectedPart === part} onClick={() => p.onSelectPart(part)}>
                    {partLabel(part, p.garment)}
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`${hidden ? "Show" : "Hide"} ${partLabel(part, p.garment)} on the canvas`}
                    aria-pressed={hidden}
                    title={hidden ? "Hidden on the canvas only; it is still in the export" : "Hide on the canvas only; it stays in the export"}
                    onClick={() => p.onTogglePart(part)}
                  >
                    {hidden ? <EyeOffIcon width={14} height={14} /> : <EyeIcon width={14} height={14} />}
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="field__hint">Hiding a dress part only changes the canvas. Hiding a drawing also leaves it out of the export.</p>
        </div>
      )}
    </section>
  );
}

function EyeButton({ shown, label, onClick }: { shown: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className="icon-btn"
      aria-label={`${shown ? "Hide" : "Show"} ${label}`}
      aria-pressed={!shown}
      title={shown ? "Hide (also leaves it out of the export)" : "Show"}
      onClick={onClick}
    >
      {shown ? <EyeIcon width={14} height={14} /> : <EyeOffIcon width={14} height={14} />}
    </button>
  );
}

/** A drawn element's name: click selects, double click renames (Enter or leaving the box saves, Escape cancels). */
function LayerName({ element, on, onSelect, onRename }: {
  element: CustomElement;
  on: boolean;
  onSelect: () => void;
  onRename: (id: string, name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(element.name);
  const cancelled = useRef(false);
  useEffect(() => setDraft(element.name), [element.name]);

  const finish = () => {
    setEditing(false);
    if (cancelled.current) {
      cancelled.current = false;
      return;
    }
    const next = draft.trim();
    if (next && next !== element.name) onRename(element.id, next);
    else setDraft(element.name);
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.currentTarget.blur();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      cancelled.current = true;
      setDraft(element.name);
      e.currentTarget.blur();
    }
  };

  if (editing) {
    return (
      <input
        className="input layer__edit"
        aria-label={`Rename ${element.name}`}
        value={draft}
        maxLength={MAX_NAME}
        autoFocus
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={finish}
        onKeyDown={onKey}
      />
    );
  }
  return (
    <button
      type="button"
      className="layer__name"
      aria-pressed={on}
      title="Click to select, double click to rename"
      onClick={onSelect}
      onDoubleClick={() => setEditing(true)}
    >
      {element.name}
    </button>
  );
}
