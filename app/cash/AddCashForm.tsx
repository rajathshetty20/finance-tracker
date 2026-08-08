"use client";

import { useRef, useState, useTransition } from "react";
import { createCash } from "./actions";
import { useGuard } from "../useGuard";

export default function AddCashForm() {
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
      const res = await createCash(fd);
      if (res?.error) setError(res.error);
      else formRef.current?.reset();
    }),
    );
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_180px_auto]">
      <input
        name="name"
        required
        placeholder="e.g. HDFC Savings"
        className="rounded-md border border-rule bg-surface px-3 py-2 text-sm outline-none focus:border-ink"
      />
      <input
        name="amount"
        type="number"
        inputMode="decimal"
        step="any"
        required
        placeholder="Amount (negative ok)"
        className="rounded-md border border-rule bg-surface px-3 py-2 text-sm outline-none focus:border-ink"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-ink px-3 py-2 text-sm font-medium text-ground hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Adding..." : "Add"}
      </button>
      {error && <p className="sm:col-span-3 text-sm text-down">{error}</p>}
    </form>
  );
}
