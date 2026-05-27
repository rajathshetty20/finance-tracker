// Solves the standard amortization equation for monthly interest rate r:
//   P = E * (1 − (1+r)^(−N)) / r
// where P = principal, E = monthly EMI, N ≈ totalPayable / E.
// Returns the equivalent annual effective rate ((1+r)^12 − 1), or null
// if it can't be solved (insufficient data, non-finite, etc).
export function impliedAnnualRate(
  principal: number,
  emi: number,
  totalPayable: number,
): number | null {
  if (!Number.isFinite(principal) || !Number.isFinite(emi) || !Number.isFinite(totalPayable)) {
    return null;
  }
  if (principal <= 0 || emi <= 0) return null;
  if (totalPayable < principal) return null;
  const N = Math.round(totalPayable / emi);
  if (N <= 0) return null;
  if (Math.abs(N * emi - principal) < 1e-6) return 0;

  // Newton-Raphson on f(r) = E * (1 − (1+r)^(−N)) − r * P.
  let r = 0.01;
  for (let i = 0; i < 100; i++) {
    const f = emi * (1 - Math.pow(1 + r, -N)) - r * principal;
    const df = emi * N * Math.pow(1 + r, -N - 1) - principal;
    if (Math.abs(df) < 1e-12) break;
    const next = r - f / df;
    if (!Number.isFinite(next)) return null;
    if (Math.abs(next - r) < 1e-10) {
      r = next;
      break;
    }
    r = next;
    if (r <= -0.999) r = -0.5;
  }
  if (!Number.isFinite(r) || r <= -0.999) return null;
  return Math.pow(1 + r, 12) - 1;
}
