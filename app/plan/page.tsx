import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type {
  AssetClass,
  Category,
  Debt,
  DebtPayment,
  Entry,
  Goal,
  GoalAllocation,
  Investment,
  InvestmentEntry,
  Phase,
} from "@/lib/types";
import {
  analyzeGoals,
  formatMonthsLeft,
  goalVerdict,
  lowerReturns,
  planSummary,
  poolByAssetClass,
  STRESS_POINTS,
  type GoalAnalysis,
  type GoalVerdict,
} from "@/lib/goals";
import { cashflowBases } from "@/lib/money";
import { appToday } from "@/lib/demo";
import { currentMonthStartISO, fmtINR, fmtMonthYear } from "@/lib/dates";
import Disclose from "../Disclose";
import CreateGoalForm from "../goals/CreateGoalForm";
import AssetClassesEditor from "../goals/AssetClassesEditor";

function fmtCompact(n: number): string {
  const a = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  if (a >= 1e7) return `${sign}₹${(a / 1e7).toFixed(a >= 1e8 ? 0 : 2)}Cr`;
  if (a >= 1e5) return `${sign}₹${(a / 1e5).toFixed(a >= 1e6 ? 0 : 1)}L`;
  if (a >= 1e3) return `${sign}₹${(a / 1e3).toFixed(0)}k`;
  return `${sign}₹${Math.round(a)}`;
}

export default async function PlanPage() {
  const supabase = await createClient();
  const today = await appToday();

  const [
    { data: goalsData },
    { data: allocData },
    { data: classesData },
    { data: invsData },
    { data: entriesData },
    { data: phasesData },
    { data: debtsData },
    { data: paymentsData },
    { data: catsData },
  ] = await Promise.all([
    supabase.from("goals").select("*").order("end_date", { ascending: true }),
    supabase.from("goal_allocations").select("*"),
    supabase.from("asset_classes").select("*").order("name", { ascending: true }),
    supabase.from("investments").select("*"),
    supabase.from("investment_entries").select("*"),
    supabase.from("phases").select("*").order("start_date", { ascending: false }),
    supabase.from("debts").select("*"),
    supabase.from("debt_payments").select("*"),
    supabase.from("categories").select("*"),
  ]);

  const goals = (goalsData ?? []) as Goal[];
  const allocs = (allocData ?? []) as GoalAllocation[];
  const assetClasses = (classesData ?? []) as AssetClass[];
  const invs = (invsData ?? []) as Investment[];
  const allEntries = (entriesData ?? []) as InvestmentEntry[];
  const phases = (phasesData ?? []) as Phase[];
  const currentPhase = phases.find((p) => p.end_date === null) ?? null;

  const entriesByInv = new Map<string, InvestmentEntry[]>();
  for (const inv of invs) entriesByInv.set(inv.id, []);
  for (const e of allEntries) entriesByInv.get(e.investment_id)?.push(e);

  const allocByGoal = new Map<string, GoalAllocation[]>();
  for (const a of allocs) {
    const arr = allocByGoal.get(a.goal_id) ?? [];
    arr.push(a);
    allocByGoal.set(a.goal_id, arr);
  }

  const pool = poolByAssetClass(invs, entriesByInv);
  const { analyses, surplusByClass } = analyzeGoals(goals, allocByGoal, assetClasses, pool, today);
  const summary = planSummary(analyses);
  const classNameById = new Map(assetClasses.map((c) => [c.id, c.name]));

  // The same figure at a stated, more pessimistic assumption. Two of the four
  // goals sit almost entirely in one asset class, so the whole answer moves
  // with one number typed into the box at the bottom of this page; printing it
  // only at that number leaves nothing to disagree with.
  const stressed = planSummary(
    analyzeGoals(goals, allocByGoal, lowerReturns(assetClasses, STRESS_POINTS), pool, today)
      .analyses,
  );

  // What a month can commit — computed once, in lib/money.ts, and quoted with
  // its base wherever it appears, so this page and Home cannot drift apart.
  let bases = null;
  if (currentPhase) {
    const [{ data: incData }, { data: expData }] = await Promise.all([
      supabase.from("incomes").select("*").eq("phase_id", currentPhase.id),
      supabase.from("expenses").select("*").eq("phase_id", currentPhase.id),
    ]);
    bases = cashflowBases({
      incomes: (incData ?? []) as Entry[],
      expenses: (expData ?? []) as Entry[],
      openDebts: ((debtsData ?? []) as Debt[]).filter((d) => d.status === "open"),
      payments: (paymentsData ?? []) as DebtPayment[],
      categories: (catsData ?? []) as Category[],
      phaseStartISO: currentPhase.start_date,
      todayISO: today,
      monthStartISO: currentMonthStartISO(today),
    });
  }

  // Round ONCE, then do the arithmetic on the rounded figures, so the numbers
  // printed on this page subtract to the difference also printed on this page.
  // Independently rounding each of five floats left the shown values ₹1 apart.
  const available = bases?.salaryInvestable == null ? null : Math.round(bases.salaryInvestable);
  const required = Math.round(summary.requiredMonthly);
  const requiredStressed = Math.round(stressed.requiredMonthly);
  const headroom = available !== null ? available - required : null;
  const stressHeadroom = available !== null ? available - requiredStressed : null;


  const totalPool = [...pool.values()].reduce((s, v) => s + v, 0);
  const inactive = goals.filter((g) => g.status !== "active");

  // A class shows up in "unclaimed" for two different reasons and the engine
  // reports them identically. Distinguishing them matters: one is "your goals
  // are full", the other is "nothing you are saving for wants this".
  const targetedClasses = new Set<string>();
  for (const a of analyses) for (const c of a.projection.targetAllocNow.keys()) targetedClasses.add(c);
  const unclaimed = [...surplusByClass.entries()]
    .filter(([, amt]) => amt > 0.5)
    .map(([cls, amt]) => ({
      name: classNameById.get(cls) ?? "—",
      amt,
      targeted: targetedClasses.has(cls),
    }))
    .sort((x, y) => y.amt - x.amt);
  const unclaimedTotal = unclaimed.reduce((s, r) => s + r.amt, 0);

  const byDueDate = [...analyses].sort(
    (a, b) => a.projection.monthsRemaining - b.projection.monthsRemaining,
  );
  // Same-date goals are filled in UUID order, which is not something a reader
  // could ever predict; say so rather than presenting it as a due-date rule.
  const tiedDueDates = new Set(
    byDueDate
      .map((a) => a.goal.end_date)
      .filter((d, i, arr) => arr.indexOf(d) !== i),
  );

  const monthlyByClass = [...summary.byClass.entries()]
    .map(([cls, amt]) => ({ name: classNameById.get(cls) ?? "—", amt, poolNow: pool.get(cls) ?? 0 }))
    .filter((r) => r.amt > 0)
    .sort((x, y) => y.amt - x.amt);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Plan</h1>
        <p className="text-sm text-ink-3">
          Whether your investments will cover what you&apos;re saving for.
        </p>
      </header>

      {/* ── The verdict, first thing on the screen ───────────────────────── */}
      {analyses.length > 0 && (
        <section className="rounded-xl border border-rule bg-surface p-5">
          <div className="text-[11px] font-medium uppercase tracking-wider text-ink-3">
            {available !== null && headroom !== null
              ? headroom >= 0
                ? "Spare each month"
                : "Short each month"
              : "The plan needs, per month"}
          </div>
          <div
            className={`mt-1 text-[2.6rem] font-semibold leading-none tabular-nums ${
              headroom === null ? "" : headroom >= 0 ? "text-up" : "text-down"
            }`}
          >
            {headroom === null ? fmtINR(required) : fmtINR(Math.abs(headroom))}
          </div>
          <p className="mt-1 text-[0.8125rem] text-ink-3">
            {headroom === null ? (
              <>across {analyses.length} active goal{analyses.length === 1 ? "" : "s"}</>
            ) : headroom >= 0 ? (
              <>You can fund the plan.</>
            ) : (
              <>You cannot fund the plan as it stands.</>
            )}
          </p>

          {available !== null && headroom !== null && bases ? (
            <>
              <p className="mt-3 font-mono text-[0.6875rem] leading-relaxed tabular-nums text-ink-3">
                {fmtINR(available)} salary investable − {fmtINR(required)} the plan needs ={" "}
                {headroom >= 0 ? "+" : "−"}
                {fmtINR(Math.abs(headroom))}
              </p>
              {/* Sensitivity: the same verdict at a stated, worse assumption. */}
              <div className="mt-3 border-t border-rule-soft pt-3">
                <p className="text-[0.8125rem] text-ink-2">
                  <span className="font-medium text-ink">If returns come in {STRESS_POINTS} points lower</span>{" "}
                  across every asset class ({[...assetClasses]
                    .filter((c) => Number(c.expected_return) > 0)
                    .sort((a, b) => (pool.get(b.id) ?? 0) - (pool.get(a.id) ?? 0))
                    .slice(0, 2)
                    .map((c) => `${c.name} ${Number(c.expected_return)}→${Math.max(0, Number(c.expected_return) - STRESS_POINTS)}%`)
                    .join(", ")}
                  ), the plan needs{" "}
                  <span className="font-semibold tabular-nums">{fmtINR(requiredStressed)}</span>{" "}
                  —{" "}
                  {stressHeadroom !== null && stressHeadroom >= 0 ? (
                    <span className="tabular-nums text-up">
                      still affordable, {fmtINR(stressHeadroom)} to spare
                    </span>
                  ) : (
                    <span className="tabular-nums text-down">
                      short by {fmtINR(Math.abs(stressHeadroom ?? 0))}
                    </span>
                  )}
                  .
                </p>
              </div>
            </>
          ) : (
            <p className="mt-3 text-sm text-ink-3">
              Log a completed month of income and spending and this page can say whether the plan is
              affordable.
            </p>
          )}
        </section>
      )}

      {/* ── Per-goal ─────────────────────────────────────────────────────── */}
      {analyses.length === 0 ? (
        <p className="rounded-xl border border-dashed border-rule p-6 text-center text-sm text-ink-3">
          No active goals yet. Add one below.
        </p>
      ) : (
        <section className="space-y-3">
          <h2 className="text-sm font-medium">Goals, soonest first</h2>
          {byDueDate.map((a) => (
            <GoalCard
              key={a.goal.id}
              a={a}
              monthly={summary.byGoal.get(a.goal.id) ?? 0}
            />
          ))}
        </section>
      )}

      {/* ── Where the pool actually went ─────────────────────────────────── */}
      {analyses.length > 0 && totalPool > 0 && (
        <section className="rounded-xl border border-rule bg-surface p-4">
          <h2 className="text-sm font-medium">How the pool is shared</h2>
          <p className="mt-0.5 text-xs text-ink-3">
            {fmtCompact(totalPool)} invested, claimed soonest-due first.
          </p>
          {/* One stacked bar, as on Home: the whole pool in a single row, with
              the unclaimed remainder visible as a segment rather than as a
              footnote. Five identically-coloured tracks could not be compared
              against each other anyway. */}
          <div className="mt-3 flex h-2.5 gap-[2px] overflow-hidden rounded-full">
            {byDueDate.map((a, i) => (
              <span
                key={a.goal.id}
                style={{
                  width: `${(a.attributed / totalPool) * 100}%`,
                  background: `var(--cat-${(i % 8) + 1})`,
                }}
              />
            ))}
            {unclaimedTotal > 0 && (
              <span
                style={{ width: `${(unclaimedTotal / totalPool) * 100}%`, background: "var(--cat-other)" }}
              />
            )}
          </div>
          <ul className="mt-2.5 space-y-1">
            {byDueDate.map((a, i) => (
              <li key={a.goal.id} className="flex items-baseline gap-1.5 text-[0.8125rem]">
                <i
                  className="h-2 w-2 shrink-0 -translate-y-px rounded-sm"
                  style={{ background: `var(--cat-${(i % 8) + 1})` }}
                />
                <span className="min-w-0 flex-1 truncate">
                  {a.goal.name}
                  <span className="ml-2 text-ink-3">{fmtMonthYear(a.goal.end_date)}</span>
                </span>
                <span className="tabular-nums">{fmtINR(a.attributed)}</span>
              </li>
            ))}
            {unclaimed.map((r) => (
              <li key={r.name} className="flex items-baseline gap-1.5 text-[0.8125rem]">
                <i
                  className="h-2 w-2 shrink-0 -translate-y-px rounded-sm"
                  style={{ background: "var(--cat-other)" }}
                />
                <span className="min-w-0 flex-1 truncate text-ink-2">
                  Unclaimed — {r.name}
                  <span className="ml-2 text-ink-3">{r.targeted ? "goals full" : "untargeted"}</span>
                </span>
                <span className="tabular-nums text-ink-2">{fmtINR(r.amt)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 font-mono text-[0.6875rem] tabular-nums text-ink-3">
            {fmtINR(totalPool - unclaimedTotal)} claimed + {fmtINR(unclaimedTotal)} unclaimed ={" "}
            {fmtINR(totalPool)} invested
          </p>
          {tiedDueDates.size > 0 && (
            <p className="mt-1 text-[0.6875rem] text-warn">
              {tiedDueDates.size === 1 ? "Two goals share a date" : `${tiedDueDates.size} pairs share a date`}
              ; which fills first is arbitrary. Move one if the order matters.
            </p>
          )}
        </section>
      )}

      {/* ── Where the monthly money should go ────────────────────────────── */}
      {monthlyByClass.length > 0 && (
        <section className="rounded-xl border border-rule bg-surface p-4">
          <h2 className="text-sm font-medium">Where the monthly money goes</h2>
          <p className="mt-0.5 text-xs text-ink-3">{fmtINR(required)}, split by class.</p>
          <ul className="mt-3 divide-y divide-rule-soft">
            {monthlyByClass.map((r) => (
              <li key={r.name} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                <span className="truncate">
                  {r.name}
                  <span className="ml-2 text-xs text-ink-3">holding {fmtCompact(r.poolNow)}</span>
                </span>
                <span className="shrink-0 font-medium tabular-nums">{fmtINR(r.amt)}/mo</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {inactive.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-medium">Achieved / archived</h2>
          <ul className="divide-y divide-rule overflow-hidden rounded-xl border border-rule bg-surface">
            {inactive.map((g) => (
              <li key={g.id}>
                <Link
                  href={`/goals/${g.id}`}
                  className="flex items-center justify-between px-4 py-3 hover:bg-surface-2"
                >
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
        <Disclose label="Add a goal" tone="primary">
          <CreateGoalForm />
        </Disclose>
      </section>

      {/* ── The numbers every verdict above rests on ─────────────────────── */}
      <section className="rounded-xl border border-rule bg-surface p-4">
        <h2 className="text-sm font-medium">Expected returns</h2>
        <p className="mt-0.5 text-xs text-ink-3">
          Assumed growth per asset class. Every figure on this page moves with them.
        </p>
        <div className="mt-3">
          <AssetClassesEditor assetClasses={assetClasses} />
        </div>
      </section>
    </div>
  );
}

const BADGE: Record<GoalVerdict["kind"], { label: string; cls: string }> = {
  "no-plan": { label: "no plan", cls: "bg-warn-soft text-warn" },
  due: { label: "due now", cls: "bg-warn-soft text-warn" },
  "on-track": { label: "on track", cls: "bg-up-soft text-up" },
  behind: { label: "behind", cls: "bg-down-soft text-down" },
};

function GoalCard({
  a,
  monthly,
}: {
  a: GoalAnalysis;
  monthly: number;
}) {
  const { goal, projection: p, attributed } = a;
  const v = goalVerdict(a);
  const badge = BADGE[v.kind];

  const coveragePct = Math.min(100, Math.max(attributed > 0 ? 1.5 : 0, a.coverage * 100));
  const barTone = v.kind === "behind" ? "bg-down" : v.kind === "due" ? "bg-warn" : "bg-up";

  return (
    <div className="rounded-xl border border-rule bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <Link href={`/goals/${goal.id}`} className="min-w-0 hover:underline">
          <div className="truncate text-sm font-medium">{goal.name}</div>
          <div className="mt-0.5 text-xs text-ink-3">
            {fmtMonthYear(goal.end_date)} ·{" "}
            {p.monthsRemaining === 0 ? "due now" : `${formatMonthsLeft(p.monthsRemaining)} left`}

          </div>
        </Link>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${badge.cls}`}
        >
          {badge.label}
        </span>
      </div>

      <div className="mt-3">
        <div className="flex items-baseline justify-between text-[0.6875rem] text-ink-3">
          <span>of what it needs now</span>
          <span className="tabular-nums">{Math.round(a.coverage * 100)}%</span>
        </div>
        <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2">
          <div className={`h-full rounded-full ${barTone}`} style={{ width: `${coveragePct}%` }} />
        </div>
      </div>

      <p className="mt-2 text-[0.8125rem] text-ink-2">
        <VerdictLine a={a} v={v} />
      </p>

      <p className="mt-1.5 font-mono text-[0.6875rem] tabular-nums text-ink-3">
        {fmtINR(attributed)} of {fmtCompact(p.fundedCorpus)} needed · {fmtCompact(p.targetCorpus)} by{" "}
        {fmtMonthYear(a.goal.end_date)}
        {monthly > 0 && <> · invest {fmtINR(monthly)}/mo</>}
      </p>
    </div>
  );
}

/** One line per verdict. */
function VerdictLine({ a, v }: { a: GoalAnalysis; v: GoalVerdict }) {
  const { projection: p } = a;
  switch (v.kind) {
    case "no-plan":
      return (
        <>
          No glide path set.{" "}
          <Link href={`/goals/${a.goal.id}`} className="underline">
            Set one
          </Link>
          .
        </>
      );
    case "due":
      return v.short > 0.5 ? (
        <>Due now, short {fmtINR(v.short)}.</>
      ) : (
        <>Due now and met.</>
      );
    case "on-track":
      return <>Fully funded — left alone, it reaches {fmtCompact(p.targetCorpus)} on time.</>;
    case "behind":
      return <>Short {fmtINR(v.short)} of what it needs to get there on its own.</>;
  }
}
