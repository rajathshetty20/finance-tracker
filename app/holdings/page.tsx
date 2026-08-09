import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type {
  AssetClass,
  CashBalance,
  Debt,
  DebtPayment,
  Investment,
  InvestmentEntry,
} from "@/lib/types";
import { xirr, formatXirr, type CashFlow } from "@/lib/xirr";
import { impliedAnnualRate } from "@/lib/debtRate";
import { portfolioXirrOverPeriod } from "@/lib/portfolioXirr";
import { marketValueOf } from "@/lib/goals";
import { inferEmis } from "@/lib/money";
import { appToday } from "@/lib/demo";
import { fmtDate, fmtINR } from "@/lib/dates";
import Disclose from "../Disclose";
import CashRow from "../cash/CashRow";
import AddCashForm from "../cash/AddCashForm";
import AddInvestmentForm from "../investments/AddInvestmentForm";
import AddDebtForm from "../debts/AddDebtForm";

function bookOf(entries: InvestmentEntry[]) {
  return entries.reduce((a, e) => {
    if (e.entry_type === "contribution") return a + Number(e.amount);
    if (e.entry_type === "withdrawal") return a - Number(e.amount);
    return a;
  }, 0);
}

function flowsFor(inv: Investment, entries: InvestmentEntry[], today: string): CashFlow[] {
  const sorted = [...entries].sort((a, b) => (a.date < b.date ? -1 : 1));
  const flows: CashFlow[] = [];
  for (const e of sorted) {
    if (e.entry_type === "contribution") flows.push({ date: e.date, amount: -Number(e.amount) });
    else if (e.entry_type === "withdrawal") flows.push({ date: e.date, amount: Number(e.amount) });
  }
  if (inv.status === "open") {
    const market = marketValueOf(inv, entries);
    if (market > 0) flows.push({ date: today, amount: market });
  }
  return flows;
}


function daysSince(iso: string | null, today: string): number {
  if (!iso) return 0;
  const a = new Date(iso).getTime();
  const b = new Date(`${today}T00:00:00Z`).getTime();
  return Math.max(0, Math.floor((b - a) / 86_400_000));
}

export default async function HoldingsPage() {
  const supabase = await createClient();
  const today = await appToday();

  const [
    { data: invsData },
    { data: entriesData },
    { data: classesData },
    { data: cashData },
    { data: debtsData },
    { data: paymentsData },
  ] = await Promise.all([
    supabase.from("investments").select("*").order("created_at", { ascending: false }),
    supabase.from("investment_entries").select("*"),
    supabase.from("asset_classes").select("*").order("name", { ascending: true }),
    supabase.from("cash_balances").select("*").order("created_at", { ascending: true }),
    supabase.from("debts").select("*").order("created_at", { ascending: false }),
    supabase.from("debt_payments").select("*"),
  ]);

  const invs = (invsData ?? []) as Investment[];
  const allEntries = (entriesData ?? []) as InvestmentEntry[];
  const assetClasses = (classesData ?? []) as AssetClass[];
  const cash = (cashData ?? []) as CashBalance[];
  const debts = (debtsData ?? []) as Debt[];
  const payments = (paymentsData ?? []) as DebtPayment[];
  const classNameById = new Map(assetClasses.map((c) => [c.id, c.name]));

  const byInvId = new Map<string, InvestmentEntry[]>();
  for (const inv of invs) byInvId.set(inv.id, []);
  for (const e of allEntries) byInvId.get(e.investment_id)?.push(e);

  const open = invs.filter((i) => i.status === "open");
  const closed = invs.filter((i) => i.status === "closed");

  const investMarket = open.reduce((a, i) => a + marketValueOf(i, byInvId.get(i.id) ?? []), 0);
  const investBook = open.reduce((a, i) => a + bookOf(byInvId.get(i.id) ?? []), 0);
  const unrealized = investMarket - investBook;

  const openFlows: CashFlow[] = [];
  for (const inv of open) openFlows.push(...flowsFor(inv, byInvId.get(inv.id) ?? [], today));
  const unrealizedXirr = xirr(openFlows);

  // Every investment ever made, open and closed, as one money-weighted return.
  const lifetimeFlows: CashFlow[] = [];
  for (const inv of invs) lifetimeFlows.push(...flowsFor(inv, byInvId.get(inv.id) ?? [], today));
  lifetimeFlows.sort((a, b) => (a.date < b.date ? -1 : 1));
  const lifetimeXirr = xirr(lifetimeFlows);

  const realizedGain = closed.reduce((acc, inv) => {
    const es = byInvId.get(inv.id) ?? [];
    const c = es.filter((e) => e.entry_type === "contribution").reduce((a, e) => a + Number(e.amount), 0);
    const w = es.filter((e) => e.entry_type === "withdrawal").reduce((a, e) => a + Number(e.amount), 0);
    return acc + (w - c);
  }, 0);

  // Cash is a signed ledger: a credit-card balance is stored as a negative row.
  // Summing it into one "cash" figure and calling the result an asset put five
  // figures of card debt on the assets side of a balance sheet.
  // >= 0, not > 0: a row sitting at exactly zero belongs to neither list under
  // a strict split, so it disappeared from the only screen that can edit it.
  const cashPositive = cash.filter((r) => Number(r.amount) >= 0);
  const cashNegative = cash.filter((r) => Number(r.amount) < 0);
  const cashInHand = cashPositive.reduce((a, r) => a + Number(r.amount), 0);
  const cardFloat = cashNegative.reduce((a, r) => a + Number(r.amount), 0); // ≤ 0
  const cashSum = cashInHand + cardFloat;

  const paidBy = new Map<string, number>();
  for (const p of payments) paidBy.set(p.debt_id, (paidBy.get(p.debt_id) ?? 0) + Number(p.amount));
  const openDebts = debts.filter((d) => d.status === "open");
  const closedDebts = debts.filter((d) => d.status === "closed");
  const debtPending = openDebts.reduce(
    (a, d) => a + (Number(d.total_payable) - (paidBy.get(d.id) ?? 0)),
    0,
  );
  const emis = inferEmis(openDebts, payments);
  const emiById = new Map(emis.map((e) => [e.debtId, e]));

  // Portfolio return measured over each loan's own life, so "borrow or pay
  // down" is compared over the same window rather than against a lifetime
  // number covering years the loan did not exist.
  const sinceLoan = new Map<string, number | null>(
    openDebts.map((d) => [
      d.id,
      portfolioXirrOverPeriod(invs, byInvId, d.start_date, today),
    ]),
  );

  // Identical to Home's headline by construction.
  const assets = investMarket + cashInHand;
  const liabilities = debtPending + Math.abs(cardFloat);
  const netWorth = investMarket + cashSum - debtPending;
  const barTotal = Math.max(1, assets + liabilities);

  const oldestCash =
    cash.length > 0 ? cash.reduce((m, r) => (r.updated_at < m ? r.updated_at : m), cash[0].updated_at) : null;

  const seg = (v: number) => Math.max(0, (v / barTotal) * 100);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Holdings</h1>
        <p className="text-sm text-ink-3">What you own and what you owe, on one sheet.</p>
      </header>

      <section className="rounded-xl border border-rule bg-surface p-5">
        <div className="text-[11px] font-medium uppercase tracking-wider text-ink-3">Net worth</div>
        <div
          className={`mt-1 text-[2.2rem] font-semibold leading-none tabular-nums ${
            netWorth < 0 ? "text-down" : ""
          }`}
        >
          {fmtINR(netWorth)}
        </div>

        {assets > 0 && (
          <>
            <div className="mt-4 flex h-2.5 gap-[2px] overflow-hidden rounded-full">
              <span style={{ width: `${seg(investMarket)}%`, background: "var(--cat-1)" }} />
              <span style={{ width: `${seg(cashInHand)}%`, background: "var(--cat-6)" }} />
              {liabilities > 0 && (
                <span style={{ width: `${seg(liabilities)}%`, background: "var(--debt)" }} />
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[0.8125rem]">
              <Key color="var(--cat-1)" value={fmtINR(investMarket)} name="invested" />
              <Key color="var(--cat-6)" value={fmtINR(cashInHand)} name="cash" />
              {liabilities > 0 && (
                <Key color="var(--debt)" value={`−${fmtINR(liabilities)}`} name="debt" />
              )}
            </div>
            <p className="mt-3 font-mono text-[0.6875rem] tabular-nums text-ink-3">
              {fmtINR(investMarket)} invested + {fmtINR(cashInHand)} cash − {fmtINR(liabilities)}{" "}
              debt = {fmtINR(netWorth)}
            </p>
          </>
        )}

        {lifetimeXirr !== null && (
          <p className="mt-3 border-t border-rule-soft pt-3 text-[0.8125rem] text-ink-2">
            <span className="font-medium text-ink">{formatXirr(lifetimeXirr)} a year</span> across
            every investment you have made, open and closed.
          </p>
        )}
      </section>

      {/* ── Investments ──────────────────────────────────────────────────── */}
      <section className="rounded-xl border border-rule bg-surface p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 className="text-sm font-medium">Investments</h2>
          <span className="text-[0.8125rem] tabular-nums text-ink-3">
            {open.length} open · {fmtINR(investMarket)}
          </span>
        </div>
        <p className="mt-1 font-mono text-[0.6875rem] tabular-nums text-ink-3">
          {fmtINR(investMarket)} market − {fmtINR(investBook)} put in ={" "}
          <span className={unrealized >= 0 ? "text-up" : "text-down"}>
            {unrealized >= 0 ? "+" : "−"}
            {fmtINR(Math.abs(unrealized))} unrealized
          </span>{" "}
          · {formatXirr(unrealizedXirr)} XIRR
        </p>
        {realizedGain !== 0 && (
          <p className="mt-0.5 text-[0.6875rem] text-ink-3">
            + {fmtINR(realizedGain)} realized on {closed.length} closed position
            {closed.length === 1 ? "" : "s"}.
          </p>
        )}

        {open.length > 0 && (
          <ul className="mt-3 divide-y divide-rule-soft">
            {open.map((inv) => {
              const entries = byInvId.get(inv.id) ?? [];
              const book = bookOf(entries);
              const market = marketValueOf(inv, entries);
              const gain = market - book;
              return (
                <li key={inv.id}>
                  <Link
                    href={`/investments/${inv.id}`}
                    className="flex items-baseline justify-between gap-3 py-2 hover:bg-surface-2"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm">{inv.name}</span>
                      <span className="block text-[0.6875rem] text-ink-3">
                        {classNameById.get(inv.asset_class_id ?? "") ?? "unclassified"}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-sm tabular-nums">{fmtINR(market)}</span>
                      <span
                        className={`block text-[0.6875rem] tabular-nums ${
                          gain >= 0 ? "text-up" : "text-down"
                        }`}
                      >
                        {gain >= 0 ? "+" : "−"}
                        {fmtINR(Math.abs(gain))} · {formatXirr(xirr(flowsFor(inv, entries, today)))}{" "}
                        XIRR
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          <Disclose label="Add investment">
            <AddInvestmentForm assetClasses={assetClasses.map((c) => c.name)} />
          </Disclose>
          {closed.length > 0 && (
            <Disclose label="Closed" count={closed.length}>
              <ul className="divide-y divide-rule-soft">
                {closed.map((inv) => (
                  <li key={inv.id}>
                    <Link
                      href={`/investments/${inv.id}`}
                      className="flex items-baseline justify-between gap-3 py-2 hover:bg-surface-2"
                    >
                      <span className="min-w-0 truncate text-sm text-ink-2">{inv.name}</span>
                      <span className="shrink-0 text-[0.6875rem] tabular-nums text-ink-3">
                        closed {fmtDate(inv.closed_on!)} · XIRR{" "}
                        {formatXirr(xirr(flowsFor(inv, byInvId.get(inv.id) ?? [], today)))}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Disclose>
          )}
        </div>
      </section>

      {/* ── Cash ─────────────────────────────────────────────────────────── */}
      <section className="rounded-xl border border-rule bg-surface p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 className="text-sm font-medium">Cash</h2>
          <span className="text-[0.8125rem] tabular-nums text-ink-3">{fmtINR(cashSum)} net</span>
        </div>
        <p className="mt-0.5 text-xs text-ink-3">
          Typed in by hand. Grouped by sign — a negative balance is money owed.
          {oldestCash && ` Oldest entry ${daysSince(oldestCash, today)}d old.`}
        </p>

        {cash.length === 0 ? (
          <p className="mt-3 text-[0.8125rem] text-ink-3">No cash entries yet.</p>
        ) : (
          <>
            <ul className="mt-3 divide-y divide-rule-soft">
              {cashPositive.map((r) => (
                <CashRow key={r.id} row={r} />
              ))}
            </ul>
            {cashNegative.length > 0 && (
              <>
                <p className="mt-3 border-t border-rule pt-2 text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-3">
                  Negative balances — {fmtINR(Math.abs(cardFloat))} owed
                </p>
                <ul className="divide-y divide-rule-soft">
                  {cashNegative.map((r) => (
                    <CashRow key={r.id} row={r} />
                  ))}
                </ul>
              </>
            )}
          </>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Disclose label="Add cash entry">
            <AddCashForm />
          </Disclose>
          {/* The audit trail belongs where the question arises — "where did
              this cash come from" — not only behind a header menu. */}
          <Link href="/money-sources" className="text-[0.8125rem] text-ink-3 underline hover:text-ink">
            Where it came from
          </Link>
        </div>
      </section>

      {/* ── Debts ────────────────────────────────────────────────────────── */}
      <section className="rounded-xl border border-rule bg-surface p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 className="text-sm font-medium">Debts</h2>
          <span className="text-[0.8125rem] tabular-nums text-ink-3">
            {fmtINR(debtPending)} pending
          </span>
        </div>

        {openDebts.length === 0 ? (
          <p className="mt-2 text-[0.8125rem] text-ink-3">Nothing owed.</p>
        ) : (
          <ul className="mt-3 space-y-4">
            {openDebts.map((d) => {
              const paid = paidBy.get(d.id) ?? 0;
              const payable = Number(d.total_payable);
              const principal = Number(d.principal);
              const pending = payable - paid;
              const interest = payable - principal;
              const pct = payable > 0 ? (paid / payable) * 100 : 0;
              const emi = emiById.get(d.id);
              const implied = emi ? impliedAnnualRate(principal, emi.amount, payable) : null;
              const monthsLeft = emi && emi.amount > 0 ? Math.ceil(pending / emi.amount) : null;
              return (
                <li key={d.id}>
                  <Link href={`/debts/${d.id}`} className="block hover:underline">
                    {/* Descriptions run to 100+ characters and carry the terms;
                        they wrap rather than truncate. */}
                    <span className="block text-sm leading-snug">{d.description}</span>
                  </Link>
                  <div className="mt-1.5 flex items-baseline justify-between gap-3 text-[0.8125rem]">
                    <span className="tabular-nums text-ink-2">{fmtINR(pending)} still to pay</span>
                    <span className="tabular-nums text-ink-3">{pct.toFixed(0)}% paid</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2">
                    <div
                      className="h-full rounded-full bg-debt"
                      style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                    />
                  </div>
                  <p className="mt-1.5 font-mono text-[0.6875rem] tabular-nums text-ink-3">
                    {fmtINR(principal)} borrowed + {fmtINR(interest)} interest ={" "}
                    {fmtINR(payable)} payable · {fmtINR(paid)} paid
                  </p>
                  {/* Two rates and a paragraph became one rate and the number
                      it should be compared against: money that clears a loan
                      earns the loan's rate, risk free. */}
                  <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 font-mono text-[0.6875rem] tabular-nums text-ink-3">
                    {emi && (
                      <span>
                        EMI {fmtINR(emi.amount)}
                        {monthsLeft !== null && <> · ~{monthsLeft} left</>}
                      </span>
                    )}
                    {implied !== null && <span>{formatXirr(implied)} p.a. cost</span>}
                    {sinceLoan.get(d.id) != null && (
                      <span>{formatXirr(sinceLoan.get(d.id)!)} p.a. portfolio</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <Disclose label="Add debt">
            <AddDebtForm />
          </Disclose>
          {closedDebts.length > 0 && (
            <Disclose label="Closed" count={closedDebts.length}>
              <ul className="divide-y divide-rule-soft">
                {closedDebts.map((d) => (
                  <li key={d.id}>
                    <Link
                      href={`/debts/${d.id}`}
                      className="flex items-baseline justify-between gap-3 py-2 hover:bg-surface-2"
                    >
                      <span className="min-w-0 truncate text-sm text-ink-2">{d.description}</span>
                      <span className="shrink-0 text-[0.6875rem] text-ink-3">
                        closed {fmtDate(d.closed_on!)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Disclose>
          )}
        </div>
      </section>
    </div>
  );
}

function Key({ color, value, name }: { color: string; value: string; name: string }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <i className="h-2 w-2 shrink-0 -translate-y-px rounded-sm" style={{ background: color }} />
      <span className="font-semibold tabular-nums">{value}</span>
      <span className="text-ink-3">{name}</span>
    </span>
  );
}
