"use client";

import { useState, useTransition } from "react";
import { updateCash, deleteCash } from "./actions";
import type { CashBalance } from "@/lib/types";
import { useGuard } from "../useGuard";
import RowActions from "../RowActions";
import FormError from "../FormError";

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
  const guard = useGuard();

  async function onSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(() =>
      guard(async () => {
      const res = await updateCash(fd);
      if (res?.error) setError(res.error);
      else setEditing(false);
    }),
    );
  }

  function onDelete() {
    if (!confirm(`Delete "${row.name}"?`)) return;
    setError(null);
    const fd = new FormData();
    fd.set("id", row.id);
    startTransition(() =>
      guard(async () => {
      const res = await deleteCash(fd);
      if (res?.error) setError(res.error);
    }),
    );
  }

  if (editing) {
    return (
      <li className="py-2">
        <form onSubmit={onSave} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_180px_auto]">
          <input type="hidden" name="id" value={row.id} />
          <input name="name" required defaultValue={row.name} autoFocus className="rounded-md border border-rule bg-surface px-2 py-1 text-sm" />
          <input name="amount" type="number" step="any" required defaultValue={row.amount} className="rounded-md border border-rule bg-surface px-2 py-1 text-sm" />
          <div className="flex items-center gap-2 text-xs">
            <button type="submit" disabled={pending} className="font-medium text-up disabled:opacity-60">Save</button>
            <button type="button" onClick={() => setEditing(false)} className="text-ink-3">Cancel</button>
          </div>
          {error && <p className="sm:col-span-3 text-xs text-down">{error}</p>}
        </form>
      </li>
    );
  }

  return (
    <li className="py-2">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm">{row.name}</div>
          <div className="text-[0.6875rem] text-ink-3">updated {daysAgo(row.updated_at)}</div>
        </div>
        <span className={`text-sm tabular-nums ${Number(row.amount) < 0 ? "text-down" : ""}`}>
          {Number(row.amount) < 0 ? "−" : ""}₹{Math.abs(Number(row.amount)).toLocaleString("en-IN")}
        </span>
        <RowActions onEdit={() => setEditing(true)} onDelete={onDelete} disabled={pending} />
      </div>
      <FormError>{error}</FormError>
    </li>
  );
}
