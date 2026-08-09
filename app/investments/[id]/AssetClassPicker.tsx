"use client";

import { useState, useTransition } from "react";
import { updateInvestmentAssetClass } from "../actions";
import { useGuard } from "../../useGuard";
import { inputCls } from "../../ui";

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
  const guard = useGuard();

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="text-xs text-ink-3 underline-offset-2 hover:text-ink hover:underline"
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
    startTransition(() =>
      guard(async () => {
      const res = await updateInvestmentAssetClass(fd);
      if (res?.error) setError(res.error);
      else setEditing(false);
    }),
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex items-center gap-2">
      <input
        name="asset_class"
        list="asset-class-edit-options"
        defaultValue={current === "—" ? "" : current}
        autoFocus
        placeholder="Asset class"
        className={inputCls}
      />
      <datalist id="asset-class-edit-options">
        {options.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <button type="submit" disabled={pending} className="text-xs font-medium text-up disabled:opacity-60">
        Save
      </button>
      <button type="button" onClick={() => setEditing(false)} className="text-xs text-ink-3">
        Cancel
      </button>
      {error && <span className="text-xs text-down">{error}</span>}
    </form>
  );
}
