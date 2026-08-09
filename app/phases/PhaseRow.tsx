"use client";

import { useState, useTransition } from "react";
import { renamePhase, editFirstPhaseStartDate } from "./actions";
import type { Phase } from "@/lib/types";
import { fmtINR, fmtMonthYear } from "@/lib/dates";
import { useGuard } from "../useGuard";

export type PhaseStats = {
  avgIncome: number;
  avgExpense: number;
  savingsRatio: number | null;
};

export default function PhaseRow({
  phase,
  canEditStart,
  stats,
}: {
  phase: Phase;
  canEditStart: boolean;
  stats?: PhaseStats;
}) {
  const [editingName, setEditingName] = useState(false);
  const [editingStart, setEditingStart] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const guard = useGuard();

  const isCurrent = phase.end_date === null;

  async function submitName(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(() =>
      guard(async () => {
      const res = await renamePhase(fd);
      if (res?.error) setError(res.error);
      else setEditingName(false);
    }),
    );
  }

  async function submitStart(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(() =>
      guard(async () => {
      const res = await editFirstPhaseStartDate(fd);
      if (res?.error) setError(res.error);
      else setEditingStart(false);
    }),
    );
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
                className="flex-1 rounded-md border border-rule bg-surface px-2 py-1 text-sm outline-none focus:border-ink"
              />
              <button type="submit" disabled={pending} className="text-xs font-medium text-up disabled:opacity-60">
                Save
              </button>
              <button type="button" onClick={() => setEditingName(false)} className="text-xs text-ink-3">
                Cancel
              </button>
            </form>
          ) : (
            <div className="flex items-center gap-2">
              <div className="text-sm font-medium">{phase.name}</div>
              {isCurrent && (
                <span className="rounded-full bg-up-soft px-2 py-0.5 text-[10px] font-medium text-up">
                  current
                </span>
              )}
              <button onClick={() => setEditingName(true)} className="text-xs text-ink-3 hover:text-ink">
                rename
              </button>
            </div>
          )}
          <div className="mt-1 text-xs text-ink-3 tabular-nums">
            {editingStart ? (
              <form onSubmit={submitStart} className="flex items-center gap-2">
                <input type="hidden" name="id" value={phase.id} />
                <input
                  type="date"
                  name="start_date"
                  defaultValue={phase.start_date}
                  required
                  autoFocus
                  className="rounded-md border border-rule bg-surface px-2 py-1 text-xs outline-none focus:border-ink"
                />
                <button type="submit" disabled={pending} className="text-xs font-medium text-up disabled:opacity-60">
                  Save
                </button>
                <button type="button" onClick={() => setEditingStart(false)} className="text-xs text-ink-3">
                  Cancel
                </button>
              </form>
            ) : (
              <>
                {fmtMonthYear(phase.start_date)} →{" "}
                {phase.end_date ? fmtMonthYear(phase.end_date) : "present"}
                {canEditStart && (
                  <button
                    onClick={() => setEditingStart(true)}
                    className="ml-2 text-ink-3 hover:text-ink"
                  >
                    edit start date
                  </button>
                )}
              </>
            )}
          </div>
          {error && <p className="mt-1 text-xs text-down">{error}</p>}
          {stats && (
            <div className="mt-1 text-xs text-ink-3 tabular-nums">
              avg income {fmtINR(stats.avgIncome)}/mo · avg expense {fmtINR(stats.avgExpense)}/mo · savings{" "}
              {stats.savingsRatio !== null ? `${(stats.savingsRatio * 100).toFixed(1)}%` : "—"}
            </div>
          )}
        </div>
      </div>
    </li>
  );
}
