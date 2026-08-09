import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Category, EntryWithJoins, Phase } from "@/lib/types";
import { todayISO, monthsInRange, currentMonthStartISO, fmtINR } from "@/lib/dates";
import { cutoffISO, parseRange, rangeDescription } from "@/lib/range";
import RangeLinks from "../RangeLinks";
import AddIncomeForm from "./AddIncomeForm";
import IncomeRow from "./IncomeRow";

export default async function IncomesPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const range = parseRange((await searchParams).range);
  const supabase = await createClient();

  const [{ data: phasesData }, { data: catsData }, { data: entriesData }] = await Promise.all([
    supabase.from("phases").select("*").order("start_date", { ascending: false }),
    supabase.from("categories").select("*").eq("kind", "income").order("name", { ascending: true }),
    supabase
      .from("incomes")
      .select("*, category:categories(id, name), phase:phases(id, name, end_date)")
      .order("date", { ascending: false }),
  ]);

  const phases = (phasesData ?? []) as Phase[];
  const categories = (catsData ?? []) as Category[];
  const entries = (entriesData ?? []) as EntryWithJoins[];

  const currentPhase = phases.find((p) => p.end_date === null) ?? null;

  if (!currentPhase) {
    return (
      <div className="space-y-4">
        <header>
          <h1 className="text-2xl font-semibold">Incomes</h1>
        </header>
        <p className="text-sm text-ink-3">
          Create a phase first in <Link href="/settings" className="underline">Settings</Link>.
        </p>
      </div>
    );
  }

  // The ledger below is windowed; the per-category summary above is not. That
  // summary is an average over the phase, so scoping it to the last 30 days
  // would change what it means, not just how much of it you see.
  const cutoff = cutoffISO(range, todayISO());
  const windowed = cutoff ? entries.filter((e) => e.date >= cutoff) : entries;
  const groups = phases.map((p) => ({
    phase: p,
    rows: windowed.filter((e) => e.phase_id === p.id),
  }));
  const shownCount = groups.reduce((n, g) => n + g.rows.length, 0);

  const monthStart = currentMonthStartISO();
  const monthsInPhase = monthsInRange(currentPhase.start_date, todayISO());
  const monthsForAvg = Math.max(1, monthsInPhase - 1);

  const summary = new Map<string, { name: string; past: number; current: number }>();
  for (const cat of categories) {
    summary.set(cat.id, { name: cat.name, past: 0, current: 0 });
  }
  for (const e of entries) {
    if (e.phase_id !== currentPhase.id) continue;
    const s = summary.get(e.category_id);
    if (!s) continue;
    if (e.date >= monthStart) s.current += Number(e.amount);
    else s.past += Number(e.amount);
  }
  const breakdown = Array.from(summary.values())
    .filter((s) => s.past > 0 || s.current > 0)
    .map((s) => ({ ...s, avg: s.past / monthsForAvg }))
    .sort((a, b) => b.avg + b.current - (a.avg + a.current));
  const breakdownTotalAvg = breakdown.reduce((a, s) => a + s.avg, 0);
  const breakdownTotalCurrent = breakdown.reduce((a, s) => a + s.current, 0);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Incomes</h1>
        <p className="text-sm text-ink-3">
          New entries attach to <strong>{currentPhase.name}</strong>. Entries in closed phases are locked.
        </p>
      </header>

      <section className="rounded-xl border border-rule bg-surface p-4">
        <h2 className="mb-3 text-sm font-medium text-ink-3">Add income</h2>
        <AddIncomeForm categories={categories} phaseStart={currentPhase.start_date} />
      </section>

      {breakdown.length > 0 && (
        <section className="overflow-hidden rounded-xl border border-rule bg-surface">
          <div className="border-b border-rule-soft px-4 py-3">
            <h2 className="text-sm font-medium text-ink-3">By category — {currentPhase.name}</h2>
            <p className="text-xs text-ink-3">
              Past monthly average (across {monthsForAvg} completed month{monthsForAvg === 1 ? "" : "s"}) vs. current month so far.
            </p>
          </div>
          <ul className="divide-y divide-rule">
            <li className="grid grid-cols-[1fr_auto_auto] items-center gap-4 px-4 py-2 text-[10px] font-medium uppercase tracking-wide text-ink-3">
              <span>Category</span>
              <span className="w-28 text-right">Avg / mo</span>
              <span className="w-28 text-right">This month</span>
            </li>
            {breakdown.map((s) => (
              <li key={s.name} className="grid grid-cols-[1fr_auto_auto] items-center gap-4 px-4 py-2 text-sm">
                <span className="truncate">{s.name}</span>
                <span className="w-28 text-right tabular-nums">{fmtINR(s.avg)}</span>
                <span className="w-28 text-right tabular-nums">{fmtINR(s.current)}</span>
              </li>
            ))}
            <li className="grid grid-cols-[1fr_auto_auto] items-center gap-4 bg-surface-2 px-4 py-2 text-sm font-medium">
              <span>Total</span>
              <span className="w-28 text-right tabular-nums">{fmtINR(breakdownTotalAvg)}</span>
              <span className="w-28 text-right tabular-nums">{fmtINR(breakdownTotalCurrent)}</span>
            </li>
          </ul>
        </section>
      )}

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-medium text-ink-3">
          Ledger
          <span className="ml-2 text-xs">
            {shownCount} entr{shownCount === 1 ? "y" : "ies"} · {rangeDescription(range)}
          </span>
        </h2>
        <RangeLinks active={range} />
      </div>

      {groups.every((g) => g.rows.length === 0) ? (
        <p className="rounded-xl border border-dashed border-rule p-6 text-center text-sm text-ink-3">
          {cutoff ? "Nothing in this period." : "Nothing logged yet."}
        </p>
      ) : (
        groups.map(({ phase, rows }) =>
          rows.length === 0 ? null : (
            <section key={phase.id}>
              <h2 className="mb-2 flex items-center gap-2 text-sm font-medium text-ink-3">
                {phase.name}
                {phase.end_date === null && (
                  <span className="rounded-full bg-up-soft px-2 py-0.5 text-[10px] font-medium text-up">
                    current
                  </span>
                )}
              </h2>
              <ul className="divide-y divide-rule overflow-hidden rounded-xl border border-rule bg-surface">
                {rows.map((e) => (
                  <IncomeRow
                    key={e.id}
                    entry={e}
                    categories={categories}
                    phaseStart={currentPhase.start_date}
                  />
                ))}
              </ul>
            </section>
          )
        )
      )}
    </div>
  );
}
