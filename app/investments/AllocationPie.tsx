"use client";

import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

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

export default function AllocationPie({
  data,
}: {
  data: { name: string; value: number }[];
}) {
  if (data.length === 0) return null;
  const total = data.reduce((a, s) => a + s.value, 0);
  if (total <= 0) return null;

  const sorted = [...data].sort((a, b) => b.value - a.value);

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="text-sm font-medium text-zinc-500">Portfolio allocation</h2>
      <p className="text-xs text-zinc-400">By current market value.</p>
      <div className="mt-3 grid items-center gap-4 sm:grid-cols-[1fr_220px]">
        <div className="h-60">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={sorted}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={45}
                outerRadius={95}
                paddingAngle={1}
                stroke="none"
              >
                {sorted.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(v, _n, item) => {
                  const value = Number(v);
                  const pct = total > 0 ? ((value / total) * 100).toFixed(1) : "0";
                  return [`${fmtINR(value)} (${pct}%)`, item?.payload?.name ?? ""];
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
        <ul className="space-y-1.5 text-sm">
          {sorted.map((s, i) => {
            const pct = (s.value / total) * 100;
            return (
              <li key={s.name} className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className="h-3 w-3 shrink-0 rounded-sm"
                    style={{ backgroundColor: COLORS[i % COLORS.length] }}
                  />
                  <span className="truncate">{s.name}</span>
                </div>
                <span className="shrink-0 text-xs text-zinc-500 tabular-nums">
                  {pct.toFixed(1)}%
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
