import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Category, Entry, Phase } from "@/lib/types";
import { currentMonthStartISO, fmtINR, monthsInRange } from "@/lib/dates";
import { appToday } from "@/lib/demo";
import { APP_TIME_ZONE } from "@/lib/dates";
import Disclose from "../Disclose";
import NewCategoryForm from "./NewCategoryForm";
import CategoryRow from "./CategoryRow";
import FirstPhaseForm from "../phases/FirstPhaseForm";
import EndAndStartForm from "../phases/EndAndStartForm";
import PhaseRow, { type PhaseStats } from "../phases/PhaseRow";

export default async function SettingsPage() {
  const supabase = await createClient();
  const today = await appToday();

  const [{ data: catsData }, { data: phasesData }, { data: incomesData }, { data: expensesData }] =
    await Promise.all([
      supabase.from("categories").select("*").order("name", { ascending: true }),
      supabase.from("phases").select("*").order("start_date", { ascending: false }),
      supabase.from("incomes").select("*"),
      supabase.from("expenses").select("*"),
    ]);
  const categories = (catsData ?? []) as Category[];
  const phases = (phasesData ?? []) as Phase[];
  const incomes = (incomesData ?? []) as Entry[];
  const expenses = (expensesData ?? []) as Entry[];

  const currentPhase = phases.find((p) => p.end_date === null) ?? null;
  const firstPhaseId = phases.length > 0 ? phases[phases.length - 1].id : null;
  const onlyOnePhase = phases.length === 1;

  const monthStart = currentMonthStartISO(today);
  const sum = (rows: Entry[]) => rows.reduce((a, r) => a + Number(r.amount), 0);
  const statsByPhaseId = new Map<string, PhaseStats>();
  for (const p of phases) {
    const isCurrent = p.end_date === null;
    let avgIncome: number;
    let avgExpense: number;
    if (isCurrent) {
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

  // How much each category actually carries. A bare list gives no way to tell
  // a category worth keeping from one logged twice in two years, and a delete
  // that will be refused by the foreign key is better shown than attempted.
  const usage = new Map<string, { count: number; total: number }>();
  for (const e of [...expenses, ...incomes]) {
    const u = usage.get(e.category_id) ?? { count: 0, total: 0 };
    u.count += 1;
    u.total += Number(e.amount);
    usage.set(e.category_id, u);
  }
  const rank = (a: Category, b: Category) =>
    (usage.get(b.id)?.total ?? 0) - (usage.get(a.id)?.total ?? 0) || a.name.localeCompare(b.name);
  const expenseCats = categories.filter((c) => c.kind === "expense").sort(rank);
  const incomeCats = categories.filter((c) => c.kind === "income").sort(rank);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Settings</h1>
      </header>

      <section className="rounded-xl border border-rule bg-surface p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 className="text-sm font-medium">Phases</h2>
          <span className="text-[0.6875rem] text-ink-3">
            {phases.length} · entries attach by date
          </span>
        </div>
        <p className="mt-0.5 text-xs text-ink-3">
          A period of life — a job, a sabbatical. Phases scope the averages on every other screen.
        </p>

        {phases.length === 0 ? (
          <div className="mt-3">
            <FirstPhaseForm />
          </div>
        ) : (
          <>
            <ul className="mt-3 divide-y divide-rule-soft">
              {phases.map((p) => (
                <PhaseRow
                  key={p.id}
                  phase={p}
                  canEditStart={onlyOnePhase && p.id === firstPhaseId}
                  stats={statsByPhaseId.get(p.id)}
                />
              ))}
            </ul>
            {currentPhase && (
              <div className="mt-3">
                <Disclose label="End phase and start new">
                  <EndAndStartForm currentName={currentPhase.name} />
                </Disclose>
              </div>
            )}
          </>
        )}
      </section>

      <CategorySection
        title="Expense categories"
        kind="expense"
        categories={expenseCats}
        usage={usage}
      />
      <CategorySection
        title="Income categories"
        kind="income"
        categories={incomeCats}
        usage={usage}
      />

      <section className="rounded-xl border border-rule bg-surface p-4">
        <h2 className="text-sm font-medium">Data</h2>
        <p className="mt-0.5 text-xs text-ink-3">
          Days are counted in {APP_TIME_ZONE}, wherever you log from.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href="/cashflow/export?ledger=expenses&range=all"
            className="inline-flex min-h-[36px] items-center rounded-lg border border-rule px-3 text-[0.8125rem] text-ink-2 hover:bg-surface-2"
          >
            Export expenses (CSV)
          </Link>
          <Link
            href="/cashflow/export?ledger=incomes&range=all"
            className="inline-flex min-h-[36px] items-center rounded-lg border border-rule px-3 text-[0.8125rem] text-ink-2 hover:bg-surface-2"
          >
            Export incomes (CSV)
          </Link>
        </div>
        <p className="mt-3 text-xs text-ink-3">
          Expected returns per asset class live on{" "}
          <Link href="/plan" className="underline">
            Plan
          </Link>
          , beside the verdicts they drive.
        </p>
      </section>
    </div>
  );
}

function CategorySection({
  title,
  kind,
  categories,
  usage,
}: {
  title: string;
  kind: "expense" | "income";
  categories: Category[];
  usage: Map<string, { count: number; total: number }>;
}) {
  return (
    <section className="rounded-xl border border-rule bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-sm font-medium">{title}</h2>
        <span className="text-[0.6875rem] text-ink-3">{categories.length}</span>
      </div>

      {categories.length > 0 && (
        <ul className="mt-3 divide-y divide-rule-soft">
          {categories.map((c) => {
            const u = usage.get(c.id);
            return (
              <li key={c.id}>
                <CategoryRow
                  category={c}
                  usage={
                    u
                      ? `${u.count} entr${u.count === 1 ? "y" : "ies"} · ${fmtINR(u.total)}`
                      : "unused"
                  }
                  inUse={Boolean(u)}
                />
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-3">
        <Disclose label={`Add ${kind} category`}>
          <NewCategoryForm kind={kind} />
        </Disclose>
      </div>
    </section>
  );
}
