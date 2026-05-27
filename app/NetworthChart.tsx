"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
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

function fmtDateShort(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" });
}

function fmtDateLong(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default function NetworthChart({ data }: { data: Point[] }) {
  if (data.length === 0) return null;

  const first = data[0].nw;
  const last = data[data.length - 1].nw;
  const change = last - first;
  const pct = first !== 0 ? (change / Math.abs(first)) * 100 : 0;
  const days = Math.round(
    (new Date(data[data.length - 1].date + "T00:00:00").getTime() -
      new Date(data[0].date + "T00:00:00").getTime()) /
      86_400_000,
  );
  const singlePoint = data.length === 1;

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-medium text-zinc-500">Net worth over time</h2>
        {!singlePoint && (
          <span className={`text-xs tabular-nums ${change >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
            {change >= 0 ? "+" : ""}{fmtCompact(change)} ({pct >= 0 ? "+" : ""}{pct.toFixed(1)}%) over {days}d
          </span>
        )}
      </div>
      <div className="mt-3 h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgb(228 228 231)" />
            <XAxis
              dataKey="date"
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
                const key = item?.dataKey as keyof Point | undefined;
                const label =
                  key === "nw" ? "Net Worth"
                  : key === "invest_market" ? "Investments"
                  : key === "cash" ? "Cash"
                  : key === "debt_pending" ? "Debt pending"
                  : "";
                return [fmtFull(Number(v)), label];
              }}
              labelFormatter={(d) => fmtDateLong(String(d))}
              contentStyle={{
                backgroundColor: "rgb(255 255 255)",
                border: "1px solid rgb(228 228 231)",
                borderRadius: "8px",
                fontSize: "12px",
              }}
            />
            <Line
              type="monotone"
              dataKey="nw"
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
