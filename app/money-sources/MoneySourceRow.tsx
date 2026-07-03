"use client";

import { useState, useTransition } from "react";
import { updateManualMoneySource, deleteManualMoneySource } from "./actions";
import type { MoneySource } from "@/lib/types";

const KIND_LABEL: Record<MoneySource["kind"], string> = {
  manual: "Manual",
  opening_balance: "Opening balance",
  phase_rollover: "Phase rollover",
  realized_gain: "Realized gain",
  debt_closure: "Debt closure",
};

const KIND_PILL: Record<MoneySource["kind"], string> = {
  manual: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  opening_balance: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  phase_rollover: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  realized_gain: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  debt_closure: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
};

export default function MoneySourceRow({ row }: { row: MoneySource }) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const isManual = row.kind === "manual";

  async function onSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await updateManualMoneySource(fd);
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
      const res = await deleteManualMoneySource(fd);
      if (res?.error) setError(res.error);
    });
  }

  if (editing) {
    return (
      <li className="px-4 py-3">
        <form onSubmit={onSave} className="grid grid-cols-1 gap-2 sm:grid-cols-[140px_1fr_180px_auto]">
          <input type="hidden" name="id" value={row.id} />
          <input type="date" name="date" required defaultValue={row.date} className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900" />
          <input name="name" required defaultValue={row.name} className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900" />
          <input name="amount" type="number" step="0.01" required defaultValue={row.amount} className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900" />
          <div className="flex items-center gap-2 text-xs">
            <button type="submit" disabled={pending} className="font-medium text-emerald-700 disabled:opacity-60 dark:text-emerald-400">Save</button>
            <button type="button" onClick={() => setEditing(false)} className="text-zinc-500">Cancel</button>
          </div>
          {error && <p className="sm:col-span-4 text-xs text-red-600">{error}</p>}
        </form>
      </li>
    );
  }

  const sign = Number(row.amount) < 0;
  return (
    <li className="px-4 py-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate text-sm">{row.name}</span>
        <span className={`shrink-0 text-sm tabular-nums ${sign ? "text-red-600 dark:text-red-400" : ""}`}>
          {sign ? "−" : ""}₹{Math.abs(Number(row.amount)).toLocaleString("en-IN")}
        </span>
      </div>
      <div className="mt-1 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-xs text-zinc-500 tabular-nums">{row.date}</span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${KIND_PILL[row.kind]}`}>
            {KIND_LABEL[row.kind]}
          </span>
        </div>
        {isManual ? (
          <div className="flex shrink-0 items-center gap-3 text-xs">
            <button onClick={() => setEditing(true)} className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">edit</button>
            <button onClick={onDelete} disabled={pending} className="text-red-600 disabled:opacity-60 hover:text-red-700">delete</button>
          </div>
        ) : (
          <span className="shrink-0 text-xs text-zinc-400">auto</span>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </li>
  );
}
