"use client";

import {
  Area,
  CartesianGrid,
  ComposedChart,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PlannedPoint } from "@/lib/goals";

function fmtCompact(n: number): string {
  const a = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  if (a >= 1e7) return `${sign}₹${(a / 1e7).toFixed(a >= 1e8 ? 0 : 2)}Cr`;
  if (a >= 1e5) return `${sign}₹${(a / 1e5).toFixed(a >= 1e6 ? 0 : 1)}L`;
  if (a >= 1e3) return `${sign}₹${(a / 1e3).toFixed(0)}k`;
  return `${sign}₹${a.toFixed(0)}`;
}

function fmtFull(n: number): string {
  const sign = n < 0 ? "−" : "";
  return `${sign}₹${Math.abs(Math.round(n)).toLocaleString("en-IN")}`;
}

function toTs(iso: string): number {
  return new Date(iso + "T00:00:00").getTime();
}

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-IN", { month: "short", year: "numeric" });
}

type TooltipItem = { dataKey?: string | number; value?: number };

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipItem[]; label?: number | string }) {
  if (!active || !payload || payload.length === 0) return null;
  const planned = Number(payload.find((p) => p.dataKey === "planned")?.value ?? 0);
  return (
    <div style={{ backgroundColor: "var(--chart-surface)", border: "1px solid var(--chart-border)", borderRadius: 8, fontSize: 12, padding: "8px 10px", lineHeight: 1.5 }}>
      <div style={{ color: "var(--ink-3)" }}>{fmtDate(Number(label))}</div>
      <div style={{ marginTop: 4 }}>
        <span style={{ color: "var(--ink-3)" }}>Needed </span>
        <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtFull(planned)}</span>
      </div>
    </div>
  );
}

export default function GoalChart({
  data,
  attributed,
  todayISO,
}: {
  data: PlannedPoint[];
  attributed: number;
  todayISO: string;
}) {
  if (data.length === 0) return null;
  const points = data.map((p) => ({ ...p, ts: toTs(p.date) }));
  const todayTs = toTs(todayISO);
  const clampedTs = Math.min(Math.max(todayTs, points[0].ts), points[points.length - 1].ts);

  return (
    <section className="rounded-xl border border-rule bg-surface p-4">
      <h2 className="text-sm font-medium">What it must hold to reach the target</h2>
      <div className="mt-3 h-64">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
            <XAxis
              dataKey="ts"
              type="number"
              scale="time"
              domain={["dataMin", "dataMax"]}
              tickFormatter={fmtDate}
              tick={{ fill: "var(--ink-3)", fontSize: 11 }}
              axisLine={{ stroke: "var(--chart-grid)" }}
              tickLine={{ stroke: "var(--chart-grid)" }}
              minTickGap={50}
            />
            {/* Anchored at zero, unlike the other charts: this one is a fill
                measuring progress up from nothing toward the target, so the
                shaded region means exactly what it looks like. */}
            <YAxis
              tickFormatter={fmtCompact}
              tick={{ fill: "var(--ink-3)", fontSize: 11 }}
              axisLine={{ stroke: "var(--chart-grid)" }}
              tickLine={{ stroke: "var(--chart-grid)" }}
              width={70}
              domain={[0, (max: number) => max * 1.08]}
            />
            <Tooltip content={<ChartTooltip />} />
            <Area isAnimationActive={false} type="monotone" dataKey="planned" name="Needed" stroke="var(--goal)" strokeWidth={2.5} fill="none" dot={false} />
            <ReferenceDot
              x={clampedTs}
              y={attributed}
              r={5}
              fill="var(--ink-2)"
              stroke="var(--chart-surface)"
              strokeWidth={2}
              label={{ value: "now", position: "top", fontSize: 11, fill: "var(--ink-2)" }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
