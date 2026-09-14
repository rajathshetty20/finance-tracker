import test from "node:test";
import assert from "node:assert/strict";

import { lockFunds, lockShares, outstandingDebt } from "./lock.ts";
import { analyzeGoals, poolByAssetClass } from "./goals.ts";
import {
  alloc,
  assetClass,
  byGoal,
  byInvestment,
  debt,
  entry,
  goal,
  investment,
  payment,
} from "./fixtures.test-helpers.ts";

const sum = (m: Map<string, number>) => [...m.values()].reduce((a, v) => a + v, 0);

// ---------------------------------------------------------------------------
// Outstanding debt
// ---------------------------------------------------------------------------

test("outstanding is total payable less what has been paid, interest included", () => {
  const d = debt({ id: "d", principal: 500_000, total_payable: 572_400 });
  const ps = [
    payment({ id: "p1", debt_id: "d", amount: 15_900 }),
    payment({ id: "p2", debt_id: "d", amount: 15_900 }),
  ];
  assert.equal(outstandingDebt([d], ps), 572_400 - 31_800);
});

test("an instalment shrinks the lock by exactly its own value", () => {
  // The whole reason the EMI is not also netted off investable income.
  const d = debt({ id: "d", total_payable: 572_400 });
  const before = outstandingDebt([d], []);
  const after = outstandingDebt([d], [payment({ id: "p", debt_id: "d", amount: 15_900 })]);
  assert.equal(before - after, 15_900);
});

test("closed debts are settled and lock nothing", () => {
  const d = debt({ id: "d", status: "closed", closed_on: "2026-01-01" });
  assert.equal(outstandingDebt([d], []), 0);
});

test("overpayment cannot push a debt negative and credit the pool", () => {
  const d = debt({ id: "d", total_payable: 100_000 });
  const ps = [payment({ id: "p", debt_id: "d", amount: 150_000 })];
  assert.equal(outstandingDebt([d], ps), 0);
});

// ---------------------------------------------------------------------------
// Shares
// ---------------------------------------------------------------------------

test("weights are normalised, so 60/40 and 6/4 are one split", () => {
  const pool = new Map([["eq", 100], ["fi", 100]]);
  const big = lockShares([assetClass("eq", 12, 60), assetClass("fi", 7, 40)], pool);
  const small = lockShares([assetClass("eq", 12, 6), assetClass("fi", 7, 4)], pool);
  assert.deepEqual([...big], [...small]);
  assert.equal(big.get("eq"), 0.6);
});

test("with no weights set the lock spreads pro-rata over what is held", () => {
  const pool = new Map([["eq", 750_000], ["fi", 250_000]]);
  const shares = lockShares([assetClass("eq", 12), assetClass("fi", 7)], pool);
  assert.equal(shares.get("eq"), 0.75);
  assert.equal(shares.get("fi"), 0.25);
});

// ---------------------------------------------------------------------------
// Locking
// ---------------------------------------------------------------------------

test("the lock comes off the pool by the configured split", () => {
  const pool = new Map([["eq", 1_000_000], ["fi", 1_000_000]]);
  const r = lockFunds(pool, 400_000, [assetClass("eq", 12, 25), assetClass("fi", 7, 75)]);
  assert.equal(r.lockedByClass.get("eq"), 100_000);
  assert.equal(r.lockedByClass.get("fi"), 300_000);
  assert.equal(r.available.get("eq"), 900_000);
  assert.equal(r.available.get("fi"), 700_000);
  assert.equal(r.unbacked, 0);
});

test("a class that cannot cover its share spills onto the classes with room", () => {
  // Asking 100% from a class holding 200k when the lock is 500k: the other
  // 300k is still committed, and must not be left for the goals to claim.
  const pool = new Map([["fi", 200_000], ["eq", 1_000_000]]);
  const r = lockFunds(pool, 500_000, [assetClass("fi", 7, 100), assetClass("eq", 12, 0)]);
  assert.equal(r.lockedByClass.get("fi"), 200_000);
  assert.equal(r.lockedByClass.get("eq"), 300_000);
  assert.equal(sum(r.lockedByClass), 500_000);
  assert.equal(r.unbacked, 0);
});

test("debt beyond the whole portfolio is reported unbacked, not silently dropped", () => {
  const pool = new Map([["eq", 300_000]]);
  const r = lockFunds(pool, 500_000, [assetClass("eq", 12, 100)]);
  assert.equal(r.lockedByClass.get("eq"), 300_000);
  assert.equal(r.available.get("eq"), 0);
  assert.equal(r.unbacked, 200_000);
});

test("no debt leaves the pool untouched", () => {
  const pool = new Map([["eq", 1_000_000]]);
  const r = lockFunds(pool, 0, [assetClass("eq", 12, 100)]);
  assert.equal(r.amount, 0);
  assert.equal(r.unbacked, 0);
  assert.deepEqual([...r.available], [...pool]);
});

test("locked plus available always equals what is held", () => {
  const pool = new Map([["eq", 640_000], ["fi", 210_000], ["gold", 90_000]]);
  for (const amount of [1, 250_000, 940_000, 2_000_000]) {
    const r = lockFunds(pool, amount, [
      assetClass("eq", 12, 3),
      assetClass("fi", 7, 1),
      assetClass("gold", 8, 0),
    ]);
    assert.ok(
      Math.abs(sum(r.lockedByClass) + sum(r.available) - sum(pool)) < 1e-6,
      `conservation broken at ${amount}`,
    );
    assert.ok(Math.abs(sum(r.lockedByClass) + r.unbacked - amount) < 1e-6);
    for (const v of r.available.values()) assert.ok(v >= -1e-9, "a class went negative");
  }
});

// ---------------------------------------------------------------------------
// Against the goals engine
// ---------------------------------------------------------------------------

test("a lock takes from the goals only once it bites into what they need", () => {
  const classes = [assetClass("eq", 12, 100)];
  const invs = [investment({ id: "i1", asset_class_id: "eq" })];
  const entries = byInvestment([
    entry({
      id: "v1",
      investment_id: "i1",
      date: "2026-01-01",
      entry_type: "valuation",
      total_value_after: 2_000_000,
    }),
  ]);
  const held = poolByAssetClass(invs, entries);
  const g = goal({ id: "g", end_date: "2030-01-01" });
  const allocs = byGoal([alloc("g", "eq", 0, 100)]);
  const claim = (pool: Map<string, number>) =>
    analyzeGoals([g], allocs, classes, pool, "2026-01-01").analyses[0];

  const free = claim(held);

  // A goal never claims more than it needs, so a lock the surplus can absorb
  // leaves it exactly as it was — the surplus pays for the debt, not the plan.
  const small = claim(lockFunds(held, 500_000, classes).available);
  assert.equal(small.attributed, free.attributed);

  // Past that, the lock eats into the goal and the shortfall has to be bought
  // back with a bigger monthly contribution.
  const big = claim(lockFunds(held, 1_500_000, classes).available);
  assert.equal(big.attributed, 500_000);
  assert.ok(big.attributed < free.attributed);
  assert.ok(big.requiredMonthly > free.requiredMonthly, "a smaller corpus must cost more");
});
