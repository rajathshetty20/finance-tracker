"use client";

import { useState, useTransition } from "react";
import { renameCategory, deleteCategory } from "./actions";
import type { Category } from "@/lib/types";
import { useGuard } from "../useGuard";

export default function CategoryRow({ category }: { category: Category }) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const guard = useGuard();

  async function onRename(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(() =>
      guard(async () => {
      const res = await renameCategory(fd);
      if (res?.error) setError(res.error);
      else setEditing(false);
    }),
    );
  }

  function onDelete() {
    if (!confirm(`Delete category "${category.name}"?`)) return;
    setError(null);
    const fd = new FormData();
    fd.set("id", category.id);
    startTransition(() =>
      guard(async () => {
      const res = await deleteCategory(fd);
      if (res?.error) setError(res.error);
    }),
    );
  }

  return (
    <li className="flex items-center justify-between gap-3 px-4 py-2">
      {editing ? (
        <form onSubmit={onRename} className="flex flex-1 items-center gap-2">
          <input type="hidden" name="id" value={category.id} />
          <input
            name="name"
            defaultValue={category.name}
            required
            autoFocus
            className="flex-1 rounded-md border border-rule bg-surface px-2 py-1 text-sm outline-none focus:border-ink"
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
          <span className="text-sm">{category.name}</span>
          <div className="flex items-center gap-3 text-xs">
            <button onClick={() => setEditing(true)} className="text-ink-3 hover:text-ink">
              rename
            </button>
            <button onClick={onDelete} disabled={pending} className="text-down disabled:opacity-60 hover:text-down">
              delete
            </button>
          </div>
        </>
      )}
      {error && <p className="ml-3 text-xs text-down">{error}</p>}
    </li>
  );
}
