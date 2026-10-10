import { ExportIcon, UploadIcon } from "./Icons";

interface Props {
  projectName: string;
  onUpload: () => void;
  exportEnabled: boolean;
}

export function TopBar({ projectName, onUpload, exportEnabled }: Props) {
  return (
    <header className="topbar">
      <div className="topbar__titles">
        <span className="topbar__crumb">Atelier <span aria-hidden="true">/</span> Workbench</span>
        <div className="topbar__title-row">
          <h1 className="topbar__project">{projectName}</h1>
          <span className="chip">Draft</span>
        </div>
      </div>

      <div className="topbar__actions">
        <span className="status" title="The garment builder is not connected yet">
          <span className="status__dot" aria-hidden="true" />
          Builder not connected
        </span>
        <button type="button" className="btn btn--ghost" onClick={onUpload} aria-label="Upload sketch">
          <UploadIcon />
          <span>Upload sketch</span>
        </button>
        <button
          type="button"
          className="btn btn--primary"
          disabled={!exportEnabled}
          aria-describedby={exportEnabled ? undefined : "export-hint"}
          title={exportEnabled ? undefined : "Available once a technical flat has been generated"}
        >
          <ExportIcon />
          <span>Export</span>
        </button>
        {!exportEnabled && (
          <span id="export-hint" className="visually-hidden">
            Export becomes available once a technical flat has been generated.
          </span>
        )}
      </div>
    </header>
  );
}
