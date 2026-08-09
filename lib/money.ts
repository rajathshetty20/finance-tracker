// Cashflow arithmetic. Pure functions, no I/O.
//
// This module exists because "investable" had four definitions living in three
// files: an average over completed months, the latest salary minus that same
// average, and a single month's earned − spent. They differ by tens of
// thousands of rupees and were all printed under the same word. Every figure
// here carries the base it was computed from, and every screen names it.

import type { Category, Debt, DebtPayment, Entry, InvestmentEntry } from "./types";

export type MonthKey = string; // "YYYY-MM"

export function monthKeyOf(iso: string): MonthKey {
  return iso.slice(0, 7);
}

/** "2026-08" → "Aug 2026". */
export function fmtMonthKey(key: MonthKey): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** "2026-08" → "Aug 26". For dense columns where "Sept 2025" wraps. */
export function fmtMonthShort(key: MonthKey): string {
  const [y, m] = key.split("-").map(Number);
  const mon = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", {
    month: "short",
    timeZone: "UTC",
  });
  return `${mon.slice(0, 3)} ${String(y).slice(2)}`;
}

/** Month keys from `startISO` to `endISO` inclusive, ascending. */
export function monthKeysBetween(startISO: string, endISO: string): MonthKey[] {
  const out: MonthKey[] = [];
  let y = Number(startISO.slice(0, 4));
  let m = Number(startISO.slice(5, 7));
  const endY = Number(endISO.slice(0, 4));
  const endM = Number(endISO.slice(5, 7));
  while (y < endY || (y === endY && m <= endM)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// EMI — always inferred, never stored
// ---------------------------------------------------------------------------

/**
 * There is no `emi` column. The last payment on an open debt is the only
 * evidence of the instalment, so every figure derived from it is labelled
 * "inferred" and dated wherever it is printed.
 */
export type InferredEmi = {
  debtId: string;
  description: string;
  amount: number;
  /** Date of the payment this was read off. */
  asOf: string;
};

export function inferEmis(openDebts: Debt[], payments: DebtPayment[]): InferredEmi[] {
  const latest = new Map<string, DebtPayment>();
  for (const p of payments) {
    const prev = latest.get(p.debt_id);
    if (!prev || p.date > prev.date || (p.date === prev.date && p.created_at > prev.created_at)) {
      latest.set(p.debt_id, p);
    }
  }
  const out: InferredEmi[] = [];
  for (const d of openDebts) {
    const p = latest.get(d.id);
    if (!p) continue;
    out.push({
      debtId: d.id,
      description: d.description,
      amount: Number(p.amount),
      asOf: p.date,
    });
  }
  return out;
}

export function totalEmi(emis: InferredEmi[]): number {
  return emis.reduce((a, e) => a + e.amount, 0);
}

// ---------------------------------------------------------------------------
// Month-by-month
// ---------------------------------------------------------------------------

export type MonthRow = {
  month: MonthKey;
  earned: number;
  spent: number;
  /** EMI actually paid that month, from debt_payments — not the inferred figure. */
  emiPaid: number;
  /** Net investment contributions that month (contributions − withdrawals). */
  invested: number;
  /** earned − spent. */
  kept: number;
  /** earned − spent − emiPaid. What that month could have sent to investments. */
  couldInvest: number;
  /**
   * invested − couldInvest, or null when the month spent more than it earned.
   *
   * Unclamped, this inverted: a month that spent ₹4.96L had couldInvest of
   * −₹3.24L, so any investment at all produced a large POSITIVE gap and the
   * worst month on the page rendered as the best, in green, with a "+".
   */
  gap: number | null;
  /** earned − spent − EMI came out negative: nothing was left to invest. */
  overspent: boolean;
  /** False for the month in progress, whose figures are incomplete by nature. */
  complete: boolean;
};

export function monthlySeries({
  incomes,
  expenses,
  payments,
  invEntries,
  fromISO,
  toISO,
  currentMonth,
}: {
  incomes: Entry[];
  expenses: Entry[];
  payments: DebtPayment[];
  invEntries: InvestmentEntry[];
  fromISO: string;
  toISO: string;
  /** Month key of "now" — marked incomplete. */
  currentMonth: MonthKey;
}): MonthRow[] {
  const keys = monthKeysBetween(fromISO, toISO);
  const blank = () => ({ earned: 0, spent: 0, emiPaid: 0, invested: 0 });
  const acc = new Map(keys.map((k) => [k, blank()]));

  const add = (iso: string, field: "earned" | "spent" | "emiPaid" | "invested", n: number) => {
    const row = acc.get(monthKeyOf(iso));
    if (row) row[field] += n;
  };

  for (const r of incomes) add(r.date, "earned", Number(r.amount));
  for (const r of expenses) add(r.date, "spent", Number(r.amount));
  for (const p of payments) add(p.date, "emiPaid", Number(p.amount));
  for (const e of invEntries) {
    if (e.entry_type === "contribution") add(e.date, "invested", Number(e.amount));
    else if (e.entry_type === "withdrawal") add(e.date, "invested", -Number(e.amount));
  }

  return keys.map((month) => {
    const a = acc.get(month)!;
    const kept = a.earned - a.spent;
    const couldInvest = kept - a.emiPaid;
    const overspent = couldInvest < 0;
    return {
      month,
      ...a,
      kept,
      couldInvest,
      overspent,
      gap: overspent ? null : a.invested - couldInvest,
      complete: month !== currentMonth,
    };
  });
}

export function median(ns: number[]): number {
  if (ns.length === 0) return 0;
  const s = [...ns].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// ---------------------------------------------------------------------------
// The bases every screen quotes
// ---------------------------------------------------------------------------

export type CashflowBases = {
  /** Completed months in the current phase — the divisor for every average. */
  completedMonths: number;
  /** True when there is enough history for an average to mean anything. */
  hasHistory: boolean;

  avgIncome: number;
  avgExpense: number;
  /** Middle month's spending. Differs from avgExpense when one month is an outlier. */
  medianExpense: number;
  /** The completed month furthest above the median, if it distorts the mean. */
  outlierMonth: { month: MonthKey; spent: number; liftsAverageBy: number } | null;

  emis: InferredEmi[];
  emiTotal: number;

  /** Latest Salary-category income. Excludes bonus and freelance by design. */
  inhandSalary: number | null;
  inhandSalaryDate: string | null;

  /** avgIncome − avgExpense − emiTotal. A typical month, all income included. */
  avgInvestable: number | null;
  /** inhandSalary − avgExpense − emiTotal. What a standing SIP can commit to. */
  salaryInvestable: number | null;
};

export function cashflowBases({
  incomes,
  expenses,
  openDebts,
  payments,
  categories,
  phaseStartISO,
  todayISO,
  monthStartISO,
}: {
  /** Current-phase rows only. */
  incomes: Entry[];
  expenses: Entry[];
  openDebts: Debt[];
  payments: DebtPayment[];
  /** Income categories, to find "Salary". */
  categories: Category[];
  phaseStartISO: string;
  todayISO: string;
  monthStartISO: string;
}): CashflowBases {
  // Income lands at the end of a month, so the month in progress has spending
  // but not yet its pay. Including it would drag every average down.
  const pastIncomes = incomes.filter((r) => r.date < monthStartISO);
  const pastExpenses = expenses.filter((r) => r.date < monthStartISO);

  const keys = monthKeysBetween(phaseStartISO, todayISO);
  const completedMonths = Math.max(1, keys.length - 1);
  const hasHistory = keys.length >= 2;

  const sum = (rows: Entry[]) => rows.reduce((a, r) => a + Number(r.amount), 0);
  const avgIncome = sum(pastIncomes) / completedMonths;
  const avgExpense = sum(pastExpenses) / completedMonths;

  const byMonth = new Map<MonthKey, number>(
    keys.slice(0, -1).map((k) => [k, 0]),
  );
  for (const r of pastExpenses) {
    const k = monthKeyOf(r.date);
    if (byMonth.has(k)) byMonth.set(k, byMonth.get(k)! + Number(r.amount));
  }
  const monthTotals = [...byMonth.values()];
  const medianExpense = median(monthTotals);

  // One laptop-and-phone month silently moves the average — and therefore
  // "investable" — for as many months as it stays in the window.
  let outlierMonth: CashflowBases["outlierMonth"] = null;
  if (monthTotals.length >= 3) {
    let worstKey: MonthKey | null = null;
    let worstVal = 0;
    for (const [k, v] of byMonth) {
      if (v > worstVal) {
        worstVal = v;
        worstKey = k;
      }
    }
    if (worstKey && worstVal > medianExpense * 2) {
      outlierMonth = {
        month: worstKey,
        spent: worstVal,
        liftsAverageBy: (worstVal - medianExpense) / completedMonths,
      };
    }
  }

  const emis = inferEmis(openDebts, payments);
  const emiTotal = totalEmi(emis);

  const salaryCat = categories.find((c) => c.kind === "income" && c.name === "Salary");
  let inhandSalary: number | null = null;
  let inhandSalaryDate: string | null = null;
  if (salaryCat) {
    const rows = incomes
      .filter((r) => r.category_id === salaryCat.id)
      .sort((a, b) => (a.date < b.date ? 1 : -1));
    if (rows.length > 0) {
      inhandSalary = Number(rows[0].amount);
      inhandSalaryDate = rows[0].date;
    }
  }

  return {
    completedMonths,
    hasHistory,
    avgIncome,
    avgExpense,
    medianExpense,
    outlierMonth,
    emis,
    emiTotal,
    inhandSalary,
    inhandSalaryDate,
    avgInvestable: hasHistory ? avgIncome - avgExpense - emiTotal : null,
    salaryInvestable:
      hasHistory && inhandSalary !== null ? inhandSalary - avgExpense - emiTotal : null,
  };
}

// ---------------------------------------------------------------------------
// "Did I forget to log something"
// ---------------------------------------------------------------------------

/**
 * Six expenses a month is not a typing problem; forgetting one is. So the
 * recurring feature is framed as an absence, not a shortcut: a category logged
 * in most recent months with nothing in the current one.
 *
 * Keyed on category, never on (category, amount) — a rent that changes every
 * month is still a rent that is due every month.
 */
export type RecurringMiss = {
  categoryId: string;
  categoryName: string;
  /** Of the last `MISS_WINDOW` completed months, how many had an entry. */
  monthsSeen: number;
  /**
   * Typical amount for this category in the window — the median, not the last
   * one entered. A category's most recent row can be a ₹1.45L laptop, and
   * offering that as the prefill for "you usually log Shopping" is worse than
   * offering nothing.
   */
  typicalAmount: number;
  lastDate: string;
};

export const MISS_WINDOW = 4;
export const MISS_THRESHOLD = 3;
export const MISS_MAX = 4;

export function missingRecurring({
  expenses,
  categories,
  todayISO,
  monthStartISO,
}: {
  expenses: Entry[];
  categories: Category[];
  todayISO: string;
  monthStartISO: string;
}): RecurringMiss[] {
  const currentMonth = monthKeyOf(todayISO);
  const nameById = new Map(categories.map((c) => [c.id, c.name]));

  // The MISS_WINDOW completed months immediately before this one.
  const window: MonthKey[] = [];
  let y = Number(monthStartISO.slice(0, 4));
  let m = Number(monthStartISO.slice(5, 7));
  for (let i = 0; i < MISS_WINDOW; i++) {
    m -= 1;
    if (m < 1) {
      m = 12;
      y -= 1;
    }
    window.push(`${y}-${String(m).padStart(2, "0")}`);
  }
  const inWindow = new Set(window);

  const seen = new Map<string, Set<MonthKey>>();
  const loggedThisMonth = new Set<string>();
  const last = new Map<string, Entry>();
  const amounts = new Map<string, number[]>();

  for (const e of expenses) {
    const k = monthKeyOf(e.date);
    if (k === currentMonth) loggedThisMonth.add(e.category_id);
    if (inWindow.has(k)) {
      const s = seen.get(e.category_id) ?? new Set<MonthKey>();
      s.add(k);
      seen.set(e.category_id, s);
      const prev = last.get(e.category_id);
      if (!prev || e.date > prev.date) last.set(e.category_id, e);
      const arr = amounts.get(e.category_id) ?? [];
      arr.push(Number(e.amount));
      amounts.set(e.category_id, arr);
    }
  }

  const out: RecurringMiss[] = [];
  for (const [catId, months] of seen) {
    if (months.size < MISS_THRESHOLD) continue;
    if (loggedThisMonth.has(catId)) continue;
    const e = last.get(catId)!;
    out.push({
      categoryId: catId,
      categoryName: nameById.get(catId) ?? "—",
      monthsSeen: months.size,
      typicalAmount: Math.round(median(amounts.get(catId) ?? [Number(e.amount)])),
      lastDate: e.date,
    });
  }
  // Bounded: a wall of chips covering half the category list is a to-do list,
  // not a nudge, and reads as noise on the 1st of a month when nothing is
  // logged yet. The biggest few are the ones worth chasing.
  return out.sort((a, b) => b.typicalAmount - a.typicalAmount).slice(0, MISS_MAX);
}

// ---------------------------------------------------------------------------
// Where the spending is concentrated
// ---------------------------------------------------------------------------

/** Names that mean "I didn't decide what this was". */
const CATCH_ALL = /^(misc|miscellaneous|other|others|uncategori[sz]ed|general|unknown)$/i;

export type CategoryShare = {
  categoryId: string;
  name: string;
  amount: number;
  count: number;
  share: number; // 0..1 of the total in the window
  isCatchAll: boolean;
};

export function categoryShares(
  expenses: Entry[],
  categories: Category[],
): CategoryShare[] {
  const nameById = new Map(categories.map((c) => [c.id, c.name]));
  const acc = new Map<string, { amount: number; count: number }>();
  for (const e of expenses) {
    const cur = acc.get(e.category_id) ?? { amount: 0, count: 0 };
    cur.amount += Number(e.amount);
    cur.count += 1;
    acc.set(e.category_id, cur);
  }
  const total = [...acc.values()].reduce((a, r) => a + r.amount, 0);
  return [...acc.entries()]
    .map(([categoryId, r]) => {
      const name = nameById.get(categoryId) ?? "—";
      return {
        categoryId,
        name,
        amount: r.amount,
        count: r.count,
        share: total > 0 ? r.amount / total : 0,
        isCatchAll: CATCH_ALL.test(name.trim()),
      };
    })
    .sort((a, b) => b.amount - a.amount);
}
