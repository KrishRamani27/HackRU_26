import type { CustomElement } from "../../../Builder/buildFlat";
import { groupingOf } from "../draw/groups";
import type { ElementPatch } from "../state/specReducer";
import { ColorSwatch, RangeField, Section } from "./Controls";
import { TrashIcon } from "./Icons";
import { SavePartBar } from "./SavePartBar";

interface Props {
  /** The selected elements (two or more, or one whole group). */
  elements: readonly CustomElement[];
  /** Applies the same change to every selected element. `coalesce` merges a stream of changes into one undo step. */
  onUpdateAll: (patch: ElementPatch, coalesce: string) => void;
  onCommit: () => void;
  onGroup: () => void;
  onUngroup: () => void;
  onDelete: () => void;
  onSave: (name: string) => Promise<void>;
  onOpenLibrary: () => void;
}

/** The properties panel while several drawn elements are selected: color, width, grouping and delete only. */
export function MultiPanel({ elements, onUpdateAll, onCommit, onGroup, onUngroup, onDelete, onSave, onOpenLibrary }: Props) {
  const first = elements[0];
  const { canGroup, canUngroup } = groupingOf(elements);
  const isOneGroup = elements.every((e) => e.group_id && e.group_id === first.group_id);
  const title = isOneGroup ? `Group of ${elements.length}` : `${elements.length} drawings`;
  const key = (field: string) => `multi:${elements.map((e) => e.id).join(",")}:${field}`;

  return (
    <aside className="panel panel--right" aria-labelledby="props-heading">
      <div className="panel__header">
        <div className="panel__heading">
          <span className="panel__index" aria-hidden="true">03</span>
          <h2 id="props-heading" className="panel__title">Properties</h2>
        </div>
      </div>
      <div className="panel__body">
        <SavePartBar label={title} onSave={onSave} onOpenLibrary={onOpenLibrary} />
        <Section name="selection" title={title}>
          <p className="field__hint">Changes here apply to all {elements.length}. Drag any of them on the canvas to move them together.</p>

          <div className="field">
            <div className="field__row">
              <label className="field__label" htmlFor="multi-stroke">Stroke color</label>
              <ColorSwatch
                id="multi-stroke"
                value={first.stroke.toLowerCase()}
                label="Stroke color of all selected"
                onChange={(hex) => onUpdateAll({ stroke: hex }, key("stroke"))}
                onCommit={onCommit}
              />
            </div>
          </div>

          <RangeField
            label="Stroke width"
            min={0.5}
            max={20}
            step={0.5}
            value={Math.min(20, first.stroke_width)}
            display={String(first.stroke_width)}
            onChange={(v) => onUpdateAll({ stroke_width: v }, key("stroke_width"))}
            onCommit={onCommit}
          />
        </Section>

        <Section name="grouping" title="Group">
          <p className="field__hint">
            {isOneGroup
              ? "These drawings are one group: clicking any of them selects all."
              : "Group them so clicking any one selects, moves and saves them all."}
          </p>
          <div className="button-row">
            {canGroup && (
              <button type="button" className="btn btn--ghost btn--sm" onClick={onGroup}>Group</button>
            )}
            {canUngroup && (
              <button type="button" className="btn btn--ghost btn--sm" onClick={onUngroup}>Ungroup</button>
            )}
          </div>
        </Section>

        <Section name="remove" title="Remove">
          <p className="field__hint">Press Delete or Backspace, or use the button, to remove all {elements.length}. Undo brings them back.</p>
          <button type="button" className="btn btn--danger btn--sm match-btn" onClick={onDelete}>
            <TrashIcon width={16} height={16} />
            <span>Delete {elements.length}</span>
          </button>
        </Section>
      </div>
    </aside>
  );
}
