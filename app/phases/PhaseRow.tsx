"use client";

import { useState, useTransition } from "react";
import { renamePhase, editFirstPhaseStartDate } from "./actions";
import type { Phase } from "@/lib/types";

export default function PhaseRow({ phase, canEditStart }: { phase: Phase; canEditStart: boolean }) {
  const [editingName, setEditingName] = useState(false);
  const [editingStart, setEditingStart] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const isCurrent = phase.end_date === null;

  async function submitName(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await renamePhase(fd);
      if (res?.error) setError(res.error);
      else setEditingName(false);
    });
  }

  async function submitStart(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await editFirstPhaseStartDate(fd);
      if (res?.error) setError(res.error);
      else setEditingStart(false);
    });
  }

  return (
    <li className="px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1">
          {editingName ? (
            <form onSubmit={submitName} className="flex items-center gap-2">
              <input type="hidden" name="id" value={phase.id} />
              <input
                name="name"
                defaultValue={phase.name}
                required
                autoFocus
                className="flex-1 rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-100"
              />
              <button type="submit" disabled={pending} className="text-xs font-medium text-emerald-700 disabled:opacity-60 dark:text-emerald-400">
                Save
              </button>
              <button type="button" onClick={() => setEditingName(false)} className="text-xs text-zinc-500">
                Cancel
              </button>
            </form>
          ) : (
            <div className="flex items-center gap-2">
              <div className="text-sm font-medium">{phase.name}</div>
              {isCurrent && (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
                  current
                </span>
              )}
              <button onClick={() => setEditingName(true)} className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
                rename
              </button>
            </div>
          )}
          <div className="mt-1 text-xs text-zinc-500 tabular-nums">
            {editingStart ? (
              <form onSubmit={submitStart} className="flex items-center gap-2">
                <input type="hidden" name="id" value={phase.id} />
                <input
                  type="date"
                  name="start_date"
                  defaultValue={phase.start_date}
                  required
                  autoFocus
                  className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-100"
                />
                <button type="submit" disabled={pending} className="text-xs font-medium text-emerald-700 disabled:opacity-60 dark:text-emerald-400">
                  Save
                </button>
                <button type="button" onClick={() => setEditingStart(false)} className="text-xs text-zinc-500">
                  Cancel
                </button>
              </form>
            ) : (
              <>
                {phase.start_date} → {phase.end_date ?? "present"}
                {canEditStart && (
                  <button
                    onClick={() => setEditingStart(true)}
                    className="ml-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                  >
                    edit start date
                  </button>
                )}
              </>
            )}
          </div>
          {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
        </div>
      </div>
    </li>
  );
}
