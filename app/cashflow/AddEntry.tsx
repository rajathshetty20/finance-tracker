"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { ChevronDown } from "lucide-react";
import type { Category } from "@/lib/types";
import { createExpense } from "../expenses/actions";
import { createIncome } from "../incomes/actions";
import { useGuard } from "../useGuard";
import { btnPrimary, inputCls, selectCls } from "../ui";

/** The add form, collapsed until asked for. */
export default function AddEntry({
  categories,
  phaseStart,
  today,
  kind,
}: {
  categories: Category[];
  phaseStart: string;
  /** Resolved server-side: the browser's clock is not the ledger's timezone. */
  today: string;
  kind: "expenses" | "incomes";
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const guard = useGuard();
  const formRef = useRef<HTMLFormElement>(null);

  const create = kind === "expenses" ? createExpense : createIncome;
  const noun = kind === "expenses" ? "expense" : "income";

  useEffect(() => {
    if (open) formRef.current?.querySelector<HTMLInputElement>('input[name="amount"]')?.focus();
  }, [open]);

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
            defaultValue=""
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
            className={inputCls}
          />
          <input name="note" placeholder="Note (optional)" className={`${inputCls} col-span-2 sm:col-span-1`} />
          <div className="col-span-2 flex items-center gap-3 sm:col-span-4">
            <button type="submit" disabled={pending} className={btnPrimary}>
              {pending ? "Adding…" : "Add"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
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
