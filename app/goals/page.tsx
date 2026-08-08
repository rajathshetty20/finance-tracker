import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { AssetClass, Goal, GoalAllocation, Investment, InvestmentEntry } from "@/lib/types";
import { analyzeGoals, formatMonthsLeft, poolByAssetClass, type GoalAnalysis } from "@/lib/goals";
import { fmtINR, todayISO } from "@/lib/dates";
import CreateGoalForm from "./CreateGoalForm";
import AssetClassesEditor from "./AssetClassesEditor";

function fmtCompact(n: number): string {
  const a = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  if (a >= 1e7) return `${sign}₹${(a / 1e7).toFixed(a >= 1e8 ? 0 : 2)}Cr`;
  if (a >= 1e5) return `${sign}₹${(a / 1e5).toFixed(a >= 1e6 ? 0 : 1)}L`;
  if (a >= 1e3) return `${sign}₹${(a / 1e3).toFixed(0)}k`;
  return `${sign}₹${Math.round(a)}`;
}

export default async function GoalsPage() {
  const supabase = await createClient();
  const [
    { data: goalsData },
    { data: allocData },
    { data: classesData },
    { data: invsData },
    { data: entriesData },
  ] = await Promise.all([
    supabase.from("goals").select("*").order("end_date", { ascending: true }),
    supabase.from("goal_allocations").select("*"),
    supabase.from("asset_classes").select("*").order("name", { ascending: true }),
    supabase.from("investments").select("*"),
    supabase.from("investment_entries").select("*"),
  ]);

  const goals = (goalsData ?? []) as Goal[];
  const allocs = (allocData ?? []) as GoalAllocation[];
  const assetClasses = (classesData ?? []) as AssetClass[];
  const invs = (invsData ?? []) as Investment[];
  const allEntries = (entriesData ?? []) as InvestmentEntry[];

  const entriesByInv = new Map<string, InvestmentEntry[]>();
  for (const e of allEntries) {
    const arr = entriesByInv.get(e.investment_id) ?? [];
    arr.push(e);
    entriesByInv.set(e.investment_id, arr);
  }

  const allocByGoal = new Map<string, GoalAllocation[]>();
  for (const a of allocs) {
    const arr = allocByGoal.get(a.goal_id) ?? [];
    arr.push(a);
    allocByGoal.set(a.goal_id, arr);
  }

  const pool = poolByAssetClass(invs, entriesByInv);
  const today = todayISO();
  const { analyses, surplusByClass } = analyzeGoals(goals, allocByGoal, assetClasses, pool, today);

  const classNameById = new Map(assetClasses.map((c) => [c.id, c.name]));
  const totalRequired = analyses.reduce((s, a) => s + a.requiredMonthly, 0);
  const totalPool = [...pool.values()].reduce((s, v) => s + v, 0);
  const inactive = goals.filter((g) => g.status !== "active");

  // Pool not attributed to any goal (excess in a class beyond all goals' plans,
  // or a class no goal targets).
  const surplusRows = [...surplusByClass.entries()]
    .map(([cls, amt]) => ({ name: classNameById.get(cls) ?? "—", amt }))
    .filter((r) => r.amt > 0.5)
    .sort((x, y) => y.amt - x.amt);
  const totalSurplus = surplusRows.reduce((s, r) => s + r.amt, 0);

  // Aggregate the suggested monthly investment per asset class across all goals.
  // Each goal's required SIP is split by its target allocation right now, and we
  // keep the per-goal contributions so the breakdown shows what each amount is for.
  const monthlyByClass = new Map<
    string,
    { total: number; byGoal: { name: string; amt: number; monthsLeft: number }[] }
  >();
  for (const a of analyses) {
    for (const [cls, amt] of a.requiredByClass) {
      if (amt <= 0.5) continue;
      const e = monthlyByClass.get(cls) ?? { total: 0, byGoal: [] };
      e.total += amt;
      e.byGoal.push({ name: a.goal.name, amt, monthsLeft: a.projection.monthsRemaining });
      monthlyByClass.set(cls, e);
    }
  }
  const monthlyRows = [...monthlyByClass.entries()]
    .map(([cls, e]) => ({
      name: classNameById.get(cls) ?? "—",
      amt: e.total,
      poolNow: pool.get(cls) ?? 0,
      byGoal: [...e.byGoal].sort((x, y) => y.amt - x.amt),
    }))
    .filter((r) => r.amt > 0.5)
    .sort((x, y) => y.amt - x.amt);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Goals</h1>
        <p className="text-sm text-ink-3">
          Each goal needs a corpus by its date. Your investments sit in one pool, split by asset
          class, and are shared across goals by how soon they&apos;re due. Goals are a planning
          overlay — they never touch cash or net worth.
        </p>
      </header>

      {analyses.length > 0 && (
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat label="Active goals" value={String(analyses.length)} />
          <Stat label="Invested pool" value={fmtCompact(totalPool)} />
          <Stat label="Required / month" value={fmtCompact(totalRequired)} />
        </section>
      )}

      {monthlyRows.length > 0 && (
        <section>
          <h2 className="mb-1 text-sm font-medium text-ink-3">Monthly investment by asset class</h2>
          <p className="mb-2 text-xs text-ink-3">
            How much to put into each asset class this year across all goals (steps up 10% each
            year).
          </p>
          <ul className="divide-y divide-rule overflow-hidden rounded-xl border border-rule bg-surface">
            {monthlyRows.map((r) => (
              <li key={r.name} className="px-4 py-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-sm">
                    {r.name}
                    <span className="ml-2 text-xs text-ink-3">pool {fmtCompact(r.poolNow)}</span>
                  </span>
                  <span className="text-sm font-medium tabular-nums">{fmtINR(r.amt)}/mo</span>
                </div>
                {r.byGoal.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-ink-3">
                    {r.byGoal.map((g) => (
                      <span key={g.name} className="tabular-nums">
                        {g.name} {fmtINR(g.amt)}{" "}
                        <span className="text-ink-3">({formatMonthsLeft(g.monthsLeft)} left)</span>
                      </span>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {surplusRows.length > 0 && (
        <section>
          <h2 className="mb-1 text-sm font-medium text-ink-3">
            Surplus — not attributed to any goal
          </h2>
          <p className="mb-2 text-xs text-ink-3">
            Investments beyond what your goals&apos; plans call for in that asset class (or in a
            class no goal targets). Total {fmtCompact(totalSurplus)}.
          </p>
          <ul className="divide-y divide-rule overflow-hidden rounded-xl border border-rule bg-surface">
            {surplusRows.map((r) => (
              <li key={r.name} className="flex items-center justify-between px-4 py-2.5">
                <span className="text-sm">{r.name}</span>
                <span className="text-sm font-medium tabular-nums text-ink-3">{fmtINR(r.amt)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-3">
        {analyses.length === 0 ? (
          <p className="rounded-xl border border-dashed border-rule p-6 text-center text-sm text-ink-3">
            No active goals yet. Add one below.
          </p>
        ) : (
          analyses.map((a) => <GoalCard key={a.goal.id} a={a} />)
        )}
      </section>

      {inactive.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-medium text-ink-3">Achieved / archived</h2>
          <ul className="divide-y divide-rule overflow-hidden rounded-xl border border-rule bg-surface">
            {inactive.map((g) => (
              <li key={g.id}>
                <Link href={`/goals/${g.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-surface-2">
                  <span className="text-sm text-ink-2">{g.name}</span>
                  <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-ink">
                    {g.status}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-xl border border-rule bg-surface p-4">
        <h2 className="mb-3 text-sm font-medium text-ink-3">Add goal</h2>
        <CreateGoalForm />
      </section>

      <section className="rounded-xl border border-rule bg-surface p-4">
        <h2 className="mb-1 text-sm font-medium text-ink-3">Asset classes & expected returns</h2>
        <p className="mb-3 text-xs text-ink-3">
          The appreciation assumption (annual %) used to project every goal. Investments are tagged
          with these classes.
        </p>
        <AssetClassesEditor assetClasses={assetClasses} />
      </section>
    </div>
  );
}

function GoalCard({ a }: { a: GoalAnalysis }) {
  const { goal, projection, fundedPct, requiredMonthly, onTrack } = a;
  const timeLeft =
    projection.monthsRemaining === 0 ? "due now" : `${formatMonthsLeft(projection.monthsRemaining)} left`;
  const pct = Math.min(100, Math.max(0, fundedPct * 100));
  const noPlan = !projection.hasPlan;
  // A due goal needs its full target today, but its required SIP is 0 (no
  // months to invest over) — show the gap instead. Future goals with a 0 SIP
  // are genuinely fully funded (corpus grows into the target on its own).
  const shortNow =
    projection.monthsRemaining === 0 ? Math.max(0, projection.targetCorpus - a.attributed) : 0;

  return (
    <Link
      href={`/goals/${goal.id}`}
      className="block rounded-xl border border-rule bg-surface p-4 hover:bg-surface-2"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">{goal.name}</span>
          </div>
          <div className="mt-0.5 text-xs text-ink-3">
            {goal.end_date} · {timeLeft}
          </div>
        </div>
        {noPlan ? (
          <span className="shrink-0 rounded-full bg-warn-soft px-2 py-0.5 text-[10px] font-medium text-warn">
            no plan
          </span>
        ) : (
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
              onTrack
                ? "bg-up-soft text-up"
                : "bg-down-soft text-down"
            }`}
          >
            {onTrack ? "on track" : "behind"}
          </span>
        )}
      </div>

      <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2">
        <div
          className={`h-full rounded-full ${onTrack ? "bg-up" : "bg-warn"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-ink-3 tabular-nums">
        <span>
          {fmtINR(a.attributed)} / {fmtINR(projection.targetCorpus)}
        </span>
        <span>
          {Math.round(requiredMonthly) > 0 ? (
            <>invest {fmtINR(requiredMonthly)}/mo</>
          ) : !projection.hasPlan ? (
            "—"
          ) : shortNow > 0.5 ? (
            <span className="text-down">short {fmtINR(shortNow)}</span>
          ) : (
            <span className="text-up">fully funded</span>
          )}
        </span>
      </div>
    </Link>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-rule bg-surface p-4">
      <div className="text-xs text-ink-3">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}
