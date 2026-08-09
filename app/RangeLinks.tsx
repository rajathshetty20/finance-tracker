"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { RANGES, type RangeKey } from "@/lib/range";

/** Period filter for the ledger pages. Plain links — no client state to lose. */
export default function RangeLinks({ active }: { active: RangeKey }) {
  const pathname = usePathname();
  const params = useSearchParams();

  return (
    <div className="flex flex-wrap gap-1">
      {RANGES.map((r) => {
        const next = new URLSearchParams(params);
        next.set("range", r.key);
        const on = r.key === active;
        return (
          <Link
            key={r.key}
            href={`${pathname}?${next}`}
            scroll={false}
            aria-current={on ? "true" : undefined}
            className={`rounded-full px-2.5 py-1 text-[0.75rem] transition-colors ${
              on
                ? "bg-ink font-medium text-ground"
                : "border border-rule text-ink-2 hover:bg-surface-2"
            }`}
          >
            {r.label}
          </Link>
        );
      })}
    </div>
  );
}
