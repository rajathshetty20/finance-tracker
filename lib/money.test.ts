// Cashflow arithmetic: the month series, the bases every screen quotes, the
// "did you forget to log this" nudge, and category concentration.
//
// Run with `npm test` after touching lib/money.ts.

import assert from "node:assert/strict";
import test from "node:test";
import {
  cashflowBases,
  categoryShares,
  fmtMonthShort,
  inferEmis,
  median,
  monthKeysBetween,
  monthlySeries,
  totalEmi,
} from "./money.ts";
import { category, debt, ledger, payment } from "./fixtures.test-helpers.ts";

// ---------------------------------------------------------------------------
// Month arithmetic
// ---------------------------------------------------------------------------

test("month keys span year boundaries inclusively", () => {
  assert.deepEqual(monthKeysBetween("2025-11-14", "2026-02-02"), [
    "2025-11",
    "2025-12",
    "2026-01",
    "2026-02",
  ]);
  assert.deepEqual(monthKeysBetween("2026-03-01", "2026-03-31"), ["2026-03"]);
});

test("September abbreviates to three letters like every other month", () => {
  // en-GB gives "Sept", which sat one character wider than every other tick.
  assert.equal(fmtMonthShort("2025-09"), "Sep 25");
  assert.equal(fmtMonthShort("2026-01"), "Jan 26");
});

test("median handles even and odd counts", () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(median([]), 0);
});

// ---------------------------------------------------------------------------
// The month series
// ---------------------------------------------------------------------------

const opts = {
  payments: [],
  invEntries: [],
  fromISO: "2026-01-01",
  toISO: "2026-03-15",
  currentMonth: "2026-03",
};

test("a month that spends more than it earns is flagged, not scored", () => {
  // The inversion this exists for: gap = invested − couldInvest with an
  // unclamped negative couldInvest made the worst month on the page render as
  // the best, in green, with a "+".
  const rows = monthlySeries({
    ...opts,
    incomes: [ledger({ id: "i", date: "2026-01-31", amount: 210_000 })],
    expenses: [ledger({ id: "e", date: "2026-01-14", amount: 496_000 })],
    invEntries: [],
  });
  const jan = rows.find((r) => r.month === "2026-01")!;
  assert.equal(jan.overspent, true);
  assert.equal(jan.gap, null, "no gap is computable when nothing was left");
  assert.ok(jan.couldInvest < 0);
});

test("a solvent month reports the gap between what was left and what was invested", () => {
  const rows = monthlySeries({
    ...opts,
    incomes: [ledger({ id: "i", date: "2026-01-31", amount: 200_000 })],
    expenses: [ledger({ id: "e", date: "2026-01-14", amount: 80_000 })],
    payments: [payment({ id: "p", debt_id: "d", date: "2026-01-10", amount: 20_000 })],
    invEntries: [
      {
        id: "c",
        user_id: "u",
        investment_id: "inv",
        date: "2026-01-20",
        entry_type: "contribution",
        amount: 60_000,
        total_value_after: 60_000,
        note: null,
        created_at: "2026-01-20T00:00:00Z",
      },
    ],
  });
  const jan = rows.find((r) => r.month === "2026-01")!;
  assert.equal(jan.overspent, false);
  assert.equal(jan.couldInvest, 100_000, "200,000 − 80,000 − 20,000");
  assert.equal(jan.invested, 60_000);
  assert.equal(jan.gap, -40_000, "invested 40k less than the month left over");
});

test("withdrawals net against contributions in the invested figure", () => {
  const mk = (type: "contribution" | "withdrawal", amount: number, id: string) => ({
    id,
    user_id: "u",
    investment_id: "inv",
    date: "2026-01-20",
    entry_type: type,
    amount,
    total_value_after: 0,
    note: null,
    created_at: "2026-01-20T00:00:00Z",
  });
  const rows = monthlySeries({
    ...opts,
    incomes: [ledger({ id: "i", date: "2026-01-31", amount: 200_000 })],
    expenses: [],
    invEntries: [mk("contribution", 50_000, "a"), mk("withdrawal", 20_000, "b")],
  });
  assert.equal(rows.find((r) => r.month === "2026-01")!.invested, 30_000);
});

test("the month in progress is marked incomplete", () => {
  const rows = monthlySeries({ ...opts, incomes: [], expenses: [] });
  assert.equal(rows.find((r) => r.month === "2026-03")!.complete, false);
  assert.equal(rows.find((r) => r.month === "2026-01")!.complete, true);
});

// ---------------------------------------------------------------------------
// EMI, always inferred
// ---------------------------------------------------------------------------

test("EMI is read off the latest payment and carries its date", () => {
  const d = debt({ id: "d" });
  const emis = inferEmis(
    [d],
    [
      payment({ id: "p1", debt_id: "d", date: "2026-06-10", amount: 15_900 }),
      payment({ id: "p2", debt_id: "d", date: "2026-07-10", amount: 16_400 }),
    ],
  );
  assert.equal(emis.length, 1);
  assert.equal(emis[0].amount, 16_400);
  assert.equal(emis[0].asOf, "2026-07-10");
  assert.equal(totalEmi(emis), 16_400);
});

test("a debt with no payments yet contributes no inferred EMI", () => {
  assert.deepEqual(inferEmis([debt({ id: "d" })], []), []);
});

// ---------------------------------------------------------------------------
// The bases every screen quotes
// ---------------------------------------------------------------------------

const cats = [category("sal", "Salary", "income"), category("rent", "Rent")];

function bases(over: Partial<Parameters<typeof cashflowBases>[0]> = {}) {
  return cashflowBases({
    incomes: [],
    expenses: [],
    openDebts: [],
    payments: [],
    categories: cats,
    phaseStartISO: "2026-01-01",
    todayISO: "2026-04-09",
    monthStartISO: "2026-04-01",
    ...over,
  });
}

test("averages divide by completed months and exclude the month in progress", () => {
  // Pay lands at month end, so including the current month drags every average
  // down and makes the app look broken on the 1st.
  const b = bases({
    incomes: [
      ledger({ id: "i1", date: "2026-01-31", amount: 200_000, category_id: "sal" }),
      ledger({ id: "i2", date: "2026-02-28", amount: 200_000, category_id: "sal" }),
      ledger({ id: "i3", date: "2026-03-31", amount: 200_000, category_id: "sal" }),
    ],
    expenses: [
      ledger({ id: "e1", date: "2026-01-05", amount: 90_000 }),
      ledger({ id: "e2", date: "2026-02-05", amount: 90_000 }),
      ledger({ id: "e3", date: "2026-03-05", amount: 90_000 }),
      ledger({ id: "e4", date: "2026-04-05", amount: 40_000 }), // in progress
    ],
  });
  assert.equal(b.completedMonths, 3);
  assert.equal(b.avgIncome, 200_000);
  assert.equal(b.avgExpense, 90_000, "April must not pull the mean down");
});

test("salary investable uses the latest salary, not the income average", () => {
  const b = bases({
    incomes: [
      ledger({ id: "i1", date: "2026-01-31", amount: 100_000, category_id: "sal" }),
      ledger({ id: "i2", date: "2026-03-31", amount: 200_000, category_id: "sal" }),
    ],
    expenses: [ledger({ id: "e", date: "2026-01-05", amount: 30_000 })],
    openDebts: [debt({ id: "d" })],
    payments: [payment({ id: "p", debt_id: "d", date: "2026-03-10", amount: 10_000 })],
  });
  assert.equal(b.inhandSalary, 200_000);
  assert.equal(b.emiTotal, 10_000);
  assert.equal(b.salaryInvestable, 200_000 - b.avgExpense - 10_000);
  assert.notEqual(b.salaryInvestable, b.avgInvestable, "the two bases must differ");
});

test("bonus and freelance never reach the salary figure", () => {
  const b = bases({
    incomes: [
      ledger({ id: "i1", date: "2026-01-31", amount: 100_000, category_id: "sal" }),
      ledger({ id: "i2", date: "2026-02-15", amount: 500_000, category_id: "bonus" }),
    ],
  });
  assert.equal(b.inhandSalary, 100_000);
});

test("one outlier month is detected with how much it lifts the mean", () => {
  const b = bases({
    incomes: [],
    expenses: [
      ledger({ id: "e1", date: "2026-01-05", amount: 90_000 }),
      ledger({ id: "e2", date: "2026-02-05", amount: 90_000 }),
      ledger({ id: "e3", date: "2026-03-05", amount: 500_000 }),
    ],
  });
  assert.ok(b.outlierMonth, "a 5x month must be surfaced");
  assert.equal(b.outlierMonth!.month, "2026-03");
  assert.ok(b.medianExpense < b.avgExpense);
  assert.ok(b.outlierMonth!.liftsAverageBy > 0);
});

test("a steady ledger reports no outlier", () => {
  const b = bases({
    expenses: [
      ledger({ id: "e1", date: "2026-01-05", amount: 90_000 }),
      ledger({ id: "e2", date: "2026-02-05", amount: 92_000 }),
      ledger({ id: "e3", date: "2026-03-05", amount: 88_000 }),
    ],
  });
  assert.equal(b.outlierMonth, null);
});

// ---------------------------------------------------------------------------
// Concentration
// ---------------------------------------------------------------------------

test("shares are ranked and a catch-all bucket is identified", () => {
  const shares = categoryShares(
    [
      ledger({ id: "1", amount: 45_000, category_id: "misc" }),
      ledger({ id: "2", amount: 30_000, category_id: "rent" }),
      ledger({ id: "3", amount: 25_000, category_id: "food" }),
    ],
    [category("misc", "Miscellaneous"), category("rent", "Rent"), category("food", "Food")],
  );
  assert.equal(shares[0].name, "Miscellaneous");
  assert.equal(shares[0].isCatchAll, true, "a bucket, not a category");
  assert.equal(shares[1].isCatchAll, false);
  assert.ok(Math.abs(shares.reduce((s, r) => s + r.share, 0) - 1) < 1e-9);
});

test("catch-all matching is case- and spelling-tolerant but not greedy", () => {
  const shares = categoryShares(
    [
      ledger({ id: "1", amount: 10, category_id: "a" }),
      ledger({ id: "2", amount: 10, category_id: "b" }),
      ledger({ id: "3", amount: 10, category_id: "c" }),
    ],
    [category("a", "Other"), category("b", "Uncategorized"), category("c", "Groceries")],
  );
  const by = new Map(shares.map((s) => [s.name, s.isCatchAll]));
  assert.equal(by.get("Other"), true);
  assert.equal(by.get("Uncategorized"), true);
  assert.equal(by.get("Groceries"), false);
});
