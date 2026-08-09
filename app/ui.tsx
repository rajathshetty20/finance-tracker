import type { GoalVerdict } from "@/lib/goals";
// The shapes the whole app is built from.
//
// Previously `rounded-xl border … shadow-sm` and its variants appeared in
// dozens of files and gave every section identical visual weight, which is
// why nothing on a page had hierarchy. Sections are hairline-separated
// groups; only things that genuinely float get elevation.

export type Domain = "income" | "expense" | "investment" | "debt" | "cash" | "goal";

export const DOMAIN_COLOR: Record<Domain, string> = {
  income: "var(--income)",
  expense: "var(--expense)",
  investment: "var(--investment)",
  debt: "var(--debt)",
  cash: "var(--cash)",
  goal: "var(--goal)",
};

/** A titled block of content. No border, no shadow — a rule and a label. */
export function Group({
  title,
  meta,
  domain,
  children,
}: {
  title: string;
  meta?: React.ReactNode;
  domain?: Domain;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-rule pt-3">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="flex items-center gap-2 text-[0.8125rem] font-semibold tracking-wide text-ink-2 uppercase">
          {domain && (
            <span
              aria-hidden="true"
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: DOMAIN_COLOR[domain] }}
            />
          )}
          {title}
        </h2>
        {meta && <span className="tnum text-[0.8125rem] text-ink-3">{meta}</span>}
      </div>
      {children}
    </section>
  );
}

/** Hairline-divided list. */
export function Rows({ children }: { children: React.ReactNode }) {
  return <ul className="divide-y divide-rule-soft">{children}</ul>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-3 text-[0.8125rem] text-ink-3">{children}</p>;
}

/** A headline figure with its label above and context below. */
export function Stat({
  label,
  value,
  sub,
  domain,
  tone,
}: {
  label: string;
  value: string;
  sub?: string | null;
  domain?: Domain;
  /** Money moves one of two ways; colour it only when the direction matters. */
  tone?: "up" | "down" | null;
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5">
        {domain && (
          <span
            aria-hidden="true"
            className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: DOMAIN_COLOR[domain] }}
          />
        )}
        <span className="truncate text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-3">
          {label}
        </span>
      </div>
      <div
        className={`tnum mt-1 text-[1.125rem] font-semibold leading-tight ${
          tone === "up" ? "text-up" : tone === "down" ? "text-down" : ""
        }`}
      >
        {value}
      </div>
      {sub && <div className="tnum truncate text-[0.75rem] text-ink-3">{sub}</div>}
    </div>
  );
}

// Shared control classes, so a field looks the same wherever it appears.
export const inputCls =
  "w-full min-w-0 rounded-lg border border-rule bg-surface px-3 py-2 outline-none focus:border-ink";

export const selectCls =
  "w-full min-w-0 rounded-lg border border-rule bg-surface px-3 py-2 text-[0.9375rem] outline-none focus:border-ink";

export const btnPrimary =
  "min-h-[40px] rounded-lg bg-ink px-4 py-2 text-[0.8125rem] font-semibold text-ground hover:opacity-90 disabled:opacity-40";

export const btnQuiet =
  "min-h-[40px] rounded-lg border border-rule px-3 py-2 text-[0.8125rem] font-semibold text-ink-2 hover:bg-surface-2 disabled:opacity-40";

/**
 * Stable colour for an asset class.
 *
 * Home coloured its portfolio mix by RANK — `--cat-${i}` over a list sorted by
 * value — so Equity was blue only because it happened to be largest that day,
 * and the hues would swap the moment fixed income overtook it. The glide-path
 * editor meanwhile had its own hard-coded Tailwind hex list, so one class wore
 * two different colours on two screens.
 *
 * Index into the class's position in the canonical (name-ordered) list, so a
 * class keeps its colour regardless of what it is currently worth.
 */
export function assetClassColor(classId: string, orderedClassIds: string[]): string {
  const i = orderedClassIds.indexOf(classId);
  return `var(--cat-${((i < 0 ? 0 : i) % 8) + 1})`;
}

/**
 * How a goal verdict looks — badge and progress bar, in one place.
 *
 * These lived twice: Plan coloured the bar from the verdict (amber when due,
 * green when funded) while the goal page coloured it from a rounded coverage
 * percentage, so the same goal drew a different colour on each screen — a due
 * goal was amber on one and blue on the other. The verdict is the only input
 * either bar should have.
 */
export const GOAL_VERDICT_STYLE: Record<
  GoalVerdict["kind"],
  { label: string; badge: string; bar: string }
> = {
  "no-plan": { label: "no plan", badge: "bg-warn-soft text-warn", bar: "bg-warn" },
  due: { label: "due now", badge: "bg-warn-soft text-warn", bar: "bg-warn" },
  funded: { label: "fully funded", badge: "bg-up-soft text-up", bar: "bg-up" },
  // Neutral, not red: still paying into a goal is the normal state, not a fault.
  "in-progress": { label: "in progress", badge: "bg-surface-2 text-ink-2", bar: "bg-accent" },
};
