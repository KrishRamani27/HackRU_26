import type { LeftTab } from "./LeftPanel";
import { HangerIcon, LibraryIcon, WorkbenchIcon } from "./Icons";

interface Props {
  /** The tab open in the left panel. The rail item for it is lit. */
  tab: LeftTab;
  onTabChange: (tab: LeftTab) => void;
}

// Each item switches the left panel, the same as the tabs inside it. "Workbench" is the
// sketch view and "Library" is the saved parts view, so exactly one is lit at a time.
const ITEMS: { tab: LeftTab; label: string; Icon: typeof WorkbenchIcon }[] = [
  { tab: "sketch", label: "Workbench", Icon: WorkbenchIcon },
  { tab: "library", label: "Library", Icon: LibraryIcon },
];

export function NavRail({ tab, onTabChange }: Props) {
  return (
    <nav className="rail" aria-label="Primary">
      <span className="rail__mark" aria-hidden="true">
        <HangerIcon width={20} height={20} />
      </span>
      <ul className="rail__list">
        {ITEMS.map(({ tab: id, label, Icon }) => (
          <li key={id}>
            <button
              type="button"
              className={`rail__item${tab === id ? " is-active" : ""}`}
              aria-current={tab === id ? "page" : undefined}
              onClick={() => onTabChange(id)}
            >
              <Icon />
              <span className="rail__label">{label}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
