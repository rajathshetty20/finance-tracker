"use client";

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Point = { date: string; book: number; market: number };

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

type TooltipItem = { dataKey?: string | number; value?: number };

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipItem[];
  label?: number | string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const book = Number(payload.find((p) => p.dataKey === "book")?.value ?? 0);
  const market = Number(payload.find((p) => p.dataKey === "market")?.value ?? 0);
  const gain = market - book;
  const pct = book !== 0 ? (gain / book) * 100 : 0;
  const gainColor = gain >= 0 ? "rgb(4 120 87)" : "rgb(220 38 38)";
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
        <span style={{ color: "var(--ink-3)" }}>Invested </span>
        <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtFull(book)}</span>
      </div>
      <div>
        <span style={{ color: "var(--ink-3)" }}>Market </span>
        <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtFull(market)}</span>
      </div>
      <div style={{ marginTop: 4, color: gainColor, fontVariantNumeric: "tabular-nums" }}>
        {pct >= 0 ? "+" : ""}
        {pct.toFixed(1)}%
      </div>
    </div>
  );
}

export default function InvestmentChart({
  data,
  title,
  headline,
}: {
  data: Point[];
  title: string;
  // Overrides the header gain/pct (default: market − book at the last point).
  // Used by the closed-investment detail view, whose series ends at 0/0.
  headline?: { gain: number; pct: number };
}) {
  if (data.length === 0) return null;

  const points = data.map((p) => ({ ...p, ts: toTs(p.date) }));
  const last = data[data.length - 1];
  const gain = headline ? headline.gain : last.market - last.book;
  const pct = headline ? headline.pct : last.book !== 0 ? (gain / last.book) * 100 : 0;
  const singlePoint = data.length === 1;

  return (
    <section className="rounded-xl border border-rule bg-surface p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-medium text-ink-3">{title}</h2>
        <span
          className={`text-xs tabular-nums ${
            gain >= 0
              ? "text-up"
              : "text-down"
          }`}
        >
          {gain >= 0 ? "+" : ""}
          {fmtCompact(gain)} ({pct >= 0 ? "+" : ""}
          {pct.toFixed(1)}%)
        </span>
      </div>
      <div className="mt-3 h-64">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="marketGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--investment)" stopOpacity={0.25} />
                <stop offset="100%" stopColor="var(--investment)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
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
              domain={["auto", "auto"]}
            />
            <Tooltip content={<ChartTooltip />} />
            <Legend
              verticalAlign="top"
              height={24}
              iconType="plainline"
              wrapperStyle={{ fontSize: 11, color: "var(--ink-3)" }}
            />
            <Area
              type="monotone"
              dataKey="market"
              name="Market"
              stroke="var(--investment)"
              strokeWidth={2.5}
              fill="url(#marketGradient)"
              dot={singlePoint ? { r: 4, fill: "var(--investment)" } : false}
              activeDot={{ r: 5, fill: "var(--investment)", stroke: "var(--chart-surface)", strokeWidth: 2 }}
            />
            <Line
              type="monotone"
              dataKey="book"
              name="Invested"
              stroke="var(--ink-3)"
              strokeWidth={2}
              strokeDasharray="4 4"
              dot={singlePoint ? { r: 4 } : false}
              activeDot={{ r: 4 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
