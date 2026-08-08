import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { AssetClass, Investment, InvestmentEntry } from "@/lib/types";
import { xirr, formatXirr, type CashFlow } from "@/lib/xirr";
import { seriesForInvestment } from "@/lib/investmentSeries";
import AddEntryForm from "./AddEntryForm";
import CloseForm from "./CloseForm";
import AssetClassPicker from "./AssetClassPicker";
import InvestmentChart from "../InvestmentChart";

function todayISO() {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

export default async function InvestmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

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
  const assetClassName =
    assetClasses.find((c) => c.id === investment.asset_class_id)?.name ?? "—";

  const book = entries.reduce((a, e) => {
    if (e.entry_type === "contribution") return a + Number(e.amount);
    if (e.entry_type === "withdrawal") return a - Number(e.amount);
    return a;
  }, 0);

  const contributions = entries
    .filter((e) => e.entry_type === "contribution")
    .reduce((a, e) => a + Number(e.amount), 0);

  const market =
    investment.status === "closed"
      ? 0
      : entries.length > 0
        ? Number(entries[0].total_value_after)
        : 0;

  const flows: CashFlow[] = [];
  const sorted = [...entries].sort((a, b) => (a.date < b.date ? -1 : 1));
  for (const e of sorted) {
    if (e.entry_type === "contribution") flows.push({ date: e.date, amount: -Number(e.amount) });
    else if (e.entry_type === "withdrawal") flows.push({ date: e.date, amount: Number(e.amount) });
  }
  if (investment.status === "open" && market > 0) {
    flows.push({ date: todayISO(), amount: market });
  }
  const r = xirr(flows);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <Link href="/investments" className="text-xs text-ink-3 hover:text-ink">← Investments</Link>
        </div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold">{investment.name}</h1>
          {investment.status === "closed" && (
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-ink">
              closed {investment.closed_on}
            </span>
          )}
        </div>
        <p className="text-sm text-ink-3">{assetClassName} · opened {investment.opened_on}</p>
        <AssetClassPicker
          investmentId={investment.id}
          current={assetClassName}
          options={assetClasses.map((c) => c.name)}
        />
      </header>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Book (Σ contrib − Σ withdrawals)" value={`₹${book.toLocaleString("en-IN")}`} />
        <Stat label={investment.status === "open" ? "Market (latest NAV)" : "Market"} value={`₹${market.toLocaleString("en-IN")}`} />
        <Stat label="XIRR" value={formatXirr(r)} />
      </section>

      <InvestmentChart
        title="Invested vs market over time"
        data={seriesForInvestment(investment, entries)}
        headline={
          investment.status === "closed"
            ? // Realized gain = Σ withdrawals − Σ contributions = −book;
              // the series ends at 0/0, so the default headline would be +0.
              { gain: -book, pct: contributions > 0 ? (-book / contributions) * 100 : 0 }
            : undefined
        }
      />

      {investment.status === "open" && (
        <>
          <section className="rounded-xl border border-rule bg-surface p-4">
            <h2 className="mb-3 text-sm font-medium text-ink-3">Add entry</h2>
            <AddEntryForm investmentId={investment.id} />
          </section>
          <section>
            <CloseForm investmentId={investment.id} suggestedProceeds={market} />
          </section>
        </>
      )}

      <section>
        <h2 className="mb-2 text-sm font-medium text-ink-3">Entries</h2>
        {entries.length === 0 ? (
          <p className="rounded-xl border border-dashed border-rule p-6 text-center text-sm text-ink-3">
            No entries yet.
          </p>
        ) : (
          <ul className="divide-y divide-rule overflow-hidden rounded-xl border border-rule bg-surface">
            {entries.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 px-4 py-2">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="w-20 text-xs text-ink-3 tabular-nums">{e.date}</span>
                  <span className="w-28 text-xs">
                    <EntryTypePill type={e.entry_type} />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs text-ink-3">{e.note}</span>
                </div>
                <div className="text-right tabular-nums text-xs">
                  {e.entry_type === "contribution" && <div className="text-down">−₹{Number(e.amount).toLocaleString("en-IN")}</div>}
                  {e.entry_type === "withdrawal" && <div className="text-up">+₹{Number(e.amount).toLocaleString("en-IN")}</div>}
                  {e.entry_type === "valuation" && <div className="text-ink-3">—</div>}
                  <div className="text-ink-3">NAV ₹{Number(e.total_value_after).toLocaleString("en-IN")}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function EntryTypePill({ type }: { type: "contribution" | "withdrawal" | "valuation" }) {
  const styles: Record<typeof type, string> = {
    contribution: "bg-down-soft text-down",
    withdrawal: "bg-up-soft text-up",
    valuation: "bg-surface-2 text-ink",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${styles[type]}`}>
      {type}
    </span>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-rule bg-surface p-4">
      <div className="text-xs text-ink-3">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}
