// Fund locking. Pure functions, no DB access.
//
// Some of the corpus is already spoken for and must never be counted as
// funding a goal. The one such claim today is debt repayment: `total_payable`
// already contains every rupee of future interest, so the outstanding balance
// is a FIXED number that shrinks by exactly the amount you pay and never grows.
//
// The lock is taken off the pool BEFORE lib/goals.ts sees it, so the waterfall
// needs no notion of priority — goals compete only for what is genuinely free.
//
// Why an EMI is not also deducted from investable income (lib/money.ts):
// paying an instalment of E raises `paid` by E, which drops the outstanding by
// exactly E, which releases exactly E of locked corpus to the goals. The
// instalment is a transfer from cashflow into freed corpus, not a loss. Netting
// it off income as well would charge the same rupees to the plan twice.

import type { AssetClass, Debt, DebtPayment } from "./types";

/**
 * What every open debt still costs, interest included.
 *
 * `total_payable` is the whole obligation, so this falls by exactly the amount
 * paid and never accrues. Closed debts are settled and contribute nothing.
 */
export function outstandingDebt(debts: Debt[], payments: DebtPayment[]): number {
  const paidBy = new Map<string, number>();
  for (const p of payments) paidBy.set(p.debt_id, (paidBy.get(p.debt_id) ?? 0) + Number(p.amount));
  return debts
    .filter((d) => d.status === "open")
    .reduce((a, d) => a + Math.max(0, Number(d.total_payable) - (paidBy.get(d.id) ?? 0)), 0);
}

/**
 * Each class's share of the lock, as fractions summing to 1.
 *
 * Weights are normalised, so 60/40 and 6/4 are one split — classes are edited a
 * row at a time and a sum-to-100 rule would reject every keystroke on the way
 * from one valid split to another. With no weights set anywhere, the lock
 * spreads pro-rata over what is actually held, so an unconfigured lock still
 * applies instead of silently vanishing.
 */
export function lockShares(
  assetClasses: AssetClass[],
  poolByClass: Map<string, number>,
): Map<string, number> {
  const out = new Map<string, number>();
  const weightTotal = assetClasses.reduce((a, c) => a + Math.max(0, Number(c.lock_weight)), 0);

  if (weightTotal > 0) {
    for (const c of assetClasses) {
      const w = Math.max(0, Number(c.lock_weight));
      if (w > 0) out.set(c.id, w / weightTotal);
    }
    return out;
  }

  const poolTotal = [...poolByClass.values()].reduce((a, v) => a + v, 0);
  if (poolTotal <= 0) return out;
  for (const [cls, v] of poolByClass) if (v > 0) out.set(cls, v / poolTotal);
  return out;
}

export type LockResult = {
  /** Total reserved off the top. */
  amount: number;
  /** Reserved per class, capped by what that class actually holds. */
  lockedByClass: Map<string, number>;
  /** The pool goals may claim: holdings − lock. */
  available: Map<string, number>;
  /** Lock the whole portfolio cannot cover. Non-zero means debt exceeds holdings. */
  unbacked: number;
};

/**
 * Reserve `amount` from the pool, split by the configured shares.
 *
 * A class can only give what it holds. Where the chosen split asks for more
 * than a class has, the excess spills onto the classes that still have room,
 * in proportion to that room — the money is committed whether or not the split
 * is satisfiable, and leaving it "unallocated" would hand goals a corpus that
 * is already promised elsewhere. Only when the entire pool is exhausted does
 * the remainder stay unbacked.
 */
export function lockFunds(
  poolByClass: Map<string, number>,
  amount: number,
  assetClasses: AssetClass[],
): LockResult {
  const available = new Map(poolByClass);
  const lockedByClass = new Map<string, number>();
  if (!Number.isFinite(amount) || amount <= 0) {
    return { amount: 0, lockedByClass, available, unbacked: 0 };
  }

  const shares = lockShares(assetClasses, poolByClass);
  let outstanding = amount;

  // Pass 1: the split as configured, each class capped at what it holds.
  for (const [cls, frac] of shares) {
    const take = Math.min(available.get(cls) ?? 0, amount * frac);
    if (take <= 0) continue;
    lockedByClass.set(cls, take);
    available.set(cls, (available.get(cls) ?? 0) - take);
    outstanding -= take;
  }

  // Pass 2: spill what the split could not place onto whatever room is left,
  // proportionally. Loops because each round can itself exhaust a class.
  while (outstanding > 1e-6) {
    const room = [...available.entries()].filter(([, v]) => v > 1e-6);
    const roomTotal = room.reduce((a, [, v]) => a + v, 0);
    if (roomTotal <= 1e-6) break;
    const round = Math.min(outstanding, roomTotal);
    for (const [cls, v] of room) {
      const take = Math.min(v, round * (v / roomTotal));
      lockedByClass.set(cls, (lockedByClass.get(cls) ?? 0) + take);
      available.set(cls, v - take);
      outstanding -= take;
    }
  }

  return { amount, lockedByClass, available, unbacked: Math.max(0, outstanding) };
}
