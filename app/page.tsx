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
import { analyzeGoals, marketValueOf, planSummary, poolByAssetClass } from "@/lib/goals";
import { cashflowBases } from "@/lib/money";
import { lockFunds, outstandingDebt } from "@/lib/lock";
import { appToday } from "@/lib/demo";
import { currentMonthStartISO, fmtINR as fmt, fmtMonthYear } from "@/lib/dates";
import { fmtMonthKey } from "@/lib/money";
import { assetClassColor } from "./ui";
import NetworthChart from "./NetworthChart";
import { buildNetworthSeries } from "@/lib/networthSeries";

export default async function DashboardPage() {
  const supabase = await createClient();
  const today = await appToday();

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
    supabase.from("categories").select("*"),
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

  // Was an inline copy that sorted on `date` alone — reintroducing exactly the
  // same-date tie bug lib/goals.ts documents. One implementation, imported.
  const invest_market = openInvs.reduce(
    (acc, inv) => acc + marketValueOf(inv, entriesByInv.get(inv.id) ?? []),
    0,
  );

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

  // Signed ledger: a card balance is a negative row. Netting it into one
  // "cash" figure puts card debt on the assets side — /holdings was fixed for
  // this and Home was not, so the two tabs disagreed one click apart.
  const cashInHand = cash.reduce((a, r) => a + Math.max(0, Number(r.amount)), 0);
  const cardFloat = cash.reduce((a, r) => a + Math.min(0, Number(r.amount)), 0); // ≤ 0
  const cashSum = cashInHand + cardFloat;

  const paidBy = new Map<string, number>();
  for (const p of payments) paidBy.set(p.debt_id, (paidBy.get(p.debt_id) ?? 0) + Number(p.amount));

  const openDebts = debts.filter((d) => d.status === "open");
  const debt_pending = outstandingDebt(debts, payments);
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

  // Every average, the EMI, and both "investable" figures come from one place
  // (lib/money.ts) so this page and /plan cannot print different numbers under
  // the same word — which they did, by ₹13,716.
  const monthStart = currentMonthStartISO(today);
  const bases = cashflowBases({
    incomes,
    expenses,
    openDebts,
    payments,
    categories: incomeCategories,
    phaseStartISO: currentPhase.start_date,
    todayISO: today,
    monthStartISO: monthStart,
  });
  const months_for_avg = bases.completedMonths;
  const avgPastExpense = bases.avgExpense;

  // A negative cash balance is a cash balance. Card float nets against the
  // other accounts rather than being reported as debt — "debt" here means
  // borrowing you took out, which is the only thing you can pay down.
  const assets_for_ratio = invest_market + cashSum;
  const debt_ratio = assets_for_ratio > 0 ? debt_pending / assets_for_ratio : null;

  const monthlyInvestable = bases.investable;
  const salary = bases.inhandSalary;
  const salaryDate = bases.inhandSalaryDate;
  // avgExpense decides the verdict, and one laptop-and-phone month moves it —
  // lib/money.ts computes the outlier for exactly this reason, so say it here
  // rather than letting a single purchase flip the answer silently.
  const outlier = bases.outlierMonth;



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
  const heldByClass = poolByAssetClass(invs, entriesByInv);
  const lock = lockFunds(heldByClass, debt_pending, assetClasses);
  const pool = lock.available;
  const { analyses } = analyzeGoals(goals, allocByGoal, assetClasses, pool, today);
  const goalsRequired = planSummary(analyses).requiredMonthly;
  // Round both operands BEFORE subtracting, as /plan does: subtracting raw
  // floats and rounding the result left this ₹1 off the rows above it.
  const spare =
    monthlyInvestable === null
      ? null
      : Math.round(monthlyInvestable) - Math.round(goalsRequired);
  const hasGoals = analyses.length > 0;
  const showGoalsRow = hasGoals && Math.round(goalsRequired) > 0;
  const barScale = Math.max(salary ?? 0, avgPastExpense + (showGoalsRow ? goalsRequired : 0), 1);

  // Portfolio mix, ranked. Replaces the nested two-ring donut, which needed a
  // legend repeating every percentage in text to be readable at all.
  const classNameById = new Map(assetClasses.map((c) => [c.id, c.name]));
  const classOrder = assetClasses.map((c) => c.id);
  const mix = [...heldByClass.entries()]
    .map(([id, value]) => ({ id, name: classNameById.get(id) ?? "—", value }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value);
  const mixTotal = mix.reduce((a, r) => a + r.value, 0);

  const assets = invest_market + Math.max(0, cashSum);
  // Assets and debt share one scale so the segments are comparable.
  const barTotal = Math.max(1, assets + debt_pending);
  const balanced = Math.abs(cash_discrepancy) < 0.01;

  const nwSeries = buildNetworthSeries({
    invs,
    invEntries,
    debts,
    payments,
    money,
    incomes: allIncomes,
    expenses: allExpenses,
    today,
  });

  // The parity check, stated as the subtraction it is. Two independent routes
  // to the same cash figure: what the ledger implies you must be holding, and
  // what you have actually recorded. "Off by ₹1,46,945" named a discrepancy
  // without ever showing where it came from, which is the one thing this app
  // exists to be able to do.
  // The parity check still runs — it is the regression test that has caught
  // real errors — but it now reports only its verdict. The full derivation was
  // on screen every day and earned its space only on the rare one where it is
  // not zero, so that detail lives in the sentence shown when it breaks.

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
            {/* Three segments across one scale: two things you own and the one
                you owe. The bar showed only the assets, so it could not be
                read as the headline it sits under. */}
            <div className="mt-4 flex h-2.5 gap-[2px] overflow-hidden rounded-full">
              <span style={{ width: `${(invest_market / barTotal) * 100}%`, background: "var(--cat-1)" }} />
              <span style={{ width: `${Math.max(0, (cashSum / barTotal) * 100)}%`, background: "var(--cat-6)" }} />
              {debt_pending > 0 && (
                <span style={{ width: `${(debt_pending / barTotal) * 100}%`, background: "var(--debt)" }} />
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[0.8125rem]">
              <Key color="var(--cat-1)" value={fmt(invest_market)} name="invested" />
              <Key color="var(--cat-6)" value={fmt(cashSum)} name="cash" />
              {debt_pending > 0 && (
                <Key color="var(--debt)" value={`−${fmt(debt_pending)}`} name="debt" />
              )}
            </div>
          </>
        )}

        <p className="mt-3 font-mono text-[0.6875rem] tabular-nums text-ink-3">
          {fmt(invest_market)} invested + {fmt(cashSum)} cash − {fmt(debt_pending)} debt ={" "}
          {fmt(NW)}
          {debt_ratio !== null && debt_pending > 0 && (
            <span className="ml-2">· debt is {(debt_ratio * 100).toFixed(1)}% of what you hold</span>
          )}
        </p>

        {/* The parity check. Two independent routes to the same figure: what
            you hold, and what the ledger says you should hold. It used to
            appear only when it disagreed — but "the books balance" is the
            claim this app exists to make, so it is worth stating when true. */}
        <div className="mt-4 border-t border-rule-soft pt-3">
          <p className="flex items-start gap-2 text-[0.8125rem] text-ink-2">
            {balanced ? (
              <Check className="mt-[3px] h-3.5 w-3.5 shrink-0 text-up" />
            ) : (
              <TriangleAlert className="mt-[3px] h-3.5 w-3.5 shrink-0 text-warn" />
            )}
            <span>
              {balanced ? (
                <>
                  <span className="font-medium text-ink">Books balance.</span> Holdings and the
                  income-and-spending ledger agree, to the rupee.
                </>
              ) : (
                <>
                  <span className="font-medium text-ink">
                    {fmt(Math.abs(cash_discrepancy))} unexplained.
                  </span>{" "}
                  {cash_discrepancy > 0
                    ? "The ledger accounts for more cash than you hold — money spent but not recorded."
                    : "You hold more cash than the ledger accounts for — money received but not recorded."}{" "}
                  {/* Money sources are materialised when a phase closes, not
                      typed, so "check the sources" was a dead end: the only
                      figure a person can actually correct here is a stale cash
                      balance. */}
                  <Link href="/holdings" className="underline">
                    Update your cash balances
                  </Link>
                  .
                </>
              )}
            </span>
          </p>
        </div>
      </section>

      {/* The month, subtracted in order. The answer leads and the chain
          derives it, matching /plan — the merge that produced this section
          first buried the verdict in its own last row. */}
      <section className="rounded-xl border border-rule bg-surface p-5">
        <h2 className="text-sm font-medium">
          {hasGoals ? "Can you fund the plan?" : "What's left each month"}
        </h2>
        {monthlyInvestable !== null && salary !== null && salary > 0 ? (
          <>
            <div className="mt-3 text-[11px] font-medium uppercase tracking-wider text-ink-3">
              {!hasGoals ? "Investable each month" : spare! >= 0 ? "Spare each month" : "Short each month"}
            </div>
            <div
              className={`mt-1 text-[2rem] font-semibold leading-none tabular-nums ${
                !hasGoals ? "" : spare! >= 0 ? "text-up" : "text-down"
              }`}
            >
              {fmt(Math.abs(spare!))}
            </div>
            <p className="mt-1 text-[0.8125rem] text-ink-3">
              {!hasGoals
                ? "No active goals to fund yet."
                : spare! >= 0
                  ? "You can fund the plan."
                  : "You cannot fund the plan as it stands."}
            </p>

            {/* Scaled to whatever is larger, salary or its claims, so an
                overspend runs past the salary mark instead of being silently
                shrunk to fit. The empty track is what is left over. */}
            <div className="relative mt-4 h-2 overflow-hidden rounded-full bg-surface-2">
              <div className="flex h-full gap-[2px]">
                <span
                  className="shrink-0"
                  style={{ width: `${(avgPastExpense / barScale) * 100}%`, background: "var(--expense)" }}
                />
                {showGoalsRow && (
                  <span
                    className="shrink-0"
                    style={{ width: `${(goalsRequired / barScale) * 100}%`, background: "var(--goal)" }}
                  />
                )}
              </div>
              {spare! < 0 && (
                <span
                  className="absolute inset-y-0 w-px bg-ink"
                  style={{ left: `${(salary / barScale) * 100}%` }}
                />
              )}
            </div>

            <div className="mt-2 divide-y divide-rule-soft">
              <FlowRow
                label="In-hand salary"
                sub={salaryDate ? `latest, ${fmtMonthYear(salaryDate)}` : undefined}
                value={fmt(salary)}
              />
              <FlowRow
                label="Typical spending"
                sub={
                  outlier
                    ? `avg of ${months_for_avg} months — ${fmtMonthKey(outlier.month)} lifts it by ${fmt(outlier.liftsAverageBy)}`
                    : `avg of ${months_for_avg} completed month${months_for_avg === 1 ? "" : "s"}`
                }
                color="var(--expense)"
                value={`−${fmt(avgPastExpense)}`}
                tone="down"
              />
              {showGoalsRow && (
                <FlowRow
                  label="Goals need"
                  sub={`${analyses.length} active goal${analyses.length === 1 ? "" : "s"}`}
                  color="var(--goal)"
                  value={`−${fmt(goalsRequired)}`}
                  tone="down"
                />
              )}
            </div>

            {hasGoals && spare! < 0 && (
              <p className="mt-3 text-xs text-ink-3">
                <Link href="/plan" className="underline">Review the plan</Link> — stretch a date,
                cut a target, or accept a later finish.
              </p>
            )}
          </>
        ) : (
          <p className="mt-2 text-sm text-ink-3">
            {!bases.hasHistory ? (
              <>
                Log a full month of income and spending in{" "}
                <Link href="/cashflow" className="underline">Cashflow</Link> and this fills in.
              </>
            ) : (
              <>
                No income yet in a category named &ldquo;Salary&rdquo; — this section reads your
                standing pay from it, and ignores bonus and freelance on purpose. Add or rename one
                in <Link href="/settings" className="underline">Settings</Link>.
              </>
            )}
          </p>
        )}
      </section>

      {mix.length > 0 && (
        <section className="rounded-xl border border-rule bg-surface p-4">
          <h2 className="text-sm font-medium">Portfolio mix</h2>
          {/* Part-to-whole is a stacked bar, not one bar per class: four bars
              each scaled to its own share made the reader reconstruct the whole
              from four percentages. A pie was the other candidate and loses —
              it cannot separate the 5.4% and 3.7% slices, and these names are
              too long to sit inside one.
              The 2px gaps and the direct labels below are also what makes the
              amber/green adjacency legal: that pair validates at ΔE 7.9 under
              protanopia, which is only permitted with secondary encoding. */}
          <div className="mt-3 flex h-2.5 gap-[2px] overflow-hidden rounded-full">
            {mix.map((r) => (
              <span
                key={r.id}
                style={{
                  width: `${(r.value / mixTotal) * 100}%`,
                  background: assetClassColor(r.id, classOrder),
                }}
              />
            ))}
          </div>
          <div className="mt-2.5 grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
            {mix.map((r) => (
              <div key={r.id} className="flex items-baseline gap-1.5 text-[0.8125rem]">
                <i
                  className="h-2 w-2 shrink-0 -translate-y-px rounded-sm"
                  style={{ background: assetClassColor(r.id, classOrder) }}
                />
                <span className="min-w-0 flex-1 truncate">{r.name}</span>
                <span className="tabular-nums">{fmt(r.value)}</span>
                <span className="w-11 text-right tabular-nums text-ink-3">
                  {((r.value / mixTotal) * 100).toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

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
  tone,
  color,
}: {
  label: string;
  sub?: string;
  value: string;
  tone?: "down";
  color?: string;
}) {
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-3 py-2">
      <span className="flex flex-col text-sm">
        <span className="flex items-center gap-2">
          {/* Rows not drawn on the bar still reserve the swatch, so the chain
              starts and ends on one left edge. */}
          <i
            className="h-2.5 w-2.5 shrink-0 rounded-sm"
            style={color ? { background: color } : undefined}
          />
          {label}
        </span>
        {sub && <span className="pl-[18px] text-[0.6875rem] text-ink-3">{sub}</span>}
      </span>
      <span className={`text-right font-semibold tabular-nums ${tone === "down" ? "text-down" : ""}`}>
        {value}
      </span>
    </div>
  );
}
