"use client";

import { useState, useTransition } from "react";
import { endAndStartNewPhase } from "./actions";
import { useGuard } from "../useGuard";

function todayISO() {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

export default function EndAndStartForm({ currentName }: { currentName: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const guard = useGuard();
  const [open, setOpen] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(() =>
      guard(async () => {
      const res = await endAndStartNewPhase(fd);
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
        End phase and start new
      </button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-md border border-rule bg-surface p-4">
      <p className="text-sm text-ink-3">
        End <strong>{currentName}</strong> and start a new phase. The closing materializes a rollover entry equal to that phase&apos;s savings.
      </p>
      <div>
        <label className="block text-xs text-ink-3">End date of current phase</label>
        <input
          type="date"
          name="end_date"
          required
          defaultValue={todayISO()}
          className="mt-1 w-full rounded-md border border-rule bg-surface px-3 py-2 text-sm outline-none focus:border-ink"
        />
      </div>
      <div>
        <label className="block text-xs text-ink-3">New phase name</label>
        <input
          name="new_name"
          required
          placeholder="e.g. Sabbatical 2027"
          className="mt-1 w-full rounded-md border border-rule bg-surface px-3 py-2 text-sm outline-none focus:border-ink"
        />
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-ink px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "Working..." : "End and start new"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md px-3 py-2 text-sm text-ink-3 hover:text-ink"
        >
          Cancel
        </button>
      </div>
      {error && <p className="text-sm text-down">{error}</p>}
    </form>
  );
}
