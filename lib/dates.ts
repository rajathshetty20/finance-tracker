/**
 * The zone this ledger's days are counted in.
 *
 * Days must not depend on where the code runs. Resolving "today" from the
 * process clock means the server (UTC on Vercel) and the user disagree by one
 * day for part of every night, so an entry logged at 01:00 lands on yesterday
 * and "this month" flips early on the 1st.
 */
export const APP_TIME_ZONE = "Asia/Kolkata";

export function todayISO(): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: APP_TIME_ZONE }).format(new Date());
}

export function monthsInRange(startISO: string, endISO: string): number {
  const s = new Date(startISO + "T00:00:00");
  const e = new Date(endISO + "T00:00:00");
  const m = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth()) + 1;
  return Math.max(1, m);
}

export function daysInRange(startISO: string, endISO: string): number {
  const s = new Date(startISO + "T00:00:00").getTime();
  const e = new Date(endISO + "T00:00:00").getTime();
  return Math.floor((e - s) / 86_400_000) + 1;
}

export function fmtINR(n: number): string {
  const sign = n < 0 ? "−" : "";
  return `${sign}₹${Math.abs(Math.round(n)).toLocaleString("en-IN")}`;
}

/**
 * First of the month containing `today`. Takes the day explicitly so callers
 * that have resolved it once — the demo freezes it, see lib/demo.ts — cannot
 * end up with a month boundary from a different clock than their other figures.
 */
export function currentMonthStartISO(today: string = todayISO()): string {
  return today.slice(0, 7) + "-01";
}

// "2025-03-01" -> "Mar 2025". Phase and goal dates are stored as plain dates,
// and printing the ISO string raw both reads as machine output and wraps in
// the middle of the number on a phone.
export function fmtMonthYear(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  if (!y || !m) return iso;
  const s = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  // en-GB abbreviates September as "Sept", so a column of dates reads
  // "Sept 2026" beside "Dec 2027" — one four-letter month among three-letter
  // ones, which looks like a typo rather than a locale.
  return s.replace("Sept ", "Sep ");
}

/**
 * "2026-07-10" → "10 Jul 2026"; `short` gives "10 Jul 26".
 *
 * One implementation because four files had their own, and three of them let
 * en-GB abbreviate September to "Sept" — one four-letter month in a column of
 * three-letter ones, which reads as a typo.
 */
export function fmtDate(iso: string, style: "long" | "short" = "long"): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d))
    .toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: style === "short" ? "2-digit" : "numeric",
      timeZone: "UTC",
    })
    .replace("Sept ", "Sep ");
}
