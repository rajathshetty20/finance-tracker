import { createClient } from "@/lib/supabase/server";
import type { MoneySource } from "@/lib/types";
import AddMoneySourceForm from "./AddMoneySourceForm";
import MoneySourceRow from "./MoneySourceRow";

export default async function MoneySourcesPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("money_sources")
    .select("*")
    .order("date", { ascending: false });
  const rows = (data ?? []) as MoneySource[];

  const total = rows.reduce((a, r) => a + Number(r.amount), 0);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Money sources</h1>
        <p className="text-sm text-ink-3">
          External pots of money plus auto-created entries from phase closes, investment closes, and debt closures. Only <strong>Manual</strong> entries are editable.
        </p>
      </header>

      <section className="rounded-xl border border-rule bg-surface p-4">
        <h2 className="mb-3 text-sm font-medium text-ink-3">Add manual entry</h2>
        <AddMoneySourceForm />
      </section>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-rule p-6 text-center text-sm text-ink-3">
          No entries yet.
        </p>
      ) : (
        <section>
          <ul className="divide-y divide-rule overflow-hidden rounded-xl border border-rule bg-surface">
            {rows.map((r) => <MoneySourceRow key={r.id} row={r} />)}
            <li className="flex items-baseline justify-between gap-3 bg-surface-2 px-4 py-2.5 text-sm font-medium">
              <span>Total</span>
              <span className={`tabular-nums ${total < 0 ? "text-down" : ""}`}>
                {total < 0 ? "−" : ""}₹{Math.abs(total).toLocaleString("en-IN")}
              </span>
            </li>
          </ul>
        </section>
      )}
    </div>
  );
}
