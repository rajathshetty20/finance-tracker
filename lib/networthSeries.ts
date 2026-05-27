import type {
  Debt,
  DebtPayment,
  Entry,
  Investment,
  InvestmentEntry,
  MoneySource,
} from "./types";

export type NetworthSeriesPoint = {
  date: string;
  nw: number;
  invest_market: number;
  cash: number;
  debt_pending: number;
};

export type NetworthSeriesInput = {
  invs: Investment[];
  invEntries: InvestmentEntry[];
  debts: Debt[];
  payments: DebtPayment[];
  money: MoneySource[];
  incomes: Entry[];
  expenses: Entry[];
  today: string;
};

// Computes NW at every event date using the same identity the dashboard uses:
//   NW = unrealized_invest − interest_commit + money_sources + phase_savings
// where phase_savings sums income−expense across ALL phases, and money_sources
// excludes `phase_rollover` entries (they'd double-count those past-phase savings).
export function buildNetworthSeries(input: NetworthSeriesInput): NetworthSeriesPoint[] {
  const { invs, invEntries, debts, payments, money, incomes, expenses, today } = input;

  const moneyForCash = money.filter((m) => m.kind !== "phase_rollover");

  const dateSet = new Set<string>();
  for (const e of invEntries) dateSet.add(e.date);
  for (const d of debts) {
    dateSet.add(d.start_date);
    if (d.closed_on) dateSet.add(d.closed_on);
  }
  for (const p of payments) dateSet.add(p.date);
  for (const m of moneyForCash) dateSet.add(m.date);
  for (const i of incomes) dateSet.add(i.date);
  for (const e of expenses) dateSet.add(e.date);
  dateSet.add(today);
  const dates = [...dateSet].sort();

  const entriesByInv = new Map<string, InvestmentEntry[]>();
  for (const inv of invs) entriesByInv.set(inv.id, []);
  for (const e of invEntries) entriesByInv.get(e.investment_id)?.push(e);
  for (const arr of entriesByInv.values()) arr.sort((a, b) => (a.date < b.date ? -1 : 1));

  const paymentsByDebt = new Map<string, DebtPayment[]>();
  for (const d of debts) paymentsByDebt.set(d.id, []);
  for (const p of payments) paymentsByDebt.get(p.debt_id)?.push(p);
  for (const arr of paymentsByDebt.values()) arr.sort((a, b) => (a.date < b.date ? -1 : 1));

  const moneySorted = [...moneyForCash].sort((a, b) => (a.date < b.date ? -1 : 1));
  const incSorted = [...incomes].sort((a, b) => (a.date < b.date ? -1 : 1));
  const expSorted = [...expenses].sort((a, b) => (a.date < b.date ? -1 : 1));

  let moneyPtr = 0;
  let incPtr = 0;
  let expPtr = 0;
  let moneyRun = 0;
  let incRun = 0;
  let expRun = 0;

  type DebtRunState = { ptr: number; paid: number };
  const debtRun = new Map<string, DebtRunState>();
  for (const d of debts) debtRun.set(d.id, { ptr: 0, paid: 0 });

  type InvRunState = { ptr: number; book: number; market: number };
  const invRun = new Map<string, InvRunState>();
  for (const inv of invs) invRun.set(inv.id, { ptr: 0, book: 0, market: 0 });

  const points: NetworthSeriesPoint[] = [];

  for (const d of dates) {
    while (moneyPtr < moneySorted.length && moneySorted[moneyPtr].date <= d) {
      moneyRun += Number(moneySorted[moneyPtr].amount);
      moneyPtr++;
    }
    while (incPtr < incSorted.length && incSorted[incPtr].date <= d) {
      incRun += Number(incSorted[incPtr].amount);
      incPtr++;
    }
    while (expPtr < expSorted.length && expSorted[expPtr].date <= d) {
      expRun += Number(expSorted[expPtr].amount);
      expPtr++;
    }

    let invest_market = 0;
    let open_book = 0;
    for (const inv of invs) {
      const entries = entriesByInv.get(inv.id) ?? [];
      const state = invRun.get(inv.id)!;
      while (state.ptr < entries.length && entries[state.ptr].date <= d) {
        const e = entries[state.ptr];
        if (e.entry_type === "contribution") state.book += Number(e.amount);
        else if (e.entry_type === "withdrawal") state.book -= Number(e.amount);
        state.market = Number(e.total_value_after);
        state.ptr++;
      }
      const closedByD = inv.status === "closed" && inv.closed_on && inv.closed_on <= d;
      if (!closedByD && inv.opened_on <= d) {
        invest_market += state.market;
        open_book += state.book;
      }
    }

    let debt_pending = 0;
    let interest_commit = 0;
    let principal_outstanding = 0;
    for (const debt of debts) {
      const list = paymentsByDebt.get(debt.id) ?? [];
      const state = debtRun.get(debt.id)!;
      while (state.ptr < list.length && list[state.ptr].date <= d) {
        state.paid += Number(list[state.ptr].amount);
        state.ptr++;
      }
      if (debt.start_date > d) continue;
      const closedByD = debt.status === "closed" && debt.closed_on && debt.closed_on <= d;
      if (closedByD) continue;
      debt_pending += Number(debt.total_payable) - state.paid;
      interest_commit += Number(debt.total_payable) - Number(debt.principal);
      principal_outstanding += Number(debt.principal) - state.paid;
    }

    const phase_savings = incRun - expRun;
    const unrealized_net = invest_market - open_book - interest_commit;
    const nw = unrealized_net + moneyRun + phase_savings;
    const cash = moneyRun + phase_savings - open_book + principal_outstanding;

    points.push({ date: d, nw, invest_market, cash, debt_pending });
  }

  return points;
}
