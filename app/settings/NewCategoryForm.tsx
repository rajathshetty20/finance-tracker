"use client";

import { useRef, useState, useTransition } from "react";
import { createCategory } from "./actions";
import { useGuard } from "../useGuard";
import { inputCls } from "../ui";

export default function NewCategoryForm({ kind }: { kind: "expense" | "income" }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const guard = useGuard();
  const formRef = useRef<HTMLFormElement>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(() =>
      guard(async () => {
      const res = await createCategory(fd);
      if (res?.error) setError(res.error);
      else formRef.current?.reset();
    }),
    );
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="flex items-start gap-2">
      <input type="hidden" name="kind" value={kind} />
      <input
        name="name"
        required
        placeholder={kind === "expense" ? "e.g. Food" : "e.g. Salary"}
        className={`flex-1 ${inputCls}`}
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-ink px-3 py-2 text-sm font-medium text-ground hover:opacity-90 disabled:opacity-60"
      >
        Add
      </button>
      {error && <p className="ml-2 self-center text-xs text-down">{error}</p>}
    </form>
  );
}
