import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { AssetClass, Investment, InvestmentEntry } from "@/lib/types";
import { xirr, formatXirr, type CashFlow } from "@/lib/xirr";
import AddInvestmentForm from "./AddInvestmentForm";
import AllocationPie from "./AllocationPie";
import InvestmentChart from "./InvestmentChart";
import { aggregateInvestmentSeries } from "@/lib/investmentSeries";

function todayISO() {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

function bookOf(entries: InvestmentEntry[]) {
  return entries.reduce((a, e) => {
    if (e.entry_type === "contribution") return a + Number(e.amount);
    if (e.entry_type === "withdrawal") return a - Number(e.amount);
    return a;
  }, 0);
}

function marketOf(inv: Investment, entries: InvestmentEntry[]) {
  if (inv.status === "closed") return 0;
  // Tie-break same-date entries by created_at, matching lib/investmentSeries.
  const latest = [...entries].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return a.created_at < b.created_at ? 1 : -1;
  })[0];
  return latest ? Number(latest.total_value_after) : 0;
}

function flowsFor(inv: Investment, entries: InvestmentEntry[]): CashFlow[] {
  const sorted = [...entries].sort((a, b) => (a.date < b.date ? -1 : 1));
  const flows: CashFlow[] = [];
  for (const e of sorted) {
    if (e.entry_type === "contribution") flows.push({ date: e.date, amount: -Number(e.amount) });
    else if (e.entry_type === "withdrawal") flows.push({ date: e.date, amount: Number(e.amount) });
  }
  if (inv.status === "open") {
    const market = marketOf(inv, entries);
    if (market > 0) flows.push({ date: todayISO(), amount: market });
  }
  return flows;
}

export default async function InvestmentsPage() {
  const supabase = await createClient();

  const [{ data: invsData }, { data: entriesData }, { data: classesData }] = await Promise.all([
    supabase.from("investments").select("*").order("created_at", { ascending: false }),
    supabase.from("investment_entries").select("*"),
    supabase.from("asset_classes").select("*").order("name", { ascending: true }),
  ]);
  const invs = (invsData ?? []) as Investment[];
  const allEntries = (entriesData ?? []) as InvestmentEntry[];
  const assetClasses = (classesData ?? []) as AssetClass[];
  const classNameById = new Map(assetClasses.map((c) => [c.id, c.name]));

  const byInvId = new Map<string, InvestmentEntry[]>();
  for (const inv of invs) byInvId.set(inv.id, []);
  for (const e of allEntries) {
    const arr = byInvId.get(e.investment_id);
    if (arr) arr.push(e);
  }

  const open = invs.filter((i) => i.status === "open");
  const closed = invs.filter((i) => i.status === "closed");

  // Portfolio XIRR: concat all flows
  const portfolioFlows: CashFlow[] = [];
  for (const inv of invs) {
    portfolioFlows.push(...flowsFor(inv, byInvId.get(inv.id) ?? []));
  }
  portfolioFlows.sort((a, b) => (a.date < b.date ? -1 : 1));
  const portXirr = xirr(portfolioFlows);

  // Cost basis currently deployed: open investments only, so that
  // Market − Invested = Unrealized gain exactly. Closed investments are
  // accounted for in "Realized gain".
  const totalInvested = open.reduce(
    (a, inv) => a + bookOf(byInvId.get(inv.id) ?? []),
    0,
  );
  const totalMarket = open.reduce(
    (a, inv) => a + marketOf(inv, byInvId.get(inv.id) ?? []),
    0,
  );

  // Unrealized: open investments — market − book, plus XIRR over their flows.
  const unrealizedGain = open.reduce((acc, inv) => {
    const es = byInvId.get(inv.id) ?? [];
    return acc + (marketOf(inv, es) - bookOf(es));
  }, 0);
  const openFlows: CashFlow[] = [];
  for (const inv of open) openFlows.push(...flowsFor(inv, byInvId.get(inv.id) ?? []));
  const unrealizedXirr = xirr(openFlows);

  // Realized: closed investments — (Σ withdrawals − Σ contributions), plus XIRR over their flows.
  const realizedGain = closed.reduce((acc, inv) => {
    const es = byInvId.get(inv.id) ?? [];
    const c = es.filter((e) => e.entry_type === "contribution").reduce((a, e) => a + Number(e.amount), 0);
    const w = es.filter((e) => e.entry_type === "withdrawal").reduce((a, e) => a + Number(e.amount), 0);
    return acc + (w - c);
  }, 0);
  const closedFlows: CashFlow[] = [];
  for (const inv of closed) closedFlows.push(...flowsFor(inv, byInvId.get(inv.id) ?? []));
  const realizedXirr = xirr(closedFlows);

  function fmtSigned(n: number): string {
    const sign = n < 0 ? "−" : n > 0 ? "+" : "";
    return `${sign}₹${Math.abs(Math.round(n)).toLocaleString("en-IN")}`;
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Investments</h1>
        <p className="text-sm text-zinc-500">
          Closed investments stay listed for lifetime XIRR. Adding an investment creates the first contribution entry.
        </p>
      </header>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Invested" value={`₹${totalInvested.toLocaleString("en-IN")}`} />
        <Stat label="Market value" value={`₹${totalMarket.toLocaleString("en-IN")}`} />
        <Stat
          label="Unrealized gain"
          value={fmtSigned(unrealizedGain)}
          sub={`XIRR ${formatXirr(unrealizedXirr)}`}
          tone={unrealizedGain > 0 ? "pos" : unrealizedGain < 0 ? "neg" : undefined}
        />
        <Stat
          label="Realized gain"
          value={fmtSigned(realizedGain)}
          sub={`XIRR ${formatXirr(realizedXirr)}`}
          tone={realizedGain > 0 ? "pos" : realizedGain < 0 ? "neg" : undefined}
        />
        <Stat label="Portfolio XIRR" value={formatXirr(portXirr)} />
      </section>

      <InvestmentChart
        title="Invested vs market over time"
        data={aggregateInvestmentSeries(invs, byInvId)}
      />

      <AllocationPie
        data={open.map((inv) => ({
          name: inv.name,
          value: marketOf(inv, byInvId.get(inv.id) ?? []),
          assetClass: classNameById.get(inv.asset_class_id ?? "") ?? "Unclassified",
        }))}
      />

      <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-3 text-sm font-medium text-zinc-500">Add investment</h2>
        <AddInvestmentForm assetClasses={assetClasses.map((c) => c.name)} />
      </section>

      {open.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-medium text-zinc-500">Open</h2>
          <ul className="divide-y divide-zinc-200 overflow-hidden rounded-xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
            {open.map((inv) => {
              const entries = byInvId.get(inv.id) ?? [];
              const book = bookOf(entries);
              const market = marketOf(inv, entries);
              const r = xirr(flowsFor(inv, entries));
              return (
                <li key={inv.id}>
                  <Link href={`/investments/${inv.id}`} className="block px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium">{inv.name}</div>
                        <div className="text-xs text-zinc-500">{classNameById.get(inv.asset_class_id ?? "") ?? "—"} · opened {inv.opened_on}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm tabular-nums">₹{market.toLocaleString("en-IN")}</div>
                        <div className="text-xs text-zinc-500 tabular-nums">
                          book ₹{book.toLocaleString("en-IN")} · {formatXirr(r)}
                        </div>
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {closed.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-medium text-zinc-500">Closed</h2>
          <ul className="divide-y divide-zinc-200 overflow-hidden rounded-xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
            {closed.map((inv) => {
              const entries = byInvId.get(inv.id) ?? [];
              const r = xirr(flowsFor(inv, entries));
              return (
                <li key={inv.id}>
                  <Link href={`/investments/${inv.id}`} className="block px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-zinc-600 dark:text-zinc-400">{inv.name}</div>
                        <div className="text-xs text-zinc-500">closed {inv.closed_on}</div>
                      </div>
                      <div className="text-xs text-zinc-500 tabular-nums">XIRR {formatXirr(r)}</div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {invs.length === 0 && (
        <p className="rounded-xl border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700">
          No investments yet.
        </p>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "pos" | "neg";
}) {
  const toneCls =
    tone === "pos"
      ? "text-emerald-700 dark:text-emerald-400"
      : tone === "neg"
        ? "text-red-600 dark:text-red-400"
        : "";
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className={`mt-1 whitespace-nowrap text-lg font-semibold tabular-nums ${toneCls}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-zinc-500 tabular-nums">{sub}</div>}
    </div>
  );
}
