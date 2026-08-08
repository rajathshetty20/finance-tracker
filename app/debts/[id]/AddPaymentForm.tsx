"use client";

import { useRef, useState, useTransition } from "react";
import { addDebtPayment } from "../actions";
import { useGuard } from "../../useGuard";

function todayISO() {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

export default function AddPaymentForm({ debtId }: { debtId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const guard = useGuard();
  const formRef = useRef<HTMLFormElement>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(() =>
      guard(async () => {
      const res = await addDebtPayment(fd);
      if (res?.error) setError(res.error);
      else formRef.current?.reset();
    }),
    );
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-4">
      <input type="hidden" name="debt_id" value={debtId} />
      <input
        type="date"
        name="date"
        required
        defaultValue={todayISO()}
        className="rounded-md border border-rule bg-surface px-3 py-2 text-sm outline-none focus:border-ink"
      />
      <input
        name="amount"
        type="number"
        step="any"
        min="0.01"
        required
        placeholder="EMI amount"
        className="rounded-md border border-rule bg-surface px-3 py-2 text-sm outline-none focus:border-ink"
      />
      <input
        name="note"
        placeholder="Note (optional)"
        className="rounded-md border border-rule bg-surface px-3 py-2 text-sm outline-none focus:border-ink"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-ink px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Adding..." : "Add EMI"}
      </button>
      {error && <p className="sm:col-span-4 text-sm text-down">{error}</p>}
    </form>
  );
}
