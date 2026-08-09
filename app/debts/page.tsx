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
        <p className="text-sm text-ink-3">
          A loan books all of its interest the day you take it, so pending is
          everything still owed — principal and interest together. Each EMI
          reduces it. Closing one records the gain or loss against what you
          actually paid.
        </p>
      </header>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Stat label="Pending (incl. future interest)" value={`₹${totalPending.toLocaleString("en-IN")}`} />
        <Stat label="Total interest committed" value={`₹${totalInterestCommit.toLocaleString("en-IN")}`} />
      </section>

      <section className="rounded-xl border border-rule bg-surface p-4">
        <h2 className="mb-3 text-sm font-medium text-ink-3">Add debt</h2>
        <AddDebtForm />
      </section>

      {open.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-medium text-ink-3">Open</h2>
          <ul className="divide-y divide-rule overflow-hidden rounded-xl border border-rule bg-surface">
            {open.map((d) => (
              <li key={d.id}>
                <Link href={`/debts/${d.id}`} className="block px-4 py-3 hover:bg-surface-2">
                  <div className="text-sm font-medium">{d.description}</div>
                  <div className="text-xs text-ink-3">
                    principal ₹{Number(d.principal).toLocaleString("en-IN")} · started {d.start_date}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {closed.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-medium text-ink-3">Closed</h2>
          <ul className="divide-y divide-rule overflow-hidden rounded-xl border border-rule bg-surface">
            {closed.map((d) => (
              <li key={d.id}>
                <Link href={`/debts/${d.id}`} className="block px-4 py-3 hover:bg-surface-2">
                  <div className="text-sm font-medium text-ink-2">{d.description}</div>
                  <div className="text-xs text-ink-3">closed {d.closed_on}</div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {debts.length === 0 && (
        <p className="rounded-xl border border-dashed border-rule p-6 text-center text-sm text-ink-3">
          No debts yet.
        </p>
      )}
    </div>
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
