import type { Investment, InvestmentEntry } from "./types";
import { xirr, type CashFlow } from "./xirr";

// Money-weighted return for the whole portfolio over a sub-period.
// Treats the portfolio's market value at startDate as a synthetic "contribution"
// and market value at endDate as a synthetic "withdrawal", then runs XIRR over
// those plus all real contribution/withdrawal flows inside the period.
export function portfolioXirrOverPeriod(
  invs: Investment[],
  entriesByInvId: Map<string, InvestmentEntry[]>,
  startDate: string,
  endDate: string,
): number | null {
  if (startDate >= endDate) return null;

  let initialMarket = 0;
  let terminalMarket = 0;
  const flows: CashFlow[] = [];

  for (const inv of invs) {
    // Skip investments that don't overlap the period.
    if (inv.opened_on > endDate) continue;
    if (inv.status === "closed" && inv.closed_on && inv.closed_on < startDate) continue;

    const entries = entriesByInvId.get(inv.id) ?? [];
    const sorted = [...entries].sort((a, b) => (a.date < b.date ? -1 : 1));

    // Latest known total_value_after strictly before startDate.
    let marketAtStart = 0;
    for (const e of sorted) {
      if (e.date < startDate) marketAtStart = Number(e.total_value_after);
    }
    initialMarket += marketAtStart;

    for (const e of sorted) {
      if (e.date < startDate || e.date > endDate) continue;
      if (e.entry_type === "contribution") flows.push({ date: e.date, amount: -Number(e.amount) });
      else if (e.entry_type === "withdrawal") flows.push({ date: e.date, amount: Number(e.amount) });
    }

    const closedWithinPeriod =
      inv.status === "closed" && inv.closed_on && inv.closed_on <= endDate;
    if (!closedWithinPeriod) {
      let marketAtEnd = 0;
      for (const e of sorted) {
        if (e.date <= endDate) marketAtEnd = Number(e.total_value_after);
      }
      terminalMarket += marketAtEnd;
    }
  }

  if (initialMarket > 0) flows.unshift({ date: startDate, amount: -initialMarket });
  if (terminalMarket > 0) flows.push({ date: endDate, amount: terminalMarket });
  flows.sort((a, b) => (a.date < b.date ? -1 : 1));
  return xirr(flows);
}
