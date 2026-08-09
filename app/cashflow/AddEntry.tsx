"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { ChevronDown } from "lucide-react";
import type { Category } from "@/lib/types";
import type { RecurringMiss } from "@/lib/money";
import { createExpense } from "../expenses/actions";
import { createIncome } from "../incomes/actions";
import { useGuard } from "../useGuard";
import { btnPrimary, inputCls, selectCls } from "../ui";

/**
 * Add form and the "did you forget one" nudge, together because the nudge's
 * whole job is to open the form with something already in it.
 *
 * The nudge replaces the "repeat these amounts" idea it started as: a repeated
 * (category, amount) pair does not exist in a real ledger — rent alone changes
 * most months — but a repeated *category* does, and the useful question is not
 * "want to retype this?" but "it is the 9th and there is no rent yet".
 */
export default function AddEntry({
  categories,
  phaseStart,
  today,
  kind,
  misses,
  monthLabel,
}: {
  categories: Category[];
  phaseStart: string;
  /** Resolved server-side: the browser's clock is not the ledger's timezone. */
  today: string;
  kind: "expenses" | "incomes";
  misses: RecurringMiss[];
  monthLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const guard = useGuard();
  const formRef = useRef<HTMLFormElement>(null);
  const [prefill, setPrefill] = useState<{ categoryId: string; amount: number } | null>(null);

  const create = kind === "expenses" ? createExpense : createIncome;
  const noun = kind === "expenses" ? "expense" : "income";

  useEffect(() => {
    if (open) formRef.current?.querySelector<HTMLInputElement>('input[name="amount"]')?.focus();
  }, [open, prefill]);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(() =>
      guard(async () => {
        const res = await create(fd);
        if (res?.error) setError(res.error);
        else {
          formRef.current?.reset();
          setPrefill(null);
          setOpen(false);
        }
      }),
    );
  }

  if (categories.length === 0) {
    return (
      <p className="text-[0.8125rem] text-ink-3">
        Add {noun} categories in{" "}
        <a href="/settings" className="underline">
          Settings
        </a>{" "}
        first.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {misses.length > 0 && (
        <div className="rounded-lg border border-rule bg-surface-2/60 p-3">
          <p className="text-[0.8125rem] text-ink-2">
            <span className="font-medium text-ink">Nothing logged yet in {monthLabel}</span> for
            categories you record most months. Tap one to add it with your usual amount.
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {misses.map((m) => (
              <button
                key={m.categoryId}
                type="button"
                onClick={() => {
                  setPrefill({ categoryId: m.categoryId, amount: m.typicalAmount });
                  setOpen(true);
                }}
                className="rounded-full border border-rule bg-surface px-2.5 py-1 text-[0.75rem] hover:border-ink"
              >
                {m.categoryName}{" "}
                <span className="tabular-nums text-ink-3">
                  ₹{m.typicalAmount.toLocaleString("en-IN")}
                </span>
              </button>
            ))}
          </div>
          <p className="mt-2 text-[0.6875rem] text-ink-3">
            Shown when a category appears in at least 3 of the last 4 months. The amount is your
            median for that category over those months, not a prediction.
          </p>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`${btnPrimary} inline-flex items-center gap-1.5`}
      >
        Add {noun}
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <form
          ref={formRef}
          onSubmit={onSubmit}
          className="grid grid-cols-2 gap-2 rounded-lg border border-rule p-3 sm:grid-cols-4"
        >
          <input
            type="date"
            name="date"
            required
            min={phaseStart}
            max={today}
            defaultValue={today}
            className={inputCls}
          />
          <select
            name="category_id"
            required
            defaultValue={prefill?.categoryId ?? ""}
            key={prefill?.categoryId ?? "none"}
            className={selectCls}
          >
            <option value="" disabled>
              Category…
            </option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            name="amount"
            type="number"
            inputMode="decimal"
            step="any"
            min="0.01"
            required
            placeholder="Amount"
            defaultValue={prefill?.amount ?? ""}
            key={`amt-${prefill?.categoryId ?? "none"}`}
            className={inputCls}
          />
          <input name="note" placeholder="Note (optional)" className={`${inputCls} col-span-2 sm:col-span-1`} />
          <div className="col-span-2 flex items-center gap-3 sm:col-span-4">
            <button type="submit" disabled={pending} className={btnPrimary}>
              {pending ? "Adding…" : "Add"}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setPrefill(null);
              }}
              className="text-[0.8125rem] text-ink-3"
            >
              Cancel
            </button>
            {error && <span className="text-[0.8125rem] text-down">{error}</span>}
          </div>
        </form>
      )}
    </div>
  );
}
