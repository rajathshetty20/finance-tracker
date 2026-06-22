export type Phase = {
  id: string;
  user_id: string;
  name: string;
  start_date: string;
  end_date: string | null;
  notes: string | null;
  created_at: string;
};

export type Category = {
  id: string;
  user_id: string;
  name: string;
  kind: "expense" | "income";
  created_at: string;
};

export const CategoryKinds = ["expense", "income"] as const;
export type CategoryKind = (typeof CategoryKinds)[number];

export type Entry = {
  id: string;
  user_id: string;
  phase_id: string;
  category_id: string;
  date: string;
  amount: number;
  note: string | null;
  created_at: string;
};
export type Expense = Entry;
export type Income = Entry;

export type EntryWithJoins = Entry & {
  category: { id: string; name: string } | null;
  phase: { id: string; name: string; end_date: string | null } | null;
};

export type CashBalance = {
  id: string;
  user_id: string;
  name: string;
  amount: number;
  updated_at: string;
  created_at: string;
};

export const MoneySourceKinds = [
  "manual",
  "opening_balance",
  "phase_rollover",
  "realized_gain",
  "debt_closure",
] as const;
export type MoneySourceKind = (typeof MoneySourceKinds)[number];

export type MoneySource = {
  id: string;
  user_id: string;
  name: string;
  amount: number; // signed
  date: string;
  kind: MoneySourceKind;
  phase_id: string | null;
  investment_id: string | null;
  debt_id: string | null;
  created_at: string;
};

export type AssetClass = {
  id: string;
  user_id: string;
  name: string;
  expected_return: number; // annual %, e.g. 12 = 12% p.a.
  created_at: string;
};

export type Investment = {
  id: string;
  user_id: string;
  name: string;
  asset_class_id: string | null;
  status: "open" | "closed";
  opened_on: string;
  closed_on: string | null;
  notes: string | null;
  created_at: string;
};

export const InvestmentEntryTypes = ["contribution", "withdrawal", "valuation"] as const;
export type InvestmentEntryType = (typeof InvestmentEntryTypes)[number];

export type InvestmentEntry = {
  id: string;
  user_id: string;
  investment_id: string;
  date: string;
  entry_type: InvestmentEntryType;
  amount: number;
  total_value_after: number;
  note: string | null;
  created_at: string;
};

export const GoalStatuses = ["active", "achieved", "archived"] as const;
export type GoalStatus = (typeof GoalStatuses)[number];

export type Goal = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  end_date: string;
  present_cost: number;
  inflation_rate: number; // annual %, e.g. 6 = 6% p.a.
  priority: number; // ascending = filled first
  status: GoalStatus;
  created_at: string;
};

// One glide-path breakpoint: at `months_before_end` months remaining, this
// asset class should be `target_pct`% of the goal's corpus.
export type GoalAllocation = {
  id: string;
  user_id: string;
  goal_id: string;
  asset_class_id: string;
  months_before_end: number;
  target_pct: number;
  created_at?: string;
};

export type Debt = {
  id: string;
  user_id: string;
  description: string;
  principal: number;
  total_payable: number;
  start_date: string;
  status: "open" | "closed";
  closed_on: string | null;
  created_at: string;
};

export type DebtPayment = {
  id: string;
  user_id: string;
  debt_id: string;
  date: string;
  amount: number;
  note: string | null;
  created_at: string;
};
