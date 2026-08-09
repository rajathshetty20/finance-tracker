import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Debt, DebtPayment, Investment, InvestmentEntry } from "@/lib/types";
import { impliedAnnualRate } from "@/lib/debtRate";
import { portfolioXirrOverPeriod } from "@/lib/portfolioXirr";
import { formatXirr } from "@/lib/xirr";
import { fmtDate, fmtINR } from "@/lib/dates";
import { appToday } from "@/lib/demo";
import { DiscloseRow } from "../../Disclose";
import AddPaymentForm from "./AddPaymentForm";
import CloseDebtForm from "./CloseDebtForm";

export default async function DebtDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const today = await appToday();

  const [{ data: debtData }, { data: paymentsData }, { data: invsData }, { data: entriesData }] =
    await Promise.all([
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
  const isOpen = debt.status === "open";

  const paid = payments.reduce((a, p) => a + Number(p.amount), 0);
  const payable = Number(debt.total_payable);
  const principal = Number(debt.principal);
  const pending = payable - paid;
  const interest = payable - principal;
  const pct = payable > 0 ? (paid / payable) * 100 : 0;
  const closureAmount = principal - paid;

  const latestEmi = payments.length > 0 ? Number(payments[0].amount) : null;
  const implied = latestEmi !== null ? impliedAnnualRate(principal, latestEmi, payable) : null;
  const monthsLeft = latestEmi && latestEmi > 0 ? Math.ceil(pending / latestEmi) : null;

  const entriesByInvId = new Map<string, InvestmentEntry[]>();
  for (const inv of invs) entriesByInvId.set(inv.id, []);
  for (const e of allEntries) entriesByInvId.get(e.investment_id)?.push(e);
  const periodEnd = !isOpen && debt.closed_on ? debt.closed_on : today;
  const periodXirr = portfolioXirrOverPeriod(invs, entriesByInvId, debt.start_date, periodEnd);

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <Link href="/holdings" className="text-xs text-ink-3 hover:text-ink">
          ← Holdings
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold leading-snug">{debt.description}</h1>
          {!isOpen && (
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-ink-2">
              closed {debt.closed_on ? fmtDate(debt.closed_on) : ""}
            </span>
          )}
        </div>
        <p className="text-sm text-ink-3">started {fmtDate(debt.start_date)}</p>
      </header>

      <section className="rounded-xl border border-rule bg-surface p-5">
        <div className="text-[11px] font-medium uppercase tracking-wider text-ink-3">
          {isOpen ? "Still to pay" : "Settled"}
        </div>
        <div className="mt-1 text-[2.2rem] font-semibold leading-none tabular-nums">
          {fmtINR(isOpen ? pending : paid)}
        </div>

        <div className="mt-4 h-2 overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full rounded-full bg-debt"
            style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
          />
        </div>
        <p className="mt-2 font-mono text-[0.6875rem] tabular-nums text-ink-3">
          {fmtINR(principal)} borrowed + {fmtINR(interest)} interest = {fmtINR(payable)} ·{" "}
          {fmtINR(paid)} paid ({pct.toFixed(0)}%)
        </p>

        {/* One rate for what it costs, one for what the money would have done
            instead. Prepaying earns the first, risk free. */}
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-0.5 border-t border-rule-soft pt-3 font-mono text-[0.6875rem] tabular-nums text-ink-3">
          {latestEmi !== null && (
            <span>
              EMI {fmtINR(latestEmi)}
              {monthsLeft !== null && isOpen && <> · ~{monthsLeft} left</>}
            </span>
          )}
          {implied !== null && <span>{formatXirr(implied)} p.a. cost</span>}
          {periodXirr !== null && <span>{formatXirr(periodXirr)} p.a. portfolio</span>}
        </div>
      </section>

      {isOpen && (
        <section>
          <DiscloseRow
            items={[
              { label: "Add EMI", tone: "primary", content: <AddPaymentForm debtId={debt.id} /> },
              {
                label: "Mark this debt repaid",
                content: (
                  <CloseDebtForm debtId={debt.id} expectedClosureAmount={closureAmount} />
                ),
              },
            ]}
          />
        </section>
      )}

      <section className="rounded-xl border border-rule bg-surface p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 className="text-sm font-medium">Payments</h2>
          <span className="text-[0.6875rem] tabular-nums text-ink-3">
            {payments.length} · {fmtINR(paid)}
          </span>
        </div>
        {payments.length === 0 ? (
          <p className="mt-2 text-[0.8125rem] text-ink-3">Nothing paid yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-rule-soft">
            {payments.map((p) => (
              <li key={p.id} className="flex items-baseline justify-between gap-3 py-2">
                <span className="w-[92px] shrink-0 text-[0.6875rem] tabular-nums text-ink-3">
                  {fmtDate(p.date)}
                </span>
                <span className="min-w-0 flex-1 truncate text-[0.75rem] text-ink-3">{p.note}</span>
                <span className="shrink-0 text-sm tabular-nums">{fmtINR(Number(p.amount))}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
