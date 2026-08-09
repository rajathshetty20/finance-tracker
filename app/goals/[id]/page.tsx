import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { AssetClass, Goal, GoalAllocation, Investment, InvestmentEntry } from "@/lib/types";
import {
  analyzeGoals,
  formatMonthsLeft,
  goalVerdict,
  monthsBetween,
  plannedSeries,
  poolByAssetClass,
  poolValueAsOf,
  type GoalVerdict,
} from "@/lib/goals";
import { fmtINR, fmtMonthYear } from "@/lib/dates";
import { appToday } from "@/lib/demo";
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
  const poolAt = (iso: string) => poolValueAsOf(invs, entriesByInv, iso);
  const today = await appToday();

  // Run the full waterfall so this goal's attributed corpus reflects the shared pool.
  const { analyses } = analyzeGoals(goals, allocByGoal, assetClasses, pool, today, poolAt);
  const analysis = analyses.find((a) => a.goal.id === goal.id);

  const series = goal.status === "active" ? plannedSeries(goal, myAllocs, assetClasses) : [];

  const timeLeft = analysis
    ? analysis.projection.monthsRemaining === 0
      ? "due now"
      : formatMonthsLeft(analysis.projection.monthsRemaining)
    : "—";
  const target = analysis?.projection.targetCorpus ?? 0;
  const attributed = analysis?.attributed ?? 0;
  const fundedPct = analysis ? Math.round(analysis.fundedPct * 100) : 0;

  // Same verdict vocabulary as /plan, from the same function — a goal cannot
  // read "on track" on one screen and "behind" on the other.
  const verdict = analysis ? goalVerdict(analysis) : null;
  const verdictBadge = verdict
    ? GOAL_BADGE[verdict.kind]
    : { label: "", cls: "" };
  const schedulePct =
    analysis && analysis.projection.plannedCorpusNow > 0
      ? Math.round(analysis.schedulePct * 100)
      : null;

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
        <Link href="/plan" className="text-xs text-ink-3 hover:text-ink">
          ← Plan
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold">{goal.name}</h1>
          {verdict && (
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${verdictBadge.cls}`}>
              {verdictBadge.label}
            </span>
          )}
          {goal.status !== "active" && (
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-ink">
              {goal.status}
            </span>
          )}
        </div>
        {goal.description && <p className="text-sm text-ink-3">{goal.description}</p>}
        <p className="text-sm text-ink-3">
          Target {fmtMonthYear(goal.end_date)} · {fmtINR(goal.present_cost)} today @ {Number(goal.inflation_rate)}%
          inflation
        </p>
      </header>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Target corpus" value={fmtINR(target)} />
        <Stat label="Attributed now" value={fmtINR(attributed)} />
        <Stat label="Funded" value={`${fundedPct}%`} sub="of the final target" />
        <Stat
          label="Of schedule"
          value={
            verdict?.kind === "no-history"
              ? "—"
              : schedulePct !== null
                ? `${schedulePct}%`
                : "—"
          }
          sub={
            verdict?.kind === "no-history"
              ? `plan is ${verdict.monthsElapsed}m old`
              : "vs the plan's own path"
          }
          tone={
            schedulePct === null || verdict?.kind === "no-history"
              ? undefined
              : schedulePct >= 100
                ? "pos"
                : "neg"
          }
        />
        <Stat label="Time left" value={timeLeft} />
        <Stat
          label="Required / month"
          value={analysis && Math.round(analysis.requiredMonthly) > 0 ? fmtINR(analysis.requiredMonthly) : "—"}
        />
      </section>

      {!analysis?.projection.hasPlan && (
        <p className="rounded-xl border border-dashed border-warn bg-warn-soft p-4 text-sm text-ink-2">
          This goal has no glide path yet. Set the allocation plan below to see progress and the
          required monthly investment.
        </p>
      )}

      {series.length > 0 && <GoalChart data={series} attributed={attributed} todayISO={today} />}

      {rows.length > 0 && (
        <section>
          <h2 className="mb-1 text-sm font-medium text-ink-3">Allocation right now (shared pool, soonest-due goals first)</h2>
          <p className="mb-2 text-xs text-ink-3">
            Suggested ₹/mo is this year&apos;s amount — contributions are assumed to step up 10%
            each year from here.
          </p>
          <div className="overflow-x-auto rounded-xl border border-rule bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-rule text-left text-xs text-ink-3">
                  <th className="px-4 py-2 font-medium">Asset class</th>
                  <th className="px-4 py-2 text-right font-medium">Need now</th>
                  <th className="px-4 py-2 text-right font-medium">Have</th>
                  <th className="px-4 py-2 text-right font-medium">Shortfall</th>
                  <th className="px-4 py-2 text-right font-medium">Suggested ₹/mo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {rows.map((r) => (
                  <tr key={r.classId} className="tabular-nums">
                    <td className="px-4 py-2">
                      {r.name}
                      <span className="ml-2 text-xs text-ink-3">pool {fmtINR(r.poolTotal)}</span>
                    </td>
                    <td className="px-4 py-2 text-right">{fmtINR(r.need)}</td>
                    <td className="px-4 py-2 text-right">{fmtINR(r.have)}</td>
                    <td className={`px-4 py-2 text-right ${r.shortfall > 0 ? "text-down" : "text-ink-3"}`}>
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

      <section className="rounded-xl border border-rule bg-surface p-4">
        <h2 className="mb-1 text-sm font-medium text-ink-3">Glide path</h2>
        <p className="mb-3 text-xs text-ink-3">
          Target allocation at each milestone (years before the goal date). Each milestone must sum
          to 100%. Between milestones the allocation glides linearly.
        </p>
        {assetClasses.length === 0 ? (
          <p className="text-sm text-ink-3">
            Add asset classes on the{" "}
            <Link href="/plan" className="underline">
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

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "pos" | "neg";
}) {
  const toneCls =
    tone === "pos"
      ? "text-up"
      : tone === "neg"
        ? "text-down"
        : "";
  return (
    <div className="rounded-xl border border-rule bg-surface p-4">
      <div className="text-xs text-ink-3">{label}</div>
      <div className={`mt-1 text-lg font-semibold tabular-nums ${toneCls}`}>{value}</div>
      {sub && <div className="mt-0.5 text-[0.6875rem] text-ink-3">{sub}</div>}
    </div>
  );
}

const GOAL_BADGE: Record<GoalVerdict["kind"], { label: string; cls: string }> = {
  "no-plan": { label: "no plan", cls: "bg-warn-soft text-warn" },
  due: { label: "due now", cls: "bg-warn-soft text-warn" },
  funded: { label: "funded", cls: "bg-up-soft text-up" },
  "will-fund": { label: "on assumptions, funded", cls: "bg-surface-2 text-ink-2" },
  "no-history": { label: "no history yet", cls: "bg-surface-2 text-ink-2" },
  "on-track": { label: "on track", cls: "bg-up-soft text-up" },
  "slightly-behind": { label: "slightly behind", cls: "bg-warn-soft text-warn" },
  behind: { label: "behind", cls: "bg-down-soft text-down" },
};
