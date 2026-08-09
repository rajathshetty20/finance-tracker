"use client";

import { useRef, useState, useTransition } from "react";
import { createDebt } from "./actions";
import { useGuard } from "../useGuard";
import { todayInAppZone } from "../todayLocal";
import { inputCls } from "../ui";


export default function AddDebtForm() {
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
      const res = await createDebt(fd);
      if (res?.error) setError(res.error);
      else formRef.current?.reset();
    }),
    );
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-3">
      <input
        name="description"
        required
        placeholder="Description (e.g. HDFC home loan)"
        className={`w-full ${inputCls}`}
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <input
          type="date"
          name="start_date"
          required
          defaultValue={todayInAppZone()}
          className={inputCls}
        />
        <input
          name="principal"
          type="number"
          step="any"
          min="0.01"
          required
          placeholder="Principal"
          className={inputCls}
        />
        <input
          name="total_payable"
          type="number"
          step="any"
          min="0.01"
          required
          placeholder="Total payable (principal + interest)"
          className={inputCls}
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-ground hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Creating..." : "Create debt"}
      </button>
      {error && <p className="text-sm text-down">{error}</p>}
    </form>
  );
}
