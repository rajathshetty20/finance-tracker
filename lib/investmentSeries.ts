import type { Investment, InvestmentEntry } from "./types";

export type InvestmentSeriesPoint = { date: string; book: number; market: number };

export function seriesForInvestment(
  inv: Investment,
  entries: InvestmentEntry[],
): InvestmentSeriesPoint[] {
  const sorted = [...entries].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return a.created_at < b.created_at ? -1 : 1;
  });

  const byDate = new Map<string, { book: number; market: number }>();
  let book = 0;
  for (const e of sorted) {
    if (e.entry_type === "contribution") book += Number(e.amount);
    else if (e.entry_type === "withdrawal") book -= Number(e.amount);
    byDate.set(e.date, { book, market: Number(e.total_value_after) });
  }

  const points = [...byDate.entries()]
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  if (inv.status === "closed" && inv.closed_on) {
    const closeDate = inv.closed_on;
    const trimmed = points.filter((p) => p.date < closeDate);
    trimmed.push({ date: closeDate, book: 0, market: 0 });
    return trimmed;
  }
  return points;
}

export function aggregateInvestmentSeries(
  invs: Investment[],
  byInvId: Map<string, InvestmentEntry[]>,
): InvestmentSeriesPoint[] {
  type Event = { date: string; invId: string; book: number; market: number };
  const events: Event[] = [];
  for (const inv of invs) {
    const series = seriesForInvestment(inv, byInvId.get(inv.id) ?? []);
    for (const p of series) {
      events.push({ date: p.date, invId: inv.id, book: p.book, market: p.market });
    }
  }
  events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const lastByInv = new Map<string, { book: number; market: number }>();
  const out: InvestmentSeriesPoint[] = [];
  let i = 0;
  while (i < events.length) {
    const date = events[i].date;
    while (i < events.length && events[i].date === date) {
      const e = events[i];
      lastByInv.set(e.invId, { book: e.book, market: e.market });
      i++;
    }
    let book = 0;
    let market = 0;
    for (const v of lastByInv.values()) {
      book += v.book;
      market += v.market;
    }
    out.push({ date, book, market });
  }
  return out;
}
