"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Search, X } from "lucide-react";
import type { Category } from "@/lib/types";
import { RANGE_KEYS, rangeLabel, type RangeKey } from "@/lib/range";
import { selectCls } from "../ui";

/**
 * Period, category and text filters for the ledger.
 *
 * All three live in the URL, so a filtered view is linkable, survives a reload,
 * and is what the CSV export reads — the exported file is always exactly the
 * rows on screen, which is the only version of "export" that can be trusted.
 *
 * Native <select> rather than a row of pills: seven periods plus a category
 * list will not fit a phone as buttons, and a select opens a picker instead of
 * zooming the page (globals.css deliberately leaves select below 16px).
 */
export default function LedgerControls({
  categories,
  today,
  ledger,
}: {
  categories: Category[];
  today: string;
  ledger: "expenses" | "incomes";
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(params.get("q") ?? "");
  const firstRender = useRef(true);

  const range = (params.get("range") ?? "90") as RangeKey;
  const cat = params.get("cat") ?? "";

  function push(next: Record<string, string | null>) {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v === null || v === "") sp.delete(k);
      else sp.set(k, v);
    }
    startTransition(() => router.replace(`/cashflow?${sp.toString()}`, { scroll: false }));
  }

  // Debounce the text box so a five-letter search is one navigation, not five.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const t = setTimeout(() => {
      if ((params.get("q") ?? "") !== q) push({ q: q || null });
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div className={`grid grid-cols-2 gap-2 sm:grid-cols-[auto_auto_1fr] ${pending ? "opacity-60" : ""}`}>
      <label className="sr-only" htmlFor="range">
        Period
      </label>
      <select
        id="range"
        className={selectCls}
        value={range}
        onChange={(e) => push({ range: e.target.value })}
      >
        {RANGE_KEYS.map((k) => (
          <option key={k} value={k}>
            {rangeLabel(k, today)}
          </option>
        ))}
      </select>

      <label className="sr-only" htmlFor="cat">
        Category
      </label>
      <select id="cat" className={selectCls} value={cat} onChange={(e) => push({ cat: e.target.value || null })}>
        <option value="">All categories</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>

      <div className="relative col-span-2 sm:col-span-1">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-3" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={`Search notes in ${ledger}`}
          aria-label="Search notes"
          className="w-full min-w-0 rounded-lg border border-rule bg-surface py-2 pl-8 pr-8 text-[0.9375rem] outline-none focus:border-ink"
        />
        {q && (
          <button
            type="button"
            onClick={() => setQ("")}
            aria-label="Clear search"
            className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-1.5 text-ink-3 hover:text-ink"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
