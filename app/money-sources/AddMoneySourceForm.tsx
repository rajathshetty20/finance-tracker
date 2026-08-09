"use client";

import { useRef, useState, useTransition } from "react";
import { createManualMoneySource } from "./actions";
import { useGuard } from "../useGuard";
import { todayInAppZone } from "../todayLocal";
import { inputCls } from "../ui";


export default function AddMoneySourceForm() {
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
      const res = await createManualMoneySource(fd);
      if (res?.error) setError(res.error);
      else formRef.current?.reset();
    }),
    );
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-[140px_1fr_180px_auto]">
      <input
        type="date"
        name="date"
        required
        defaultValue={todayInAppZone()}
        className={inputCls}
      />
      <input
        name="name"
        required
        placeholder="e.g. Gift from parents, Fixed deposit"
        className={inputCls}
      />
      <input
        name="amount"
        type="number"
        inputMode="decimal"
        step="any"
        required
        placeholder="Amount (negative ok)"
        className={inputCls}
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-ink px-3 py-2 text-sm font-medium text-ground hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Adding..." : "Add"}
      </button>
      {error && <p className="sm:col-span-4 text-sm text-down">{error}</p>}
    </form>
  );
}
