"use client";

import { useRef, useState, useTransition } from "react";
import { createIncome } from "./actions";
import type { Category } from "@/lib/types";

function todayISO() {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

export default function AddIncomeForm({
  categories,
  phaseStart,
}: {
  categories: Category[];
  phaseStart: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await createIncome(fd);
      if (res?.error) setError(res.error);
      else formRef.current?.reset();
    });
  }

  if (categories.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        Add an income category in <a href="/settings" className="underline">Categories</a> first.
      </p>
    );
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-5">
      <input
        type="date"
        name="date"
        required
        min={phaseStart}
        defaultValue={todayISO()}
        className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-100"
      />
      <select
        name="category_id"
        required
        defaultValue=""
        className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-100"
      >
        <option value="" disabled>Category…</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
      <input
        name="amount"
        type="number"
        inputMode="decimal"
        step="0.01"
        min="0.01"
        required
        placeholder="Amount"
        className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-100"
      />
      <input
        name="note"
        placeholder="Note (optional)"
        className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-100"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
      >
        {pending ? "Adding..." : "Add"}
      </button>
      {error && <p className="sm:col-span-5 text-sm text-red-600">{error}</p>}
    </form>
  );
}
