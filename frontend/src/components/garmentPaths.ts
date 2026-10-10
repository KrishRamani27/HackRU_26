// Static line art for a generic crew-neck tee (viewBox 0 0 400 400).
// Used only for placeholders and the labeled sample preview — never presented
// as builder output.

const BODY_REST =
  " L300 62 L372 150 L330 176 L296 132 L304 380 L96 380 L104 132 L70 176 L28 150 L100 62 Z";

export const tee = {
  frontBody: "M160 40 Q200 96 240 40" + BODY_REST,
  backBody: "M160 40 Q200 52 240 40" + BODY_REST,
  /** Inside of the back neck, visible through the front neck opening. */
  frontNeckInside: "M160 40 Q200 54 240 40 Q200 96 160 40 Z",
  frontRib: "M150 43.7 Q200 112 250 43.7",
  frontRibStitch: "M146 45.2 Q200 122 254 45.2",
  backRib: "M150 43.7 Q200 66 250 43.7",
  backRibStitch: "M146 45.2 Q200 74 254 45.2",
  armholes: "M300 62 Q286 98 296 132 M100 62 Q114 98 104 132",
  sleeveHemStitch: "M362 141 L322 166 M38 141 L78 166",
  hemStitch: "M97 362 L303 362 M97 367 L303 367",
  rightSleeve: "M300 62 Q286 98 296 132 L330 176 L372 150 Z",
  centerLine: "M200 84 L200 380",
};
