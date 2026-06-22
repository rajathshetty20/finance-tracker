"use client";

import { useState, useTransition } from "react";
import { updateInvestmentAssetClass } from "../actions";

export default function AssetClassPicker({
  investmentId,
  current,
  options,
}: {
  investmentId: string;
  current: string;
  options: string[];
}) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="text-xs text-zinc-500 underline-offset-2 hover:text-zinc-900 hover:underline dark:hover:text-zinc-100"
      >
        change asset class
      </button>
    );
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    fd.set("investment_id", investmentId);
    startTransition(async () => {
      const res = await updateInvestmentAssetClass(fd);
      if (res?.error) setError(res.error);
      else setEditing(false);
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex items-center gap-2">
      <input
        name="asset_class"
        list="asset-class-edit-options"
        defaultValue={current === "—" ? "" : current}
        autoFocus
        placeholder="Asset class"
        className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-100"
      />
      <datalist id="asset-class-edit-options">
        {options.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <button type="submit" disabled={pending} className="text-xs font-medium text-emerald-700 disabled:opacity-60 dark:text-emerald-400">
        Save
      </button>
      <button type="button" onClick={() => setEditing(false)} className="text-xs text-zinc-500">
        Cancel
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </form>
  );
}
