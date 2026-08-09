"use client";

import { useState, useTransition } from "react";
import { renameCategory, deleteCategory } from "./actions";
import type { Category } from "@/lib/types";
import { useGuard } from "../useGuard";
import RowActions from "../RowActions";
import FormError from "../FormError";
import { inputCls } from "../ui";

export default function CategoryRow({
  category,
  usage,
  inUse,
}: {
  category: Category;
  /** e.g. "18 entries · ₹1,84,200", or "unused". */
  usage: string;
  /** Categories with entries cannot be deleted — the FK refuses. Say so up
      front rather than offering a button that always fails. */
  inUse: boolean;
}) {
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
    <div className="py-2">
      <div className="flex items-center justify-between gap-3">
      {editing ? (
        <form onSubmit={onRename} className="flex flex-1 items-center gap-2">
          <input type="hidden" name="id" value={category.id} />
          <input
            name="name"
            defaultValue={category.name}
            required
            autoFocus
            className={`flex-1 ${inputCls}`}
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
          <span className="min-w-0">
            <span className="block truncate text-sm">{category.name}</span>
            <span className="block text-[0.6875rem] tabular-nums text-ink-3">{usage}</span>
          </span>
          <RowActions
            onEdit={() => setEditing(true)}
            onDelete={inUse ? undefined : onDelete}
            disabled={pending}
            editLabel="Rename"
          />
        </>
      )}
      </div>
      <FormError>{error}</FormError>
    </div>
  );
}
