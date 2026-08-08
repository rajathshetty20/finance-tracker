import { createClient } from "@/lib/supabase/server";
import type { Category, Entry, Phase } from "@/lib/types";
import { currentMonthStartISO, monthsInRange, todayISO } from "@/lib/dates";
import NewCategoryForm from "./NewCategoryForm";
import CategoryRow from "./CategoryRow";
import FirstPhaseForm from "../phases/FirstPhaseForm";
import EndAndStartForm from "../phases/EndAndStartForm";
import PhaseRow, { type PhaseStats } from "../phases/PhaseRow";

export default async function SettingsPage() {
  const supabase = await createClient();
  const [
    { data: catsData },
    { data: phasesData },
    { data: incomesData },
    { data: expensesData },
  ] = await Promise.all([
    supabase.from("categories").select("*").order("name", { ascending: true }),
    supabase.from("phases").select("*").order("start_date", { ascending: false }),
    supabase.from("incomes").select("*"),
    supabase.from("expenses").select("*"),
  ]);
  const categories = (catsData ?? []) as Category[];
  const phases = (phasesData ?? []) as Phase[];
  const incomes = (incomesData ?? []) as Entry[];
  const expenses = (expensesData ?? []) as Entry[];

  const expenseCats = categories.filter((c) => c.kind === "expense");
  const incomeCats = categories.filter((c) => c.kind === "income");

  const currentPhase = phases.find((p) => p.end_date === null) ?? null;
  const firstPhaseId = phases.length > 0 ? phases[phases.length - 1].id : null;
  const onlyOnePhase = phases.length === 1;

  const today = todayISO();
  const monthStart = currentMonthStartISO();
  const sum = (rows: Entry[]) => rows.reduce((a, r) => a + Number(r.amount), 0);
  const statsByPhaseId = new Map<string, PhaseStats>();
  for (const p of phases) {
    const isCurrent = p.end_date === null;
    let avgIncome: number;
    let avgExpense: number;
    if (isCurrent) {
      // Match dashboard: exclude the partial current month and divide by completed months.
      const months = monthsInRange(p.start_date, today);
      if (months < 2) continue;
      const monthsForAvg = months - 1;
      avgIncome = sum(incomes.filter((i) => i.phase_id === p.id && i.date < monthStart)) / monthsForAvg;
      avgExpense = sum(expenses.filter((e) => e.phase_id === p.id && e.date < monthStart)) / monthsForAvg;
    } else {
      const months = monthsInRange(p.start_date, p.end_date!);
      avgIncome = sum(incomes.filter((i) => i.phase_id === p.id)) / months;
      avgExpense = sum(expenses.filter((e) => e.phase_id === p.id)) / months;
    }
    const savingsRatio = avgIncome > 0 ? (avgIncome - avgExpense) / avgIncome : null;
    statsByPhaseId.set(p.id, { avgIncome, avgExpense, savingsRatio });
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Settings</h1>
      </header>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-medium">Phases</h2>
          <p className="text-sm text-ink-3">
            A phase is a period of life — a job, a sabbatical, whatever marks a meaningful change. Expenses and incomes auto-attach to the phase whose date range contains them.
          </p>
        </div>
        {phases.length === 0 ? (
          <div className="rounded-xl border border-rule bg-surface p-4">
            <h3 className="mb-3 text-sm font-medium text-ink-3">Create your first phase</h3>
            <FirstPhaseForm />
          </div>
        ) : (
          <>
            <ul className="divide-y divide-rule overflow-hidden rounded-xl border border-rule bg-surface">
              {phases.map((p) => (
                <PhaseRow
                  key={p.id}
                  phase={p}
                  canEditStart={onlyOnePhase && p.id === firstPhaseId}
                  stats={statsByPhaseId.get(p.id)}
                />
              ))}
            </ul>
            {currentPhase && <EndAndStartForm currentName={currentPhase.name} />}
          </>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-medium">Categories</h2>
          <p className="text-sm text-ink-3">
            Tags for expenses and incomes. A category can&apos;t be deleted while entries reference it.
          </p>
        </div>
        <div className="space-y-3 rounded-xl border border-rule bg-surface p-4">
          <h3 className="text-sm font-medium text-ink-3">Expense categories</h3>
          <NewCategoryForm kind="expense" />
          {expenseCats.length > 0 && (
            <ul className="divide-y divide-rule overflow-hidden rounded-md border border-rule">
              {expenseCats.map((c) => (
                <CategoryRow key={c.id} category={c} />
              ))}
            </ul>
          )}
        </div>
        <div className="space-y-3 rounded-xl border border-rule bg-surface p-4">
          <h3 className="text-sm font-medium text-ink-3">Income categories</h3>
          <NewCategoryForm kind="income" />
          {incomeCats.length > 0 && (
            <ul className="divide-y divide-rule overflow-hidden rounded-md border border-rule">
              {incomeCats.map((c) => (
                <CategoryRow key={c.id} category={c} />
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
