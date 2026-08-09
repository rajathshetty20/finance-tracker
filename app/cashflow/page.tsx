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
  categoryMonthly,
  fmtMonthKey,
  fmtMonthShort,
  monthKeyOf,
} from "@/lib/money";
import { appToday } from "@/lib/demo";
import { currentMonthStartISO, fmtINR, fmtMonthYear } from "@/lib/dates";
import { inWindow, parseRange, rangeDescription, rangeWindow } from "@/lib/range";
import Disclose from "../Disclose";
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
  const byCategory = categoryMonthly({
    rows: ledger === "expenses" ? phaseExpenses : phaseIncomes,
    categories,
    monthStartISO: monthStart,
    completedMonths: bases.completedMonths,
  });
  const avgTotal = byCategory.reduce((a, r) => a + r.avg, 0);
  const currentTotal = byCategory.reduce((a, r) => a + r.current, 0);

  // ── The ledger ───────────────────────────────────────────────────────────
  // Scoped to the current phase, because everything above it is: showing a
  // previous job's rows under an average computed from this one invited a
  // comparison that is not being made. Earlier phases get their own section.
  const rows = ledger === "expenses" ? allExpenses : allIncomes;
  const win = rangeWindow(range, today);
  const matchesFilters = (e: EntryWithJoins) => {
    if (catFilter && e.category_id !== catFilter) return false;
    if (q) {
      const hay = `${e.note ?? ""} ${e.category?.name ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  };
  const matches = (e: EntryWithJoins) => inWindow(e.date, win) && matchesFilters(e);
  const filtered = rows.filter((e) => e.phase_id === currentPhase.id && matches(e));
  // Closed phases ignore the period filter. "Last 90 days" is a question about
  // the phase you are in; applied to a phase that ended sixteen months ago it
  // matches nothing, so the section silently vanished at the default range.
  // Category and search still apply — those ask *what*, not *when*.
  const earlier = rows.filter(
    (e) => e.phase_id !== currentPhase.id && matchesFilters(e),
  );
  const earlierByPhase = phases
    .filter((p) => p.id !== currentPhase.id)
    .map((p) => ({ phase: p, rows: earlier.filter((e) => e.phase_id === p.id) }))
    .filter((g) => g.rows.length > 0);
  const filteredTotal = filtered.reduce((a, e) => a + Number(e.amount), 0);
  const shown = showAll ? filtered : filtered.slice(0, PAGE_SIZE);

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
      {byCategory.length > 0 && (
        <section className="rounded-xl border border-rule bg-surface p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h2 className="text-sm font-medium">
              {ledger === "expenses" ? "Spending" : "Income"} by category
            </h2>
          </div>

          <div className="mt-3 grid grid-cols-[1fr_auto_auto_auto] items-baseline gap-x-3 text-[0.6875rem] font-medium uppercase tracking-wide text-ink-3">
            <span>Category</span>
            <span className="w-14 text-right">Share</span>
            <span className="w-20 text-right">Avg / mo</span>
            <span className="w-24 text-right">{fmtMonthShort(thisMonth)}</span>
          </div>
          <ul className="mt-1 divide-y divide-rule-soft">
            {byCategory.map((r) => (
              <li
                key={r.categoryId}
                className="grid grid-cols-[1fr_auto_auto_auto] items-baseline gap-x-3 py-1.5 text-[0.8125rem]"
              >
                <span className="min-w-0">
                  <span className="block truncate">{r.name}</span>
                  {/* Rent and Subscriptions differ by 38x; a column of digits
                      makes you count characters to see it. */}
                  <span className="mt-1 block h-1 overflow-hidden rounded-full bg-surface-2">
                    <span
                      className="block h-full rounded-full bg-ink-3/50"
                      style={{ width: `${avgTotal > 0 ? (r.avg / avgTotal) * 100 : 0}%` }}
                    />
                  </span>
                </span>
                <span className="w-14 text-right tabular-nums text-ink-3">
                  {avgTotal > 0 ? `${Math.round((r.avg / avgTotal) * 100)}%` : "—"}
                </span>
                <span className="w-20 text-right tabular-nums text-ink-2">{fmtINR(r.avg)}</span>
                {/* The comparison is spelled out rather than encoded as a
                    colour. A caption reading "amber where this month is
                    running well above" explained the paint, not the rule, and
                    left the rule invisible to anyone who cannot see it. */}
                <span className="w-24 text-right tabular-nums">
                  <span className={r.current === 0 ? "text-ink-3" : ""}>
                    {r.current === 0 ? "—" : fmtINR(r.current)}
                  </span>
                  {/* Only the overshoot. Under-spending part-way through a
                      month is not news — on the 9th every category reads far
                      below a full month's average, which is arithmetic, not a
                      signal. Being ALREADY above one is worth saying. */}
                  {r.delta > 0 && r.avg > 0 && r.delta >= r.avg * 0.2 && (
                    <span className="block text-[0.6875rem] text-warn">
                      +{Math.round((r.delta / r.avg) * 100)}% vs avg
                    </span>
                  )}
                </span>
              </li>
            ))}
            <li className="grid grid-cols-[1fr_auto_auto_auto] items-baseline gap-x-3 border-t border-rule pt-1.5 text-[0.8125rem] font-semibold">
              <span>Total</span>
              <span className="w-14 text-right tabular-nums text-ink-3">100%</span>
              <span className="w-20 text-right tabular-nums">{fmtINR(avgTotal)}</span>
              <span className="w-24 text-right tabular-nums">{fmtINR(currentTotal)}</span>
            </li>
          </ul>
          <p className="mt-2 text-[0.6875rem] text-ink-3">
            Average over {bases.completedMonths} completed month
            {bases.completedMonths === 1 ? "" : "s"}; — means nothing logged yet this month.
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
          <ul className="divide-y divide-rule-soft overflow-hidden rounded-xl border border-rule bg-surface">
            {shown.map((e) => (
              <EntryRow
                key={e.id}
                entry={e}
                categories={ledgerCategories}
                phaseStart={currentPhase.start_date}
                kind={ledger}
              />
            ))}
          </ul>
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

        {earlierByPhase.length > 0 && (
          <Disclose
            label="Earlier phases"
            count={earlier.length}
          >
            <div className="space-y-4">
              {earlierByPhase.map(({ phase, rows: grp }) => (
                <section key={phase.id}>
                  <h3 className="mb-1.5 flex flex-wrap items-baseline gap-2 text-[0.8125rem] font-medium text-ink-3">
                    {phase.name}
                    <span className="text-[0.6875rem] font-normal">
                      {fmtMonthYear(phase.start_date)} –{" "}
                      {phase.end_date ? fmtMonthYear(phase.end_date) : "present"} · entries locked
                    </span>
                  </h3>
                  <ul className="divide-y divide-rule-soft overflow-hidden rounded-xl border border-rule bg-surface">
                    {grp.slice(0, PAGE_SIZE).map((e) => (
                      <EntryRow
                        key={e.id}
                        entry={e}
                        categories={ledgerCategories}
                        phaseStart={currentPhase.start_date}
                        kind={ledger}
                      />
                    ))}
                  </ul>
                  {grp.length > PAGE_SIZE && (
                    <p className="mt-1 text-[0.6875rem] text-ink-3">
                      Showing {PAGE_SIZE} of {grp.length}.
                    </p>
                  )}
                </section>
              ))}
            </div>
          </Disclose>
        )}
      </section>

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
