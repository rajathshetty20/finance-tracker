import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { AssetClass, Investment, InvestmentEntry } from "@/lib/types";
import { xirr, formatXirr, type CashFlow } from "@/lib/xirr";
import { seriesForInvestment } from "@/lib/investmentSeries";
import { fmtDate, fmtINR } from "@/lib/dates";
import { appToday } from "@/lib/demo";
import Disclose from "../../Disclose";
import AddEntryForm from "./AddEntryForm";
import CloseForm from "./CloseForm";
import AssetClassPicker from "./AssetClassPicker";
import InvestmentChart from "../InvestmentChart";

export default async function InvestmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const today = await appToday();

  const [{ data: inv }, { data: entriesData }, { data: classesData }] = await Promise.all([
    supabase.from("investments").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("investment_entries")
      .select("*")
      .eq("investment_id", id)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase.from("asset_classes").select("*").order("name", { ascending: true }),
  ]);

  if (!inv) notFound();
  const investment = inv as Investment;
  const entries = (entriesData ?? []) as InvestmentEntry[];
  const assetClasses = (classesData ?? []) as AssetClass[];
  const assetClassName = assetClasses.find((c) => c.id === investment.asset_class_id)?.name ?? "—";
  const isOpen = investment.status === "open";

  const book = entries.reduce((a, e) => {
    if (e.entry_type === "contribution") return a + Number(e.amount);
    if (e.entry_type === "withdrawal") return a - Number(e.amount);
    return a;
  }, 0);
  const contributions = entries
    .filter((e) => e.entry_type === "contribution")
    .reduce((a, e) => a + Number(e.amount), 0);
  const market = isOpen && entries.length > 0 ? Number(entries[0].total_value_after) : 0;

  const flows: CashFlow[] = [];
  for (const e of [...entries].sort((a, b) => (a.date < b.date ? -1 : 1))) {
    if (e.entry_type === "contribution") flows.push({ date: e.date, amount: -Number(e.amount) });
    else if (e.entry_type === "withdrawal") flows.push({ date: e.date, amount: Number(e.amount) });
  }
  if (isOpen && market > 0) flows.push({ date: today, amount: market });
  const r = xirr(flows);

  // Open: market − what is still in. Closed: what came out − what went in.
  const gain = isOpen ? market - book : -book;

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <Link href="/holdings" className="text-xs text-ink-3 hover:text-ink">
          ← Holdings
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold">{investment.name}</h1>
          {!isOpen && (
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-ink-2">
              closed {investment.closed_on ? fmtDate(investment.closed_on) : ""}
            </span>
          )}
        </div>
        <p className="text-sm text-ink-3">
          {assetClassName} · opened {fmtDate(investment.opened_on)}
        </p>
      </header>

      {/* The headline is the gain, because that is the question. Book and
          market are the two numbers it comes from, on the line below. */}
      <section className="rounded-xl border border-rule bg-surface p-5">
        <div className="text-[11px] font-medium uppercase tracking-wider text-ink-3">
          {isOpen ? "Unrealized" : "Realized"}
        </div>
        <div
          className={`mt-1 text-[2.2rem] font-semibold leading-none tabular-nums ${
            gain >= 0 ? "text-up" : "text-down"
          }`}
        >
          {gain >= 0 ? "+" : "−"}
          {fmtINR(Math.abs(gain))}
        </div>
        <p className="mt-2 font-mono text-[0.6875rem] tabular-nums text-ink-3">
          {isOpen ? (
            <>
              {fmtINR(market)} market − {fmtINR(book)} in = {gain >= 0 ? "+" : "−"}
              {fmtINR(Math.abs(gain))}
            </>
          ) : (
            <>
              {fmtINR(contributions + gain)} out − {fmtINR(contributions)} in = {gain >= 0 ? "+" : "−"}
              {fmtINR(Math.abs(gain))}
            </>
          )}
          {r !== null && <> · {formatXirr(r)} a year</>}
        </p>
        <div className="mt-3">
          <AssetClassPicker
            investmentId={investment.id}
            current={assetClassName}
            options={assetClasses.map((c) => c.name)}
          />
        </div>
      </section>

      <InvestmentChart
        title="Invested vs market"
        data={seriesForInvestment(investment, entries)}
        headline={
          isOpen
            ? undefined
            : // The series ends at 0/0, so the default headline would read +0.
              { gain: -book, pct: contributions > 0 ? (-book / contributions) * 100 : 0 }
        }
      />

      {isOpen && (
        <section className="flex flex-wrap gap-2">
          <Disclose label="Add entry" tone="primary">
            <AddEntryForm investmentId={investment.id} />
          </Disclose>
          <Disclose label="Close position">
            <CloseForm investmentId={investment.id} suggestedProceeds={market} />
          </Disclose>
        </section>
      )}

      <section className="rounded-xl border border-rule bg-surface p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 className="text-sm font-medium">Entries</h2>
          <span className="text-[0.6875rem] text-ink-3">{entries.length}</span>
        </div>
        {entries.length === 0 ? (
          <p className="mt-2 text-[0.8125rem] text-ink-3">Nothing recorded yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-rule-soft">
            {entries.map((e) => (
              <li key={e.id} className="py-2">
                <div className="flex items-baseline justify-between gap-3">
                  <div className="flex min-w-0 items-baseline gap-2.5">
                    <span className="w-[68px] shrink-0 text-[0.6875rem] tabular-nums text-ink-3">
                      {fmtDate(e.date, "short")}
                    </span>
                    <span className="truncate text-sm">
                      {e.entry_type === "contribution"
                        ? "Invested"
                        : e.entry_type === "withdrawal"
                          ? "Withdrew"
                          : "Valued"}
                    </span>
                  </div>
                  <span className="shrink-0 text-right">
                    <span className="block text-sm tabular-nums">
                      {e.entry_type === "contribution" && (
                        <span className="text-down">−{fmtINR(Number(e.amount))}</span>
                      )}
                      {e.entry_type === "withdrawal" && (
                        <span className="text-up">+{fmtINR(Number(e.amount))}</span>
                      )}
                      {e.entry_type === "valuation" && <span className="text-ink-3">—</span>}
                    </span>
                    <span className="block text-[0.6875rem] tabular-nums text-ink-3">
                      worth {fmtINR(Number(e.total_value_after))}
                    </span>
                  </span>
                </div>
                {e.note && (
                  <p className="mt-0.5 pl-[78px] text-[0.75rem] leading-snug text-ink-3">{e.note}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
