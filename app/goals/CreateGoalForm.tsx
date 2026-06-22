"use client";

import { useRef, useState, useTransition } from "react";
import { createGoal } from "./actions";

const inputCls =
  "rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-100";

export default function CreateGoalForm() {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await createGoal(fd);
      if (res?.error) setError(res.error);
      else formRef.current?.reset();
    });
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input name="name" required placeholder="Goal name (e.g. Home down payment)" className={inputCls} />
        <input name="description" placeholder="Description (optional)" className={inputCls} />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <label className="flex flex-col gap-1 text-xs text-zinc-500">
          Target date
          <input type="date" name="end_date" required className={inputCls} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-500">
          Cost today (₹)
          <input name="present_cost" type="number" step="1" min="1" required placeholder="6000000" className={inputCls} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-500">
          Inflation (% p.a.)
          <input name="inflation_rate" type="number" step="0.1" min="0" defaultValue="6" className={inputCls} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-500">
          Priority (lower first)
          <input name="priority" type="number" step="1" placeholder="auto" className={inputCls} />
        </label>
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
      >
        {pending ? "Creating..." : "Create goal"}
      </button>
      <p className="text-xs text-zinc-500">
        After creating, open the goal to set its glide path (how allocation shifts between asset
        classes as the date approaches).
      </p>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
