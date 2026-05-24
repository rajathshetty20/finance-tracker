export function todayISO(): string {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
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

export function currentMonthStartISO(): string {
  return todayISO().slice(0, 7) + "-01";
}
