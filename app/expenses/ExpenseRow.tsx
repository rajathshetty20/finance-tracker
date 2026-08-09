"use client";

import { useState, useTransition } from "react";
import { updateExpense, deleteExpense } from "./actions";
import type { Category, EntryWithJoins } from "@/lib/types";
import { useGuard } from "../useGuard";

export default function ExpenseRow({
  entry,
  categories,
  phaseStart,
}: {
  entry: EntryWithJoins;
  categories: Category[];
  phaseStart: string;
}) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const guard = useGuard();

  const canEdit = entry.phase?.end_date === null;

  async function onSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(() =>
      guard(async () => {
      const res = await updateExpense(fd);
      if (res?.error) setError(res.error);
      else setEditing(false);
    }),
    );
  }

  function onDelete() {
    if (!confirm("Delete this expense?")) return;
    setError(null);
    const fd = new FormData();
    fd.set("id", entry.id);
    startTransition(() =>
      guard(async () => {
      const res = await deleteExpense(fd);
      if (res?.error) setError(res.error);
    }),
    );
  }

  if (editing) {
    return (
      <li className="px-4 py-3">
        <form onSubmit={onSave} className="grid grid-cols-1 gap-2 sm:grid-cols-6">
          <input type="hidden" name="id" value={entry.id} />
          <input type="date" name="date" required min={phaseStart} defaultValue={entry.date} className="rounded-md border border-rule bg-surface px-2 py-1 text-sm" />
          <select name="category_id" required defaultValue={entry.category_id} className="rounded-md border border-rule bg-surface px-2 py-1 text-sm">
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input name="amount" type="number" step="any" min="0.01" required defaultValue={entry.amount} className="rounded-md border border-rule bg-surface px-2 py-1 text-sm" />
          <input name="note" defaultValue={entry.note ?? ""} placeholder="Note" className="sm:col-span-2 rounded-md border border-rule bg-surface px-2 py-1 text-sm" />
          <div className="flex items-center gap-2 text-xs">
            <button type="submit" disabled={pending} className="font-medium text-up disabled:opacity-60">Save</button>
            <button type="button" onClick={() => setEditing(false)} className="text-ink-3">Cancel</button>
          </div>
          {error && <p className="sm:col-span-6 text-xs text-down">{error}</p>}
        </form>
      </li>
    );
  }

  return (
    <li className="flex items-center justify-between gap-3 px-4 py-2">
      <div className="flex min-w-0 flex-1 items-baseline gap-3">
        <span className="w-20 shrink-0 whitespace-nowrap text-xs text-ink-3 tabular-nums">{entry.date}</span>
        <span className="min-w-0 flex-1 truncate pr-1 text-sm">{entry.category?.name ?? "—"}</span>
        <span className="hidden min-w-0 flex-1 truncate text-xs text-ink-3 sm:block">{entry.note}</span>
      </div>
      <span className="text-sm tabular-nums text-down">−₹{Number(entry.amount).toLocaleString("en-IN")}</span>
      {canEdit && (
        <div className="flex items-center gap-3 text-xs">
          <button onClick={() => setEditing(true)} className="-my-1 inline-flex min-h-[36px] items-center px-2 text-ink-3 hover:text-ink">edit</button>
          <button onClick={onDelete} disabled={pending} className="-my-1 inline-flex min-h-[36px] items-center px-2 text-down disabled:opacity-60 hover:text-down">delete</button>
        </div>
      )}
      {error && <p className="ml-3 text-xs text-down">{error}</p>}
    </li>
  );
}
