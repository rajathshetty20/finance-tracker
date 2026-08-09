import { MARK, RUPEE_PATH } from "./logoMark";

// Rupee mark — geometry lives in logoMark.ts; see the sync note there.
//
// In the app the tile takes currentColor and the glyph takes the page ground,
// so it inverts with the theme: dark tile on a light page, light tile on a
// dark one. The exported icons can't do that — they sit on an OS background
// we don't control — so those stay fixed dark-on-white in logoMark.ts.
export default function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 128 128" className={className} aria-hidden="true">
      <rect width="128" height="128" rx={MARK.radius} fill="currentColor" />
      <path d={RUPEE_PATH} fill="var(--ground)" />
    </svg>
  );
}
