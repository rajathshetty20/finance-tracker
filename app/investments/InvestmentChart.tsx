"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
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

export default function InvestmentChart({
  data,
  title,
}: {
  data: Point[];
  title: string;
}) {
  if (data.length === 0) return null;

  const points = data.map((p) => ({ ...p, ts: toTs(p.date) }));
  const last = data[data.length - 1];
  const gain = last.market - last.book;
  const pct = last.book !== 0 ? (gain / last.book) * 100 : 0;
  const singlePoint = data.length === 1;

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-medium text-zinc-500">{title}</h2>
        <span
          className={`text-xs tabular-nums ${
            gain >= 0
              ? "text-emerald-700 dark:text-emerald-400"
              : "text-red-600 dark:text-red-400"
          }`}
        >
          {gain >= 0 ? "+" : ""}
          {fmtCompact(gain)} ({pct >= 0 ? "+" : ""}
          {pct.toFixed(1)}%)
        </span>
      </div>
      <div className="mt-3 h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgb(228 228 231)" />
            <XAxis
              dataKey="ts"
              type="number"
              scale="time"
              domain={["dataMin", "dataMax"]}
              tickFormatter={fmtDateShort}
              tick={{ fill: "rgb(113 113 122)", fontSize: 11 }}
              axisLine={{ stroke: "rgb(228 228 231)" }}
              tickLine={{ stroke: "rgb(228 228 231)" }}
              minTickGap={40}
            />
            <YAxis
              tickFormatter={fmtCompact}
              tick={{ fill: "rgb(113 113 122)", fontSize: 11 }}
              axisLine={{ stroke: "rgb(228 228 231)" }}
              tickLine={{ stroke: "rgb(228 228 231)" }}
              width={70}
              domain={["auto", "auto"]}
            />
            <Tooltip
              formatter={(v, _n, item) => {
                const key = item?.dataKey as "book" | "market" | undefined;
                const label = key === "book" ? "Invested" : key === "market" ? "Market" : "";
                return [fmtFull(Number(v)), label];
              }}
              labelFormatter={(t) => fmtDateLong(Number(t))}
              contentStyle={{
                backgroundColor: "rgb(255 255 255)",
                border: "1px solid rgb(228 228 231)",
                borderRadius: "8px",
                fontSize: "12px",
              }}
            />
            <Legend
              verticalAlign="top"
              height={24}
              iconType="plainline"
              wrapperStyle={{ fontSize: 11, color: "rgb(113 113 122)" }}
            />
            <Line
              type="monotone"
              dataKey="book"
              name="Invested"
              stroke="rgb(113 113 122)"
              strokeWidth={2}
              dot={singlePoint ? { r: 4 } : false}
              activeDot={{ r: 4 }}
            />
            <Line
              type="monotone"
              dataKey="market"
              name="Market"
              stroke="rgb(16 185 129)"
              strokeWidth={2}
              dot={singlePoint ? { r: 4 } : false}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
