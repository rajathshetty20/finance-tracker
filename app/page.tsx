import Link from "next/link";
import { Banknote, CreditCard, LineChart as LineChartIcon, Percent } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import type {
  CashBalance,
  Category,
  Debt,
  DebtPayment,
  Investment,
  InvestmentEntry,
  InvestmentPlanRow,
  MoneySource,
  Phase,
  Entry,
} from "@/lib/types";
import { todayISO, monthsInRange, daysInRange, currentMonthStartISO, fmtINR as fmt } from "@/lib/dates";
import NetworthChart from "./NetworthChart";
import { buildNetworthSeries } from "@/lib/networthSeries";

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
    { data: planData },
  ] = await Promise.all([
    supabase.from("phases").select("*").order("start_date", { ascending: false }),
    supabase.from("cash_balances").select("*"),
    supabase.from("investments").select("*"),
    supabase.from("investment_entries").select("*"),
    supabase.from("debts").select("*"),
    supabase.from("debt_payments").select("*"),
    supabase.from("money_sources").select("*"),
    supabase.from("investment_plan").select("*").order("display_order", { ascending: true }),
  ]);

  const phases = (phasesData ?? []) as Phase[];
  const currentPhase = phases.find((p) => p.end_date === null) ?? null;

  if (!currentPhase) {
    return (
      <div className="space-y-4">
        <header>
          <h1 className="text-2xl font-semibold">Welcome</h1>
          <p className="text-sm text-zinc-500">
            Start by creating your first phase.
          </p>
        </header>
        <Link
          href="/settings"
          className="inline-block rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
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
  const phase_expense_curr  = expenses.filter((e) => e.date >= monthStart).reduce((a, r) => a + Number(r.amount), 0);
  const avgIncome = phase_income_past / months_for_avg;
  const avgPastExpense = phase_expense_past / months_for_avg;
  const savingsRate = avgIncome > 0 ? (avgIncome - avgPastExpense) / avgIncome : null;

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
  const sipRate =
    inhandSalary !== null && inhandSalary > 0 && monthlyInvestable !== null
      ? monthlyInvestable / inhandSalary
      : null;

  // Target investment allocation — from investment_plan table.
  const plan = (planData ?? []) as InvestmentPlanRow[];
  const allocation = plan.map((r) => ({ name: r.name, pct: Number(r.percentage) / 100 }));

  const oldestCashUpdate =
    cash.length > 0
      ? cash.reduce((min, r) => (r.updated_at < min ? r.updated_at : min), cash[0].updated_at)
      : null;

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
      <section className="rounded-xl border border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-white p-6 dark:border-emerald-950/50 dark:from-emerald-950/30 dark:via-zinc-900 dark:to-zinc-900">
        <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Net worth</div>
        <div className={`mt-2 text-5xl font-semibold tabular-nums ${NW < 0 ? "text-red-600 dark:text-red-400" : ""}`}>
          {fmt(NW)}
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <BreakdownStat icon={LineChartIcon} label="Investments" value={fmt(invest_market)} />
        <BreakdownStat icon={Banknote} label="Cash" value={fmt(cashSum)} />
        <BreakdownStat icon={CreditCard} label="Debt pending" value={`−${fmt(debt_pending).replace("−", "")}`} tone="neg" />
        <BreakdownStat
          icon={Percent}
          label="Debt ratio"
          value={debt_ratio === null ? "—" : `${(debt_ratio * 100).toFixed(1)}%`}
        />
      </section>

      <NetworthChart data={nwSeries} />

      {Math.abs(cash_discrepancy) >= 0.01 && (
        <p className="text-xs text-zinc-500">
          Cash discrepancy:{" "}
          <span className="tabular-nums text-amber-700 dark:text-amber-400">{fmt(cash_discrepancy)}</span>
          {" "}—{" "}
          {cash_discrepancy > 0
            ? "cash understated (likely received money not yet recorded)."
            : "cash overstated (likely spent money not yet recorded)."}
          {" "}
          <Link href="/cash" className="underline">Sync cash</Link>.
          {oldestCashUpdate && (
            <span className="ml-1 text-zinc-400">
              Oldest cash entry updated {Math.max(0, Math.floor((Date.now() - new Date(oldestCashUpdate).getTime()) / 86_400_000))}d ago.
            </span>
          )}
        </p>
      )}

      <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-sm font-medium text-zinc-500">Current phase</h2>
        <div className="mt-1">
          <strong>{currentPhase.name}</strong>
          <span className="ml-2 text-xs text-zinc-500">started {currentPhase.start_date}</span>
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-sm font-medium text-zinc-500">
          Cashflows summary
          {!showAverages && <span className="ml-2 text-xs text-zinc-400">(averages need a completed month)</span>}
        </h2>
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3 lg:grid-cols-4">
          <Row label="Inhand salary"             value={inhandSalary !== null ? fmt(inhandSalary) : "—"} />
          <Row label="Avg monthly income"        value={showAverages ? fmt(avgIncome)         : "—"} />
          <Row label="Past avg monthly expense"  value={showAverages ? fmt(avgPastExpense)    : "—"} />
          <Row label="Current month expense"     value={fmt(phase_expense_curr)} />
          <Row label="Total EMI"                 value={fmt(totalEmi)} />
          <Row
            label="Monthly investable"
            value={monthlyInvestable !== null ? fmt(monthlyInvestable) : "—"}
            sub="inhand salary − past avg expense − total EMI"
          />
          <Row
            label="Savings rate"
            value={showAverages && savingsRate !== null ? `${(savingsRate * 100).toFixed(1)}%` : "—"}
          />
          <Row
            label="SIP rate"
            value={sipRate !== null ? `${(sipRate * 100).toFixed(1)}%` : "—"}
            sub="monthly investable ÷ inhand salary"
          />
        </div>
      </section>

      {allocation.length > 0 && (
      <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-medium text-zinc-500">Investment plan</h2>
          <span className="text-xs text-zinc-400">SIP: {monthlyInvestable !== null ? fmt(monthlyInvestable) : "—"}/mo</span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          {allocation.map((a) => (
            <Row
              key={a.name}
              label={`${a.name} (${(a.pct * 100).toFixed(a.pct * 100 % 1 === 0 ? 0 : 1)}%)`}
              value={
                monthlyInvestable !== null && monthlyInvestable > 0
                  ? fmt(monthlyInvestable * a.pct)
                  : "—"
              }
            />
          ))}
        </div>
      </section>
      )}
    </div>
  );
}

function BreakdownStat({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  tone?: "neg";
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center gap-1.5 text-xs text-zinc-500">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className={`mt-1 text-base font-semibold tabular-nums ${tone === "neg" ? "text-red-600 dark:text-red-400" : ""}`}>
        {value}
      </div>
    </div>
  );
}

function Row({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex flex-col">
      <div className="flex justify-between gap-2">
        <span className="text-zinc-500">{label}</span>
        <span className="tabular-nums">{value}</span>
      </div>
      {sub && <div className="text-right text-[10px] text-zinc-400 tabular-nums">{sub}</div>}
    </div>
  );
}
