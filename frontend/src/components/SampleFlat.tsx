import { tee } from "./garmentPaths";

function TeeView({ view }: { view: "front" | "back" }) {
  const front = view === "front";
  return (
    <g strokeLinejoin="round" strokeLinecap="round">
      <path d={front ? tee.frontBody : tee.backBody} className="flat-fill" strokeWidth="1.8" />
      {front && <path d={tee.frontNeckInside} className="flat-shade" strokeWidth="1.4" />}
      <g fill="none" className="flat-line">
        <path d={front ? tee.frontRib : tee.backRib} strokeWidth="1.4" />
        <path d={tee.armholes} strokeWidth="1.4" />
      </g>
      <g fill="none" className="flat-stitch" strokeWidth="1" strokeDasharray="3.5 3">
        <path d={front ? tee.frontRibStitch : tee.backRibStitch} />
        <path d={tee.sleeveHemStitch} />
        <path d={tee.hemStitch} />
      </g>
    </g>
  );
}

/**
 * Static sample drawing, bundled with the app. Shown only behind an explicit
 * "View sample" action and always labeled as not generated from a sketch.
 */
export function SampleFlat() {
  return (
    <svg
      className="sample-flat"
      viewBox="0 0 840 440"
      role="img"
      aria-label="Sample technical flat of a crew-neck tee, front and back views. Static sample, not generated from a sketch."
    >
      <g transform="translate(10 6)"><TeeView view="front" /></g>
      <g transform="translate(430 6)"><TeeView view="back" /></g>
      <g className="flat-label" textAnchor="middle">
        <text x="210" y="428">FRONT</text>
        <text x="630" y="428">BACK</text>
      </g>
    </svg>
  );
}
