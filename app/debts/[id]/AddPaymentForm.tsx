"use client";

import { useRef, useState, useTransition } from "react";
import { addDebtPayment } from "../actions";
import { useGuard } from "../../useGuard";
import { todayInAppZone } from "../../todayLocal";
import { inputCls } from "../../ui";


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
        defaultValue={todayInAppZone()}
        className={inputCls}
      />
      <input
        name="amount"
        type="number"
        step="any"
        min="0.01"
        required
        placeholder="EMI amount"
        className={inputCls}
      />
      <input
        name="note"
        placeholder="Note (optional)"
        className={inputCls}
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-ink px-3 py-2 text-sm font-medium text-ground hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Adding..." : "Add EMI"}
      </button>
      {error && <p className="sm:col-span-4 text-sm text-down">{error}</p>}
    </form>
  );
}
