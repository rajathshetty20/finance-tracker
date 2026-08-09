"use client";

import { useState, useTransition } from "react";
import { closeDebt } from "../actions";
import { useGuard } from "../../useGuard";
import { todayInAppZone } from "../../todayLocal";


export default function CloseDebtForm({ debtId, expectedClosureAmount }: { debtId: string; expectedClosureAmount: number }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const guard = useGuard();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(() =>
      guard(async () => {
      const res = await closeDebt(fd);
      if (res?.error) setError(res.error);
      else setOpen(false);
    }),
    );
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-md border border-rule px-3 py-2 text-sm hover:bg-surface-2"
      >
        Close debt
      </button>
    );
  }

  const sign = expectedClosureAmount >= 0 ? "+" : "−";
  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-md border border-rule bg-surface p-4">
      <input type="hidden" name="debt_id" value={debtId} />
      <p className="text-sm text-ink-3">
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
          defaultValue={todayInAppZone()}
          className="rounded-md border border-rule bg-surface px-3 py-2 text-sm outline-none focus:border-ink"
        />
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-down px-3 py-2 text-sm font-medium text-white hover:bg-down disabled:opacity-60"
          >
            {pending ? "Closing..." : "Confirm close"}
          </button>
          <button type="button" onClick={() => setOpen(false)} className="rounded-md px-3 py-2 text-sm text-ink-3">
            Cancel
          </button>
        </div>
      </div>
      {error && <p className="text-sm text-down">{error}</p>}
    </form>
  );
}
