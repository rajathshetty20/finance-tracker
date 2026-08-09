import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Debt, DebtPayment, Investment, InvestmentEntry } from "@/lib/types";
import { impliedAnnualRate } from "@/lib/debtRate";
import { portfolioXirrOverPeriod } from "@/lib/portfolioXirr";
import { formatXirr } from "@/lib/xirr";
import AddPaymentForm from "./AddPaymentForm";
import CloseDebtForm from "./CloseDebtForm";
import { appToday } from "@/lib/demo";


export default async function DebtDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [
    { data: debtData },
    { data: paymentsData },
    { data: invsData },
    { data: entriesData },
  ] = await Promise.all([
    supabase.from("debts").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("debt_payments")
      .select("*")
      .eq("debt_id", id)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase.from("investments").select("*"),
    supabase.from("investment_entries").select("*"),
  ]);

  if (!debtData) notFound();
  const debt = debtData as Debt;
  const payments = (paymentsData ?? []) as DebtPayment[];
  const invs = (invsData ?? []) as Investment[];
  const allEntries = (entriesData ?? []) as InvestmentEntry[];

  const paid = payments.reduce((a, p) => a + Number(p.amount), 0);
  const pending = Number(debt.total_payable) - paid;
  const interestCommit = Number(debt.total_payable) - Number(debt.principal);
  const closureAmount = Number(debt.principal) - paid;

  const latestEmi = payments.length > 0 ? Number(payments[0].amount) : null;
  const debtRate =
    latestEmi !== null
      ? impliedAnnualRate(Number(debt.principal), latestEmi, Number(debt.total_payable))
      : null;

  const periodEnd = debt.status === "closed" && debt.closed_on ? debt.closed_on : await appToday();
  const entriesByInvId = new Map<string, InvestmentEntry[]>();
  for (const inv of invs) entriesByInvId.set(inv.id, []);
  for (const e of allEntries) {
    const arr = entriesByInvId.get(e.investment_id);
    if (arr) arr.push(e);
  }
  const periodXirr = portfolioXirrOverPeriod(invs, entriesByInvId, debt.start_date, periodEnd);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <Link href="/holdings" className="text-xs text-ink-3 hover:text-ink">← Holdings</Link>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold">{debt.description}</h1>
          {debt.status === "closed" && (
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-ink">
              closed {debt.closed_on}
            </span>
          )}
        </div>
        <p className="text-sm text-ink-3">started {debt.start_date}</p>
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

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-ink-3">
        {payments.length > 0 && (
          <span>
            Latest EMI: <strong className="tabular-nums text-ink">₹{Number(payments[0].amount).toLocaleString("en-IN")}</strong>
            <span className="ml-1 text-ink-3">(paid {payments[0].date})</span>
          </span>
        )}
        {debt.status === "open" && (
          <span>Interest committed upfront: ₹{interestCommit.toLocaleString("en-IN")}</span>
        )}
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-ink-3">Cost vs portfolio return</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Stat label="Implied annual rate*" value={formatXirr(debtRate)} />
          <Stat
            label={`Portfolio XIRR (${debt.start_date} → ${periodEnd})`}
            value={formatXirr(periodXirr)}
          />
        </div>
        <p className="text-xs text-ink-3">
          {latestEmi !== null ? (
            <>
              * Assumes a constant monthly EMI of ₹{latestEmi.toLocaleString("en-IN")}.
            </>
          ) : (
            <>* Add an EMI payment to estimate the implied rate.</>
          )}
        </p>
      </section>

      {debt.status === "open" && (
        <>
          <section className="rounded-xl border border-rule bg-surface p-4">
            <h2 className="mb-3 text-sm font-medium text-ink-3">Add EMI</h2>
            <AddPaymentForm debtId={debt.id} />
          </section>

          <section>
            <CloseDebtForm debtId={debt.id} expectedClosureAmount={closureAmount} />
          </section>
        </>
      )}

      <section>
        <h2 className="mb-2 text-sm font-medium text-ink-3">Payments</h2>
        {payments.length === 0 ? (
          <p className="rounded-xl border border-dashed border-rule p-6 text-center text-sm text-ink-3">
            No EMIs paid yet.
          </p>
        ) : (
          <ul className="divide-y divide-rule overflow-hidden rounded-xl border border-rule bg-surface">
            {payments.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-2">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="w-20 text-xs text-ink-3 tabular-nums">{p.date}</span>
                  <span className="min-w-0 flex-1 truncate text-xs text-ink-3">{p.note}</span>
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
    <div className="rounded-xl border border-rule bg-surface p-3">
      <div className="text-xs text-ink-3">{label}</div>
      <div className="mt-1 text-sm font-semibold tabular-nums">{value}</div>
    </div>
  );
}
