import type { ExportFormat } from "../export/exportFlat";
import { ExportMenu } from "./ExportMenu";
import { UploadIcon } from "./Icons";

interface Props {
  projectName: string;
  onUpload: () => void;
  exportEnabled: boolean;
  onExport: (format: ExportFormat) => Promise<string>;
  /** Short backend status, shown once an analysis has returned. */
  status: string | null;
}

export function TopBar({ projectName, onUpload, exportEnabled, onExport, status }: Props) {
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
        {status && (
          <span className="status">
            <span className="status__dot" aria-hidden="true" />
            {status}
          </span>
        )}
        <button type="button" className="btn btn--ghost" onClick={onUpload} aria-label="Upload sketch">
          <UploadIcon />
          <span>Upload sketch</span>
        </button>
        <ExportMenu enabled={exportEnabled} onExport={onExport} />
      </div>
    </header>
  );
}
