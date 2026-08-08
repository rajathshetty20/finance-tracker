"use client";

import { useRef, useState, useTransition } from "react";
import { createGoal } from "./actions";
import { useGuard } from "../useGuard";

const inputCls =
  "rounded-md border border-rule bg-surface px-3 py-2 text-sm outline-none focus:border-ink";

export default function CreateGoalForm() {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const guard = useGuard();
  const formRef = useRef<HTMLFormElement>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(() =>
      guard(async () => {
      const res = await createGoal(fd);
      if (res?.error) setError(res.error);
      else formRef.current?.reset();
    }),
    );
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input name="name" required placeholder="Goal name (e.g. Home down payment)" className={inputCls} />
        <input name="description" placeholder="Description (optional)" className={inputCls} />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-xs text-ink-3">
          Target date
          <input type="date" name="end_date" required className={inputCls} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-3">
          Cost today (₹)
          <input name="present_cost" type="number" step="1" min="1" required placeholder="6000000" className={inputCls} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-3">
          Inflation (% p.a.)
          <input name="inflation_rate" type="number" step="any" min="0" defaultValue="6" className={inputCls} />
        </label>
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-ground hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Creating..." : "Create goal"}
      </button>
      <p className="text-xs text-ink-3">
        After creating, open the goal to set its glide path (how allocation shifts between asset
        classes as the date approaches).
      </p>
      {error && <p className="text-sm text-down">{error}</p>}
    </form>
  );
}
