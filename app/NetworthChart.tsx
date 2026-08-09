"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Point = {
  date: string;
  nw: number;
  invest_market: number;
  cash: number;
  debt_pending: number;
};

function fmtCompact(n: number): string {
  const a = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  if (a >= 1e7) return `${sign}₹${(a / 1e7).toFixed(a >= 1e8 ? 0 : 1)}Cr`;
  if (a >= 1e5) return `${sign}₹${(a / 1e5).toFixed(a >= 1e6 ? 0 : 1)}L`;
  if (a >= 1e3) return `${sign}₹${(a / 1e3).toFixed(0)}k`;
  return `${sign}₹${a.toFixed(0)}`;
}

function fmtFull(n: number): string {
  const sign = n < 0 ? "−" : "";
  return `${sign}₹${Math.abs(Math.round(n)).toLocaleString("en-IN")}`;
}

/**
 * Axis ticks are month starts, so the day is noise: "8 Jan 24 · 8 Jun 24 ·
 * 8 Nov 24 · 10 Sept 25" reads as arbitrary sampling rather than as a
 * timeline. Month and year only, and "Sept" trimmed to three letters so it
 * does not sit a character wider than every other tick.
 */
function fmtDateShort(ts: number): string {
  const d = new Date(ts);
  return d
    .toLocaleDateString("en-IN", { month: "short", year: "2-digit" })
    .replace("Sept ", "Sep ");
}

function fmtDateLong(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function toTs(iso: string): number {
  return new Date(iso + "T00:00:00").getTime();
}

type TooltipItem = { payload?: Point & { ts: number } };

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipItem[];
  label?: number | string;
}) {
  if (!active || !payload || payload.length === 0 || !payload[0].payload) return null;
  const p = payload[0].payload;
  const assets = p.invest_market + p.cash;
  const ratio = assets > 0 ? (p.debt_pending / assets) * 100 : 0;
  return (
    <div
      style={{
        backgroundColor: "var(--chart-surface)",
        border: "1px solid var(--chart-border)",
        borderRadius: "8px",
        fontSize: "12px",
        padding: "8px 10px",
        lineHeight: 1.5,
      }}
    >
      <div style={{ color: "var(--ink-3)" }}>{fmtDateLong(Number(label))}</div>
      <div style={{ marginTop: 4 }}>
        <span style={{ color: "var(--ink-3)" }}>Net Worth </span>
        <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtFull(p.nw)}</span>
      </div>
      <div>
        <span style={{ color: "var(--ink-3)" }}>Debt ratio </span>
        <span style={{ fontVariantNumeric: "tabular-nums" }}>{ratio.toFixed(1)}%</span>
      </div>
    </div>
  );
}

export default function NetworthChart({ data }: { data: Point[] }) {
  if (data.length === 0) return null;

  const points = data.map((p) => ({ ...p, ts: toTs(p.date) }));
  const singlePoint = data.length === 1;

  return (
    <section className="rounded-xl border border-rule bg-surface p-4">
      <h2 className="text-sm font-medium">Net worth</h2>
      <div className="mt-3 h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
            <XAxis
              dataKey="ts"
              type="number"
              scale="time"
              domain={["dataMin", "dataMax"]}
              tickFormatter={fmtDateShort}
              tick={{ fill: "var(--ink-3)", fontSize: 11 }}
              axisLine={{ stroke: "var(--chart-grid)" }}
              tickLine={{ stroke: "var(--chart-grid)" }}
              minTickGap={40}
            />
            <YAxis
              tickFormatter={fmtCompact}
              tick={{ fill: "var(--ink-3)", fontSize: 11 }}
              axisLine={{ stroke: "var(--chart-grid)" }}
              tickLine={{ stroke: "var(--chart-grid)" }}
              width={70}
              // "auto" rounds the top out to the next nice number, which put a
              // ₹60L ceiling over data topping out at ₹42.6L and left the top
              // third of the plot empty. Pin the top to the data with a little
              // headroom for the marker, and keep zero as the floor so the
              // slope of the line is not exaggerated by a cropped baseline.
              domain={[0, (max: number) => max * 1.08]}
              allowDecimals={false}
            />
            <Tooltip content={<ChartTooltip />} />
            {/* Stroke only. The shaded region under an area measures down to
                the axis baseline, and this axis starts wherever the data does
                — the fill would represent nothing. */}
            <Area
              type="monotone"
              dataKey="nw"
              // The entry animation wipes a clip rect from width 0 to full. When it
              // does not run to completion the rect stays at 0 and the series is
              // clipped away — axes, gridlines and legend all present, no data.
              // A ledger chart gains nothing from a wipe; this removes the only
              // state in which it can render blank.
              isAnimationActive={false}
              stroke="var(--accent)"
              strokeWidth={2.5}
              fill="none"
              dot={singlePoint ? { r: 4, fill: "var(--accent)" } : false}
              activeDot={{ r: 5, fill: "var(--accent)", stroke: "var(--chart-surface)", strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
