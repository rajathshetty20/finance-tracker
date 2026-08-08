"use client";

import { useRef, useState, useTransition } from "react";
import { createInvestment } from "./actions";
import { useGuard } from "../useGuard";

function todayISO() {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

export default function AddInvestmentForm({ assetClasses }: { assetClasses: string[] }) {
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
      const res = await createInvestment(fd);
      if (res?.error) setError(res.error);
      else formRef.current?.reset();
    }),
    );
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input
          name="name"
          required
          placeholder="Name (e.g. Zerodha Nifty 50 SIP)"
          className="rounded-md border border-rule bg-surface px-3 py-2 text-sm outline-none focus:border-ink"
        />
        <input
          name="asset_class"
          list="asset-class-options"
          placeholder="Asset class (e.g. Equity, Fixed income)"
          className="rounded-md border border-rule bg-surface px-3 py-2 text-sm outline-none focus:border-ink"
        />
        <datalist id="asset-class-options">
          {assetClasses.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </div>
      <p className="text-xs text-ink-3">
        First contribution — the historical cost basis (use current value if unknown):
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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
          placeholder="Amount invested"
          className="rounded-md border border-rule bg-surface px-3 py-2 text-sm outline-none focus:border-ink"
        />
        <input
          name="total_value"
          type="number"
          step="any"
          min="0"
          required
          placeholder="Current total value"
          className="rounded-md border border-rule bg-surface px-3 py-2 text-sm outline-none focus:border-ink"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-ground hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Creating..." : "Create investment"}
      </button>
      {error && <p className="text-sm text-down">{error}</p>}
    </form>
  );
}
