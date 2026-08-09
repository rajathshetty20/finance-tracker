"use client";

import { useState, useTransition } from "react";
import type { Category, EntryWithJoins } from "@/lib/types";
import { updateExpense, deleteExpense } from "../expenses/actions";
import { updateIncome, deleteIncome } from "../incomes/actions";
import { useGuard } from "../useGuard";
import { inputCls, selectCls } from "../ui";

/**
 * One ledger line, for either book.
 *
 * The note gets its own line rather than a `truncate` competing with the date,
 * category and amount on one row — at 402px that left four words of a sentence
 * whose whole purpose is to explain an unusual entry.
 */
export default function EntryRow({
  entry,
  categories,
  phaseStart,
  kind,
}: {
  entry: EntryWithJoins;
  categories: Category[];
  phaseStart: string;
  kind: "expenses" | "incomes";
}) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const guard = useGuard();

  const canEdit = entry.phase?.end_date === null;
  const update = kind === "expenses" ? updateExpense : updateIncome;
  const remove = kind === "expenses" ? deleteExpense : deleteIncome;

  function onSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(() =>
      guard(async () => {
        const res = await update(fd);
        if (res?.error) setError(res.error);
        else setEditing(false);
      }),
    );
  }

  function onDelete() {
    if (!confirm(`Delete this ${kind === "expenses" ? "expense" : "income"}?`)) return;
    setError(null);
    const fd = new FormData();
    fd.set("id", entry.id);
    startTransition(() =>
      guard(async () => {
        const res = await remove(fd);
        if (res?.error) setError(res.error);
      }),
    );
  }

  if (editing) {
    return (
      <li className="px-3 py-3">
        <form onSubmit={onSave} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <input type="hidden" name="id" value={entry.id} />
          <input
            type="date"
            name="date"
            required
            min={phaseStart}
            defaultValue={entry.date}
            className={inputCls}
          />
          <select name="category_id" required defaultValue={entry.category_id} className={selectCls}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            name="amount"
            type="number"
            inputMode="decimal"
            step="any"
            min="0.01"
            required
            defaultValue={entry.amount}
            className={inputCls}
          />
          <input
            name="note"
            defaultValue={entry.note ?? ""}
            placeholder="Note"
            className={`${inputCls} col-span-2 sm:col-span-1`}
          />
          <div className="col-span-2 flex items-center gap-3 text-[0.8125rem] sm:col-span-4">
            <button type="submit" disabled={pending} className="font-semibold text-up disabled:opacity-60">
              Save
            </button>
            <button type="button" onClick={() => setEditing(false)} className="text-ink-3">
              Cancel
            </button>
            {error && <span className="text-down">{error}</span>}
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className="px-3 py-2">
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex min-w-0 items-baseline gap-2.5">
          <span className="w-[68px] shrink-0 whitespace-nowrap text-[0.6875rem] tabular-nums text-ink-3">
            {fmtDay(entry.date)}
          </span>
          <span className="min-w-0 truncate text-sm">{entry.category?.name ?? "—"}</span>
        </div>
        <div className="flex shrink-0 items-baseline gap-3">
          <span
            className={`text-sm tabular-nums ${kind === "expenses" ? "text-down" : "text-up"}`}
          >
            {kind === "expenses" ? "−" : "+"}₹{Number(entry.amount).toLocaleString("en-IN")}
          </span>
          {canEdit && (
            <span className="flex items-center gap-2 text-[0.6875rem]">
              <button
                onClick={() => setEditing(true)}
                className="-my-1 inline-flex min-h-[32px] items-center px-1 text-ink-3 hover:text-ink"
              >
                edit
              </button>
              <button
                onClick={onDelete}
                disabled={pending}
                className="-my-1 inline-flex min-h-[32px] items-center px-1 text-down disabled:opacity-60"
              >
                delete
              </button>
            </span>
          )}
        </div>
      </div>
      {entry.note && (
        <p className="mt-0.5 pl-[78px] text-[0.75rem] leading-snug text-ink-3">{entry.note}</p>
      )}
      {error && <p className="mt-1 pl-[78px] text-[0.75rem] text-down">{error}</p>}
    </li>
  );
}

/** "2026-07-02" → "2 Jul 26". Full ISO strings read as machine output in a list. */
function fmtDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  });
}
