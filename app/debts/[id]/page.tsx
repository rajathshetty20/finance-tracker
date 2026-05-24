import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Debt, DebtPayment } from "@/lib/types";
import AddPaymentForm from "./AddPaymentForm";
import CloseDebtForm from "./CloseDebtForm";

export default async function DebtDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: debtData }, { data: paymentsData }] = await Promise.all([
    supabase.from("debts").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("debt_payments")
      .select("*")
      .eq("debt_id", id)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);

  if (!debtData) notFound();
  const debt = debtData as Debt;
  const payments = (paymentsData ?? []) as DebtPayment[];

  const paid = payments.reduce((a, p) => a + Number(p.amount), 0);
  const pending = Number(debt.total_payable) - paid;
  const interestCommit = Number(debt.total_payable) - Number(debt.principal);
  const closureAmount = Number(debt.principal) - paid;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <Link href="/debts" className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">← Debts</Link>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold">{debt.description}</h1>
          {debt.status === "closed" && (
            <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-[10px] font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              closed {debt.closed_on}
            </span>
          )}
        </div>
        <p className="text-sm text-zinc-500">started {debt.start_date}</p>
      </header>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Principal" value={`₹${Number(debt.principal).toLocaleString("en-IN")}`} />
        <Stat label="Total payable" value={`₹${Number(debt.total_payable).toLocaleString("en-IN")}`} />
        <Stat label="Paid" value={`₹${paid.toLocaleString("en-IN")}`} />
        <Stat label={debt.status === "open" ? "Pending" : "Closure amount"} value={debt.status === "open"
          ? `₹${pending.toLocaleString("en-IN")}`
          : `${closureAmount >= 0 ? "+" : "−"}₹${Math.abs(closureAmount).toLocaleString("en-IN")}`
        } />
      </section>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-zinc-500">
        {payments.length > 0 && (
          <span>
            Latest EMI: <strong className="tabular-nums text-zinc-700 dark:text-zinc-200">₹{Number(payments[0].amount).toLocaleString("en-IN")}</strong>
            <span className="ml-1 text-zinc-400">(paid {payments[0].date})</span>
          </span>
        )}
        {debt.status === "open" && (
          <span>Interest committed upfront: ₹{interestCommit.toLocaleString("en-IN")}</span>
        )}
      </div>

      {debt.status === "open" && (
        <>
          <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="mb-3 text-sm font-medium text-zinc-500">Add EMI</h2>
            <AddPaymentForm debtId={debt.id} />
          </section>

          <section>
            <CloseDebtForm debtId={debt.id} expectedClosureAmount={closureAmount} />
          </section>
        </>
      )}

      <section>
        <h2 className="mb-2 text-sm font-medium text-zinc-500">Payments</h2>
        {payments.length === 0 ? (
          <p className="rounded-xl border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700">
            No EMIs paid yet.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-200 overflow-hidden rounded-xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
            {payments.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-2">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="w-20 text-xs text-zinc-500 tabular-nums">{p.date}</span>
                  <span className="min-w-0 flex-1 truncate text-xs text-zinc-500">{p.note}</span>
                </div>
                <span className="text-sm tabular-nums">₹{Number(p.amount).toLocaleString("en-IN")}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="mt-1 text-sm font-semibold tabular-nums">{value}</div>
    </div>
  );
}
