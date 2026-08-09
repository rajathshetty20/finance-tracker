"use client";

import { useRef, useState, useTransition } from "react";
import type { AssetClass } from "@/lib/types";
import { createAssetClass, updateAssetClass, deleteAssetClass } from "./actions";
import { useGuard } from "../useGuard";
import { inputCls } from "../ui";
import RowActions from "../RowActions";
import FormError from "../FormError";

export default function AssetClassesEditor({ assetClasses }: { assetClasses: AssetClass[] }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const guard = useGuard();
  const formRef = useRef<HTMLFormElement>(null);

  function onAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(() =>
      guard(async () => {
      const res = await createAssetClass(fd);
      if (res?.error) setError(res.error);
      else formRef.current?.reset();
    }),
    );
  }

  return (
    <div className="space-y-3">
      {assetClasses.length > 0 && (
        <ul className="divide-y divide-rule overflow-hidden rounded-lg border border-rule">
          {assetClasses.map((c) => (
            <AssetClassRow key={c.id} assetClass={c} />
          ))}
        </ul>
      )}

      <form ref={formRef} onSubmit={onAdd} className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-ink-3">
          Name
          <input name="name" required placeholder="Equity" className={inputCls} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-3">
          Expected return (% p.a.)
          <input name="expected_return" type="number" step="any" defaultValue="12" className={`${inputCls} w-32`} />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-ink px-3 py-1.5 text-sm font-medium text-ground hover:opacity-90 disabled:opacity-60"
        >
          Add
        </button>
        {error && <p className="w-full text-sm text-down">{error}</p>}
      </form>
    </div>
  );
}

function AssetClassRow({ assetClass }: { assetClass: AssetClass }) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const guard = useGuard();

  function onSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    fd.set("id", assetClass.id);
    startTransition(() =>
      guard(async () => {
      const res = await updateAssetClass(fd);
      if (res?.error) setError(res.error);
      else setEditing(false);
    }),
    );
  }

  function onDelete() {
    if (!confirm(`Delete asset class "${assetClass.name}"?`)) return;
    setError(null);
    const fd = new FormData();
    fd.set("id", assetClass.id);
    startTransition(() =>
      guard(async () => {
      const res = await deleteAssetClass(fd);
      if (res?.error) setError(res.error);
    }),
    );
  }

  return (
    <li className="flex items-center justify-between gap-3 px-3 py-2">
      {editing ? (
        <form onSubmit={onSave} className="flex flex-1 flex-wrap items-center gap-2">
          <input name="name" defaultValue={assetClass.name} required className={`${inputCls} flex-1`} />
          <input
            name="expected_return"
            type="number"
            step="any"
            defaultValue={String(assetClass.expected_return)}
            className={`${inputCls} w-24`}
          />
          <button type="submit" disabled={pending} className="text-xs font-medium text-up disabled:opacity-60">
            Save
          </button>
          <button type="button" onClick={() => setEditing(false)} className="text-xs text-ink-3">
            Cancel
          </button>
        </form>
      ) : (
        <>
          <span className="text-sm">{assetClass.name}</span>
          <div className="flex items-center gap-2 text-xs">
            <span className="tabular-nums text-ink-3">{Number(assetClass.expected_return)}% p.a.</span>
            <RowActions onEdit={() => setEditing(true)} onDelete={onDelete} disabled={pending} />
          </div>
        </>
      )}
      <FormError>{error}</FormError>
    </li>
  );
}
