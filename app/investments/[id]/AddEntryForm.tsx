"use client";

import { useRef, useState, useTransition } from "react";
import { addInvestmentEntry } from "../actions";

function todayISO() {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

export default function AddEntryForm({ investmentId }: { investmentId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [entryType, setEntryType] = useState<"contribution" | "withdrawal" | "valuation">("contribution");
  const formRef = useRef<HTMLFormElement>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await addInvestmentEntry(fd);
      if (res?.error) setError(res.error);
      else {
        formRef.current?.reset();
        setEntryType("contribution");
      }
    });
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
          defaultValue={todayISO()}
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-100"
        />
        <input
          name="amount"
          type="number"
          step="0.01"
          min="0"
          required={!amountDisabled}
          disabled={amountDisabled}
          placeholder={amountDisabled ? "n/a" : "Cash flow amount"}
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-900 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-100"
        />
        <input
          name="total_value"
          type="number"
          step="0.01"
          min="0"
          required
          placeholder="Total value after"
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-100"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        >
          {pending ? "Adding..." : "Add entry"}
        </button>
      </div>
      <input
        name="note"
        placeholder="Note (optional)"
        className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-100"
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
