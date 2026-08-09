import Link from "next/link";
import { Download } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import type {
  Category,
  Debt,
  DebtPayment,
  Entry,
  EntryWithJoins,
  Phase,
} from "@/lib/types";
import {
  cashflowBases,
  categoryShares,
  fmtMonthKey,
  monthKeyOf,
} from "@/lib/money";
import { appToday } from "@/lib/demo";
import { currentMonthStartISO, fmtINR } from "@/lib/dates";
import { inWindow, parseRange, rangeDescription, rangeWindow } from "@/lib/range";
import LedgerControls from "./LedgerControls";
import EntryRow from "./EntryRow";
import AddEntry from "./AddEntry";

const PAGE_SIZE = 60;

export default async function CashflowPage({
  searchParams,
}: {
  searchParams: Promise<{
    ledger?: string;
    range?: string;
    cat?: string;
    q?: string;
    all?: string;
  }>;
}) {
  const sp = await searchParams;
  const ledger: "expenses" | "incomes" = sp.ledger === "incomes" ? "incomes" : "expenses";
  const range = parseRange(sp.range);
  const catFilter = sp.cat ?? "";
  const q = (sp.q ?? "").trim().toLowerCase();
  const showAll = sp.all === "1";

  const supabase = await createClient();
  const today = await appToday();

  const [
    { data: phasesData },
    { data: catsData },
    { data: expensesData },
    { data: incomesData },
    { data: debtsData },
    { data: paymentsData },
  ] = await Promise.all([
    supabase.from("phases").select("*").order("start_date", { ascending: false }),
    supabase.from("categories").select("*").order("name", { ascending: true }),
    supabase
      .from("expenses")
      .select("*, category:categories(id, name), phase:phases(id, name, end_date)")
      .order("date", { ascending: false }),
    supabase
      .from("incomes")
      .select("*, category:categories(id, name), phase:phases(id, name, end_date)")
      .order("date", { ascending: false }),
    supabase.from("debts").select("*"),
    supabase.from("debt_payments").select("*"),
  ]);

  const phases = (phasesData ?? []) as Phase[];
  const categories = (catsData ?? []) as Category[];
  const allExpenses = (expensesData ?? []) as EntryWithJoins[];
  const allIncomes = (incomesData ?? []) as EntryWithJoins[];
  const payments = (paymentsData ?? []) as DebtPayment[];
  const currentPhase = phases.find((p) => p.end_date === null) ?? null;

  if (!currentPhase) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Cashflow</h1>
        <p className="text-sm text-ink-3">
          Create a phase first in{" "}
          <Link href="/settings" className="underline">
            Settings
          </Link>
          .
        </p>
      </div>
    );
  }

  const monthStart = currentMonthStartISO(today);
  const phaseExpenses = allExpenses.filter((e) => e.phase_id === currentPhase.id);
  const phaseIncomes = allIncomes.filter((e) => e.phase_id === currentPhase.id);

  const bases = cashflowBases({
    incomes: phaseIncomes,
    expenses: phaseExpenses,
    openDebts: ((debtsData ?? []) as Debt[]).filter((d) => d.status === "open"),
    payments,
    categories,
    phaseStartISO: currentPhase.start_date,
    todayISO: today,
    monthStartISO: monthStart,
  });

  // ── This month so far ────────────────────────────────────────────────────
  const thisMonth = monthKeyOf(today);
  const sumIn = (rows: Entry[], from: string) =>
    rows.filter((r) => r.date >= from).reduce((a, r) => a + Number(r.amount), 0);
  const earnedThisMonth = sumIn(phaseIncomes, monthStart);
  const spentThisMonth = sumIn(phaseExpenses, monthStart);

  // ── Categories ───────────────────────────────────────────────────────────
  // Every category in the current phase, not a top-six "concentration" story.
  // Scoped to this phase deliberately: mixing in a previous job's spending
  // answers a question nobody on this screen is asking.
  const shares = categoryShares(
    ledger === "expenses" ? phaseExpenses : phaseIncomes,
    categories,
  );
  const sharesTotal = shares.reduce((a, r) => a + r.amount, 0);

  // ── The ledger ───────────────────────────────────────────────────────────
  const rows = ledger === "expenses" ? allExpenses : allIncomes;
  const win = rangeWindow(range, today);
  const filtered = rows.filter((e) => {
    if (!inWindow(e.date, win)) return false;
    if (catFilter && e.category_id !== catFilter) return false;
    if (q) {
      const hay = `${e.note ?? ""} ${e.category?.name ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  const filteredTotal = filtered.reduce((a, e) => a + Number(e.amount), 0);
  const shown = showAll ? filtered : filtered.slice(0, PAGE_SIZE);
  const groups = phases
    .map((p) => ({ phase: p, rows: shown.filter((e) => e.phase_id === p.id) }))
    .filter((g) => g.rows.length > 0);

  const ledgerCategories = categories.filter(
    (c) => c.kind === (ledger === "expenses" ? "expense" : "income"),
  );
  const qs = (over: Record<string, string | null>) => {
    const p = new URLSearchParams();
    const base: Record<string, string> = { ledger, range, ...(catFilter ? { cat: catFilter } : {}), ...(q ? { q } : {}) };
    for (const [k, v] of Object.entries({ ...base, ...over })) if (v) p.set(k, v);
    return p.toString();
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Cashflow</h1>
        <p className="text-sm text-ink-3">Where the money goes.</p>
      </header>

      {/* ── This month ─────────────────────────────────────────────────── */}
      <section className="rounded-xl border border-rule bg-surface p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 className="text-sm font-medium">{fmtMonthKey(thisMonth)} so far</h2>
          <span className="text-[0.6875rem] text-ink-3">{currentPhase.name}</span>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-3">
          <Cell label="Earned" value={fmtINR(earnedThisMonth)} tone={earnedThisMonth > 0 ? "up" : null} />
          <Cell label="Spent" value={fmtINR(spentThisMonth)} tone="down" />
          <Cell
            label="Kept"
            value={fmtINR(earnedThisMonth - spentThisMonth)}
            tone={earnedThisMonth - spentThisMonth >= 0 ? "up" : "down"}
          />
        </div>
        {earnedThisMonth === 0 && (
          <p className="mt-2 text-[0.6875rem] text-ink-3">
            Salary lands at month end; averages use completed months only.
          </p>
        )}
      </section>

      {/* ── Categories ─────────────────────────────────────────────────── */}
      {shares.length > 0 && (
        <section className="rounded-xl border border-rule bg-surface p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h2 className="text-sm font-medium">
              {ledger === "expenses" ? "Spending" : "Income"} by category
            </h2>
            <span className="text-[0.6875rem] text-ink-3">{currentPhase.name}</span>
          </div>
          <p className="mt-0.5 text-xs text-ink-3">Tap one to filter the ledger.</p>
          <ul className="mt-3 space-y-2">
            {shares.map((s, i) => (
              <li key={s.categoryId} className="grid grid-cols-[1fr_auto] gap-x-2 text-[0.8125rem]">
                <Link
                  href={`/cashflow?${qs({ cat: s.categoryId })}`}
                  scroll={false}
                  className="truncate hover:underline"
                >
                  {s.name}
                </Link>
                <span className="tabular-nums text-ink-2">
                  {fmtINR(s.amount)}
                  <span className="ml-2 text-ink-3">{(s.share * 100).toFixed(1)}%</span>
                </span>
                <span className="col-span-2 mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
                  <span
                    className="block h-full rounded-full"
                    style={{ width: `${s.share * 100}%`, background: `var(--cat-${(i % 8) + 1})` }}
                  />
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 border-t border-rule-soft pt-2 font-mono text-[0.6875rem] tabular-nums text-ink-3">
            {shares.length} categor{shares.length === 1 ? "y" : "ies"} · {fmtINR(sharesTotal)} total
          </p>
        </section>
      )}


      {/* ── Ledger ─────────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div
            role="tablist"
            aria-label="Ledger"
            className="inline-flex rounded-lg border border-rule p-0.5"
          >
            {(["expenses", "incomes"] as const).map((k) => (
              <Link
                key={k}
                role="tab"
                aria-selected={ledger === k}
                href={`/cashflow?${qs({ ledger: k, cat: null })}`}
                scroll={false}
                className={`rounded-md px-3 py-1.5 text-[0.8125rem] font-medium capitalize ${
                  ledger === k ? "bg-ink text-ground" : "text-ink-2 hover:bg-surface-2"
                }`}
              >
                {k}
              </Link>
            ))}
          </div>
          <Link
            href={`/cashflow/export?${qs({})}`}
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-rule px-3 text-[0.8125rem] text-ink-2 hover:bg-surface-2"
          >
            <Download className="h-3.5 w-3.5" />
            CSV
          </Link>
        </div>

        <LedgerControls categories={ledgerCategories} today={today} ledger={ledger} />

        <AddEntry
          categories={ledgerCategories}
          phaseStart={currentPhase.start_date}
          today={today}
          kind={ledger}
        />

        <p className="text-[0.8125rem] text-ink-3">
          {filtered.length} entr{filtered.length === 1 ? "y" : "ies"} ·{" "}
          {rangeDescription(range, today)}
          {catFilter && ` · ${categories.find((c) => c.id === catFilter)?.name ?? "category"}`}
          {q && ` · matching “${q}”`} ·{" "}
          <span className="tabular-nums">{fmtINR(filteredTotal)}</span> total
        </p>

        {filtered.length === 0 ? (
          <p className="rounded-xl border border-dashed border-rule p-6 text-center text-sm text-ink-3">
            Nothing matches these filters.
          </p>
        ) : (
          groups.map(({ phase, rows: grp }) => (
            <section key={phase.id}>
              <h3 className="mb-1.5 flex items-center gap-2 text-[0.8125rem] font-medium text-ink-3">
                {phase.name}
                {phase.end_date === null ? (
                  <span className="rounded-full bg-up-soft px-2 py-0.5 text-[10px] font-medium text-up">
                    current
                  </span>
                ) : (
                  <span className="text-[0.6875rem] font-normal">closed — entries locked</span>
                )}
              </h3>
              <ul className="divide-y divide-rule-soft overflow-hidden rounded-xl border border-rule bg-surface">
                {grp.map((e) => (
                  <EntryRow
                    key={e.id}
                    entry={e}
                    categories={ledgerCategories}
                    phaseStart={currentPhase.start_date}
                    kind={ledger}
                  />
                ))}
              </ul>
            </section>
          ))
        )}

        {!showAll && filtered.length > PAGE_SIZE && (
          <Link
            href={`/cashflow?${qs({ all: "1" })}`}
            scroll={false}
            className="inline-flex min-h-[40px] items-center rounded-lg border border-rule px-3 text-[0.8125rem] font-semibold text-ink-2 hover:bg-surface-2"
          >
            Show all {filtered.length}
          </Link>
        )}
      </section>

      <p className="text-[0.6875rem] text-ink-3">
        Averages quoted elsewhere use {bases.completedMonths} completed month
        {bases.completedMonths === 1 ? "" : "s"} of {currentPhase.name}: mean spend{" "}
        {fmtINR(bases.avgExpense)}, middle month {fmtINR(bases.medianExpense)}.
        {bases.outlierMonth && (
          <>
            {" "}
            {fmtMonthKey(bases.outlierMonth.month)} was an outlier at{" "}
            {fmtINR(bases.outlierMonth.spent)}, lifting that mean by{" "}
            {fmtINR(bases.outlierMonth.liftsAverageBy)}.
          </>
        )}
      </p>
    </div>
  );
}

function Cell({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "up" | "down" | null;
}) {
  return (
    <div className="min-w-0">
      <div className="truncate text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-3">
        {label}
      </div>
      <div
        className={`mt-0.5 truncate text-[1.0625rem] font-semibold tabular-nums ${
          tone === "up" ? "text-up" : tone === "down" ? "text-down" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}
