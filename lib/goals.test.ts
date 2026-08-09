// The goal engine's arithmetic, and the two verdict bugs that reached a review.
//
// Run with `npm test` after touching lib/goals.ts. These cover the cases that
// tsc, eslint and next build all passed while the screen was wrong.

import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzeGoals,
  goalVerdict,
  largestRemainder,
  lowerReturns,
  marketValueAsOf,
  marketValueOf,
  planSummary,
  poolByAssetClass,
  poolValueAsOf,
  projectGoal,
  runWaterfall,
  targetCorpus,
} from "./goals.ts";
import {
  alloc,
  assetClass,
  byGoal,
  byInvestment,
  entry,
  goal,
  investment,
} from "./fixtures.test-helpers.ts";

// ---------------------------------------------------------------------------
// Market value
// ---------------------------------------------------------------------------

test("same-date entries are broken by created_at, not by array order", () => {
  const inv = investment({ id: "inv" });
  // A contribution and a valuation on the same day. Comparing dates alone
  // returns −1 for the tie, so "latest" used to depend on the order the
  // database happened to return — the same holding read differently by lakhs.
  const contribution = entry({
    id: "a",
    investment_id: "inv",
    date: "2026-03-10",
    entry_type: "contribution",
    amount: 50_000,
    total_value_after: 500_000,
    created_at: "2026-03-10T09:00:00Z",
  });
  const valuation = entry({
    id: "b",
    investment_id: "inv",
    date: "2026-03-10",
    entry_type: "valuation",
    amount: 0,
    total_value_after: 512_000,
    created_at: "2026-03-10T18:00:00Z",
  });

  assert.equal(marketValueOf(inv, [contribution, valuation]), 512_000);
  assert.equal(marketValueOf(inv, [valuation, contribution]), 512_000);
});

test("market value as of a past date ignores anything later", () => {
  const inv = investment({ id: "inv" });
  const entries = [
    entry({ id: "a", investment_id: "inv", date: "2025-01-01", total_value_after: 100_000 }),
    entry({ id: "b", investment_id: "inv", date: "2026-01-01", total_value_after: 300_000 }),
  ];
  assert.equal(marketValueAsOf(inv, entries, "2024-06-01"), 0, "before it existed");
  assert.equal(marketValueAsOf(inv, entries, "2025-06-01"), 100_000);
  assert.equal(marketValueAsOf(inv, entries, "2026-06-01"), 300_000);
});

test("a position closed before the date contributes nothing", () => {
  const inv = investment({ id: "inv", status: "closed", closed_on: "2025-12-01" });
  const entries = [
    entry({ id: "a", investment_id: "inv", date: "2025-01-01", total_value_after: 100_000 }),
  ];
  assert.equal(marketValueAsOf(inv, entries, "2026-01-01"), 0);
  assert.equal(marketValueAsOf(inv, entries, "2025-06-01"), 100_000);
});

test("poolValueAsOf sums every holding at that date", () => {
  const invs = [investment({ id: "a" }), investment({ id: "b" })];
  const entries = byInvestment([
    entry({ id: "1", investment_id: "a", date: "2025-01-01", total_value_after: 100_000 }),
    entry({ id: "2", investment_id: "b", date: "2025-07-01", total_value_after: 250_000 }),
  ]);
  assert.equal(poolValueAsOf(invs, entries, "2025-03-01"), 100_000);
  assert.equal(poolValueAsOf(invs, entries, "2025-12-01"), 350_000);
});

// ---------------------------------------------------------------------------
// Rounding
// ---------------------------------------------------------------------------

test("largestRemainder parts sum to the rounded total, exactly", () => {
  // The failure this exists for: rounding each share independently printed a
  // breakdown adding to ₹72,422 under a headline of ₹72,423.
  const items = ["a", "b", "c"];
  const w = new Map([["a", 1], ["b", 1], ["c", 1]]);
  const out = largestRemainder(items, (i) => w.get(i)!, 100_000.4);
  const sum = [...out.values()].reduce((s, v) => s + v, 0);
  assert.equal(sum, 100_000);
  for (const v of out.values()) assert.ok(Number.isInteger(v));
});

test("largestRemainder handles zero weights and empty input", () => {
  const zero = largestRemainder(["a", "b"], () => 0, 500);
  assert.deepEqual([...zero.values()], [0, 0]);
  assert.equal(largestRemainder([], () => 1, 500).size, 0);
});

// ---------------------------------------------------------------------------
// Verdicts
// ---------------------------------------------------------------------------

const classes = [assetClass("equity", 12), assetClass("fixed", 7)];

/** Build a one-goal analysis with full control over the pool and glide path. */
function analyseOne(
  g: ReturnType<typeof goal>,
  pool: Map<string, number>,
  now: string,
  poolAt?: (iso: string) => number,
  allocs = [alloc(g.id, "equity", 120, 100), alloc(g.id, "fixed", 0, 100)],
) {
  const { analyses } = analyzeGoals([g], byGoal(allocs), classes, pool, now, poolAt);
  return analyses[0];
}

test("a goal with no glide path reports no plan, never a grade", () => {
  const g = goal({ id: "g", end_date: "2030-01-01" });
  const { analyses } = analyzeGoals([g], new Map(), classes, new Map(), "2026-01-01");
  assert.equal(goalVerdict(analyses[0]).kind, "no-plan");
});

test("a plan younger than six months is not graded", () => {
  const g = goal({ id: "g", created_at: "2026-06-01T00:00:00Z", end_date: "2032-01-01" });
  const v = goalVerdict(analyseOne(g, new Map([["equity", 200_000]]), "2026-08-09"));
  assert.equal(v.kind, "no-history");
  assert.equal(v.kind === "no-history" && v.monthsElapsed, 2);
});

test("holding the full target reports funded even on a young plan", () => {
  // "funded" is a fact about today and rests on no assumption, so it outranks
  // the age gate. It is only reachable when the glide assumes no growth —
  // otherwise runWaterfall caps attribution at fundedCorpus, which is by
  // definition below the target.
  const flat = [assetClass("vault", 0)];
  const g = goal({
    id: "g",
    created_at: "2026-06-01T00:00:00Z",
    end_date: "2027-01-01",
    present_cost: 100_000,
    inflation_rate: 0,
  });
  const allocs = [alloc("g", "vault", 0, 100), alloc("g", "vault", 120, 100)];
  const { analyses } = analyzeGoals(
    [g],
    byGoal(allocs),
    flat,
    new Map([["vault", 5_000_000]]),
    "2026-08-09",
  );
  assert.equal(goalVerdict(analyses[0]).kind, "funded");
});

test("a young plan that would grow into its target is still not a pass", () => {
  // The verdict this ordering exists to prevent: a 33-year goal two months old
  // reporting "will fund itself" off ₹19.7L against ₹34.7Cr, a claim resting
  // entirely on one typed-in rate held for three decades.
  const g = goal({
    id: "retirement",
    created_at: "2026-06-01T00:00:00Z",
    end_date: "2059-09-13",
    present_cost: 50_000_000,
    inflation_rate: 6,
  });
  const v = goalVerdict(
    analyseOne(g, new Map([["equity", 20_000_000]]), "2026-08-09", undefined, [
      alloc("retirement", "equity", 0, 100),
      alloc("retirement", "equity", 360, 100),
    ]),
  );
  assert.equal(v.kind, "no-history", "must not read as funded on two months of history");
  assert.equal(
    v.kind === "no-history" && v.wouldFundItself,
    true,
    "but the projection is still worth reporting, as a projection",
  );
});

test("the badge band uses the same rounding the page prints", () => {
  // 89.76% displayed as "90%" while the badge said "behind" — the threshold
  // compared the raw ratio, the page printed a rounded one.
  const a = {
    projection: {
      hasPlan: true,
      monthsRemaining: 60,
      monthsElapsed: 24,
      plannedCorpusNow: 1_000_000,
      targetCorpus: 5_000_000,
      fundedCorpus: 4_000_000,
    },
    attributed: 897_600,
    schedulePct: 0.8976,
  } as never;
  assert.equal(goalVerdict(a).kind, "slightly-behind");
});

test("verdict bands step down through on-track, slightly behind, behind", () => {
  const mk = (schedulePct: number) =>
    goalVerdict({
      projection: {
        hasPlan: true,
        monthsRemaining: 60,
        monthsElapsed: 24,
        plannedCorpusNow: 1_000_000,
        targetCorpus: 5_000_000,
        fundedCorpus: 4_000_000,
      },
      attributed: 1_000_000 * schedulePct,
      schedulePct,
    } as never).kind;

  assert.equal(mk(1.2), "on-track");
  assert.equal(mk(1.0), "on-track");
  assert.equal(mk(0.95), "slightly-behind");
  assert.equal(mk(0.7), "behind");
});

test("a goal past its date reports due, with the shortfall", () => {
  const g = goal({
    id: "g",
    created_at: "2024-01-01T00:00:00Z",
    end_date: "2026-01-01",
    present_cost: 200_000,
    inflation_rate: 0,
  });
  const v = goalVerdict(
    analyseOne(g, new Map([["fixed", 50_000]]), "2026-08-09", undefined, [
      alloc("g", "fixed", 0, 100),
      alloc("g", "fixed", 120, 100),
    ]),
  );
  assert.equal(v.kind, "due");
  assert.ok(v.kind === "due" && v.short > 0);
});

// ---------------------------------------------------------------------------
// The starting-corpus anchor
// ---------------------------------------------------------------------------

test("the planned path starts from what the goal could already claim", () => {
  // The bug: the plan assumed the owner held nothing on the day the goal row
  // was inserted. Anyone tracking an existing portfolio then divided a real
  // corpus by two instalments' worth of plan and read thousands of percent.
  const g = goal({
    id: "retirement",
    created_at: "2026-06-20T00:00:00Z",
    end_date: "2059-09-13",
    present_cost: 50_000_000,
    inflation_rate: 6,
  });
  const pool = new Map([["equity", 2_000_000]]);
  const poolAt = () => 1_900_000; // the portfolio predates the goal

  const withoutAnchor = analyseOne(g, pool, "2026-08-09");
  const withAnchor = analyseOne(g, pool, "2026-08-09", poolAt);

  assert.ok(
    withoutAnchor.schedulePct > 20,
    `unanchored ratio should be absurd, got ${withoutAnchor.schedulePct}`,
  );
  assert.ok(
    withAnchor.schedulePct > 0.5 && withAnchor.schedulePct < 2,
    `anchored ratio should be near 1, got ${withAnchor.schedulePct}`,
  );
});

test("the anchored schedule does not lurch as the calendar moves", () => {
  // Same rows, six months later, nothing bought or sold: the grade must not
  // swing by hundreds of points.
  const g = goal({
    id: "retirement",
    created_at: "2026-06-20T00:00:00Z",
    end_date: "2059-09-13",
    present_cost: 50_000_000,
    inflation_rate: 6,
  });
  const pool = new Map([["equity", 2_000_000]]);
  const poolAt = () => 1_900_000;

  const now = analyseOne(g, pool, "2026-08-09", poolAt).schedulePct;
  const later = analyseOne(g, pool, "2027-02-09", poolAt).schedulePct;
  assert.ok(
    Math.abs(now - later) < 0.5,
    `schedule moved from ${now} to ${later} with no data change`,
  );
});

// ---------------------------------------------------------------------------
// Waterfall and summary
// ---------------------------------------------------------------------------

test("the waterfall fills the soonest-due goal first", () => {
  const { fills } = runWaterfall(
    [
      { goalId: "far", monthsRemaining: 120, needByClass: new Map([["eq", 100]]), capByClass: new Map([["eq", 100]]) },
      { goalId: "soon", monthsRemaining: 6, needByClass: new Map([["eq", 100]]), capByClass: new Map([["eq", 100]]) },
    ],
    new Map([["eq", 100]]),
  );
  assert.equal(fills.get("soon")!.attributed, 100);
  assert.equal(fills.get("far")!.attributed, 0);
});

test("a class no goal targets is reported as surplus, not forced onto a goal", () => {
  const { fills, surplusByClass } = runWaterfall(
    [{ goalId: "g", monthsRemaining: 12, needByClass: new Map([["eq", 50]]), capByClass: new Map([["eq", 50]]) }],
    new Map([["eq", 50], ["deposit", 57_600]]),
  );
  assert.equal(fills.get("g")!.attributed, 50);
  assert.equal(surplusByClass.get("deposit"), 57_600);
});

test("planSummary breakdowns reconcile with the headline", () => {
  const gs = [
    goal({ id: "a", created_at: "2024-01-01T00:00:00Z", end_date: "2031-01-01", present_cost: 3_000_000 }),
    goal({ id: "b", created_at: "2024-01-01T00:00:00Z", end_date: "2035-01-01", present_cost: 8_000_000 }),
  ];
  const allocs = gs.flatMap((g) => [alloc(g.id, "equity", 120, 100), alloc(g.id, "fixed", 0, 100)]);
  const { analyses } = analyzeGoals(
    gs,
    byGoal(allocs),
    classes,
    new Map([["equity", 1_000_000]]),
    "2026-08-09",
  );
  const s = planSummary(analyses);
  const total = Math.round(s.requiredMonthly);
  const byClassSum = [...s.byClass.values()].reduce((x, y) => x + y, 0);
  const byGoalSum = [...s.byGoal.values()].reduce((x, y) => x + y, 0);
  assert.equal(byClassSum, total, "per-class parts must sum to the headline");
  assert.equal(byGoalSum, total, "per-goal parts must sum to the headline");
});

test("lower returns raise what the plan demands", () => {
  const g = goal({ id: "g", created_at: "2024-01-01T00:00:00Z", end_date: "2036-01-01" });
  const allocs = [alloc("g", "equity", 120, 100), alloc("g", "fixed", 0, 100)];
  const base = analyzeGoals(
    [g], byGoal(allocs), classes, new Map([["equity", 100_000]]), "2026-08-09",
  ).analyses[0].requiredMonthly;
  const stressed = analyzeGoals(
    [g], byGoal(allocs), lowerReturns(classes, 3), new Map([["equity", 100_000]]), "2026-08-09",
  ).analyses[0].requiredMonthly;
  assert.ok(stressed > base, `stressed ${stressed} should exceed base ${base}`);
});

test("lowerReturns floors at zero and leaves names alone", () => {
  const out = lowerReturns([assetClass("deposit", 2)], 3);
  assert.equal(out[0].expected_return, 0);
  assert.equal(out[0].name, "deposit");
});

// ---------------------------------------------------------------------------
// Target corpus
// ---------------------------------------------------------------------------

test("the target inflates from the plan's start, not from today", () => {
  // This is why the page says "at Feb 2025 prices" rather than "today": the
  // label, not the arithmetic, was what made it look wrong.
  const g = goal({
    id: "g",
    created_at: "2024-01-01T00:00:00Z",
    end_date: "2034-01-01",
    present_cost: 1_000_000,
    inflation_rate: 6,
  });
  assert.equal(Math.round(targetCorpus(g)), Math.round(1_000_000 * 1.06 ** 10));
});

test("a goal due at creation needs its full target immediately", () => {
  const g = goal({
    id: "g",
    created_at: "2026-08-09T00:00:00Z",
    end_date: "2026-08-09",
    present_cost: 200_000,
    inflation_rate: 0,
  });
  const p = projectGoal(g, [alloc("g", "fixed", 0, 100)], classes, "2026-08-09");
  assert.equal(p.totalMonths, 0);
  assert.equal(Math.round(p.plannedCorpusNow), 200_000);
});

test("poolByAssetClass skips unclassified and closed holdings", () => {
  const invs = [
    investment({ id: "a", asset_class_id: "equity" }),
    investment({ id: "b", asset_class_id: null }),
    investment({ id: "c", asset_class_id: "equity", status: "closed", closed_on: "2025-01-01" }),
  ];
  const entries = byInvestment([
    entry({ id: "1", investment_id: "a", total_value_after: 100 }),
    entry({ id: "2", investment_id: "b", total_value_after: 999 }),
    entry({ id: "3", investment_id: "c", total_value_after: 999 }),
  ]);
  const pool = poolByAssetClass(invs, entries);
  assert.deepEqual([...pool.entries()], [["equity", 100]]);
});
