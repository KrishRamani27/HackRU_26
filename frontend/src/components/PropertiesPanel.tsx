import type { CanvasState } from "../types";
import { tee } from "./garmentPaths";

interface Props {
  canvas: CanvasState;
}

/**
 * Garment properties are intentionally not defined here. They will be driven
 * by the shared design-spec contract once it exists.
 */
export function PropertiesPanel({ canvas }: Props) {
  const ready = canvas.status === "ready";
  return (
    <aside className="panel panel--right" aria-labelledby="props-heading">
      <div className="panel__header">
        <div className="panel__heading">
          <span className="panel__index" aria-hidden="true">03</span>
          <h2 id="props-heading" className="panel__title">Properties</h2>
        </div>
      </div>
      <div className="panel__body">
        <div className="empty">
          <svg className="empty__art" viewBox="0 0 400 400" aria-hidden="true">
            <g strokeLinejoin="round" strokeLinecap="round" strokeWidth="5">
              <path d={tee.frontBody} className="empty__art-body" />
              <path d={tee.rightSleeve} className="empty__art-part" />
              <path d={tee.frontRib} fill="none" className="empty__art-line" />
            </g>
          </svg>
          <p className="empty__title">{ready ? "Select a part to edit" : "No part selected"}</p>
          <p className="muted">
            {ready
              ? "Click a part of the flat on the canvas to see its properties here."
              : "When a flat has been generated, selecting a part on the canvas, such as a sleeve, will show its properties here."}
          </p>
        </div>
        {!ready && (
          <p className="panel__footnote">Editing becomes available once the garment builder is connected.</p>
        )}
      </div>
    </aside>
  );
}
