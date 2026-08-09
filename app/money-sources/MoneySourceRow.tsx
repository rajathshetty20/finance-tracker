"use client";

import { useState, useTransition } from "react";
import { updateManualMoneySource, deleteManualMoneySource } from "./actions";
import type { MoneySource } from "@/lib/types";
import { useGuard } from "../useGuard";

const KIND_LABEL: Record<MoneySource["kind"], string> = {
  manual: "Manual",
  opening_balance: "Opening balance",
  phase_rollover: "Phase rollover",
  realized_gain: "Realized gain",
  debt_closure: "Debt closure",
};

const KIND_PILL: Record<MoneySource["kind"], string> = {
  manual: "bg-surface-2 text-ink",
  opening_balance: "bg-accent-soft text-accent-ink",
  phase_rollover: "bg-warn-soft text-warn",
  realized_gain: "bg-up-soft text-up",
  debt_closure: "bg-down-soft text-down",
};

export default function MoneySourceRow({ row }: { row: MoneySource }) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const guard = useGuard();

  const isManual = row.kind === "manual";

  async function onSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(() =>
      guard(async () => {
      const res = await updateManualMoneySource(fd);
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
      const res = await deleteManualMoneySource(fd);
      if (res?.error) setError(res.error);
    }),
    );
  }

  if (editing) {
    return (
      <li className="px-4 py-3">
        <form onSubmit={onSave} className="grid grid-cols-1 gap-2 sm:grid-cols-[140px_1fr_180px_auto]">
          <input type="hidden" name="id" value={row.id} />
          <input type="date" name="date" required defaultValue={row.date} className="rounded-md border border-rule bg-surface px-2 py-1 text-sm" />
          <input name="name" required defaultValue={row.name} className="rounded-md border border-rule bg-surface px-2 py-1 text-sm" />
          <input name="amount" type="number" step="any" required defaultValue={row.amount} className="rounded-md border border-rule bg-surface px-2 py-1 text-sm" />
          <div className="flex items-center gap-2 text-xs">
            <button type="submit" disabled={pending} className="font-medium text-up disabled:opacity-60">Save</button>
            <button type="button" onClick={() => setEditing(false)} className="text-ink-3">Cancel</button>
          </div>
          {error && <p className="sm:col-span-4 text-xs text-down">{error}</p>}
        </form>
      </li>
    );
  }

  const sign = Number(row.amount) < 0;
  return (
    <li className="px-4 py-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate text-sm">{row.name}</span>
        <span className={`shrink-0 text-sm tabular-nums ${sign ? "text-down" : ""}`}>
          {sign ? "−" : ""}₹{Math.abs(Number(row.amount)).toLocaleString("en-IN")}
        </span>
      </div>
      <div className="mt-1 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-xs text-ink-3 tabular-nums">{row.date}</span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${KIND_PILL[row.kind]}`}>
            {KIND_LABEL[row.kind]}
          </span>
        </div>
        {isManual ? (
          <div className="flex shrink-0 items-center gap-3 text-xs">
            <button onClick={() => setEditing(true)} className="-my-1 inline-flex min-h-[36px] items-center px-2 text-ink-3 hover:text-ink">edit</button>
            <button onClick={onDelete} disabled={pending} className="-my-1 inline-flex min-h-[36px] items-center px-2 text-down disabled:opacity-60 hover:text-down">delete</button>
          </div>
        ) : (
          <span className="shrink-0 text-xs text-ink-3">auto</span>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-down">{error}</p>}
    </li>
  );
}
