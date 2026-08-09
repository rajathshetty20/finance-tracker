"use client";

import { useRef, useState, useTransition } from "react";
import { addInvestmentEntry } from "../actions";
import { useGuard } from "../../useGuard";
import { todayInAppZone } from "../../todayLocal";


export default function AddEntryForm({ investmentId }: { investmentId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const guard = useGuard();
  const [entryType, setEntryType] = useState<"contribution" | "withdrawal" | "valuation">("contribution");
  const formRef = useRef<HTMLFormElement>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(() =>
      guard(async () => {
      const res = await addInvestmentEntry(fd);
      if (res?.error) setError(res.error);
      else {
        formRef.current?.reset();
        setEntryType("contribution");
      }
    }),
    );
  }

  const amountDisabled = entryType === "valuation";

  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-3">
      <input type="hidden" name="investment_id" value={investmentId} />
      <div className="flex gap-2 text-xs">
        {(["contribution", "withdrawal", "valuation"] as const).map((t) => (
          <label key={t} className="flex items-center gap-1 cursor-pointer">
            <input
              type="radio"
              name="entry_type"
              value={t}
              checked={entryType === t}
              onChange={() => setEntryType(t)}
            />
            <span className="capitalize">{t}</span>
          </label>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <input
          type="date"
          name="date"
          required
          defaultValue={todayInAppZone()}
          className="rounded-md border border-rule bg-surface px-3 py-2 text-sm outline-none focus:border-ink"
        />
        <input
          name="amount"
          type="number"
          step="any"
          min="0"
          required={!amountDisabled}
          disabled={amountDisabled}
          placeholder={amountDisabled ? "n/a" : "Cash flow amount"}
          className="rounded-md border border-rule bg-surface px-3 py-2 text-sm outline-none focus:border-ink disabled:opacity-50"
        />
        <input
          name="total_value"
          type="number"
          step="any"
          min="0"
          required
          placeholder="Total value after"
          className="rounded-md border border-rule bg-surface px-3 py-2 text-sm outline-none focus:border-ink"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-ink px-3 py-2 text-sm font-medium text-ground hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "Adding..." : "Add entry"}
        </button>
      </div>
      <input
        name="note"
        placeholder="Note (optional)"
        className="w-full rounded-md border border-rule bg-surface px-3 py-2 text-sm outline-none focus:border-ink"
      />
      {error && <p className="text-sm text-down">{error}</p>}
    </form>
  );
}
