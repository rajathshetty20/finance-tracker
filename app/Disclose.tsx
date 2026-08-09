"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

/**
 * A section that starts collapsed and opens in place.
 *
 * Every screen used to devote its best vertical space to an add-form that is
 * used a few times a month, pushing the numbers the screen exists to show below
 * the fold. The alternative considered was one global "+" in the nav; with
 * seven object types that adds a decision to the most frequent action, so the
 * form stays on the screen it belongs to and simply gets out of the way.
 */
export default function Disclose({
  label,
  children,
  count,
  tone = "quiet",
}: {
  label: string;
  children: React.ReactNode;
  /** Optional trailing count, e.g. "(1)" for closed positions. */
  count?: number;
  tone?: "quiet" | "primary";
}) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-3 py-2 text-[0.8125rem] font-semibold ${
          tone === "primary"
            ? "bg-ink text-ground hover:opacity-90"
            : "border border-rule text-ink-2 hover:bg-surface-2"
        }`}
      >
        {label}
        {count !== undefined && <span className="tabular-nums opacity-70">({count})</span>}
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>
      {open && <div className="mt-3">{children}</div>}
    </div>
  );
}

/**
 * A row of disclosures where only one is open at a time, and the open panel
 * renders BELOW the whole row.
 *
 * Two `Disclose`s side by side in a flex-wrap sat fine until one was opened:
 * the opened item grew, the row wrapped, and its neighbour jumped from beside
 * the button to underneath it. The buttons here never move.
 */
export function DiscloseRow({
  items,
}: {
  items: { label: string; tone?: "quiet" | "primary"; content: React.ReactNode }[];
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {items.map((item, i) => {
          const open = openIndex === i;
          return (
            <button
              key={item.label}
              type="button"
              onClick={() => setOpenIndex(open ? null : i)}
              aria-expanded={open}
              className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-3 py-2 text-[0.8125rem] font-semibold ${
                item.tone === "primary"
                  ? "bg-ink text-ground hover:opacity-90"
                  : "border border-rule text-ink-2 hover:bg-surface-2"
              }`}
            >
              {item.label}
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
                aria-hidden="true"
              />
            </button>
          );
        })}
      </div>
      {openIndex !== null && <div className="mt-3">{items[openIndex].content}</div>}
    </div>
  );
}
