// Glide-path arithmetic, extracted from the editor so it can be tested.
//
// The editor is a pointer-driven SVG; none of the rules below are testable
// through it. They are pure array maths and they all guarantee one invariant:
// every milestone's allocation sums to exactly 100.

/**
 * Round weights to integer percentages summing to exactly 100.
 *
 * Largest remainder: floor everything, then hand the leftover points to the
 * largest fractional parts. Rounding each share independently gives 99 or 101
 * often enough to matter, and the database CHECK does not permit either.
 */
export function toHundred(weights: number[]): number[] {
  const sum = weights.reduce((s, w) => s + w, 0);
  if (weights.length === 0) return [];
  if (sum <= 0) return weights.map(() => 0);
  const exact = weights.map((w) => (w / sum) * 100);
  const base = exact.map(Math.floor);
  const left = 100 - base.reduce((s, b) => s + b, 0);
  const order = exact
    .map((e, i) => ({ i, rem: e - Math.floor(e) }))
    .sort((a, b) => b.rem - a.rem);
  for (let j = 0; j < left && j < order.length; j++) base[order[j].i]++;
  return base;
}

/**
 * Set one class's share, letting the others absorb the difference in
 * proportion to what they already hold.
 *
 * Proportional, not equal: a class you had at 5% should not jump to 30% because
 * you nudged a different one. When the others are all at zero there is no
 * proportion to preserve, so the remainder is split evenly.
 */
export function rebalance(pcts: number[], idx: number, value: number): number[] {
  if (idx < 0 || idx >= pcts.length) return toHundred(pcts);
  const target = Math.max(0, Math.min(100, Math.round(value)));
  if (pcts.length === 1) return [100];
  const rest = 100 - target;
  const otherSum = pcts.reduce((s, v, i) => (i === idx ? s : s + v), 0);
  const next = pcts.map((v, i) => {
    if (i === idx) return target;
    if (otherSum > 0) return (v / otherSum) * rest;
    return rest / (pcts.length - 1);
  });
  // Re-apply the exact target after rounding, so typing 65 gives 65.
  const rounded = toHundred(next);
  const drift = rounded[idx] - target;
  if (drift !== 0) {
    rounded[idx] = target;
    // Push the drift onto the largest other class, which can absorb it.
    let biggest = -1;
    for (let i = 0; i < rounded.length; i++) {
      if (i === idx) continue;
      if (biggest === -1 || rounded[i] > rounded[biggest]) biggest = i;
    }
    if (biggest !== -1) rounded[biggest] += drift;
  }
  return rounded;
}

/** Expected return implied by a mix, given each class's assumed annual rate. */
export function blendedReturn(pcts: number[], returns: number[]): number {
  return pcts.reduce((acc, pct, i) => acc + (pct / 100) * (returns[i] ?? 0), 0);
}

/**
 * How quickly the allocation moves from its starting mix to its final one.
 *
 * Deliberately NOT a set of named allocations ("aggressive", "balanced"):
 * those would be the app choosing what you should hold, which it has no
 * standing to do and cannot infer from asset classes you named yourself. This
 * only reshapes the milestones BETWEEN the two you set, so the endpoints — the
 * actual allocation decisions — stay yours.
 */
export type GlideCurve = "early" | "even" | "late";

export const CURVES: { key: GlideCurve; label: string; hint: string }[] = [
  { key: "early", label: "De-risk early", hint: "move to the safer mix sooner" },
  { key: "even", label: "Even", hint: "a straight line between your two ends" },
  { key: "late", label: "De-risk late", hint: "stay in the growth mix longer" },
];

/** Position along the path, eased. t and the result are both 0..1. */
export function curveAt(curve: GlideCurve, t: number): number {
  const x = Math.max(0, Math.min(1, t));
  if (curve === "early") return 1 - (1 - x) * (1 - x); // fast first
  if (curve === "late") return x * x; // slow first
  return x;
}

/**
 * Re-space the intermediate milestones' allocations along `curve`.
 *
 * `milestones` must be ordered from furthest-from-goal to the goal date, which
 * is the order the editor keeps them in. The first and last are returned
 * untouched; anything between them is interpolated between those two ends at
 * its own position in time.
 */
export function reshape<T extends { years: number; pct: number[] }>(
  milestones: T[],
  curve: GlideCurve,
): T[] {
  if (milestones.length < 3) return milestones;
  const first = milestones[0];
  const last = milestones[milestones.length - 1];
  const span = first.years - last.years;
  if (span <= 0) return milestones;

  return milestones.map((m, i) => {
    if (i === 0 || i === milestones.length - 1) return m;
    // Time already elapsed toward the goal, 0 at the first milestone.
    const t = (first.years - m.years) / span;
    const e = curveAt(curve, t);
    const pct = first.pct.map((from, k) => from + (last.pct[k] - from) * e);
    return { ...m, pct: toHundred(pct) };
  });
}

/**
 * Move the boundary between two adjacent bands to `cum` (a cumulative
 * percentage from the bottom of the stack), leaving every other band alone.
 *
 * This is what dragging a handle does. Only the pair either side of the
 * boundary trade with each other, so the column total stays at 100 without any
 * renormalisation — and a class you are not touching cannot move.
 */
export function dragBoundary(pcts: number[], boundary: number, cum: number): number[] {
  if (boundary < 0 || boundary + 1 >= pcts.length) return pcts;
  const lower = pcts.slice(0, boundary).reduce((s, v) => s + v, 0);
  const upper = lower + pcts[boundary] + pcts[boundary + 1];
  const nc = Math.max(lower, Math.min(upper, cum));
  const out = [...pcts];
  out[boundary] = nc - lower;
  out[boundary + 1] = upper - nc;
  return out;
}
