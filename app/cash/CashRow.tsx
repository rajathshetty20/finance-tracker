"use client";

import { useState, useTransition } from "react";
import { updateCash, deleteCash } from "./actions";
import type { CashBalance } from "@/lib/types";

function daysAgo(iso: string) {
  const then = new Date(iso).getTime();
  const days = Math.floor((Date.now() - then) / (1000 * 60 * 60 * 24));
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

export default function CashRow({ row }: { row: CashBalance }) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function onSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await updateCash(fd);
      if (res?.error) setError(res.error);
      else setEditing(false);
    });
  }

  function onDelete() {
    if (!confirm(`Delete "${row.name}"?`)) return;
    setError(null);
    const fd = new FormData();
    fd.set("id", row.id);
    startTransition(async () => {
      const res = await deleteCash(fd);
      if (res?.error) setError(res.error);
    });
  }

  if (editing) {
    return (
      <li className="px-4 py-3">
        <form onSubmit={onSave} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_180px_auto]">
          <input type="hidden" name="id" value={row.id} />
          <input name="name" required defaultValue={row.name} autoFocus className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900" />
          <input name="amount" type="number" step="0.01" required defaultValue={row.amount} className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900" />
          <div className="flex items-center gap-2 text-xs">
            <button type="submit" disabled={pending} className="font-medium text-emerald-700 disabled:opacity-60 dark:text-emerald-400">Save</button>
            <button type="button" onClick={() => setEditing(false)} className="text-zinc-500">Cancel</button>
          </div>
          {error && <p className="sm:col-span-3 text-xs text-red-600">{error}</p>}
        </form>
      </li>
    );
  }

  return (
    <li className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{row.name}</div>
        <div className="text-xs text-zinc-500">updated {daysAgo(row.updated_at)}</div>
      </div>
      <span className={`text-sm tabular-nums ${Number(row.amount) < 0 ? "text-red-600 dark:text-red-400" : ""}`}>
        {Number(row.amount) < 0 ? "−" : ""}₹{Math.abs(Number(row.amount)).toLocaleString("en-IN")}
      </span>
      <div className="flex items-center gap-3 text-xs">
        <button onClick={() => setEditing(true)} className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">edit</button>
        <button onClick={onDelete} disabled={pending} className="text-red-600 disabled:opacity-60 hover:text-red-700">delete</button>
      </div>
      {error && <p className="ml-3 text-xs text-red-600">{error}</p>}
    </li>
  );
}
