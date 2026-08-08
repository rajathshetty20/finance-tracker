// The "Ledger" mark: two stacked bars on a baseline — money in above money
// out — inside the same rounded square the sibling tracker uses, so the pair
// reads as one family without being the same mark.
//
// Geometry lives here. app/Logo.tsx and the generated icons consume it;
// app/icon.svg is a static file that must be updated by hand to match.
export const MARK = {
  ground: "#18181b",
  up: "#34d399",
  down: "#fb7185",
  rail: "#3f3f46",
} as const;

export function markSvg({ ground = true }: { ground?: boolean } = {}) {
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">',
    ground ? `<rect width="128" height="128" rx="28" fill="${MARK.ground}"/>` : "",
    `<rect x="26" y="30" width="62" height="16" rx="8" fill="${MARK.up}"/>`,
    `<rect x="26" y="56" width="38" height="16" rx="8" fill="${MARK.down}"/>`,
    `<rect x="26" y="86" width="76" height="10" rx="5" fill="${MARK.rail}"/>`,
    "</svg>",
  ].join("");
}

export function markDataUri(opts?: { ground?: boolean }) {
  return `data:image/svg+xml;base64,${Buffer.from(markSvg(opts)).toString("base64")}`;
}
