"use client";

import { useRef, useState, useTransition } from "react";
import { createCategory } from "./actions";

export default function NewCategoryForm({ kind }: { kind: "expense" | "income" }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await createCategory(fd);
      if (res?.error) setError(res.error);
      else formRef.current?.reset();
    });
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="flex items-start gap-2">
      <input type="hidden" name="kind" value={kind} />
      <input
        name="name"
        required
        placeholder={kind === "expense" ? "e.g. Food" : "e.g. Salary"}
        className="flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-100"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
      >
        Add
      </button>
      {error && <p className="ml-2 self-center text-xs text-red-600">{error}</p>}
    </form>
  );
}
