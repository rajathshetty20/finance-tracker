"use client";

import { useRef, useState, useTransition } from "react";
import { createDebt } from "./actions";
import { useGuard } from "../useGuard";

function todayISO() {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

export default function AddDebtForm() {
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
      const res = await createDebt(fd);
      if (res?.error) setError(res.error);
      else formRef.current?.reset();
    }),
    );
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-3">
      <input
        name="description"
        required
        placeholder="Description (e.g. HDFC home loan)"
        className="w-full rounded-md border border-rule bg-surface px-3 py-2 text-sm outline-none focus:border-ink"
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <input
          type="date"
          name="start_date"
          required
          defaultValue={todayISO()}
          className="rounded-md border border-rule bg-surface px-3 py-2 text-sm outline-none focus:border-ink"
        />
        <input
          name="principal"
          type="number"
          step="any"
          min="0.01"
          required
          placeholder="Principal"
          className="rounded-md border border-rule bg-surface px-3 py-2 text-sm outline-none focus:border-ink"
        />
        <input
          name="total_payable"
          type="number"
          step="any"
          min="0.01"
          required
          placeholder="Total payable (principal + interest)"
          className="rounded-md border border-rule bg-surface px-3 py-2 text-sm outline-none focus:border-ink"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Creating..." : "Create debt"}
      </button>
      {error && <p className="text-sm text-down">{error}</p>}
    </form>
  );
}
