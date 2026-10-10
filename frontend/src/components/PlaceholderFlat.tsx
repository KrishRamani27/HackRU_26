import { tee } from "./garmentPaths";

/** Neutral outline used only as a visual placeholder. Not builder output. */
export function PlaceholderFlat() {
  return (
    <svg
      className="placeholder-flat"
      viewBox="0 0 400 400"
      role="img"
      aria-label="Placeholder outline of a generic top. Not generated output."
    >
      <g fill="none" stroke="currentColor" strokeLinejoin="round" strokeLinecap="round">
        <path d={tee.frontBody} strokeWidth="1.6" strokeDasharray="7 6" />
        <path d={tee.frontRib} strokeWidth="1.2" strokeDasharray="7 6" />
        <path d={tee.armholes} strokeWidth="1.2" strokeDasharray="7 6" />
        <path d={tee.centerLine} strokeWidth="1" strokeDasharray="2 7" />
      </g>
    </svg>
  );
}
