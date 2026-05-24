import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Debt, DebtPayment } from "@/lib/types";
import AddDebtForm from "./AddDebtForm";

export default async function DebtsPage() {
  const supabase = await createClient();

  const [{ data: debtsData }, { data: paymentsData }] = await Promise.all([
    supabase.from("debts").select("*").order("created_at", { ascending: false }),
    supabase.from("debt_payments").select("*"),
  ]);
  const debts = (debtsData ?? []) as Debt[];
  const payments = (paymentsData ?? []) as DebtPayment[];

  const paidBy = new Map<string, number>();
  for (const p of payments) {
    paidBy.set(p.debt_id, (paidBy.get(p.debt_id) ?? 0) + Number(p.amount));
  }

  const open = debts.filter((d) => d.status === "open");
  const closed = debts.filter((d) => d.status === "closed");

  const totalPending = open.reduce((a, d) => a + (Number(d.total_payable) - (paidBy.get(d.id) ?? 0)), 0);
  const totalInterestCommit = open.reduce((a, d) => a + (Number(d.total_payable) - Number(d.principal)), 0);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Debts</h1>
        <p className="text-sm text-zinc-500">
          Each debt commits to <code>total_payable − principal</code> as interest upfront. EMIs reduce pending. Closing materializes the realized PnL.
        </p>
      </header>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Stat label="Pending (incl. future interest)" value={`₹${totalPending.toLocaleString("en-IN")}`} />
        <Stat label="Interest committed (open)" value={`₹${totalInterestCommit.toLocaleString("en-IN")}`} />
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-3 text-sm font-medium text-zinc-500">Add debt</h2>
        <AddDebtForm />
      </section>

      {open.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-medium text-zinc-500">Open</h2>
          <ul className="divide-y divide-zinc-200 overflow-hidden rounded-xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
            {open.map((d) => {
              const paid = paidBy.get(d.id) ?? 0;
              const pending = Number(d.total_payable) - paid;
              return (
                <li key={d.id}>
                  <Link href={`/debts/${d.id}`} className="block px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium">{d.description}</div>
                        <div className="text-xs text-zinc-500">
                          principal ₹{Number(d.principal).toLocaleString("en-IN")} · started {d.start_date}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm tabular-nums">₹{pending.toLocaleString("en-IN")}</div>
                        <div className="text-xs text-zinc-500 tabular-nums">paid ₹{paid.toLocaleString("en-IN")}</div>
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
            {closed.map((d) => (
              <li key={d.id}>
                <Link href={`/debts/${d.id}`} className="block px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                  <div className="text-sm font-medium text-zinc-600 dark:text-zinc-400">{d.description}</div>
                  <div className="text-xs text-zinc-500">closed {d.closed_on}</div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {debts.length === 0 && (
        <p className="rounded-xl border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700">
          No debts yet.
        </p>
      )}
    </div>
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
