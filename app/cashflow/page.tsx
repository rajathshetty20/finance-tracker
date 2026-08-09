import Link from "next/link";
import { Download } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import type {
  Category,
  Debt,
  DebtPayment,
  Entry,
  EntryWithJoins,
  InvestmentEntry,
  Phase,
} from "@/lib/types";
import {
  cashflowBases,
  categoryShares,
  fmtMonthKey,
  fmtMonthShort,
  missingRecurring,
  monthlySeries,
  monthKeyOf,
} from "@/lib/money";
import { appToday } from "@/lib/demo";
import { currentMonthStartISO, fmtINR } from "@/lib/dates";
import { inWindow, parseRange, rangeDescription, rangeWindow } from "@/lib/range";
import LedgerControls from "./LedgerControls";
import EntryRow from "./EntryRow";
import AddEntry from "./AddEntry";

const PAGE_SIZE = 60;

function fmtCompact(n: number): string {
  const a = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  if (a >= 1e7) return `${sign}₹${(a / 1e7).toFixed(2)}Cr`;
  if (a >= 1e5) return `${sign}₹${(a / 1e5).toFixed(1)}L`;
  if (a >= 1e3) return `${sign}₹${(a / 1e3).toFixed(0)}k`;
  return `${sign}₹${Math.round(a)}`;
}

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
    { data: invEntriesData },
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
    supabase.from("investment_entries").select("*"),
  ]);

  const phases = (phasesData ?? []) as Phase[];
  const categories = (catsData ?? []) as Category[];
  const allExpenses = (expensesData ?? []) as EntryWithJoins[];
  const allIncomes = (incomesData ?? []) as EntryWithJoins[];
  const payments = (paymentsData ?? []) as DebtPayment[];
  const invEntries = (invEntriesData ?? []) as InvestmentEntry[];
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

  // ── Does it reach the investments? ───────────────────────────────────────
  // 12 completed months, so the month in progress cannot make the gap look
  // like a collapse just because pay has not landed yet.
  const series = monthlySeries({
    incomes: phaseIncomes,
    expenses: phaseExpenses,
    payments,
    invEntries,
    fromISO: currentPhase.start_date,
    toISO: today,
    currentMonth: thisMonth,
  });
  const completed = series.filter((r) => r.complete).slice(-12);
  // Overspent months are excluded from the totals rather than netted in: a
  // month with −₹3.24L "could invest" would otherwise subtract from the
  // headline and make the comparison read as a surplus.
  const solvent = completed.filter((r) => !r.overspent);
  const overspentMonths = completed.filter((r) => r.overspent);
  const couldTotal = solvent.reduce((a, r) => a + r.couldInvest, 0);
  const investedTotal = solvent.reduce((a, r) => a + r.invested, 0);
  const barMax = Math.max(
    1,
    ...completed.map((r) => Math.max(Math.max(0, r.couldInvest), r.invested)),
  );

  // ── Concentration ────────────────────────────────────────────────────────
  // Whole ledger, not the current phase: a catch-all bucket accumulates across
  // jobs, and the link below lands on all-time, so the count and the landing
  // page have to be measured over the same rows.
  const allLedgerExpenses = allExpenses;
  const shares = categoryShares(allLedgerExpenses, categories);
  const biggest = shares[0] ?? null;
  const catchAll = shares.find((s) => s.isCatchAll && s.share >= 0.15) ?? null;
  const sharesShown = shares.slice(0, 6);
  const sharesRest = shares.slice(6);
  const restShare = sharesRest.reduce((a, r) => a + r.share, 0);

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
  const misses =
    ledger === "expenses"
      ? missingRecurring({
          expenses: phaseExpenses,
          categories,
          todayISO: today,
          monthStartISO: monthStart,
        })
      : [];

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
        <p className="text-sm text-ink-3">
          Where the money goes, and whether it reaches the investments.
        </p>
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
            No income recorded yet this month — salary is logged at month end, which is why every
            average on this page and on Home divides by completed months only.
          </p>
        )}
      </section>

      {/* ── The arrow in the middle of the thesis ──────────────────────── */}
      {completed.length > 0 && (
        <section className="rounded-xl border border-rule bg-surface p-4">
          <h2 className="text-sm font-medium">Does it reach the investments?</h2>
          <p className="mt-0.5 text-xs text-ink-3">
            What each completed month left after spending and EMI, against what actually went into
            investments that month. Last {completed.length} month
            {completed.length === 1 ? "" : "s"} of {currentPhase.name}.
          </p>

          <p className="mt-3 text-[0.8125rem] text-ink-2">
            Could have invested{" "}
            <span className="font-semibold tabular-nums text-ink">{fmtCompact(couldTotal)}</span>,
            invested{" "}
            <span className="font-semibold tabular-nums text-ink">{fmtCompact(investedTotal)}</span>{" "}
            —{" "}
            {investedTotal >= couldTotal ? (
              <span className="tabular-nums text-up">
                {fmtCompact(investedTotal - couldTotal)} more than it left
              </span>
            ) : (
              <span className="tabular-nums text-down">
                {fmtCompact(couldTotal - investedTotal)} stayed as cash
              </span>
            )}
            .
            {overspentMonths.length > 0 && (
              <>
                {" "}
                <span className="text-warn">
                  {overspentMonths.length} month{overspentMonths.length === 1 ? "" : "s"} spent more
                  than {overspentMonths.length === 1 ? "it" : "they"} earned and{" "}
                  {overspentMonths.length === 1 ? "is" : "are"} left out of both totals (
                  {overspentMonths.map((r) => fmtMonthShort(r.month)).join(", ")}).
                </span>
              </>
            )}
          </p>

          <div className="mt-3 space-y-1.5">
            {/* cat-2 against cat-1 — amber against blue. The first pairing used
                cat-6 and cat-1, two adjacent blues, which at 1.5px tall were
                one colour in dark mode. */}
            <div className="flex items-center gap-3 text-[0.6875rem] text-ink-3">
              <span className="flex items-center gap-1.5">
                <i className="h-2 w-2 rounded-sm" style={{ background: "var(--cat-2)" }} />
                could invest
              </span>
              <span className="flex items-center gap-1.5">
                <i className="h-2 w-2 rounded-sm" style={{ background: "var(--cat-1)" }} />
                invested
              </span>
            </div>
            {completed.map((r) => (
              <div key={r.month} className="grid grid-cols-[58px_1fr_auto] items-center gap-2">
                <span className="whitespace-nowrap text-[0.6875rem] tabular-nums text-ink-3">
                  {fmtMonthShort(r.month)}
                </span>
                <span className="space-y-[3px]">
                  <span
                    className="block h-1.5 rounded-full"
                    style={{
                      width: `${Math.max(r.overspent ? 0 : 0.5, (r.couldInvest / barMax) * 100)}%`,
                      background: r.overspent ? "var(--warn)" : "var(--cat-2)",
                    }}
                  />
                  <span
                    className="block h-1.5 rounded-full"
                    style={{
                      width: `${Math.max(0, (r.invested / barMax) * 100)}%`,
                      background: "var(--cat-1)",
                    }}
                  />
                </span>
                <span
                  className={`w-[86px] text-right text-[0.6875rem] tabular-nums ${
                    r.overspent ? "text-warn" : r.gap! < 0 ? "text-down" : "text-up"
                  }`}
                >
                  {r.overspent ? (
                    "overspent"
                  ) : (
                    <>
                      {r.gap! >= 0 ? "+" : "−"}
                      {fmtCompact(Math.abs(r.gap!)).replace("−", "")}
                    </>
                  )}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[0.6875rem] text-ink-3">
            The right-hand figure is invested − could invest for that month. Money left over is not
            lost — it is sitting in cash, which is where Home&apos;s balance check finds it.
          </p>
        </section>
      )}

      {/* ── Concentration ──────────────────────────────────────────────── */}
      {biggest && (
        <section className="rounded-xl border border-rule bg-surface p-4">
          <h2 className="text-sm font-medium">Where the spending concentrates</h2>
          <p className="mt-1 text-[0.8125rem] text-ink-2">
            <span className="font-semibold">{biggest.name}</span> is{" "}
            <span className="tabular-nums">{(biggest.share * 100).toFixed(0)}%</span> of everything
            you have ever logged — {fmtINR(biggest.amount)} across {biggest.count} entr
            {biggest.count === 1 ? "y" : "ies"}, all phases.
          </p>
          {catchAll && (
            <p className="mt-2 rounded-lg border border-warn/30 bg-warn-soft/60 p-2.5 text-[0.8125rem] text-ink-2">
              <span className="font-medium text-ink">
                {(catchAll.share * 100).toFixed(0)}% of your spending is in &ldquo;{catchAll.name}
                &rdquo;.
              </span>{" "}
              That is a bucket, not a category — nothing on any screen can tell you what it was.{" "}
              <Link href={`/cashflow?${qs({ cat: catchAll.categoryId, range: "all", all: null })}`} className="underline">
                Look through the {catchAll.count} entries
              </Link>
              .
            </p>
          )}
          <ul className="mt-3 space-y-2">
            {sharesShown.map((s, i) => (
              <li key={s.categoryId} className="grid grid-cols-[1fr_auto] gap-x-2 text-[0.8125rem]">
                <Link href={`/cashflow?${qs({ cat: s.categoryId })}`} className="truncate hover:underline">
                  {s.name}
                </Link>
                <span className="tabular-nums text-ink-2">{(s.share * 100).toFixed(1)}%</span>
                <span className="col-span-2 mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
                  <span
                    className="block h-full rounded-full"
                    style={{ width: `${s.share * 100}%`, background: `var(--cat-${(i % 8) + 1})` }}
                  />
                </span>
              </li>
            ))}
            {sharesRest.length > 0 && (
              <li className="flex items-baseline justify-between gap-2 pt-1 text-[0.75rem] text-ink-3">
                <span>
                  + {sharesRest.length} smaller categor{sharesRest.length === 1 ? "y" : "ies"}
                </span>
                <span className="tabular-nums">{(restShare * 100).toFixed(1)}%</span>
              </li>
            )}
          </ul>
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
          misses={misses}
          monthLabel={fmtMonthKey(thisMonth)}
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
