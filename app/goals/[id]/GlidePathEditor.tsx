"use client";

import { useState, useTransition } from "react";
import type { AssetClass, GoalAllocation } from "@/lib/types";
import { saveGlidePath, type GlideRow } from "../actions";

type Milestone = { years: string; pct: Record<string, string> };

const cellCls =
  "w-20 rounded-md border border-zinc-300 bg-white px-2 py-1 text-right text-sm tabular-nums outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-100";

function initMilestones(existing: GoalAllocation[]): Milestone[] {
  const byMonths = new Map<number, Record<string, string>>();
  for (const a of existing) {
    const rec = byMonths.get(a.months_before_end) ?? {};
    rec[a.asset_class_id] = String(Number(a.target_pct));
    byMonths.set(a.months_before_end, rec);
  }
  const out = [...byMonths.entries()]
    .sort((a, b) => b[0] - a[0]) // furthest milestone first
    .map(([months, pct]) => ({ years: String(months / 12), pct }));
  return out.length > 0 ? out : [{ years: "", pct: {} }];
}

export default function GlidePathEditor({
  goalId,
  assetClasses,
  existing,
}: {
  goalId: string;
  assetClasses: AssetClass[];
  existing: GoalAllocation[];
}) {
  const [milestones, setMilestones] = useState<Milestone[]>(() => initMilestones(existing));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function setYears(mi: number, years: string) {
    setMilestones((ms) => ms.map((m, i) => (i === mi ? { ...m, years } : m)));
    setSaved(false);
  }

  function setPct(mi: number, classId: string, value: string) {
    setMilestones((ms) =>
      ms.map((m, i) => (i === mi ? { ...m, pct: { ...m.pct, [classId]: value } } : m)),
    );
    setSaved(false);
  }

  function addMilestone() {
    setMilestones((ms) => [...ms, { years: "", pct: {} }]);
  }

  function removeMilestone(mi: number) {
    setMilestones((ms) => ms.filter((_, i) => i !== mi));
    setSaved(false);
  }

  function colSum(m: Milestone): number {
    return assetClasses.reduce((s, c) => s + (Number(m.pct[c.id]) || 0), 0);
  }

  function onSave() {
    setError(null);
    setSaved(false);
    const rows: GlideRow[] = [];
    for (const m of milestones) {
      const years = Number(m.years);
      if (!Number.isFinite(years) || years < 0) continue;
      const months = Math.round(years * 12);
      for (const c of assetClasses) {
        const pct = Number(m.pct[c.id]) || 0;
        if (pct > 0) rows.push({ asset_class_id: c.id, months_before_end: months, target_pct: pct });
      }
    }
    startTransition(async () => {
      const res = await saveGlidePath(goalId, rows);
      if (res?.error) setError(res.error);
      else setSaved(true);
    });
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="text-sm">
          <thead>
            <tr>
              <th className="px-2 py-1 text-left text-xs font-medium text-zinc-500">Years before goal →</th>
              {milestones.map((m, mi) => (
                <th key={mi} className="px-2 py-1">
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      value={m.years}
                      onChange={(e) => setYears(mi, e.target.value)}
                      placeholder="yrs"
                      className={`${cellCls} text-center`}
                    />
                    <button
                      type="button"
                      onClick={() => removeMilestone(mi)}
                      className="text-xs text-zinc-400 hover:text-red-600"
                      title="Remove milestone"
                    >
                      ✕
                    </button>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {assetClasses.map((c) => (
              <tr key={c.id}>
                <td className="px-2 py-1 text-zinc-600 dark:text-zinc-400">{c.name}</td>
                {milestones.map((m, mi) => (
                  <td key={mi} className="px-2 py-1">
                    <input
                      type="number"
                      step="1"
                      min="0"
                      max="100"
                      value={m.pct[c.id] ?? ""}
                      onChange={(e) => setPct(mi, c.id, e.target.value)}
                      placeholder="0"
                      className={cellCls}
                    />
                  </td>
                ))}
              </tr>
            ))}
            <tr>
              <td className="px-2 py-1 text-xs font-medium text-zinc-500">Sum</td>
              {milestones.map((m, mi) => {
                const sum = colSum(m);
                const ok = Math.abs(sum - 100) <= 0.5;
                return (
                  <td
                    key={mi}
                    className={`px-2 py-1 text-right text-xs font-medium tabular-nums ${
                      ok ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
                    }`}
                  >
                    {sum.toFixed(0)}%
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={addMilestone}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          + Milestone
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={pending}
          className="rounded-md bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        >
          {pending ? "Saving..." : "Save plan"}
        </button>
        {saved && <span className="text-xs text-emerald-700 dark:text-emerald-400">Saved.</span>}
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
    </div>
  );
}
