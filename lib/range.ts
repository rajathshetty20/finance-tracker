// Pure vocabulary for the ledger period filter.
//
// Kept out of the client component that renders the control: a "use client"
// module cannot be imported by a Server Component, and the pages need to parse
// the range on the server to decide what to query.
//
// A range is a bounded window {from, to}, not a lookback in days. The days
// model could not express "last financial year", which is the window an Indian
// tax return is actually filed on.

export type RangeKey =
  | "month"
  | "30"
  | "90"
  | "365"
  | "fy"
  | "fy-1"
  | "all";

export const RANGE_KEYS: RangeKey[] = ["month", "30", "90", "365", "fy", "fy-1", "all"];
export const DEFAULT_RANGE: RangeKey = "90";

export function parseRange(v: string | undefined): RangeKey {
  return RANGE_KEYS.includes(v as RangeKey) ? (v as RangeKey) : DEFAULT_RANGE;
}

/** The Indian financial year starts 1 April. FY 2026-27 runs Apr 2026 → Mar 2027. */
export function fyStartYear(iso: string): number {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  return m >= 4 ? y : y - 1;
}

function shiftDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export type Window = { from: string | null; to: string | null };

/** Inclusive bounds for a range. Nulls mean unbounded on that side. */
export function rangeWindow(key: RangeKey, todayISO: string): Window {
  switch (key) {
    case "month":
      return { from: todayISO.slice(0, 7) + "-01", to: todayISO };
    case "30":
      return { from: shiftDays(todayISO, -29), to: todayISO };
    case "90":
      return { from: shiftDays(todayISO, -89), to: todayISO };
    case "365":
      return { from: shiftDays(todayISO, -364), to: todayISO };
    case "fy": {
      const y = fyStartYear(todayISO);
      return { from: `${y}-04-01`, to: todayISO };
    }
    case "fy-1": {
      const y = fyStartYear(todayISO) - 1;
      return { from: `${y}-04-01`, to: `${y + 1}-03-31` };
    }
    case "all":
      return { from: null, to: null };
  }
}

export function inWindow(dateISO: string, w: Window): boolean {
  if (w.from && dateISO < w.from) return false;
  if (w.to && dateISO > w.to) return false;
  return true;
}

/** Short label for a control. FY labels carry their years, e.g. "FY 26-27". */
export function rangeLabel(key: RangeKey, todayISO: string): string {
  switch (key) {
    case "month":
      return "This month";
    case "30":
      return "30 days";
    case "90":
      return "90 days";
    case "365":
      return "12 months";
    case "fy": {
      const y = fyStartYear(todayISO);
      return `FY ${String(y).slice(2)}-${String(y + 1).slice(2)}`;
    }
    case "fy-1": {
      const y = fyStartYear(todayISO) - 1;
      return `FY ${String(y).slice(2)}-${String(y + 1).slice(2)}`;
    }
    case "all":
      return "All time";
  }
}

/** Prose form for a sentence: "260 entries · last 90 days". */
export function rangeDescription(key: RangeKey, todayISO: string): string {
  switch (key) {
    case "all":
      return "all time";
    case "month":
      return "this month";
    case "fy":
    case "fy-1":
      return rangeLabel(key, todayISO);
    default:
      return `last ${rangeLabel(key, todayISO).toLowerCase()}`;
  }
}
