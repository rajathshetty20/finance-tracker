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
  const today = await appToday();

  // Run the full waterfall so this goal's attributed corpus reflects the shared pool.
  const { analyses } = analyzeGoals(goals, allocByGoal, assetClasses, pool, today);
  const analysis = analyses.find((a) => a.goal.id === goal.id);

  const series = goal.status === "active" ? plannedSeries(goal, myAllocs, assetClasses, today) : [];

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
  const coveragePct = analysis ? Math.round(analysis.coverage * 100) : null;
  const needed = analysis?.projection.fundedCorpus ?? 0;

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
      <header className="space-y-1">
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
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-ink-2">
              {goal.status}
            </span>
          )}
        </div>
        <p className="text-sm text-ink-3">
          {fmtMonthYear(goal.end_date)} · {timeLeft}
          {goal.description && <> · {goal.description}</>}
        </p>
      </header>

      {/* Same shape as every other headline in the app: the number, the bar,
          then the arithmetic. Six equal stat tiles gave the reader no idea
          which of them was the answer. */}
      <section className="rounded-xl border border-rule bg-surface p-5">
        <div className="text-[11px] font-medium uppercase tracking-wider text-ink-3">
          Of what it needs now
        </div>
        <div
          className={`mt-1 text-[2.2rem] font-semibold leading-none tabular-nums ${
            coveragePct === null ? "" : coveragePct >= 100 ? "text-up" : "text-down"
          }`}
        >
          {coveragePct !== null ? `${coveragePct}%` : "—"}
        </div>

        <div className="mt-4 h-2 overflow-hidden rounded-full bg-surface-2">
          <div
            className={`h-full rounded-full ${
              coveragePct !== null && coveragePct >= 100 ? "bg-up" : "bg-down"
            }`}
            style={{ width: `${Math.min(100, Math.max(attributed > 0 ? 1.5 : 0, coveragePct ?? 0))}%` }}
          />
        </div>

        <p className="mt-2 font-mono text-[0.6875rem] tabular-nums text-ink-3">
          {fmtINR(attributed)} of {fmtINR(needed)} needed · target {fmtINR(target)} by{" "}
          {fmtMonthYear(goal.end_date)}
        </p>
        <p className="mt-1 font-mono text-[0.6875rem] tabular-nums text-ink-3">
          {fmtINR(goal.present_cost)} at {fmtMonthYear(goal.created_at.slice(0, 10))} prices ·{" "}
          {Number(goal.inflation_rate)}% inflation · {fundedPct}% of the final target
        </p>

        {analysis && Math.round(analysis.requiredMonthly) > 0 && (
          <p className="mt-3 border-t border-rule-soft pt-3 text-[0.8125rem] text-ink-2">
            Invest{" "}
            <span className="font-semibold tabular-nums text-ink">
              {fmtINR(analysis.requiredMonthly)}
            </span>{" "}
            a month to close it.
          </p>
        )}
      </section>

      {!analysis?.projection.hasPlan && (
        <p className="rounded-xl border border-dashed border-warn bg-warn-soft p-3 text-[0.8125rem] text-ink-2">
          No glide path yet — set one below.
        </p>
      )}

      {series.length > 0 && <GoalChart data={series} attributed={attributed} todayISO={today} />}

      {rows.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-medium text-ink-3">By asset class</h2>
          {/* A five-column table cannot be read at 402px — "Shortfall" was
              clipped mid-word and the last column was off-screen. Each class
              gets a block instead, with the gap called out only when there is
              one. */}
          <ul className="divide-y divide-rule-soft rounded-xl border border-rule bg-surface px-4">
            {rows.map((r) => (
              <li key={r.classId} className="py-2.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-sm">{r.name}</span>
                  <span className="shrink-0 text-sm tabular-nums">
                    {fmtINR(r.have)}{" "}
                    <span className="text-ink-3">of {fmtINR(r.need)}</span>
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className={`h-full rounded-full ${r.shortfall > 0 ? "bg-down" : "bg-up"}`}
                    style={{
                      width: `${r.need > 0 ? Math.min(100, (r.have / r.need) * 100) : 100}%`,
                    }}
                  />
                </div>
                <p className="mt-1 font-mono text-[0.6875rem] tabular-nums text-ink-3">
                  {r.shortfall > 0 ? (
                    <span className="text-down">short {fmtINR(r.shortfall)}</span>
                  ) : (
                    "filled"
                  )}
                  {r.sipShare > 0 && <> · invest {fmtINR(r.sipShare)}/mo</>} · pool{" "}
                  {fmtINR(r.poolTotal)}
                </p>
              </li>
            ))}
          </ul>
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

const GOAL_BADGE: Record<GoalVerdict["kind"], { label: string; cls: string }> = {
  "no-plan": { label: "no plan", cls: "bg-warn-soft text-warn" },
  due: { label: "due now", cls: "bg-warn-soft text-warn" },
  "on-track": { label: "on track", cls: "bg-up-soft text-up" },
  behind: { label: "behind", cls: "bg-down-soft text-down" },
};
