"use client";

import { useState, useTransition } from "react";
import { renameCategory, deleteCategory } from "./actions";
import type { Category } from "@/lib/types";

export default function CategoryRow({ category }: { category: Category }) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function onRename(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await renameCategory(fd);
      if (res?.error) setError(res.error);
      else setEditing(false);
    });
  }

  function onDelete() {
    if (!confirm(`Delete category "${category.name}"?`)) return;
    setError(null);
    const fd = new FormData();
    fd.set("id", category.id);
    startTransition(async () => {
      const res = await deleteCategory(fd);
      if (res?.error) setError(res.error);
    });
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
            className="flex-1 rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-100"
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
          <span className="text-sm">{category.name}</span>
          <div className="flex items-center gap-3 text-xs">
            <button onClick={() => setEditing(true)} className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
              rename
            </button>
            <button onClick={onDelete} disabled={pending} className="text-red-600 disabled:opacity-60 hover:text-red-700">
              delete
            </button>
          </div>
        </>
      )}
      {error && <p className="ml-3 text-xs text-red-600">{error}</p>}
    </li>
  );
}
