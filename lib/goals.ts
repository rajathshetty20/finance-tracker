// Goal-based investing engine. Pure functions, no DB access.
//
// A goal needs `targetCorpus` (today's cost inflated to the goal date). A
// glide path (goal_allocations) says what % of each asset class the corpus
// should hold as the goal approaches. From that we derive, for any date:
//   - the planned on-track corpus today (simulate the goal's own SIP plan), and
//   - the per-asset-class holding the goal needs RIGHT NOW.
//
// Investments are NOT owned by goals. They sit in one pool, classified by asset
// class. `runWaterfall` distributes that pool across goals by how soon they're
// due (nearest end-date filled first); surplus in a class goes to the furthest
// goal that targets it. A goal is on track only if every class need is filled.

import type { AssetClass, Goal, GoalAllocation, Investment, InvestmentEntry } from "./types";

// Format a remaining duration in months as "years and months". Under a year we
// show only months (e.g. "8m"); otherwise years + months ("1y 4m", "2y").
export function formatMonthsLeft(monthsRemaining: number): string {
  const m = Math.max(0, Math.round(monthsRemaining));
  if (m < 12) return `${m}m`;
  const years = Math.floor(m / 12);
  const months = m % 12;
  return months === 0 ? `${years}y` : `${years}y ${months}m`;
}

// ---------------------------------------------------------------------------
// Investment pool
// ---------------------------------------------------------------------------

/** Latest valuation of an open investment; closed → 0. */
export function marketValueOf(inv: Investment, entries: InvestmentEntry[]): number {
  if (inv.status === "closed") return 0;
  // Two entries can share a date (a contribution and a same-day valuation), and
  // the rows arrive unordered. Comparing only `date` returns −1 for a tie, so
  // which one counted as "latest" depended on the order the DB happened to
  // return — the same holding could read differently on two pages, by lakhs.
  // created_at breaks the tie, matching lib/investmentSeries.ts.
  const latest = [...entries].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return a.created_at < b.created_at ? 1 : -1;
  })[0];
  return latest ? Number(latest.total_value_after) : 0;
}



/** Market value of all open investments, grouped by asset class id. */
export function poolByAssetClass(
  invs: Investment[],
  entriesByInv: Map<string, InvestmentEntry[]>,
): Map<string, number> {
  const pool = new Map<string, number>();
  for (const inv of invs) {
    if (!inv.asset_class_id) continue;
    const v = marketValueOf(inv, entriesByInv.get(inv.id) ?? []);
    if (v === 0) continue;
    pool.set(inv.asset_class_id, (pool.get(inv.asset_class_id) ?? 0) + v);
  }
  return pool;
}

// ---------------------------------------------------------------------------
// Date / rate helpers
// ---------------------------------------------------------------------------

function isoMonthIndex(iso: string): number {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  return y * 12 + (m - 1);
}

/** Whole months from `aISO` to `bISO` (b − a); may be negative. Day-of-month ignored. */
export function monthsBetween(aISO: string, bISO: string): number {
  return isoMonthIndex(bISO) - isoMonthIndex(aISO);
}

/** Annual % (12 → 0.12) converted to an equivalent monthly compounding rate. */
function monthlyRate(annualPct: number): number {
  return Math.pow(1 + Number(annualPct) / 100, 1 / 12) - 1;
}

/** Assumed annual step-up in the monthly SIP (10% — contributions grow each year). */
export const STEP_UP_RATE = 0.1;

// ---------------------------------------------------------------------------
// Glide path
// ---------------------------------------------------------------------------

type GlidePoint = { m: number; pct: number };
type Glide = Map<string, GlidePoint[]>; // asset_class_id → breakpoints sorted by months_before_end asc

export function buildGlide(allocations: GoalAllocation[]): Glide {
  // A milestone (months_before_end) applies to EVERY class: a class with no row
  // at that milestone is 0% there. We reconstruct the full grid so that storing
  // only the non-zero cells (saveGlidePath drops zeros) can't strand a class on
  // a single point — which would otherwise hold it flat across all time.
  const milestones = [...new Set(allocations.map((a) => a.months_before_end))].sort((x, y) => x - y);

  const stored = new Map<string, Map<number, number>>();
  for (const a of allocations) {
    const m = stored.get(a.asset_class_id) ?? new Map<number, number>();
    m.set(a.months_before_end, Number(a.target_pct));
    stored.set(a.asset_class_id, m);
  }

  const g: Glide = new Map();
  for (const [cls, monthMap] of stored) {
    g.set(
      cls,
      milestones.map((m) => ({ m, pct: monthMap.get(m) ?? 0 })),
    );
  }
  return g;
}

/** Target % for one asset class at `remaining` months out (linear interp, held flat past the ends). */
function pctForClassAt(points: GlidePoint[], remaining: number): number {
  if (points.length === 0) return 0;
  if (remaining <= points[0].m) return points[0].pct;
  const last = points[points.length - 1];
  if (remaining >= last.m) return last.pct;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (remaining >= a.m && remaining <= b.m) {
      const t = (remaining - a.m) / (b.m - a.m);
      return a.pct + t * (b.pct - a.pct);
    }
  }
  return last.pct;
}

/** Target allocation across all classes at `remaining` months out, as fractions summing to 1. */
export function targetAllocAt(glide: Glide, remaining: number): Map<string, number> {
  const raw = new Map<string, number>();
  let sum = 0;
  for (const [cls, pts] of glide) {
    const p = pctForClassAt(pts, remaining);
    raw.set(cls, p);
    sum += p;
  }
  const out = new Map<string, number>();
  if (sum <= 0) return out;
  for (const [cls, p] of raw) out.set(cls, p / sum);
  return out;
}

// ---------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------

function blendedMonthlyReturn(
  glide: Glide,
  monthlyReturns: Map<string, number>,
  remaining: number,
): number {
  const alloc = targetAllocAt(glide, remaining);
  let g = 0;
  for (const [cls, frac] of alloc) g += frac * (monthlyReturns.get(cls) ?? 0);
  return g;
}

/**
 * Corpus at each elapsed month 0..steps (length steps+1). path[0] is the
 * starting corpus before any contribution. Each month: contribute the SIP for
 * that month, then grow at the blended return for the months remaining.
 *
 * `P` is the year-1 monthly SIP; the contribution steps up by STEP_UP_RATE every
 * 12 months. Contribution stays linear in P (factor known per month), so the
 * affine two-evaluation solve in solveSIP still holds.
 */
function simulatePath(
  start: number,
  P: number,
  startRemaining: number,
  steps: number,
  glide: Glide,
  monthlyReturns: Map<string, number>,
): number[] {
  const path = [start];
  let c = start;
  for (let j = 0; j < steps; j++) {
    const g = blendedMonthlyReturn(glide, monthlyReturns, startRemaining - j);
    const contribution = P * Math.pow(1 + STEP_UP_RATE, Math.floor(j / 12));
    c = (c + contribution) * (1 + g);
    path.push(c);
  }
  return path;
}

/**
 * Monthly SIP needed to reach `target` from `start` over `steps` months.
 * Ending corpus is affine in P, so two evaluations pin the line exactly.
 */
function solveSIP(
  start: number,
  target: number,
  startRemaining: number,
  steps: number,
  glide: Glide,
  monthlyReturns: Map<string, number>,
): number {
  if (steps <= 0) return 0;
  const e0 = simulatePath(start, 0, startRemaining, steps, glide, monthlyReturns).at(-1)!;
  const e1 = simulatePath(start, 1, startRemaining, steps, glide, monthlyReturns).at(-1)!;
  const slope = e1 - e0;
  if (slope <= 0) return 0;
  return Math.max(0, (target - e0) / slope);
}

// ---------------------------------------------------------------------------
// Per-goal projection
// ---------------------------------------------------------------------------

export type GoalProjection = {
  hasPlan: boolean;
  monthsRemaining: number; // now → end_date
  targetCorpus: number; // today's cost inflated to the goal date
  /**
   * The corpus that, held today and left alone, reaches targetCorpus by the
   * goal's date at the assumed returns. This is what the goal NEEDS.
   *
   * It replaces a simulated SIP path that started at ₹0 on the day the goal
   * row was inserted. That made "on track" depend on when you happened to
   * create the goal rather than on what you hold — a two-month-old plan needed
   * almost nothing, so any real portfolio passed trivially.
   */
  fundedCorpus: number;
  targetHoldingNow: Map<string, number>; // fundedCorpus split by the glide path
  targetAllocNow: Map<string, number>; // per asset class target fraction (0..1) right now
};

/** Corpus needed at the goal date: today's cost inflated over created_at → end_date. */
export function targetCorpus(goal: Goal): number {
  const N = Math.max(0, monthsBetween(goal.created_at.slice(0, 10), goal.end_date));
  return Number(goal.present_cost) * Math.pow(1 + Number(goal.inflation_rate) / 100, N / 12);
}

export function projectGoal(
  goal: Goal,
  allocations: GoalAllocation[],
  assetClasses: AssetClass[],
  nowISO: string,
): GoalProjection {
  const monthsRemaining = Math.max(0, monthsBetween(nowISO, goal.end_date));
  const target = targetCorpus(goal);
  const glide = buildGlide(allocations);
  const hasPlan = glide.size > 0;

  const monthlyReturns = new Map(
    assetClasses.map((ac) => [ac.id, monthlyRate(Number(ac.expected_return))]),
  );

  let fundedCorpus = target;
  const targetHoldingNow = new Map<string, number>();
  const targetAllocNow = new Map<string, number>();

  if (hasPlan) {
    // Growth of one rupee left alone until the goal date, blended across the
    // glide path. A goal due today needs its whole target in hand.
    const growth =
      monthsRemaining > 0
        ? simulatePath(1, 0, monthsRemaining, monthsRemaining, glide, monthlyReturns).at(-1)!
        : 1;
    fundedCorpus = growth > 0 ? target / growth : target;
    for (const [cls, frac] of targetAllocAt(glide, monthsRemaining)) {
      targetAllocNow.set(cls, frac);
      targetHoldingNow.set(cls, fundedCorpus * frac);
    }
  }

  return {
    hasPlan,
    monthsRemaining,
    targetCorpus: target,
    fundedCorpus,
    targetHoldingNow,
    targetAllocNow,
  };
}

/** Monthly SIP needed from now to hit the target, starting from `attributedCorpus`. */
export function forwardSIP(
  goal: Goal,
  allocations: GoalAllocation[],
  assetClasses: AssetClass[],
  attributedCorpus: number,
  nowISO: string,
): number {
  const monthsRemaining = monthsBetween(nowISO, goal.end_date);
  const glide = buildGlide(allocations);
  if (glide.size === 0 || monthsRemaining <= 0) return 0;
  const monthlyReturns = new Map(
    assetClasses.map((ac) => [ac.id, monthlyRate(Number(ac.expected_return))]),
  );
  return solveSIP(
    attributedCorpus,
    targetCorpus(goal),
    monthsRemaining,
    monthsRemaining,
    glide,
    monthlyReturns,
  );
}

// ---------------------------------------------------------------------------
// Planned trajectory (for charting)
// ---------------------------------------------------------------------------

function addMonthsISO(iso: string, months: number): string {
  const d = new Date(iso.slice(0, 10) + "T00:00:00");
  d.setMonth(d.getMonth() + months);
  const tz = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

export type PlannedPoint = { date: string; planned: number; target: number };

/**
 * For each month from now to the goal date: the corpus that would have to be
 * held at that moment to reach the target with no further investing, plus the
 * flat target line.
 *
 * This replaces a simulated SIP path anchored at the goal's creation date. The
 * curve rises to meet the target, and where your holding sits against it is
 * exactly the question the card answers.
 */
export function plannedSeries(
  goal: Goal,
  allocations: GoalAllocation[],
  assetClasses: AssetClass[],
  fromISO: string,
): PlannedPoint[] {
  const months = monthsBetween(fromISO, goal.end_date);
  const glide = buildGlide(allocations);
  const target = targetCorpus(goal);
  if (glide.size === 0 || months <= 0) return [];

  const monthlyReturns = new Map(
    assetClasses.map((ac) => [ac.id, monthlyRate(Number(ac.expected_return))]),
  );

  const out: PlannedPoint[] = [];
  for (let j = 0; j <= months; j++) {
    const remaining = months - j;
    const growth =
      remaining > 0
        ? simulatePath(1, 0, remaining, remaining, glide, monthlyReturns).at(-1)!
        : 1;
    out.push({
      date: addMonthsISO(fromISO, j),
      planned: growth > 0 ? target / growth : target,
      target,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Priority waterfall
// ---------------------------------------------------------------------------

export type WaterfallGoal = {
  goalId: string;
  monthsRemaining: number; // now → end_date; ascending (soonest due) is filled first
  needByClass: Map<string, number>; // on-track holding needed now, per class
  capByClass: Map<string, number>; // corpus per class beyond which the goal is fully funded
};

export type ClassFill = { need: number; filled: number; shortfall: number };

export type GoalFill = {
  goalId: string;
  byClass: Map<string, ClassFill>;
  attributed: number; // total filled, including surplus attributed to this goal
  totalNeed: number;
  onTrack: boolean;
};

export type WaterfallResult = {
  fills: Map<string, GoalFill>;
  surplusByClass: Map<string, number>; // pool not attributed to any goal, per class
};

/**
 * Distribute the pooled market value (per asset class) across goals by how soon
 * they're due (fewest months remaining first), in two passes:
 *   1. on-track: fill each goal's need-now;
 *   2. surplus: top each goal up toward its funded cap (soonest-due first),
 *      so spare money funds the most imminent goals before later ones.
 * Anything left in a class after that — including the whole pool of a class no
 * goal targets — is reported as unallocated surplus, never forced onto a goal.
 */
export function runWaterfall(
  goals: WaterfallGoal[],
  poolByClass: Map<string, number>,
): WaterfallResult {
  const ordered = [...goals].sort(
    (a, b) => a.monthsRemaining - b.monthsRemaining || (a.goalId < b.goalId ? -1 : 1),
  );

  const result = new Map<string, GoalFill>();
  for (const g of ordered) {
    result.set(g.goalId, {
      goalId: g.goalId,
      byClass: new Map(),
      attributed: 0,
      totalNeed: 0,
      onTrack: true,
    });
  }

  const classes = new Set<string>(poolByClass.keys());
  for (const g of goals) for (const c of g.needByClass.keys()) classes.add(c);

  const surplusByClass = new Map<string, number>();

  const give = (goalId: string, cls: string, amt: number) => {
    if (amt <= 0) return;
    const fill = result.get(goalId)!;
    const bc = fill.byClass.get(cls);
    if (bc) bc.filled += amt;
    fill.attributed += amt;
  };

  for (const cls of classes) {
    let remaining = poolByClass.get(cls) ?? 0;

    // Goals that target this class get a fill entry (even with need-now 0).
    const targeting = ordered.filter((g) => g.needByClass.has(cls));
    for (const g of targeting) {
      const need = g.needByClass.get(cls) ?? 0;
      const fill = result.get(g.goalId)!;
      fill.byClass.set(cls, { need, filled: 0, shortfall: need });
      fill.totalNeed += need;
    }

    // Pass 1 — on-track: fill need-now, soonest-due goal first.
    for (const g of targeting) {
      const bc = result.get(g.goalId)!.byClass.get(cls)!;
      const take = Math.min(remaining, bc.need);
      give(g.goalId, cls, take);
      bc.shortfall = bc.need - bc.filled;
      remaining -= take;
    }
    for (const g of targeting) {
      const bc = result.get(g.goalId)!.byClass.get(cls)!;
      if (bc.shortfall > 1e-6) result.get(g.goalId)!.onTrack = false;
    }

    // Pass 2 — surplus toward funded cap, soonest-due goal first.
    for (const g of targeting) {
      if (remaining <= 1e-6) break;
      const bc = result.get(g.goalId)!.byClass.get(cls)!;
      const cap = g.capByClass.get(cls) ?? bc.need;
      const room = Math.max(0, cap - bc.filled);
      const take = Math.min(remaining, room);
      give(g.goalId, cls, take);
      remaining -= take;
    }

    // Leftover (everyone funded, or no goal targets this class) is unallocated.
    if (remaining > 1e-6) {
      surplusByClass.set(cls, (surplusByClass.get(cls) ?? 0) + remaining);
    }
  }
  return { fills: result, surplusByClass };
}

// ---------------------------------------------------------------------------
// Aggregate analysis (what the pages consume)
// ---------------------------------------------------------------------------

export type GoalAnalysis = {
  goal: Goal;
  projection: GoalProjection;
  fill: GoalFill;
  attributed: number;
  fundedPct: number; // attributed / targetCorpus
  /** attributed / fundedCorpus — 1 means the goal is fully funded from the pool. */
  coverage: number;
  requiredMonthly: number; // forward SIP from the attributed corpus
  requiredByClass: Map<string, number>; // requiredMonthly split toward the classes still short
  onTrack: boolean;
};

/**
 * Full analysis for every active goal: projection, the waterfall fill, funded
 * %, on-schedule %, and the monthly SIP still required. Only active goals claim
 * the pool. `allocByGoal` maps goal id → its glide-path rows.
 */
export type GoalsAnalysis = {
  analyses: GoalAnalysis[];
  surplusByClass: Map<string, number>; // invested pool not attributed to any goal
};


export function analyzeGoals(
  goals: Goal[],
  allocByGoal: Map<string, GoalAllocation[]>,
  assetClasses: AssetClass[],
  poolByClass: Map<string, number>,
  nowISO: string,
  /**
   * Total invested market value as at a past date. Supply it (see
   * poolValueAsOf) and each goal's planned path starts from what it could
   * already have claimed on the day its plan began, instead of from zero.
   *
   * Without it the schedule ratio is meaningless for anyone who started
   * tracking an existing portfolio — the denominator is a couple of
   * instalments while the numerator is the whole holding — and it lurches
   * every month as the waterfall reallocates, with no money moving.
   */
): GoalsAnalysis {
  const active = goals.filter((g) => g.status === "active");

  const projections = new Map(
    active.map((g) => [g.id, projectGoal(g, allocByGoal.get(g.id) ?? [], assetClasses, nowISO)]),
  );

  const { fills, surplusByClass } = runWaterfall(
    active.map((g) => {
      const p = projections.get(g.id)!;
      return {
        goalId: g.id,
        monthsRemaining: p.monthsRemaining,
        needByClass: p.targetHoldingNow,
        capByClass: p.targetHoldingNow,
      };
    }),
    poolByClass,
  );

  const analyses = active.map((g) => {
    const projection = projections.get(g.id)!;
    const fill = fills.get(g.id)!;
    const attributed = fill.attributed;
    const requiredMonthly = forwardSIP(
      g,
      allocByGoal.get(g.id) ?? [],
      assetClasses,
      attributed,
      nowISO,
    );
    const fundedPct = projection.targetCorpus > 0 ? attributed / projection.targetCorpus : 0;
    const coverage =
      projection.fundedCorpus > 0 ? attributed / projection.fundedCorpus : attributed > 0 ? 1 : 0;

    // Split the required SIP toward the classes still short of their funded cap,
    // so a class already filled (e.g. one with surplus) gets no new money.
    const shortfall = new Map<string, number>();
    let totalShort = 0;
    for (const [cls, frac] of projection.targetAllocNow) {
      const cap = projection.fundedCorpus * frac;
      const filled = fill.byClass.get(cls)?.filled ?? 0;
      const s = Math.max(0, cap - filled);
      shortfall.set(cls, s);
      totalShort += s;
    }
    const requiredByClass = new Map<string, number>();
    for (const [cls, s] of shortfall) {
      requiredByClass.set(cls, totalShort > 0 ? requiredMonthly * (s / totalShort) : 0);
    }

    return {
      goal: g,
      projection,
      fill,
      attributed,
      fundedPct,
      coverage,
      requiredMonthly,
      requiredByClass,
      onTrack: projection.hasPlan && fill.onTrack,
    };
  });

  return { analyses, surplusByClass };
}

// ---------------------------------------------------------------------------
// Verdicts
// ---------------------------------------------------------------------------

export type GoalVerdict =
  /** No glide path — nothing to project against. */
  | { kind: "no-plan" }
  /** Past its date. `short` is target − attributed, 0 when met. */
  | { kind: "due"; short: number }
  /** Holds everything it needs: left alone, it reaches the target on time. */
  | { kind: "on-track" }
  /** Short of what it needs. `short` is the gap, in rupees. */
  | { kind: "behind"; short: number };

/**
 * The single definition of how a goal is doing.
 *
 * Goals claim from one pool, soonest due first. A goal that received
 * everything it needs is on track; one that did not is behind, by the amount
 * it did not get. That is all — there is no notion of "where a plan says you
 * should be by now", which is what used to make the answer depend on the day
 * the goal row happened to be created.
 */
export function goalVerdict(a: GoalAnalysis): GoalVerdict {
  const { projection: p, attributed } = a;
  if (!p.hasPlan) return { kind: "no-plan" };
  if (p.monthsRemaining === 0) {
    return { kind: "due", short: Math.max(0, p.targetCorpus - attributed) };
  }
  const short = p.fundedCorpus - attributed;
  // A rupee of float: a goal filled to its need should not read as behind.
  if (short <= 0.5) return { kind: "on-track" };
  return { kind: "behind", short };
}

/** Verdicts that should not read as a pass. */
export function verdictIsShort(v: GoalVerdict): boolean {
  return v.kind === "behind" || (v.kind === "due" && v.short > 0.5);
}

// ---------------------------------------------------------------------------
// Plan summary — the one place a monthly total is added up
// ---------------------------------------------------------------------------

/**
 * Distribute `total` across `parts` in whole rupees so the parts sum to
 * `Math.round(total)` exactly. Rounding each part independently is what made
 * "Required / month" print ₹72,423 in one place and a breakdown adding to
 * ₹72,422 in another.
 */
export function largestRemainder<T>(
  items: T[],
  weight: (t: T) => number,
  total: number,
): Map<T, number> {
  const out = new Map<T, number>();
  const target = Math.round(total);
  const sum = items.reduce((s, i) => s + weight(i), 0);
  if (items.length === 0) return out;
  if (sum <= 0) {
    for (const i of items) out.set(i, 0);
    return out;
  }
  const exact = items.map((i) => ({ i, v: (weight(i) / sum) * target }));
  let assigned = 0;
  for (const e of exact) {
    const f = Math.floor(e.v);
    out.set(e.i, f);
    assigned += f;
  }
  const order = [...exact].sort((a, b) => (b.v - Math.floor(b.v)) - (a.v - Math.floor(a.v)));
  for (let k = 0; k < target - assigned; k++) {
    const e = order[k % order.length];
    out.set(e.i, (out.get(e.i) ?? 0) + 1);
  }
  return out;
}

export type PlanSummary = {
  /** Unrounded sum of every active goal's forward SIP. */
  requiredMonthly: number;
  /** Per asset class, in whole rupees, summing exactly to round(requiredMonthly). */
  byClass: Map<string, number>;
  /** Per goal id, in whole rupees, summing exactly to round(requiredMonthly). */
  byGoal: Map<string, number>;
  /** Goals whose verdict is not a pass. */
  shortGoals: GoalAnalysis[];
};

/**
 * Everything a page needs to state what the plan costs per month. Both Home and
 * /plan read this, so the two can no longer print different totals, and the
 * breakdowns add up to the headline by construction.
 */
export function planSummary(analyses: GoalAnalysis[]): PlanSummary {
  const requiredMonthly = analyses.reduce((s, a) => s + a.requiredMonthly, 0);

  const classIds = new Set<string>();
  for (const a of analyses) for (const cls of a.requiredByClass.keys()) classIds.add(cls);
  const classList = [...classIds];
  const classWeight = (cls: string) =>
    analyses.reduce((s, a) => s + (a.requiredByClass.get(cls) ?? 0), 0);

  const perGoal = largestRemainder(analyses, (a) => a.requiredMonthly, requiredMonthly);

  return {
    requiredMonthly,
    byClass: largestRemainder(classList, classWeight, requiredMonthly),
    byGoal: new Map([...perGoal].map(([a, v]) => [a.goal.id, v])),
    shortGoals: analyses.filter((a) => verdictIsShort(goalVerdict(a))),
  };
}

/**
 * The same asset classes with every expected return cut by `points` percentage
 * points (floored at zero), for stating a verdict against a second, stated
 * assumption. Two of this plan's largest goals sit in one asset class, so the
 * whole answer moves with one number typed into a settings box; printing the
 * verdict only at that number gives the reader nothing to disagree with.
 */
export function lowerReturns(classes: AssetClass[], points: number): AssetClass[] {
  return classes.map((c) => ({
    ...c,
    expected_return: Math.max(0, Number(c.expected_return) - points),
  }));
}

/** Percentage points knocked off every expected return for the stress case. */
export const STRESS_POINTS = 3;
