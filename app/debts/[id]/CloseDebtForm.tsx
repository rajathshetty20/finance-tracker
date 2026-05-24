"use client";

import { useState, useTransition } from "react";
import { closeDebt } from "../actions";

function todayISO() {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

export default function CloseDebtForm({ debtId, expectedClosureAmount }: { debtId: string; expectedClosureAmount: number }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await closeDebt(fd);
      if (res?.error) setError(res.error);
      else setOpen(false);
    });
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-md border border-zinc-300 px-3 py-2 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
      >
        Close debt
      </button>
    );
  }

  const sign = expectedClosureAmount >= 0 ? "+" : "−";
  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-md border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <input type="hidden" name="debt_id" value={debtId} />
      <p className="text-sm text-zinc-500">
        Closes the debt. A <code>debt_closure</code> money source will be created for{" "}
        <strong>{sign}₹{Math.abs(expectedClosureAmount).toLocaleString("en-IN")}</strong> (= principal − Σ payments).
        {expectedClosureAmount < 0 && " Negative = realized interest loss."}
        {expectedClosureAmount > 0 && " Positive = creditor forgave / you settled below principal."}
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input
          type="date"
          name="close_date"
          required
          defaultValue={todayISO()}
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-100"
        />
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-rose-600 px-3 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-60"
          >
            {pending ? "Closing..." : "Confirm close"}
          </button>
          <button type="button" onClick={() => setOpen(false)} className="rounded-md px-3 py-2 text-sm text-zinc-500">
            Cancel
          </button>
        </div>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
