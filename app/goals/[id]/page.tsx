import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { AssetClass, Goal, GoalAllocation, Investment, InvestmentEntry } from "@/lib/types";
import { analyzeGoals, monthsBetween, plannedSeries, poolByAssetClass } from "@/lib/goals";
import { fmtINR, todayISO } from "@/lib/dates";
import GlidePathEditor from "./GlidePathEditor";
import GoalActions from "./GoalActions";
import GoalChart from "./GoalChart";

export default async function GoalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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
  const goal = goals.find((g) => g.id === id);
  if (!goal) notFound();

  const allocs = (allocData ?? []) as GoalAllocation[];
  const assetClasses = (classesData ?? []) as AssetClass[];
  const invs = (invsData ?? []) as Investment[];
  const allEntries = (entriesData ?? []) as InvestmentEntry[];
  const classNameById = new Map(assetClasses.map((c) => [c.id, c.name]));

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
  const myAllocs = allocByGoal.get(goal.id) ?? [];

  const pool = poolByAssetClass(invs, entriesByInv);
  const today = todayISO();

  // Run the full waterfall so this goal's attributed corpus reflects the shared pool.
  const { analyses } = analyzeGoals(goals, allocByGoal, assetClasses, pool, today);
  const analysis = analyses.find((a) => a.goal.id === goal.id);

  const series = goal.status === "active" ? plannedSeries(goal, myAllocs, assetClasses) : [];

  const years = analysis ? (analysis.projection.monthsRemaining / 12).toFixed(1) : "—";
  const target = analysis?.projection.targetCorpus ?? 0;
  const attributed = analysis?.attributed ?? 0;
  const fundedPct = analysis ? Math.round(analysis.fundedPct * 100) : 0;

  // Per-class target / have / shortfall, and a suggested split of the monthly SIP
  // (split by the target allocation right now, which is valid even when the
  // on-track corpus is still 0).
  const needEntries = analysis ? [...analysis.projection.targetHoldingNow.entries()] : [];
  const rows = needEntries.map(([classId, need]) => {
    const fill = analysis!.fill.byClass.get(classId);
    const have = fill?.filled ?? 0;
    const shortfall = Math.max(0, need - have);
    const sipShare = analysis?.requiredByClass.get(classId) ?? 0;
    return {
      classId,
      name: classNameById.get(classId) ?? "—",
      need,
      have,
      shortfall,
      poolTotal: pool.get(classId) ?? 0,
      sipShare,
    };
  });

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Link href="/goals" className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
          ← Goals
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold">{goal.name}</h1>
          {goal.status !== "active" && (
            <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-[10px] font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              {goal.status}
            </span>
          )}
        </div>
        {goal.description && <p className="text-sm text-zinc-500">{goal.description}</p>}
        <p className="text-sm text-zinc-500">
          Target {goal.end_date} · {fmtINR(goal.present_cost)} today @ {Number(goal.inflation_rate)}%
          inflation
        </p>
      </header>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Target corpus" value={fmtINR(target)} />
        <Stat label="Attributed now" value={fmtINR(attributed)} />
        <Stat label="Funded" value={`${fundedPct}%`} />
        <Stat label="Years left" value={years} />
        <Stat
          label="Required / month"
          value={analysis && Math.round(analysis.requiredMonthly) > 0 ? fmtINR(analysis.requiredMonthly) : "—"}
          tone={analysis && analysis.onTrack ? "pos" : analysis && analysis.projection.hasPlan ? "neg" : undefined}
        />
      </section>

      {!analysis?.projection.hasPlan && (
        <p className="rounded-xl border border-dashed border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          This goal has no glide path yet. Set the allocation plan below to see progress and the
          required monthly investment.
        </p>
      )}

      {series.length > 0 && <GoalChart data={series} attributed={attributed} todayISO={today} />}

      {rows.length > 0 && (
        <section>
          <h2 className="mb-1 text-sm font-medium text-zinc-500">Allocation right now (shared pool, soonest-due goals first)</h2>
          <p className="mb-2 text-xs text-zinc-500">
            Suggested ₹/mo is this year&apos;s amount — contributions are assumed to step up 10%
            each year from here.
          </p>
          <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500 dark:border-zinc-800">
                  <th className="px-4 py-2 font-medium">Asset class</th>
                  <th className="px-4 py-2 text-right font-medium">Need now</th>
                  <th className="px-4 py-2 text-right font-medium">Have</th>
                  <th className="px-4 py-2 text-right font-medium">Shortfall</th>
                  <th className="px-4 py-2 text-right font-medium">Suggested ₹/mo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {rows.map((r) => (
                  <tr key={r.classId} className="tabular-nums">
                    <td className="px-4 py-2">
                      {r.name}
                      <span className="ml-2 text-xs text-zinc-400">pool {fmtINR(r.poolTotal)}</span>
                    </td>
                    <td className="px-4 py-2 text-right">{fmtINR(r.need)}</td>
                    <td className="px-4 py-2 text-right">{fmtINR(r.have)}</td>
                    <td className={`px-4 py-2 text-right ${r.shortfall > 0 ? "text-red-600 dark:text-red-400" : "text-zinc-400"}`}>
                      {r.shortfall > 0 ? fmtINR(r.shortfall) : "—"}
                    </td>
                    <td className="px-4 py-2 text-right">{r.sipShare > 0 ? fmtINR(r.sipShare) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-1 text-sm font-medium text-zinc-500">Glide path</h2>
        <p className="mb-3 text-xs text-zinc-500">
          Target allocation at each milestone (years before the goal date). Each milestone must sum
          to 100%. Between milestones the allocation glides linearly.
        </p>
        {assetClasses.length === 0 ? (
          <p className="text-sm text-zinc-500">
            Add asset classes on the{" "}
            <Link href="/goals" className="underline">
              Goals
            </Link>{" "}
            page first.
          </p>
        ) : (
          <GlidePathEditor
            goalId={goal.id}
            assetClasses={assetClasses}
            existing={myAllocs}
            horizonYears={Math.max(1, Math.round(monthsBetween(goal.created_at.slice(0, 10), goal.end_date) / 12))}
          />
        )}
      </section>

      <GoalActions goal={goal} />
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "pos" | "neg" }) {
  const toneCls =
    tone === "pos"
      ? "text-emerald-700 dark:text-emerald-400"
      : tone === "neg"
        ? "text-red-600 dark:text-red-400"
        : "";
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className={`mt-1 text-lg font-semibold tabular-nums ${toneCls}`}>{value}</div>
    </div>
  );
}
