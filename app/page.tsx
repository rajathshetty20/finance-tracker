import Link from "next/link";
import { Check, TriangleAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import type {
  AssetClass,
  CashBalance,
  Category,
  Debt,
  DebtPayment,
  Goal,
  GoalAllocation,
  Investment,
  InvestmentEntry,
  MoneySource,
  Phase,
  Entry,
} from "@/lib/types";
import { analyzeGoals, poolByAssetClass } from "@/lib/goals";
import { todayISO, monthsInRange, daysInRange, currentMonthStartISO, fmtINR as fmt } from "@/lib/dates";
import NetworthChart from "./NetworthChart";
import { buildNetworthSeries } from "@/lib/networthSeries";

// Module scope: reading the clock inside the component body counts as
// calling an impure function during render.
function daysSince(iso: string | null): number {
  if (!iso) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
}

export default async function DashboardPage() {
  const supabase = await createClient();

  const [
    { data: phasesData },
    { data: cashData },
    { data: invsData },
    { data: invEntriesData },
    { data: debtsData },
    { data: debtPaymentsData },
    { data: moneyData },
    { data: goalsData },
    { data: allocData },
    { data: assetClassData },
  ] = await Promise.all([
    supabase.from("phases").select("*").order("start_date", { ascending: false }),
    supabase.from("cash_balances").select("*"),
    supabase.from("investments").select("*"),
    supabase.from("investment_entries").select("*"),
    supabase.from("debts").select("*"),
    supabase.from("debt_payments").select("*"),
    supabase.from("money_sources").select("*"),
    supabase.from("goals").select("*"),
    supabase.from("goal_allocations").select("*"),
    supabase.from("asset_classes").select("*"),
  ]);

  const phases = (phasesData ?? []) as Phase[];
  const currentPhase = phases.find((p) => p.end_date === null) ?? null;

  if (!currentPhase) {
    return (
      <div className="space-y-4">
        <header>
          <h1 className="text-2xl font-semibold">Welcome</h1>
          <p className="text-sm text-ink-3">
            Start by creating your first phase.
          </p>
        </header>
        <Link
          href="/settings"
          className="inline-block rounded-md bg-ink px-4 py-2 text-sm font-medium text-ground hover:opacity-90"
        >
          Create your first phase
        </Link>
      </div>
    );
  }

  // All-phase income/expense (used for the NW series across history). The current
  // phase's slice is derived from this for the cashflow/savings metrics below.
  const [{ data: expensesData }, { data: incomesData }, { data: categoriesData }] = await Promise.all([
    supabase.from("expenses").select("*"),
    supabase.from("incomes").select("*"),
    supabase.from("categories").select("*").eq("kind", "income"),
  ]);

  const cash = (cashData ?? []) as CashBalance[];
  const invs = (invsData ?? []) as Investment[];
  const invEntries = (invEntriesData ?? []) as InvestmentEntry[];
  const debts = (debtsData ?? []) as Debt[];
  const payments = (debtPaymentsData ?? []) as DebtPayment[];
  const money = (moneyData ?? []) as MoneySource[];
  const allExpenses = (expensesData ?? []) as Entry[];
  const allIncomes = (incomesData ?? []) as Entry[];
  const expenses = allExpenses.filter((e) => e.phase_id === currentPhase.id);
  const incomes = allIncomes.filter((e) => e.phase_id === currentPhase.id);
  const incomeCategories = (categoriesData ?? []) as Category[];

  const entriesByInv = new Map<string, InvestmentEntry[]>();
  for (const inv of invs) entriesByInv.set(inv.id, []);
  for (const e of invEntries) entriesByInv.get(e.investment_id)?.push(e);

  const openInvs = invs.filter((i) => i.status === "open");

  const invest_market = openInvs.reduce((acc, inv) => {
    const es = entriesByInv.get(inv.id) ?? [];
    const latest = [...es].sort((a, b) => (a.date < b.date ? 1 : -1))[0];
    return acc + (latest ? Number(latest.total_value_after) : 0);
  }, 0);

  const bookOf = (es: InvestmentEntry[]) =>
    es.reduce((a, e) => {
      if (e.entry_type === "contribution") return a + Number(e.amount);
      if (e.entry_type === "withdrawal") return a - Number(e.amount);
      return a;
    }, 0);

  const open_invest_book = openInvs.reduce(
    (acc, inv) => acc + bookOf(entriesByInv.get(inv.id) ?? []),
    0,
  );

  const cashSum = cash.reduce((a, r) => a + Number(r.amount), 0);

  const paidBy = new Map<string, number>();
  for (const p of payments) paidBy.set(p.debt_id, (paidBy.get(p.debt_id) ?? 0) + Number(p.amount));

  const openDebts = debts.filter((d) => d.status === "open");
  const debt_pending = openDebts.reduce(
    (a, d) => a + (Number(d.total_payable) - (paidBy.get(d.id) ?? 0)),
    0,
  );
  const interest_commit = openDebts.reduce(
    (a, d) => a + (Number(d.total_payable) - Number(d.principal)),
    0,
  );

  const unrealized_inv = invest_market - open_invest_book;
  const unrealized_net = unrealized_inv - interest_commit;
  const money_sources = money.reduce((a, m) => a + Number(m.amount), 0);

  const phase_income = incomes.reduce((a, r) => a + Number(r.amount), 0);
  const phase_expense = expenses.reduce((a, r) => a + Number(r.amount), 0);
  const phase_savings = phase_income - phase_expense;

  const NW = invest_market + cashSum - debt_pending;
  const expected_NW = unrealized_net + money_sources + phase_savings;
  const cash_discrepancy = expected_NW - NW;

  // Current-phase monthly averages.
  // Income lands at end of the month, so the current (partial) month doesn't
  // yet contain its income — exclude it from the divisor AND from past totals.
  const months = monthsInRange(currentPhase.start_date, todayISO());
  const days = daysInRange(currentPhase.start_date, todayISO());
  const months_for_avg = Math.max(1, months - 1);
  const showAverages = days >= 7 && months >= 2;
  const monthStart = currentMonthStartISO();
  const phase_income_past   = incomes.filter((e) => e.date <  monthStart).reduce((a, r) => a + Number(r.amount), 0);
  const phase_expense_past  = expenses.filter((e) => e.date <  monthStart).reduce((a, r) => a + Number(r.amount), 0);
  const avgIncome = phase_income_past / months_for_avg;
  const avgPastExpense = phase_expense_past / months_for_avg;

  // Debt-to-asset ratio (informational, alongside debt pending)
  const assets_for_ratio = invest_market + cashSum;
  const debt_ratio = assets_for_ratio > 0 ? debt_pending / assets_for_ratio : null;

  // Cashflow metrics
  // Inhand salary = latest income entry in current phase whose category is "Salary"
  const salaryCat = incomeCategories.find((c) => c.name === "Salary");
  let inhandSalary: number | null = null;
  if (salaryCat) {
    const salaryEntries = incomes
      .filter((e) => e.category_id === salaryCat.id)
      .sort((a, b) => (a.date < b.date ? 1 : -1));
    if (salaryEntries.length > 0) inhandSalary = Number(salaryEntries[0].amount);
  }
  // Total EMI = sum of each open debt's most recent payment amount.
  // (No dedicated emi column — the last actual EMI is a reliable proxy.)
  const lastEmiAmount = new Map<string, number>();
  const lastEmiDate = new Map<string, string>();
  for (const p of payments) {
    const prev = lastEmiDate.get(p.debt_id);
    if (!prev || p.date > prev) {
      lastEmiDate.set(p.debt_id, p.date);
      lastEmiAmount.set(p.debt_id, Number(p.amount));
    }
  }
  const totalEmi = openDebts.reduce((a, d) => a + (lastEmiAmount.get(d.id) ?? 0), 0);
  // Monthly investable = inhand_salary − past avg monthly expense − total EMI
  const monthlyInvestable =
    inhandSalary !== null && showAverages
      ? inhandSalary - avgPastExpense - totalEmi
      : null;
  // SIP rate = monthly investable as % of inhand salary

  const oldestCashUpdate =
    cash.length > 0
      ? cash.reduce((min, r) => (r.updated_at < min ? r.updated_at : min), cash[0].updated_at)
      : null;

  const oldestCashAgeDays = daysSince(oldestCashUpdate);


  // Goals: same helper the Goals page uses, so the two pages can never
  // disagree about what the plan costs.
  const goals = (goalsData ?? []) as Goal[];
  const assetClasses = (assetClassData ?? []) as AssetClass[];
  const allocByGoal = new Map<string, GoalAllocation[]>();
  for (const a of (allocData ?? []) as GoalAllocation[]) {
    const arr = allocByGoal.get(a.goal_id);
    if (arr) arr.push(a);
    else allocByGoal.set(a.goal_id, [a]);
  }
  const pool = poolByAssetClass(invs, entriesByInv);
  const { analyses } = analyzeGoals(goals, allocByGoal, assetClasses, pool, todayISO());
  const goalsRequired = analyses.reduce((s, a) => s + a.requiredMonthly, 0);
  // The plan is funded by a standing SIP out of salary, not out of a trailing
  // average that is dragged down by an older pay level.
  const headroom =
    monthlyInvestable !== null && analyses.length > 0 ? monthlyInvestable - goalsRequired : null;

  // Portfolio mix, ranked. Replaces the nested two-ring donut, which needed a
  // legend repeating every percentage in text to be readable at all.
  const classNameById = new Map(assetClasses.map((c) => [c.id, c.name]));
  const mix = [...pool.entries()]
    .map(([id, value]) => ({ name: classNameById.get(id) ?? "—", value }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value);
  const mixTotal = mix.reduce((a, r) => a + r.value, 0);

  // Every outflow subtracted in order. "Avg investable" is what a typical month
  // actually leaves once debt service is taken out — the old "avg savings"
  // stopped at expenses, so it read ~17k higher than anything you could invest.
  const avgInvestable = showAverages ? avgIncome - avgPastExpense - totalEmi : null;

  const assets = invest_market + cashSum;
  const balanced = Math.abs(cash_discrepancy) < 0.01;

  const nwSeries = buildNetworthSeries({
    invs,
    invEntries,
    debts,
    payments,
    money,
    incomes: allIncomes,
    expenses: allExpenses,
    today: todayISO(),
  });

  return (
    <div className="space-y-6">
      {/* Net worth, then the arithmetic behind it. The components used to be
          four separate tiles, which asked the reader to take on trust that
          they related to the headline. */}
      <section className="rounded-xl border border-rule bg-surface p-5">
        <div className="text-[11px] font-medium uppercase tracking-wider text-ink-3">Net worth</div>
        <div className={`mt-1 text-[2.6rem] font-semibold leading-none tabular-nums ${NW < 0 ? "text-down" : ""}`}>
          {fmt(NW)}
        </div>

        {assets > 0 && (
          <>
            <div className="mt-4 flex h-2.5 gap-[2px] overflow-hidden rounded-full">
              <span style={{ width: `${(invest_market / assets) * 100}%`, background: "var(--cat-1)" }} />
              <span style={{ width: `${(cashSum / assets) * 100}%`, background: "var(--cat-6)" }} />
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[0.8125rem]">
              <Key color="var(--cat-1)" value={fmt(invest_market)} name="invested" />
              <Key color="var(--cat-6)" value={fmt(cashSum)} name="cash" />
            </div>
          </>
        )}

        <p className="mt-3 font-mono text-[0.6875rem] tabular-nums text-ink-3">
          {fmt(assets)} assets − {fmt(debt_pending)} debt = {fmt(NW)}
        </p>

        {/* The parity check. Two independent routes to the same figure: what
            you hold, and what the ledger says you should hold. It used to
            appear only when it disagreed — but "the books balance" is the
            claim this app exists to make, so it is worth stating when true. */}
        <div className="mt-4 border-t border-rule-soft pt-3">
          {balanced ? (
            <p className="flex items-start gap-2 text-[0.8125rem] text-ink-2">
              <Check className="mt-[3px] h-3.5 w-3.5 shrink-0 text-up" />
              <span>
                <span className="font-medium text-ink">Books balance.</span> Holdings and the
                income-and-spending ledger agree, to the rupee.
              </span>
            </p>
          ) : (
            <p className="flex items-start gap-2 text-[0.8125rem] text-ink-2">
              <TriangleAlert className="mt-[3px] h-3.5 w-3.5 shrink-0 text-warn" />
              <span>
                <span className="font-medium text-ink">Off by {fmt(Math.abs(cash_discrepancy))}.</span>{" "}
                {cash_discrepancy > 0
                  ? "Cash is understated — money received but not recorded."
                  : "Cash is overstated — money spent but not recorded."}{" "}
                <Link href="/cash" className="underline">Sync cash</Link>
                {oldestCashUpdate && ` · oldest entry ${oldestCashAgeDays}d old`}.
              </span>
            </p>
          )}
        </div>
      </section>

      {/* One month, subtracted in order. */}
      <section className="rounded-xl border border-rule bg-surface p-4">
        <h2 className="text-sm font-medium text-ink-3">
          Where a month goes
          {!showAverages && <span className="ml-2 text-xs">(needs a completed month)</span>}
        </h2>
        {showAverages && avgInvestable !== null ? (
          <>
            <div className="mt-3 flex h-2 gap-[2px] overflow-hidden rounded-full bg-surface-2">
              <span style={{ width: `${(avgPastExpense / avgIncome) * 100}%`, background: "var(--down)" }} />
              <span style={{ width: `${(totalEmi / avgIncome) * 100}%`, background: "var(--warn)" }} />
              <span style={{ width: `${Math.max(0, avgInvestable / avgIncome) * 100}%`, background: "var(--up)" }} />
            </div>
            <div className="mt-1">
              <FlowRow label="Earned" sub="average month" value={fmt(avgIncome)} />
              <FlowRow label="Spent" value={`−${fmt(avgPastExpense)}`} pct={avgPastExpense / avgIncome} tone="down" />
              <FlowRow label="Debt service" sub="EMI" value={`−${fmt(totalEmi)}`} pct={totalEmi / avgIncome} tone="down" />
              <FlowRow
                label="Avg investable"
                sub="avg income − expenses − EMI"
                value={fmt(avgInvestable)}
                pct={avgInvestable / avgIncome}
                tone="keep"
              />
            </div>
          </>
        ) : (
          <p className="mt-2 text-sm text-ink-3">
            Log a full month and this fills in.
          </p>
        )}
      </section>

      {/* Required vs available — one subtraction across two pages that the app
          has never actually performed. */}
      {headroom !== null && monthlyInvestable !== null && (
        <section className="rounded-xl border border-rule bg-surface p-4">
          <h2 className="text-sm font-medium text-ink-3">Can you fund the plan?</h2>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Cell label="Goals need" value={fmt(goalsRequired)} />
            <Cell label="Salary investable" value={fmt(monthlyInvestable)} sub="in-hand − expenses − EMI" />
          </div>
          <div
            className={`mt-3 rounded-lg border p-3 text-sm ${
              headroom >= 0 ? "border-up/30 bg-up/[0.07]" : "border-down/30 bg-down/[0.07]"
            }`}
          >
            {headroom >= 0 ? (
              <>
                Yes — <span className="font-semibold tabular-nums text-up">{fmt(headroom)}</span> to
                spare each month from salary, across {analyses.length} active goal
                {analyses.length === 1 ? "" : "s"}.
              </>
            ) : (
              <>
                Short by{" "}
                <span className="font-semibold tabular-nums text-down">{fmt(Math.abs(headroom))}</span>{" "}
                a month across {analyses.length} active goal{analyses.length === 1 ? "" : "s"}.{" "}
                <Link href="/goals" className="underline">Review the goals</Link>.
              </>
            )}
          </div>
        </section>
      )}

      {mix.length > 0 && (
        <section className="rounded-xl border border-rule bg-surface p-4">
          <h2 className="text-sm font-medium text-ink-3">Portfolio mix</h2>
          <div className="mt-3 space-y-2.5">
            {mix.map((r, i) => (
              <div key={r.name} className="grid grid-cols-[1fr_auto] gap-x-2 text-[0.8125rem]">
                <span className="truncate">{r.name}</span>
                <span className="tabular-nums text-ink-2">
                  {((r.value / mixTotal) * 100).toFixed(1)}%
                </span>
                <span className="col-span-2 mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
                  <span
                    className="block h-full rounded-full"
                    style={{
                      width: `${(r.value / mixTotal) * 100}%`,
                      background: `var(--cat-${(i % 8) + 1})`,
                    }}
                  />
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-xl border border-rule bg-surface p-4">
        <h2 className="text-sm font-medium text-ink-3">Debt</h2>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Cell label="Outstanding" value={fmt(debt_pending)} tone={debt_pending > 0 ? "down" : undefined} />
          <Cell label="Of assets" value={debt_ratio === null ? "—" : `${(debt_ratio * 100).toFixed(1)}%`} />
        </div>
      </section>

      <NetworthChart data={nwSeries} />
    </div>
  );
}

function Key({ color, value, name }: { color: string; value: string; name: string }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <i className="h-2 w-2 shrink-0 -translate-y-px rounded-sm" style={{ background: color }} />
      <span className="font-semibold tabular-nums">{value}</span>
      <span className="text-ink-3">{name}</span>
    </span>
  );
}

function FlowRow({
  label,
  sub,
  value,
  pct,
  tone,
}: {
  label: string;
  sub?: string;
  value: string;
  pct?: number;
  tone?: "down" | "keep";
}) {
  return (
    <div
      className={`grid grid-cols-[1fr_auto] items-center gap-3 py-2 ${
        tone === "keep" ? "border-t border-rule" : "border-b border-rule-soft"
      }`}
    >
      <span className={`text-sm ${tone === "keep" ? "font-semibold" : ""}`}>
        {label}
        {sub && <span className="block text-[0.6875rem] text-ink-3">{sub}</span>}
      </span>
      <span className="text-right">
        <span
          className={`block font-semibold tabular-nums ${
            tone === "down" ? "text-down" : tone === "keep" ? "text-up" : ""
          }`}
        >
          {value}
        </span>
        {pct !== undefined && (
          <span className="block text-[0.6875rem] tabular-nums text-ink-3">
            {(pct * 100).toFixed(1)}%
          </span>
        )}
      </span>
    </div>
  );
}

function Cell({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "down" }) {
  return (
    <div className="rounded-lg border border-rule p-3">
      <div className="text-[0.6875rem] font-medium uppercase tracking-wide text-ink-3">{label}</div>
      <div className={`mt-1 text-lg font-semibold tabular-nums ${tone === "down" ? "text-down" : ""}`}>
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[0.6875rem] text-ink-3">{sub}</div>}
    </div>
  );
}

