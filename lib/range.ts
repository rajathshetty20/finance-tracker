// Pure vocabulary for the ledger period filter.
//
// Kept out of the client component that renders the control: a "use client"
// module cannot be imported by a Server Component, and the pages need to parse
// the range on the server to decide what to query.
export const RANGES = [
  { key: "30", label: "30 days", days: 30 },
  { key: "90", label: "90 days", days: 90 },
  { key: "365", label: "12 months", days: 365 },
  { key: "all", label: "All", days: null },
] as const;

export type RangeKey = (typeof RANGES)[number]["key"];
export const DEFAULT_RANGE: RangeKey = "90";

export function parseRange(v: string | undefined): RangeKey {
  return RANGES.some((r) => r.key === v) ? (v as RangeKey) : DEFAULT_RANGE;
}

export function rangeLabel(key: RangeKey): string {
  return RANGES.find((r) => r.key === key)!.label;
}

/** Prose form for a sentence: "260 entries · all time". */
export function rangeDescription(key: RangeKey): string {
  return key === "all" ? "all time" : `last ${rangeLabel(key).toLowerCase()}`;
}

/** Earliest date the range includes, or null for "all". */
export function cutoffISO(key: RangeKey, todayISO: string): string | null {
  const days = RANGES.find((r) => r.key === key)!.days;
  if (days === null) return null;
  const d = new Date(`${todayISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - (days - 1));
  return d.toISOString().slice(0, 10);
}
