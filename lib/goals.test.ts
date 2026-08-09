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
  marketValueOf,
  planSummary,
  poolByAssetClass,
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
  allocs = [alloc(g.id, "equity", 120, 100), alloc(g.id, "fixed", 0, 100)],
) {
  const { analyses } = analyzeGoals([g], byGoal(allocs), classes, pool, now);
  return analyses[0];
}

test("a goal with no glide path reports no plan, never a grade", () => {
  const g = goal({ id: "g", end_date: "2030-01-01" });
  const { analyses } = analyzeGoals([g], new Map(), classes, new Map(), "2026-01-01");
  assert.equal(goalVerdict(analyses[0]).kind, "no-plan");
});

test("a goal holding enough to reach its target unaided is funded", () => {
  const flat = [assetClass("vault", 0)];
  const g = goal({ id: "g", end_date: "2029-01-01", present_cost: 100_000, inflation_rate: 0 });
  const allocs = [alloc("g", "vault", 0, 100), alloc("g", "vault", 120, 100)];
  const { analyses } = analyzeGoals(
    [g], byGoal(allocs), flat, new Map([["vault", 5_000_000]]), "2026-08-09",
  );
  assert.equal(goalVerdict(analyses[0]).kind, "funded");
  assert.ok(analyses[0].coverage >= 1);
});

test("a goal still accumulating is in progress, by the gap", () => {
  const flat = [assetClass("vault", 0)];
  const g = goal({ id: "g", end_date: "2029-01-01", present_cost: 100_000, inflation_rate: 0 });
  const allocs = [alloc("g", "vault", 0, 100), alloc("g", "vault", 120, 100)];
  const { analyses } = analyzeGoals(
    [g], byGoal(allocs), flat, new Map([["vault", 30_000]]), "2026-08-09",
  );
  const v = goalVerdict(analyses[0]);
  assert.equal(v.kind, "in-progress");
  assert.equal(v.kind === "in-progress" && Math.round(v.short), 70_000);
});

test("the verdict does not depend on when the goal row was created", () => {
  // The whole point of the rewrite: two identical goals, created years apart,
  // must read the same. The old model simulated a SIP from created_at, so a
  // freshly created goal needed almost nothing and passed trivially.
  const flat = [assetClass("vault", 0)];
  const allocs = (id: string) => [alloc(id, "vault", 0, 100), alloc(id, "vault", 120, 100)];
  const mk = (id: string, created: string) =>
    goal({ id, created_at: created, end_date: "2029-01-01", present_cost: 100_000, inflation_rate: 0 });

  const old = analyzeGoals(
    [mk("a", "2020-01-01T00:00:00Z")], byGoal(allocs("a")), flat,
    new Map([["vault", 40_000]]), "2026-08-09",
  ).analyses[0];
  const fresh = analyzeGoals(
    [mk("b", "2026-08-01T00:00:00Z")], byGoal(allocs("b")), flat,
    new Map([["vault", 40_000]]), "2026-08-09",
  ).analyses[0];

  assert.equal(goalVerdict(old).kind, goalVerdict(fresh).kind);
  assert.equal(Math.round(old.coverage * 100), Math.round(fresh.coverage * 100));
});

test("the soonest-due goal is funded before a later one gets anything", () => {
  const flat = [assetClass("vault", 0)];
  const soon = goal({ id: "soon", end_date: "2027-01-01", present_cost: 100_000, inflation_rate: 0 });
  const late = goal({ id: "late", end_date: "2035-01-01", present_cost: 100_000, inflation_rate: 0 });
  const allocs = ["soon", "late"].flatMap((id) => [alloc(id, "vault", 0, 100), alloc(id, "vault", 120, 100)]);
  const { analyses } = analyzeGoals(
    [soon, late], byGoal(allocs), flat, new Map([["vault", 100_000]]), "2026-08-09",
  );
  const bySoon = analyses.find((a) => a.goal.id === "soon")!;
  const byLate = analyses.find((a) => a.goal.id === "late")!;
  assert.equal(goalVerdict(bySoon).kind, "funded", "the nearer goal is filled first");
  assert.equal(goalVerdict(byLate).kind, "in-progress");
  assert.equal(byLate.attributed, 0);
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
    analyseOne(g, new Map([["fixed", 50_000]]), "2026-08-09", [
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
