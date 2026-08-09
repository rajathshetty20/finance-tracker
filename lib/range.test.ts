// The ledger period filter. A range is a bounded window, not a lookback in
// days — "last financial year" has both ends, which the old {days} model could
// not express at all.

import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_RANGE,
  fyStartYear,
  inWindow,
  parseRange,
  rangeDescription,
  rangeLabel,
  rangeWindow,
  RANGE_KEYS,
} from "./range.ts";

test("an unknown or missing range falls back to the default", () => {
  assert.equal(parseRange(undefined), DEFAULT_RANGE);
  assert.equal(parseRange("nonsense"), DEFAULT_RANGE);
  assert.equal(parseRange("fy-1"), "fy-1");
});

test("the Indian financial year starts in April", () => {
  assert.equal(fyStartYear("2026-08-09"), 2026, "August is in FY 26-27");
  assert.equal(fyStartYear("2026-04-01"), 2026, "1 April is the first day");
  assert.equal(fyStartYear("2026-03-31"), 2025, "31 March is still FY 25-26");
});

test("this financial year runs from 1 April to today", () => {
  assert.deepEqual(rangeWindow("fy", "2026-08-09"), { from: "2026-04-01", to: "2026-08-09" });
});

test("last financial year is a closed window, both ends", () => {
  // The case the old model could not represent: it had a lower bound only.
  assert.deepEqual(rangeWindow("fy-1", "2026-08-09"), { from: "2025-04-01", to: "2026-03-31" });
});

test("day ranges are inclusive of today", () => {
  assert.deepEqual(rangeWindow("30", "2026-08-09"), { from: "2026-07-11", to: "2026-08-09" });
  assert.deepEqual(rangeWindow("month", "2026-08-09"), { from: "2026-08-01", to: "2026-08-09" });
});

test("all time is unbounded on both sides", () => {
  assert.deepEqual(rangeWindow("all", "2026-08-09"), { from: null, to: null });
});

test("inWindow respects both bounds", () => {
  const w = rangeWindow("fy-1", "2026-08-09");
  assert.equal(inWindow("2025-04-01", w), true, "first day is in");
  assert.equal(inWindow("2026-03-31", w), true, "last day is in");
  assert.equal(inWindow("2025-03-31", w), false, "the day before is out");
  assert.equal(inWindow("2026-04-01", w), false, "the day after is out");
  assert.equal(inWindow("2020-01-01", rangeWindow("all", "2026-08-09")), true);
});

test("financial-year labels carry their years", () => {
  assert.equal(rangeLabel("fy", "2026-08-09"), "FY 26-27");
  assert.equal(rangeLabel("fy-1", "2026-08-09"), "FY 25-26");
  assert.equal(rangeLabel("fy", "2026-02-09"), "FY 25-26", "February is still last year's FY");
});

test("every key has a label and a description", () => {
  for (const k of RANGE_KEYS) {
    assert.ok(rangeLabel(k, "2026-08-09").length > 0, `${k} needs a label`);
    assert.ok(rangeDescription(k, "2026-08-09").length > 0, `${k} needs a description`);
  }
});
