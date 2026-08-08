"use client";

import { useState, useTransition } from "react";
import { createFirstPhase } from "./actions";
import { useGuard } from "../useGuard";

function todayISO() {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

export default function FirstPhaseForm() {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const guard = useGuard();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(() =>
      guard(async () => {
      const res = await createFirstPhase(fd);
      if (res?.error) setError(res.error);
    }),
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div>
        <label className="block text-xs text-ink-3">Phase name</label>
        <input
          name="name"
          required
          placeholder="e.g. Job at Acme"
          className="mt-1 w-full rounded-md border border-rule bg-surface px-3 py-2 text-sm outline-none focus:border-ink"
        />
      </div>
      <div>
        <label className="block text-xs text-ink-3">Start date</label>
        <input
          type="date"
          name="start_date"
          required
          defaultValue={todayISO()}
          className="mt-1 w-full rounded-md border border-rule bg-surface px-3 py-2 text-sm outline-none focus:border-ink"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-ground hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Creating..." : "Create phase"}
      </button>
      {error && <p className="text-sm text-down">{error}</p>}
    </form>
  );
}
