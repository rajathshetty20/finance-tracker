// Newton-Raphson XIRR solver. Returns the annual rate (e.g. 0.12 = 12%), or null if it doesn't converge.

export type CashFlow = { date: string; amount: number };

export function xirr(flows: CashFlow[]): number | null {
  if (flows.length === 0) return null;
  const hasPos = flows.some((f) => f.amount > 0);
  const hasNeg = flows.some((f) => f.amount < 0);
  // No money went in → IRR undefined.
  if (!hasNeg) return null;
  // Money went in but nothing came back (closed at 0, or still open at NAV 0).
  // Conventionally a full loss → −100%.
  if (!hasPos) return -1;

  const t0 = new Date(flows[0].date + "T00:00:00").getTime();
  const years = flows.map(
    (f) => (new Date(f.date + "T00:00:00").getTime() - t0) / (365.25 * 86_400_000),
  );

  const npv = (r: number) =>
    flows.reduce((acc, f, i) => acc + f.amount / Math.pow(1 + r, years[i]), 0);
  const dnpv = (r: number) =>
    flows.reduce(
      (acc, f, i) => acc - (years[i] * f.amount) / Math.pow(1 + r, years[i] + 1),
      0,
    );

  let r = 0.1;
  for (let iter = 0; iter < 100; iter++) {
    const f = npv(r);
    const df = dnpv(r);
    if (Math.abs(df) < 1e-12) break;
    const next = r - f / df;
    if (!Number.isFinite(next)) return null;
    if (Math.abs(next - r) < 1e-9) return next;
    r = next;
    if (r <= -0.999) r = -0.5;
  }
  return null;
}

export function formatXirr(r: number | null): string {
  if (r === null || !Number.isFinite(r)) return "—";
  return `${(r * 100).toFixed(2)}%`;
}
