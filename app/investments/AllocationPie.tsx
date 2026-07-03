"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

const COLORS = [
  "#f59e0b", // amber
  "#3b82f6", // blue
  "#10b981", // emerald
  "#ef4444", // red
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#14b8a6", // teal
  "#f97316", // orange
  "#6366f1", // indigo
  "#84cc16", // lime
];

function fmtINR(n: number): string {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

// Mix a hex color toward white by `t` (0 = base, 1 = white).
function lighten(hex: string, t: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const mix = (c: number) => Math.round(c + (255 - c) * t);
  return `#${((1 << 24) + (mix(r) << 16) + (mix(g) << 8) + mix(b)).toString(16).slice(1)}`;
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
  const classColor = new Map(classes.map((c, i) => [c.name, COLORS[i % COLORS.length]]));

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
      // Largest holding keeps the base color; smaller ones get progressively lighter.
      color: n > 1 ? lighten(base, (i / (n - 1)) * 0.55) : base,
    }));
  });

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="text-sm font-medium text-zinc-500">Portfolio allocation</h2>
      <p className="text-xs text-zinc-400">
        By current market value. Inner ring: asset class · outer ring: investment.
      </p>
      <div className="mt-3 grid items-center gap-4 sm:grid-cols-[1fr_240px]">
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={innerData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={30}
                outerRadius={62}
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
                innerRadius={68}
                outerRadius={98}
                paddingAngle={1}
                stroke="none"
              >
                {outerData.map((d, i) => (
                  <Cell key={i} fill={d.color} />
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
                  backgroundColor: "rgb(255 255 255)",
                  border: "1px solid rgb(228 228 231)",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <ul className="space-y-2.5 text-sm">
          {classes.map((c) => {
            const base = classColor.get(c.name)!;
            const n = c.items.length;
            return (
              <li key={c.name}>
                <div className="flex items-center justify-between gap-2 font-medium">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className="h-3 w-3 shrink-0 rounded-sm"
                      style={{ backgroundColor: base }}
                    />
                    <span className="truncate">{c.name}</span>
                  </div>
                  <span className="shrink-0 text-xs text-zinc-500 tabular-nums">
                    {((c.value / total) * 100).toFixed(1)}%
                  </span>
                </div>
                <ul className="mt-1 space-y-1 pl-5">
                  {c.items.map((it, i) => (
                    <li
                      key={it.name}
                      className="flex items-center justify-between gap-2 text-xs text-zinc-500"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className="h-2 w-2 shrink-0 rounded-sm"
                          style={{
                            backgroundColor:
                              n > 1 ? lighten(base, (i / (n - 1)) * 0.55) : base,
                          }}
                        />
                        <span className="truncate">{it.name}</span>
                      </div>
                      <span className="shrink-0 tabular-nums">
                        {((it.value / total) * 100).toFixed(1)}%
                      </span>
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
