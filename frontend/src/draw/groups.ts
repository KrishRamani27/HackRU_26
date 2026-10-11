import type { CustomElement } from "../../../Builder/buildFlat";

// Grouping uses the contract's optional `group_id`: elements sharing one group_id are a group.
// A group is always selected, moved, deleted and saved as a whole, so a group is never part selected.

/** The ids that go together with `id`: all the members of its group, or just itself. */
export function unitOf(id: string, elements: readonly CustomElement[]): string[] {
  const element = elements.find((e) => e.id === id);
  if (!element) return [];
  return element.group_id ? elements.filter((e) => e.group_id === element.group_id).map((e) => e.id) : [id];
}

/** Adds the rest of any group that is partly in `ids`. Keeps the order, with no repeats. */
export function expandGroups(ids: readonly string[], elements: readonly CustomElement[]): string[] {
  const out: string[] = [];
  for (const id of ids) for (const member of unitOf(id, elements)) if (!out.includes(member)) out.push(member);
  return out;
}

/** Shift+click: removes the clicked element's group (or itself) if it is all selected already, else adds it. */
export function toggleUnit(selected: readonly string[], id: string, elements: readonly CustomElement[]): string[] {
  const unit = unitOf(id, elements);
  if (unit.length === 0) return [...selected];
  const allIn = unit.every((u) => selected.includes(u));
  return allIn ? selected.filter((s) => !unit.includes(s)) : expandGroups([...selected, ...unit], elements);
}

export interface GroupingState {
  /** True when 2 or more are selected and they are not already one single group. */
  canGroup: boolean;
  /** True when any selected element belongs to a group. */
  canUngroup: boolean;
}

export function groupingOf(selected: readonly CustomElement[]): GroupingState {
  const groups = new Set(selected.map((e) => e.group_id ?? null));
  const oneGroup = groups.size === 1 && !groups.has(null);
  return { canGroup: selected.length >= 2 && !oneGroup, canUngroup: selected.some((e) => !!e.group_id) };
}
