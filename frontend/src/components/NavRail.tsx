import { HangerIcon, LibraryIcon, WorkbenchIcon } from "./Icons";

export function NavRail() {
  return (
    <nav className="rail" aria-label="Primary">
      <span className="rail__mark" aria-hidden="true">
        <HangerIcon width={20} height={20} />
      </span>
      <ul className="rail__list">
        <li>
          <a className="rail__item is-active" href="#canvas-heading" aria-current="page">
            <WorkbenchIcon />
            <span className="rail__label">Workbench</span>
          </a>
        </li>
        <li>
          <button
            type="button"
            className="rail__item"
            disabled
            aria-describedby="rail-library-hint"
            title="Library is not available yet"
          >
            <LibraryIcon />
            <span className="rail__label">Library</span>
          </button>
          <span id="rail-library-hint" className="visually-hidden">Not available yet</span>
        </li>
      </ul>
    </nav>
  );
}
