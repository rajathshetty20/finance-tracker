// Glide-path arithmetic. The one invariant that matters everywhere: a
// milestone's allocation sums to exactly 100, because the database says so.

import assert from "node:assert/strict";
import test from "node:test";
import {
  blendedReturn,
  dragBoundary,
  curveAt,
  rebalance,
  reshape,
  toHundred,
  type GlideCurve,
} from "./glide.ts";

// ---------------------------------------------------------------------------
// toHundred
// ---------------------------------------------------------------------------

test("weights become integers summing to exactly 100", () => {
  // 1/3 each rounds to 33 three times and loses a point without the remainder
  // pass; the CHECK constraint rejects 99.
  const out = toHundred([1, 1, 1]);
  assert.equal(out.reduce((a, b) => a + b, 0), 100);
  for (const v of out) assert.ok(Number.isInteger(v));
  assert.deepEqual([...out].sort((a, b) => a - b), [33, 33, 34]);
});

test("toHundred normalises whatever scale it is given", () => {
  assert.deepEqual(toHundred([5, 5]), [50, 50]);
  assert.deepEqual(toHundred([500, 500]), [50, 50]);
  assert.equal(toHundred([7, 11, 3, 19]).reduce((a, b) => a + b, 0), 100);
});

test("toHundred handles the degenerate inputs", () => {
  assert.deepEqual(toHundred([]), []);
  assert.deepEqual(toHundred([0, 0]), [0, 0], "all-zero cannot be normalised");
});

// ---------------------------------------------------------------------------
// rebalance — what typing a number does
// ---------------------------------------------------------------------------

test("typing a share gives exactly that share", () => {
  const out = rebalance([25, 25, 25, 25], 1, 65);
  assert.equal(out[1], 65, "the number you typed is the number you get");
  assert.equal(out.reduce((a, b) => a + b, 0), 100);
});

test("the others absorb the difference in proportion", () => {
  // 60/30/10 with the first cut to 40 leaves 60 to split 3:1.
  const out = rebalance([60, 30, 10], 0, 40);
  assert.equal(out[0], 40);
  assert.equal(out.reduce((a, b) => a + b, 0), 100);
  assert.ok(out[1] > out[2], "the larger class keeps the larger share");
  assert.equal(out[1], 45);
  assert.equal(out[2], 15);
});

test("a class at zero is not resurrected by editing another", () => {
  const out = rebalance([50, 50, 0], 0, 20);
  assert.equal(out[2], 0, "0% means the goal does not use it");
  assert.equal(out.reduce((a, b) => a + b, 0), 100);
});

test("when every other class is zero the remainder splits evenly", () => {
  const out = rebalance([100, 0, 0], 0, 40);
  assert.equal(out[0], 40);
  assert.deepEqual(out.slice(1), [30, 30]);
});

test("rebalance clamps out-of-range input", () => {
  assert.equal(rebalance([50, 50], 0, 999)[0], 100);
  assert.equal(rebalance([50, 50], 0, -5)[0], 0);
  assert.equal(rebalance([50, 50], 0, 999).reduce((a, b) => a + b, 0), 100);
});

test("a single class is always the whole allocation", () => {
  assert.deepEqual(rebalance([100], 0, 40), [100]);
});

test("rebalance always totals 100, across a sweep of inputs", () => {
  for (let v = 0; v <= 100; v += 7) {
    for (const start of [[25, 25, 25, 25], [70, 20, 10, 0], [1, 2, 3, 94]]) {
      const out = rebalance(start, 2, v);
      assert.equal(
        out.reduce((a, b) => a + b, 0),
        100,
        `start ${start} idx 2 value ${v} → ${out}`,
      );
      assert.equal(out[2], v, `typed ${v}, got ${out[2]}`);
    }
  }
});

// ---------------------------------------------------------------------------
// blendedReturn
// ---------------------------------------------------------------------------

test("blended return weights each class by its share", () => {
  // 75% at 12 + 15% at 7 + 5% at 9 + 5% at 15 = 9 + 1.05 + 0.45 + 0.75
  assert.equal(blendedReturn([75, 15, 5, 5], [12, 7, 9, 15]), 11.25);
});

test("a single class returns its own rate", () => {
  assert.equal(blendedReturn([100], [8]), 8);
});

test("a missing rate counts as zero rather than NaN", () => {
  assert.equal(blendedReturn([50, 50], [10]), 5);
});

// ---------------------------------------------------------------------------
// curveAt / reshape
// ---------------------------------------------------------------------------

test("every curve starts at 0 and ends at 1", () => {
  for (const c of ["early", "even", "late"] as GlideCurve[]) {
    assert.equal(curveAt(c, 0), 0, c);
    assert.equal(curveAt(c, 1), 1, c);
  }
});

test("de-risking early is ahead of even, and late is behind it", () => {
  assert.ok(curveAt("early", 0.5) > curveAt("even", 0.5));
  assert.ok(curveAt("late", 0.5) < curveAt("even", 0.5));
  assert.equal(curveAt("even", 0.5), 0.5);
});

test("curveAt clamps outside 0..1", () => {
  assert.equal(curveAt("even", -1), 0);
  assert.equal(curveAt("even", 2), 1);
});

const ms = () => [
  { years: 20, pct: [80, 20] },
  { years: 10, pct: [50, 50] },
  { years: 0, pct: [20, 80] },
];

test("reshape leaves the endpoints alone — they are your decisions", () => {
  for (const c of ["early", "even", "late"] as GlideCurve[]) {
    const out = reshape(ms(), c);
    assert.deepEqual(out[0].pct, [80, 20], c);
    assert.deepEqual(out[2].pct, [20, 80], c);
  }
});

test("an even curve puts the midpoint halfway between the ends", () => {
  const out = reshape(ms(), "even");
  assert.deepEqual(out[1].pct, [50, 50]);
});

test("de-risking early moves the midpoint closer to the final mix", () => {
  const early = reshape(ms(), "early")[1].pct;
  const late = reshape(ms(), "late")[1].pct;
  // Growth share: early should already be lower than even, late still higher.
  assert.ok(early[0] < 50, `early growth ${early[0]} should be below the even 50`);
  assert.ok(late[0] > 50, `late growth ${late[0]} should be above the even 50`);
  assert.equal(early[0], 35);
  assert.equal(late[0], 65);
});

test("every reshaped milestone still totals 100", () => {
  for (const c of ["early", "even", "late"] as GlideCurve[]) {
    for (const m of reshape(
      [
        { years: 30, pct: [70, 20, 10] },
        { years: 22, pct: [1, 2, 97] },
        { years: 9, pct: [33, 33, 34] },
        { years: 0, pct: [10, 30, 60] },
      ],
      c,
    )) {
      assert.equal(m.pct.reduce((a, b) => a + b, 0), 100, `${c} @ ${m.years}y → ${m.pct}`);
    }
  }
});

test("reshape is a no-op when there is nothing between the ends", () => {
  const two = [
    { years: 10, pct: [60, 40] },
    { years: 0, pct: [20, 80] },
  ];
  assert.deepEqual(reshape(two, "early"), two);
  assert.deepEqual(reshape([{ years: 5, pct: [100] }], "even"), [{ years: 5, pct: [100] }]);
});

test("reshape tolerates milestones that share a date", () => {
  const flat = [
    { years: 5, pct: [50, 50] },
    { years: 5, pct: [10, 90] },
    { years: 5, pct: [70, 30] },
  ];
  assert.deepEqual(reshape(flat, "even"), flat, "no span to interpolate over");
});

// ---------------------------------------------------------------------------
// dragBoundary — what dragging a handle does
// ---------------------------------------------------------------------------

test("dragging a boundary trades only between the two bands it separates", () => {
  // [A 20, B 30, C 50]; boundary 1 sits between B and C at cum 50.
  const out = dragBoundary([20, 30, 50], 1, 70);
  assert.equal(out[0], 20, "a band below the boundary must not move");
  assert.deepEqual(out, [20, 50, 30]);
  assert.equal(out.reduce((a, b) => a + b, 0), 100);
});

test("a boundary cannot be dragged past its neighbours", () => {
  assert.deepEqual(dragBoundary([20, 30, 50], 1, 999), [20, 80, 0], "clamped at the top band");
  assert.deepEqual(dragBoundary([20, 30, 50], 1, -50), [20, 0, 80], "clamped at the bottom");
});

test("dragging preserves the total for every boundary and position", () => {
  const start = [10, 20, 30, 40];
  for (let b = 0; b < start.length - 1; b++) {
    for (let cum = -20; cum <= 120; cum += 10) {
      const out = dragBoundary(start, b, cum);
      assert.equal(
        Math.round(out.reduce((a, x) => a + x, 0)),
        100,
        `boundary ${b} at ${cum} → ${out}`,
      );
      assert.ok(
        out.every((v) => v >= -1e-9),
        `boundary ${b} at ${cum} produced a negative share → ${out}`,
      );
    }
  }
});

test("an out-of-range boundary is a no-op", () => {
  assert.deepEqual(dragBoundary([50, 50], 1, 30), [50, 50]);
  assert.deepEqual(dragBoundary([50, 50], -1, 30), [50, 50]);
});
