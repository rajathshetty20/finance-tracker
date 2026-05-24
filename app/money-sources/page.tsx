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
        <p className="text-sm text-zinc-500">
          External pots of money plus auto-created entries from phase closes, investment closes, and debt closures. Only <strong>Manual</strong> entries are editable.
        </p>
      </header>

      <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-3 text-sm font-medium text-zinc-500">Add manual entry</h2>
        <AddMoneySourceForm />
      </section>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700">
          No entries yet.
        </p>
      ) : (
        <section>
          <ul className="divide-y divide-zinc-200 overflow-hidden rounded-xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
            {rows.map((r) => <MoneySourceRow key={r.id} row={r} />)}
            <li className="flex items-center justify-between gap-3 bg-zinc-50 px-4 py-2 text-sm font-medium dark:bg-zinc-900/40">
              <span>Total</span>
              <span className={`tabular-nums ${total < 0 ? "text-red-600 dark:text-red-400" : ""}`}>
                {total < 0 ? "−" : ""}₹{Math.abs(total).toLocaleString("en-IN")}
              </span>
              <span className="w-[88px]" />
            </li>
          </ul>
        </section>
      )}
    </div>
  );
}
