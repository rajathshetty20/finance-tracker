import Link from "next/link";
import { ChevronRight } from "lucide-react";
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
  planSummary,
  poolByAssetClass,
  targetCorpus,
  STEP_UP_RATE,
  type GoalAnalysis,
  type GoalVerdict,
} from "@/lib/goals";
import { cashflowBases } from "@/lib/money";
import { lockFunds, outstandingDebt } from "@/lib/lock";
import { appToday } from "@/lib/demo";
import { currentMonthStartISO, fmtINR, fmtMonthYear } from "@/lib/dates";
import Disclose from "../Disclose";
import CreateGoalForm from "../goals/CreateGoalForm";
import AssetClassesEditor from "../goals/AssetClassesEditor";
import { GOAL_VERDICT_STYLE, assetClassColor } from "@/app/ui";

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

  // Locked funds come off the top, so the waterfall only ever distributes
  // corpus that is genuinely free. See lib/lock.ts for why the EMI is then not
  // also netted off investable income.
  const debts = (debtsData ?? []) as Debt[];
  const payments = (paymentsData ?? []) as DebtPayment[];
  const heldByClass = poolByAssetClass(invs, entriesByInv);
  const lock = lockFunds(heldByClass, outstandingDebt(debts, payments), assetClasses);
  const pool = lock.available;
  const { analyses, surplusByClass } = analyzeGoals(goals, allocByGoal, assetClasses, pool, today);
  const summary = planSummary(analyses);
  const classNameById = new Map(assetClasses.map((c) => [c.id, c.name]));

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
      openDebts: debts.filter((d) => d.status === "open"),
      payments,
      categories: (catsData ?? []) as Category[],
      phaseStartISO: currentPhase.start_date,
      todayISO: today,
      monthStartISO: currentMonthStartISO(today),
    });
  }

  // Round ONCE, then do the arithmetic on the rounded figures, so the numbers
  // printed on this page subtract to the difference also printed on this page.
  // Independently rounding each of five floats left the shown values ₹1 apart.
  const available = bases?.investable == null ? null : Math.round(bases.investable);
  const required = Math.round(summary.requiredMonthly);
  const headroom = available !== null ? available - required : null;


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

  const openDebtCount = debts.filter((d) => d.status === "open").length;
  const weightsSet = assetClasses.some((c) => Number(c.lock_weight) > 0);
  const classOrder = assetClasses.map((c) => c.id);
  const lockedRows = [...lock.lockedByClass.entries()]
    .filter(([, amt]) => amt > 0.5)
    .map(([id, amt]) => ({
      id,
      name: classNameById.get(id) ?? "—",
      amt,
      share: lock.amount > 0 ? amt / lock.amount : 0,
    }))
    .sort((x, y) => y.amt - x.amt);

  const byDueDate = [...analyses].sort(
    (a, b) => a.projection.monthsRemaining - b.projection.monthsRemaining,
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
                {fmtINR(available)} investable − {fmtINR(required)} the plan needs ={" "}
                {headroom >= 0 ? "+" : "−"}
                {fmtINR(Math.abs(headroom))}
              </p>
            </>
          ) : (
            <p className="mt-3 text-sm text-ink-3">
              Log a completed month of income and spending and this page can say whether the plan is
              affordable.
            </p>
          )}
        </section>
      )}

      {/* ── Locked before anything is claimed ────────────────────────────── */}
      {lock.amount > 0 && (
        <section className="rounded-xl border border-rule bg-surface p-4">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-medium">Locked funds</h2>
            <span className="tabular-nums text-sm font-semibold">{fmtINR(lock.amount)}</span>
          </div>
          <p className="mt-0.5 text-xs text-ink-3">
            Debt repayment across {openDebtCount} open debt{openDebtCount === 1 ? "" : "s"}, held
            back before any goal claims from the pool.
          </p>

          {lockedRows.length > 0 && (
            <ul className="mt-3 space-y-1">
              {lockedRows.map((r) => (
                <li key={r.id} className="flex items-center gap-2 text-xs">
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ background: assetClassColor(r.id, classOrder) }}
                  />
                  <span className="flex-1 truncate">{r.name}</span>
                  <span className="tabular-nums text-ink-3">{Math.round(r.share * 100)}%</span>
                  <span className="w-20 text-right tabular-nums">{fmtINR(r.amt)}</span>
                </li>
              ))}
            </ul>
          )}

          <p className="mt-2 text-xs text-ink-3">
            {weightsSet
              ? "Split by the lock shares set under Asset classes below."
              : "Split pro-rata across what you hold. Set lock shares under Asset classes below to choose where it comes from."}
          </p>

          {lock.unbacked > 0.5 && (
            <p className="mt-2 rounded-lg border border-down/30 bg-down/[0.07] p-2 text-xs">
              {fmtINR(lock.unbacked)} of the debt is not backed by any holding — you owe more than
              the portfolio is worth, so the goals below are working with nothing held back for it.
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
            {fmtCompact(totalPool)} free to claim{lock.amount > 0 && <> after the lock</>},
            claimed soonest-due first.
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
                  <span className="ml-2 text-ink-3">
                    ({r.targeted ? "goals full" : "untargeted"})
                  </span>
                </span>
                <span className="tabular-nums text-ink-2">{fmtINR(r.amt)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 font-mono text-[0.6875rem] tabular-nums text-ink-3">
            {fmtINR(totalPool - unclaimedTotal)} claimed + {fmtINR(unclaimedTotal)} unclaimed ={" "}
            {fmtINR(totalPool)} free
          </p>
        </section>
      )}

      {/* ── Where the monthly money should go ────────────────────────────── */}
      {monthlyByClass.length > 0 && (
        <section className="rounded-xl border border-rule bg-surface p-4">
          <h2 className="text-sm font-medium">Where the monthly money goes</h2>
          <p className="mt-0.5 text-xs text-ink-3">
            {fmtINR(required)}, split by class. This year&apos;s figure — contributions are assumed
            to rise {Math.round(STEP_UP_RATE * 100)}% a year.
          </p>
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
                  className="flex items-baseline justify-between gap-3 px-4 py-3 hover:bg-surface-2"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-ink-2">{g.name}</span>
                    <span className="block text-[0.6875rem] text-ink-3">
                      {g.status} · {fmtMonthYear(g.end_date)}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1 text-[0.8125rem] tabular-nums text-ink-3">
                    {fmtCompact(targetCorpus(g))}
                    <ChevronRight className="h-3.5 w-3.5" />
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
        <h2 className="text-sm font-medium">Asset classes</h2>
        <p className="mt-0.5 text-xs text-ink-3">
          Assumed growth per class, and the share of locked funds each one gives up. Every figure
          on this page moves with them.
        </p>
        <div className="mt-3">
          <AssetClassesEditor assetClasses={assetClasses} />
        </div>
      </section>
    </div>
  );
}

function GoalCard({
  a,
  monthly,
}: {
  a: GoalAnalysis;
  monthly: number;
}) {
  const { goal, projection: p, attributed } = a;
  const v = goalVerdict(a);
  const style = GOAL_VERDICT_STYLE[v.kind];

  const coveragePct = Math.min(100, Math.max(attributed > 0 ? 1.5 : 0, a.coverage * 100));

  return (
    <Link
      href={`/goals/${goal.id}`}
      className="block rounded-xl border border-rule bg-surface p-4 transition-colors hover:bg-surface-2"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1">
            <span className="truncate text-sm font-medium">{goal.name}</span>
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-ink-3" />
          </div>
          <div className="mt-0.5 text-xs text-ink-3">
            {fmtMonthYear(goal.end_date)} ·{" "}
            {p.monthsRemaining === 0 ? "due now" : `${formatMonthsLeft(p.monthsRemaining)} left`}
          </div>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${style.badge}`}
        >
          {style.label}
        </span>
      </div>

      <div className="mt-3">
        <div className="flex justify-end text-[0.6875rem] tabular-nums text-ink-3">
          {Math.round(a.coverage * 100)}%
        </div>
        <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2">
          <div className={`h-full rounded-full ${style.bar}`} style={{ width: `${coveragePct}%` }} />
        </div>
      </div>

      <p className="mt-2 text-[0.8125rem] text-ink-2">
        <VerdictLine a={a} v={v} />
      </p>

      <p className="mt-1.5 font-mono text-[0.6875rem] tabular-nums text-ink-3">
        {/* Exact, not compact: when the two are close both render "₹5.5L" and
            the line reads "₹5.5L that would coast to ₹5.5L". */}
        {v.kind === "funded" ? (
          <>{fmtINR(attributed)} held</>
        ) : (
          <>
            {fmtINR(attributed)} of {fmtINR(p.fundedCorpus)}
          </>
        )}{" "}
        · target {fmtCompact(p.targetCorpus)} by {fmtMonthYear(a.goal.end_date)}
        {monthly > 0 && <> · invest {fmtINR(monthly)}/mo</>}
      </p>
    </Link>
  );
}

/** One line per verdict. */
function VerdictLine({ a, v }: { a: GoalAnalysis; v: GoalVerdict }) {
  const { projection: p } = a;
  switch (v.kind) {
    case "no-plan":
      return (
        <>
          No glide path set.
        </>
      );
    case "due":
      return v.short > 0.5 ? (
        <>Due now, short {fmtINR(v.short)}.</>
      ) : (
        <>Due now and met.</>
      );
    case "funded":
      return (
        <>
          Fully funded — left alone it reaches {fmtCompact(p.targetCorpus)} on time, with no
          further investing.
        </>
      );
    case "in-progress":
      return (
        <>
          Still accumulating — {fmtINR(v.short)} short of the point where it would reach the
          target on its own.
        </>
      );
  }
}
