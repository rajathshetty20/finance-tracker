"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { fmtINR } from "@/lib/dates";

// The validated categorical set, assigned in this fixed order and never
// cycled. The previous ten-hex rainbow was outside the token system, so it
// did not restep for dark mode, and `i % length` meant an 9th asset class
// silently reused the 1st class's colour.
const CAT = [
  "var(--cat-1)",
  "var(--cat-2)",
  "var(--cat-3)",
  "var(--cat-4)",
  "var(--cat-5)",
  "var(--cat-6)",
  "var(--cat-7)",
  "var(--cat-8)",
];
const CAT_OTHER = "var(--cat-other)";

function fmtCompact(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e7) return `₹${(a / 1e7).toFixed(a >= 1e8 ? 0 : 1)}Cr`;
  if (a >= 1e5) return `₹${(a / 1e5).toFixed(a >= 1e6 ? 0 : 1)}L`;
  if (a >= 1e3) return `₹${(a / 1e3).toFixed(0)}k`;
  return `₹${a.toFixed(0)}`;
}

// Holdings within a class are shades of that class's hue. Opacity rather than
// a mix toward white: the colours are CSS variables now, so there is no hex to
// do arithmetic on, and mixing toward white is wrong on a dark surface anyway.
// Largest holding keeps the full hue; smaller ones step down.
function shade(index: number, count: number): number {
  return count > 1 ? 1 - (index / (count - 1)) * 0.55 : 1;
}

type Datum = { name: string; value: number; assetClass: string };

export default function AllocationPie({ data }: { data: Datum[] }) {
  if (data.length === 0) return null;
  const total = data.reduce((a, s) => a + s.value, 0);
  if (total <= 0) return null;

  // Group by asset class, ordered by class total (desc).
  const classMap = new Map<string, Datum[]>();
  for (const d of data) {
    if (d.value <= 0) continue;
    const arr = classMap.get(d.assetClass);
    if (arr) arr.push(d);
    else classMap.set(d.assetClass, [d]);
  }
  const classes = [...classMap.entries()]
    .map(([name, items]) => ({
      name,
      items: [...items].sort((a, b) => b.value - a.value),
      value: items.reduce((a, s) => a + s.value, 0),
    }))
    .sort((a, b) => b.value - a.value);

  // Assign a base color per class; tint each investment a shade of it.
  const classColor = new Map(
    classes.map((c, i) => [c.name, i < CAT.length ? CAT[i] : CAT_OTHER] as const),
  );

  const innerData = classes.map((c) => ({
    name: c.name,
    value: c.value,
    color: classColor.get(c.name)!,
  }));

  const outerData = classes.flatMap((c) => {
    const base = classColor.get(c.name)!;
    const n = c.items.length;
    return c.items.map((it, i) => ({
      name: it.name,
      value: it.value,
      assetClass: c.name,
      color: base,
      opacity: shade(i, n),
    }));
  });

  return (
    <section className="rounded-xl border border-rule bg-surface p-4">
      <h2 className="text-sm font-medium text-ink-3">Portfolio allocation</h2>
      <p className="text-xs text-ink-3">
        By current market value. Inner ring: asset class · outer ring: investment.
      </p>
      <div className="mt-3 grid items-center gap-4 sm:grid-cols-[1fr_240px]">
        <div className="relative h-64">
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[10px] uppercase tracking-wide text-ink-3">Total</span>
            <span className="text-sm font-semibold tabular-nums">{fmtCompact(total)}</span>
          </div>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={innerData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={40}
                outerRadius={64}
                paddingAngle={1}
                stroke="none"
              >
                {innerData.map((d, i) => (
                  <Cell key={i} fill={d.color} />
                ))}
              </Pie>
              <Pie
                data={outerData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={70}
                outerRadius={98}
                paddingAngle={1}
                stroke="none"
              >
                {outerData.map((d, i) => (
                  <Cell key={i} fill={d.color} fillOpacity={d.opacity} />
                ))}
              </Pie>
              <Tooltip
                formatter={(v, _n, item) => {
                  const value = Number(v);
                  const pct = ((value / total) * 100).toFixed(1);
                  const p = item?.payload ?? {};
                  const label = p.assetClass ? `${p.name} · ${p.assetClass}` : p.name ?? "";
                  return [`${fmtINR(value)} (${pct}%)`, label];
                }}
                contentStyle={{
                  backgroundColor: "var(--chart-surface)",
                  border: "1px solid var(--chart-border)",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <ul className="space-y-3 text-sm">
          {classes.map((c) => {
            const base = classColor.get(c.name)!;
            const n = c.items.length;
            const classPct = ((c.value / total) * 100).toFixed(1);
            return (
              <li key={c.name}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: base }} />
                    <span className="truncate font-medium">{c.name}</span>
                  </div>
                  <span className="shrink-0 text-ink-3 tabular-nums">{classPct}%</span>
                </div>
                <ul className="mt-1 space-y-0.5 pl-[18px]">
                  {c.items.map((it, i) => (
                    <li key={it.name} className="flex items-center justify-between gap-3 text-xs text-ink-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className="h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{ background: base, opacity: shade(i, n) }}
                        />
                        <span className="truncate">{it.name}</span>
                      </div>
                      <span className="shrink-0 tabular-nums">{((it.value / total) * 100).toFixed(1)}%</span>
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
