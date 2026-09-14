// Row factories for the pure-function tests.
//
// Kept out of the *.test.ts glob so the runner does not treat it as a suite.
// Every field the app reads is present; ids are readable strings rather than
// UUIDs so a failing assertion says which row it was.

import type {
  AssetClass,
  Category,
  Debt,
  DebtPayment,
  Entry,
  Goal,
  GoalAllocation,
  Investment,
  InvestmentEntry,
} from "./types";

const U = "user-1";

export function goal(over: Partial<Goal> & { id: string }): Goal {
  return {
    user_id: U,
    name: over.id,
    description: null,
    end_date: "2030-01-01",
    present_cost: 1_000_000,
    inflation_rate: 6,
    status: "active",
    created_at: "2024-01-01T00:00:00Z",
    ...over,
  };
}

export function assetClass(id: string, expected_return: number, lock_weight = 0): AssetClass {
  return {
    id,
    user_id: U,
    name: id,
    expected_return,
    lock_weight,
    created_at: "2020-01-01T00:00:00Z",
  };
}

export function alloc(
  goal_id: string,
  asset_class_id: string,
  months_before_end: number,
  target_pct: number,
): GoalAllocation {
  return {
    id: `${goal_id}-${asset_class_id}-${months_before_end}`,
    user_id: U,
    goal_id,
    asset_class_id,
    months_before_end,
    target_pct,
  };
}

export function investment(over: Partial<Investment> & { id: string }): Investment {
  return {
    user_id: U,
    name: over.id,
    asset_class_id: "equity",
    status: "open",
    opened_on: "2023-01-01",
    closed_on: null,
    notes: null,
    created_at: "2023-01-01T00:00:00Z",
    ...over,
  };
}

export function entry(over: Partial<InvestmentEntry> & { id: string; investment_id: string }): InvestmentEntry {
  return {
    user_id: U,
    date: "2024-01-01",
    entry_type: "contribution",
    amount: 0,
    total_value_after: 0,
    note: null,
    created_at: "2024-01-01T00:00:00Z",
    ...over,
  };
}

export function ledger(over: Partial<Entry> & { id: string }): Entry {
  return {
    user_id: U,
    phase_id: "phase-1",
    category_id: "cat-1",
    date: "2026-01-01",
    amount: 1000,
    note: null,
    created_at: "2026-01-01T00:00:00Z",
    ...over,
  };
}

export function category(id: string, name: string, kind: Category["kind"] = "expense"): Category {
  return { id, user_id: U, name, kind, created_at: "2020-01-01T00:00:00Z" };
}

export function debt(over: Partial<Debt> & { id: string }): Debt {
  return {
    user_id: U,
    description: over.id,
    principal: 500_000,
    total_payable: 572_400,
    start_date: "2025-06-10",
    status: "open",
    closed_on: null,
    created_at: "2025-06-10T00:00:00Z",
    ...over,
  };
}

export function payment(over: Partial<DebtPayment> & { id: string; debt_id: string }): DebtPayment {
  return {
    user_id: U,
    date: "2026-07-10",
    amount: 15_900,
    note: null,
    created_at: "2026-07-10T00:00:00Z",
    ...over,
  };
}

/** investment_entries grouped the way every page groups them. */
export function byInvestment(entries: InvestmentEntry[]): Map<string, InvestmentEntry[]> {
  const m = new Map<string, InvestmentEntry[]>();
  for (const e of entries) {
    const arr = m.get(e.investment_id) ?? [];
    arr.push(e);
    m.set(e.investment_id, arr);
  }
  return m;
}

export function byGoal(allocs: GoalAllocation[]): Map<string, GoalAllocation[]> {
  const m = new Map<string, GoalAllocation[]>();
  for (const a of allocs) {
    const arr = m.get(a.goal_id) ?? [];
    arr.push(a);
    m.set(a.goal_id, arr);
  }
  return m;
}
