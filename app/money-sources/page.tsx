import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { MoneySource } from "@/lib/types";
import AddMoneySourceForm from "./AddMoneySourceForm";
import Disclose from "../Disclose";
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
      <header className="space-y-1">
        <Link href="/" className="text-xs text-ink-3 hover:text-ink">
          ← Home
        </Link>
        <h1 className="text-2xl font-semibold">Money sources</h1>
        <p className="text-sm text-ink-3">
          Where capital came from, other than earning it: opening balances, gifts, phase rollovers,
          realized gains, debt closures. This is the audit trail behind the balance check on Home —
          when implied cash and recorded cash disagree, a missing entry here is the usual cause.
          Only <strong>Manual</strong> entries are editable.
        </p>
      </header>

      <section className="rounded-xl border border-rule bg-surface p-4">
        <Disclose label="Add manual entry" tone="primary">
          <AddMoneySourceForm />
        </Disclose>
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
