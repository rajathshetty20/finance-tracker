// The mark is the rupee sign itself, knocked out of a rounded square.
//
// The glyph is the ₹ from **Geist** — the typeface this app already sets every
// number in — exported to a fixed path with fontTools rather than drawn by
// hand or set as live text. Two reasons it is a path: type rendered as text
// depends on the viewer having a font that contains U+20B9, which is not true
// on every platform; and the mark then drifts between the header, the favicon
// and the installed icon. Geist is SIL OFL, so shipping the outline is fine.
//
// Geometry lives here. app/Logo.tsx and the generated icons consume it;
// app/icon.svg is a static file that must be updated by hand to match.
export const MARK = {
  ground: "#16191d",
  glyph: "#ffffff",
  radius: 28,
} as const;

// ₹ centred in a 128 box at a 62px cap height.
export const RUPEE_PATH =
  "M67.06 95.00 41.03 70.90V63.56H57.97Q69.59 63.56 71.68 55.53L71.77 55.27H41.03V48.63H71.77Q69.94 40.34 57.97 40.34H41.03V33.00H86.97V39.64H75.09Q76.84 41.38 77.97 43.61Q79.11 45.84 79.63 48.63H86.97V55.27H79.63Q78.58 62.69 72.91 66.79Q67.23 70.90 57.97 70.90H51.34L77.80 95.00Z";

export function markSvg({ ground = true }: { ground?: boolean } = {}) {
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">',
    ground
      ? `<rect width="128" height="128" rx="${MARK.radius}" fill="${MARK.ground}"/>`
      : "",
    `<path d="${RUPEE_PATH}" fill="${ground ? MARK.glyph : MARK.ground}"/>`,
    "</svg>",
  ].join("");
}

export function markDataUri(opts?: { ground?: boolean }) {
  return `data:image/svg+xml;base64,${Buffer.from(markSvg(opts)).toString("base64")}`;
}
