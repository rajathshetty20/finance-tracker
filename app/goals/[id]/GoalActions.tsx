"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Goal } from "@/lib/types";
import { updateGoal, setGoalStatus, deleteGoal } from "../actions";
import { useGuard } from "../../useGuard";

const inputCls =
  "rounded-md border border-rule bg-surface px-3 py-2 text-sm outline-none focus:border-ink";

export default function GoalActions({ goal }: { goal: Goal }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const guard = useGuard();

  function onSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    fd.set("id", goal.id);
    startTransition(() =>
      guard(async () => {
      const res = await updateGoal(fd);
      if (res?.error) setError(res.error);
      else setEditing(false);
    }),
    );
  }

  function changeStatus(status: string) {
    setError(null);
    const fd = new FormData();
    fd.set("id", goal.id);
    fd.set("status", status);
    startTransition(() =>
      guard(async () => {
      const res = await setGoalStatus(fd);
      if (res?.error) setError(res.error);
    }),
    );
  }

  function onDelete() {
    if (!confirm(`Delete goal "${goal.name}"? This also removes its glide path.`)) return;
    setError(null);
    const fd = new FormData();
    fd.set("id", goal.id);
    startTransition(() =>
      guard(async () => {
      const res = await deleteGoal(fd);
      if (res?.error) setError(res.error);
      else router.push("/goals");
    }),
    );
  }

  return (
    <section className="rounded-xl border border-rule bg-surface p-4">
      <h2 className="mb-3 text-sm font-medium text-ink-3">Manage goal</h2>

      {editing ? (
        <form onSubmit={onSave} className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input name="name" defaultValue={goal.name} required placeholder="Name" className={inputCls} />
            <input name="description" defaultValue={goal.description ?? ""} placeholder="Description" className={inputCls} />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-xs text-ink-3">
              Target date
              <input type="date" name="end_date" defaultValue={goal.end_date} required className={inputCls} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-ink-3">
              Cost today (₹)
              <input name="present_cost" type="number" step="1" min="1" defaultValue={String(goal.present_cost)} required className={inputCls} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-ink-3">
              Inflation (% p.a.)
              <input name="inflation_rate" type="number" step="any" min="0" defaultValue={String(goal.inflation_rate)} className={inputCls} />
            </label>
          </div>
          <div className="flex items-center gap-3">
            <button type="submit" disabled={pending} className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60">
              {pending ? "Saving..." : "Save"}
            </button>
            <button type="button" onClick={() => setEditing(false)} className="text-sm text-ink-3">
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <button onClick={() => setEditing(true)} className="rounded-md border border-rule px-3 py-1.5 hover:bg-surface-2">
            Edit details
          </button>
          {goal.status !== "active" ? (
            <button onClick={() => changeStatus("active")} disabled={pending} className="text-ink-2 hover:text-ink disabled:opacity-60">
              Reactivate
            </button>
          ) : (
            <button onClick={() => changeStatus("achieved")} disabled={pending} className="text-up hover:text-up disabled:opacity-60">
              Mark achieved
            </button>
          )}
          {goal.status !== "archived" && (
            <button onClick={() => changeStatus("archived")} disabled={pending} className="text-ink-3 hover:text-ink disabled:opacity-60">
              Archive
            </button>
          )}
          <button onClick={onDelete} disabled={pending} className="ml-auto text-down hover:text-down disabled:opacity-60">
            Delete
          </button>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-down">{error}</p>}
    </section>
  );
}
