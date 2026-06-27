"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Goal } from "@/lib/types";
import { updateGoal, setGoalStatus, deleteGoal } from "../actions";

const inputCls =
  "rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-100";

export default function GoalActions({ goal }: { goal: Goal }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    fd.set("id", goal.id);
    startTransition(async () => {
      const res = await updateGoal(fd);
      if (res?.error) setError(res.error);
      else setEditing(false);
    });
  }

  function changeStatus(status: string) {
    setError(null);
    const fd = new FormData();
    fd.set("id", goal.id);
    fd.set("status", status);
    startTransition(async () => {
      const res = await setGoalStatus(fd);
      if (res?.error) setError(res.error);
    });
  }

  function onDelete() {
    if (!confirm(`Delete goal "${goal.name}"? This also removes its glide path.`)) return;
    setError(null);
    const fd = new FormData();
    fd.set("id", goal.id);
    startTransition(async () => {
      const res = await deleteGoal(fd);
      if (res?.error) setError(res.error);
      else router.push("/goals");
    });
  }

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="mb-3 text-sm font-medium text-zinc-500">Manage goal</h2>

      {editing ? (
        <form onSubmit={onSave} className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input name="name" defaultValue={goal.name} required placeholder="Name" className={inputCls} />
            <input name="description" defaultValue={goal.description ?? ""} placeholder="Description" className={inputCls} />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-xs text-zinc-500">
              Target date
              <input type="date" name="end_date" defaultValue={goal.end_date} required className={inputCls} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-zinc-500">
              Cost today (₹)
              <input name="present_cost" type="number" step="1" min="1" defaultValue={String(goal.present_cost)} required className={inputCls} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-zinc-500">
              Inflation (% p.a.)
              <input name="inflation_rate" type="number" step="0.1" min="0" defaultValue={String(goal.inflation_rate)} className={inputCls} />
            </label>
          </div>
          <div className="flex items-center gap-3">
            <button type="submit" disabled={pending} className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white">
              {pending ? "Saving..." : "Save"}
            </button>
            <button type="button" onClick={() => setEditing(false)} className="text-sm text-zinc-500">
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <button onClick={() => setEditing(true)} className="rounded-md border border-zinc-300 px-3 py-1.5 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800">
            Edit details
          </button>
          {goal.status !== "active" ? (
            <button onClick={() => changeStatus("active")} disabled={pending} className="text-zinc-600 hover:text-zinc-900 disabled:opacity-60 dark:text-zinc-400 dark:hover:text-zinc-100">
              Reactivate
            </button>
          ) : (
            <button onClick={() => changeStatus("achieved")} disabled={pending} className="text-emerald-700 hover:text-emerald-800 disabled:opacity-60 dark:text-emerald-400">
              Mark achieved
            </button>
          )}
          {goal.status !== "archived" && (
            <button onClick={() => changeStatus("archived")} disabled={pending} className="text-zinc-500 hover:text-zinc-700 disabled:opacity-60">
              Archive
            </button>
          )}
          <button onClick={onDelete} disabled={pending} className="ml-auto text-red-600 hover:text-red-700 disabled:opacity-60">
            Delete
          </button>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </section>
  );
}
