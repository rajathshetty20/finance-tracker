import { MARK } from "./logoMark";

// Ledger mark — geometry lives in logoMark.ts; see the sync note there.
export default function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 128 128" className={className} aria-hidden="true">
      <rect width="128" height="128" rx="28" fill={MARK.ground} />
      <rect x="26" y="30" width="62" height="16" rx="8" fill={MARK.up} />
      <rect x="26" y="56" width="38" height="16" rx="8" fill={MARK.down} />
      <rect x="26" y="86" width="76" height="10" rx="5" fill={MARK.rail} />
    </svg>
  );
}
