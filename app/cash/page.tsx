import { createClient } from "@/lib/supabase/server";
import type { CashBalance } from "@/lib/types";
import AddCashForm from "./AddCashForm";
import CashRow from "./CashRow";

export default async function CashPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("cash_balances")
    .select("*")
    .order("created_at", { ascending: true });
  const rows = (data ?? []) as CashBalance[];

  const total = rows.reduce((a, r) => a + Number(r.amount), 0);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Cash balances</h1>
        <p className="text-sm text-ink-3">
          One row per bank or wallet. These are <strong>directly editable</strong> — the app never auto-updates them.
        </p>
      </header>

      <section className="rounded-xl border border-rule bg-surface p-4">
        <h2 className="mb-3 text-sm font-medium text-ink-3">Add cash entry</h2>
        <AddCashForm />
      </section>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-rule p-6 text-center text-sm text-ink-3">
          No cash entries yet.
        </p>
      ) : (
        <section>
          <ul className="divide-y divide-rule overflow-hidden rounded-xl border border-rule bg-surface">
            {rows.map((r) => <CashRow key={r.id} row={r} />)}
            <li className="flex items-center justify-between gap-3 bg-surface-2 px-4 py-2 text-sm font-medium">
              <span>Total</span>
              <span className={`tabular-nums ${total < 0 ? "text-down" : ""}`}>
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
