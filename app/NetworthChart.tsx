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

function fmtDateShort(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" });
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
      <div style={{ color: "rgb(113 113 122)" }}>{fmtDateLong(Number(label))}</div>
      <div style={{ marginTop: 4 }}>
        <span style={{ color: "rgb(113 113 122)" }}>Net Worth </span>
        <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtFull(p.nw)}</span>
      </div>
      <div>
        <span style={{ color: "rgb(113 113 122)" }}>Debt ratio </span>
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
    <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="text-sm font-medium text-zinc-500">Net worth</h2>
      <div className="mt-3 h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="nwGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgb(16 185 129)" stopOpacity={0.3} />
                <stop offset="100%" stopColor="rgb(16 185 129)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
            <XAxis
              dataKey="ts"
              type="number"
              scale="time"
              domain={["dataMin", "dataMax"]}
              tickFormatter={fmtDateShort}
              tick={{ fill: "rgb(113 113 122)", fontSize: 11 }}
              axisLine={{ stroke: "var(--chart-grid)" }}
              tickLine={{ stroke: "var(--chart-grid)" }}
              minTickGap={40}
            />
            <YAxis
              tickFormatter={fmtCompact}
              tick={{ fill: "rgb(113 113 122)", fontSize: 11 }}
              axisLine={{ stroke: "var(--chart-grid)" }}
              tickLine={{ stroke: "var(--chart-grid)" }}
              width={70}
              domain={["auto", "auto"]}
            />
            <Tooltip content={<ChartTooltip />} />
            <Area
              type="monotone"
              dataKey="nw"
              stroke="rgb(16 185 129)"
              strokeWidth={2.5}
              fill="url(#nwGradient)"
              dot={singlePoint ? { r: 4, fill: "rgb(16 185 129)" } : false}
              activeDot={{ r: 5, fill: "rgb(16 185 129)", stroke: "var(--chart-surface)", strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
