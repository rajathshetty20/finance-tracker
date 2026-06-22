"use client";

import { useRef, useState, useTransition } from "react";
import type { AssetClass } from "@/lib/types";
import { createAssetClass, updateAssetClass, deleteAssetClass } from "./actions";

const inputCls =
  "rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-100";

export default function AssetClassesEditor({ assetClasses }: { assetClasses: AssetClass[] }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function onAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await createAssetClass(fd);
      if (res?.error) setError(res.error);
      else formRef.current?.reset();
    });
  }

  return (
    <div className="space-y-3">
      {assetClasses.length > 0 && (
        <ul className="divide-y divide-zinc-200 overflow-hidden rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {assetClasses.map((c) => (
            <AssetClassRow key={c.id} assetClass={c} />
          ))}
        </ul>
      )}

      <form ref={formRef} onSubmit={onAdd} className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-zinc-500">
          Name
          <input name="name" required placeholder="Equity" className={inputCls} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-500">
          Expected return (% p.a.)
          <input name="expected_return" type="number" step="0.1" defaultValue="12" className={`${inputCls} w-32`} />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        >
          Add
        </button>
        {error && <p className="w-full text-sm text-red-600">{error}</p>}
      </form>
    </div>
  );
}

function AssetClassRow({ assetClass }: { assetClass: AssetClass }) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    fd.set("id", assetClass.id);
    startTransition(async () => {
      const res = await updateAssetClass(fd);
      if (res?.error) setError(res.error);
      else setEditing(false);
    });
  }

  function onDelete() {
    if (!confirm(`Delete asset class "${assetClass.name}"?`)) return;
    setError(null);
    const fd = new FormData();
    fd.set("id", assetClass.id);
    startTransition(async () => {
      const res = await deleteAssetClass(fd);
      if (res?.error) setError(res.error);
    });
  }

  return (
    <li className="flex items-center justify-between gap-3 px-3 py-2">
      {editing ? (
        <form onSubmit={onSave} className="flex flex-1 flex-wrap items-center gap-2">
          <input name="name" defaultValue={assetClass.name} required className={`${inputCls} flex-1`} />
          <input
            name="expected_return"
            type="number"
            step="0.1"
            defaultValue={String(assetClass.expected_return)}
            className={`${inputCls} w-24`}
          />
          <button type="submit" disabled={pending} className="text-xs font-medium text-emerald-700 disabled:opacity-60 dark:text-emerald-400">
            Save
          </button>
          <button type="button" onClick={() => setEditing(false)} className="text-xs text-zinc-500">
            Cancel
          </button>
        </form>
      ) : (
        <>
          <span className="text-sm">{assetClass.name}</span>
          <div className="flex items-center gap-3 text-xs">
            <span className="text-zinc-500 tabular-nums">{Number(assetClass.expected_return)}% p.a.</span>
            <button onClick={() => setEditing(true)} className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
              edit
            </button>
            <button onClick={onDelete} disabled={pending} className="text-red-600 hover:text-red-700 disabled:opacity-60">
              delete
            </button>
          </div>
        </>
      )}
      {error && <p className="ml-3 text-xs text-red-600">{error}</p>}
    </li>
  );
}
