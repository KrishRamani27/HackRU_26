import { useState, type DragEvent } from "react";
import type { SketchState } from "../types";
import { formatBytes, MAX_BYTES } from "../hooks/useSketchUpload";
import { AlertIcon, CheckIcon, CloseIcon, ImageIcon, UploadIcon } from "./Icons";

interface Props {
  state: SketchState;
  onBrowse: () => void;
  onFile: (file: File) => void;
  onClear: () => void;
}

export function UploadPanel({ state, onBrowse, onFile, onClear }: Props) {
  const [dragging, setDragging] = useState(false);

  const onDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setDragging(true);
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) onFile(file);
  };

  return (
    <aside className="panel panel--left" aria-labelledby="sketch-heading">
      <div className="panel__header">
        <div className="panel__heading">
          <span className="panel__index" aria-hidden="true">01</span>
          <h2 id="sketch-heading" className="panel__title">Sketch</h2>
        </div>
        {state.status === "ready" && (
          <button type="button" className="icon-btn" onClick={onClear} aria-label="Remove sketch">
            <CloseIcon />
          </button>
        )}
      </div>

      <div className="panel__body">
        {state.status === "ready" ? (
          <figure className="sketch-preview">
            <div className="sketch-preview__frame">
              <img src={state.url} alt={`Uploaded sketch: ${state.file.name}`} />
            </div>
            <figcaption>
              <span className="sketch-preview__name" title={state.file.name}>{state.file.name}</span>
              <span className="muted">
                {state.width} × {state.height}px · {formatBytes(state.file.size)}
              </span>
            </figcaption>
            <button type="button" className="btn btn--ghost btn--block" onClick={onBrowse}>
              <UploadIcon />
              <span>Replace sketch</span>
            </button>
          </figure>
        ) : (
          <div
            className={`dropzone${dragging ? " is-dragging" : ""}${state.status === "error" ? " is-error" : ""}`}
            onDragOver={onDragOver}
            onDragEnter={onDragOver}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            {state.status === "loading" ? (
              <div className="dropzone__content" role="status">
                <span className="spinner" aria-hidden="true" />
                <p className="dropzone__title">Reading sketch…</p>
                <p className="muted dropzone__file">{state.fileName}</p>
              </div>
            ) : (
              <div className="dropzone__content">
                <span className="dropzone__icon"><ImageIcon width={24} height={24} /></span>
                <p className="dropzone__title">{dragging ? "Release to add sketch" : "Drop your sketch here"}</p>
                <p className="muted">PNG, JPG, or WebP · up to {formatBytes(MAX_BYTES)}</p>
                <button type="button" className="btn btn--ghost" onClick={onBrowse}>
                  <UploadIcon />
                  <span>Choose file</span>
                </button>
              </div>
            )}
          </div>
        )}

        {state.status === "error" && (
          <div className="notice notice--error" role="alert">
            <AlertIcon />
            <p>{state.message}</p>
          </div>
        )}

        <section className="tips" aria-labelledby="tips-heading">
          <h3 id="tips-heading" className="eyebrow">Sketch guidance</h3>
          <ul>
            <li><CheckIcon width={15} height={15} />Front view, garment centered</li>
            <li><CheckIcon width={15} height={15} />Dark lines on a plain, light ground</li>
            <li><CheckIcon width={15} height={15} />Shot flat, without heavy shadows</li>
          </ul>
        </section>
      </div>
    </aside>
  );
}
