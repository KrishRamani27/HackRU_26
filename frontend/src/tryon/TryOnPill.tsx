import "./tryon.css";

interface Props {
  on: boolean;
  onToggle: () => void;
  disabled?: boolean;
}

/** The pill in the canvas toolbar that switches the figure on and off. */
export function TryOnPill({ on, onToggle, disabled }: Props) {
  return (
    <button
      type="button"
      className="tryon-pill"
      aria-pressed={on}
      disabled={disabled}
      title={disabled ? "Open a design first" : on ? "Show the flat on its own" : "See the dress on a figure"}
      onClick={onToggle}
    >
      <svg className="tryon-pill__icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
        <circle cx="8" cy="2.6" r="1.7" fill="none" stroke="currentColor" strokeWidth="1.3" />
        <path
          d="M5.2 6.2 Q8 4.6 10.8 6.2 L9.9 9.2 L11.9 14.2 H4.1 L6.1 9.2 Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinejoin="round"
        />
      </svg>
      <span>{on ? "On figure" : "Try it on"}</span>
      <span className="tryon-pill__dot" aria-hidden="true" />
    </button>
  );
}
