import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Investment, InvestmentEntry } from "@/lib/types";
import { xirr, formatXirr, type CashFlow } from "@/lib/xirr";
import AddEntryForm from "./AddEntryForm";
import CloseForm from "./CloseForm";

function todayISO() {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

export default async function InvestmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: inv }, { data: entriesData }] = await Promise.all([
    supabase.from("investments").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("investment_entries")
      .select("*")
      .eq("investment_id", id)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);

  if (!inv) notFound();
  const investment = inv as Investment;
  const entries = (entriesData ?? []) as InvestmentEntry[];

  const book = entries.reduce((a, e) => {
    if (e.entry_type === "contribution") return a + Number(e.amount);
    if (e.entry_type === "withdrawal") return a - Number(e.amount);
    return a;
  }, 0);

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
          <Link href="/investments" className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">← Investments</Link>
        </div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold">{investment.name}</h1>
          {investment.status === "closed" && (
            <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-[10px] font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              closed {investment.closed_on}
            </span>
          )}
        </div>
        <p className="text-sm text-zinc-500">{investment.kind ?? "—"} · opened {investment.opened_on}</p>
      </header>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Book (Σ contrib − Σ withdrawals)" value={`₹${book.toLocaleString("en-IN")}`} />
        <Stat label={investment.status === "open" ? "Market (latest NAV)" : "Market"} value={`₹${market.toLocaleString("en-IN")}`} />
        <Stat label="XIRR" value={formatXirr(r)} />
      </section>

      {investment.status === "open" && (
        <>
          <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="mb-3 text-sm font-medium text-zinc-500">Add entry</h2>
            <AddEntryForm investmentId={investment.id} />
          </section>
          <section>
            <CloseForm investmentId={investment.id} suggestedProceeds={market} />
          </section>
        </>
      )}

      <section>
        <h2 className="mb-2 text-sm font-medium text-zinc-500">Entries</h2>
        {entries.length === 0 ? (
          <p className="rounded-xl border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700">
            No entries yet.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-200 overflow-hidden rounded-xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
            {entries.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 px-4 py-2">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="w-20 text-xs text-zinc-500 tabular-nums">{e.date}</span>
                  <span className="w-28 text-xs">
                    <EntryTypePill type={e.entry_type} />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs text-zinc-500">{e.note}</span>
                </div>
                <div className="text-right tabular-nums text-xs">
                  {e.entry_type === "contribution" && <div className="text-red-600 dark:text-red-400">−₹{Number(e.amount).toLocaleString("en-IN")}</div>}
                  {e.entry_type === "withdrawal" && <div className="text-emerald-700 dark:text-emerald-400">+₹{Number(e.amount).toLocaleString("en-IN")}</div>}
                  {e.entry_type === "valuation" && <div className="text-zinc-400">—</div>}
                  <div className="text-zinc-500">NAV ₹{Number(e.total_value_after).toLocaleString("en-IN")}</div>
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
    contribution: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
    withdrawal: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
    valuation: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${styles[type]}`}>
      {type}
    </span>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}
