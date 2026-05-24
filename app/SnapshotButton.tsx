"use client";

import { useState, useTransition } from "react";
import { saveNetworthSnapshot } from "./snapshot-action";

export default function SnapshotButton({
  nw,
  invest_market,
  cash,
  debt_pending,
  lastSnapshotDate,
}: {
  nw: number;
  invest_market: number;
  cash: number;
  debt_pending: number;
  lastSnapshotDate: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  function onClick() {
    setError(null);
    setSavedAt(null);
    const fd = new FormData();
    fd.set("nw", String(nw));
    fd.set("invest_market", String(invest_market));
    fd.set("cash", String(cash));
    fd.set("debt_pending", String(debt_pending));
    startTransition(async () => {
      const res = await saveNetworthSnapshot(fd);
      if (res?.error) setError(res.error);
      else setSavedAt(new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }));
    });
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={onClick}
        disabled={pending}
        className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        {pending ? "Saving…" : savedAt ? `✓ Saved at ${savedAt}` : "Save snapshot"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
      {!savedAt && !error && lastSnapshotDate && (
        <span className="text-xs text-zinc-400">last: {lastSnapshotDate}</span>
      )}
    </div>
  );
}
