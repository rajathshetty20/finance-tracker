"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { AssetClass, GoalAllocation } from "@/lib/types";
import { saveGlidePath, type GlideRow } from "../actions";
import { useGuard } from "../../useGuard";
import { assetClassColor } from "../../ui";

// A glide path is a shape over time. We render it as a full-height stacked area
// (today on the left, the goal date on the right). Only the asset classes this
// goal uses are shown as bands; dragging a boundary between two bands reallocates
// between just those two, so every column always sums to 100%. Classes are added
// or removed from the goal via the chips above the chart.

type Milestone = { id: string; years: number; pct: number[] }; // pct aligned to `active`
type Plan = { active: string[]; milestones: Milestone[] }; // active = class ids, in assetClasses order
type Drag = { type: "band"; id: string; b: number } | { type: "time"; id: string };

// The app's validated categorical tokens, not a private hex list — an asset
// class must wear the same colour here as on Home. These also carry a dark
// ramp; the raw Tailwind-500 hues did not.
const H = 240;
const PAD = { top: 28, right: 16, bottom: 30, left: 34 };
const GRID = [0, 25, 50, 75, 100];

let _seq = 0;
const nextId = () => `m${_seq++}`;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** Round weights to integer percentages summing to exactly 100 (largest-remainder). */
function toHundred(weights: number[]): number[] {
  const sum = weights.reduce((s, w) => s + w, 0);
  if (sum <= 0) return weights.map(() => 0);
  const exact = weights.map((w) => (w / sum) * 100);
  const base = exact.map(Math.floor);
  const left = 100 - base.reduce((s, b) => s + b, 0);
  const order = exact.map((e, i) => ({ i, rem: e - Math.floor(e) })).sort((a, b) => b.rem - a.rem);
  for (let j = 0; j < left && j < order.length; j++) base[order[j].i]++;
  return base;
}

/** Nearest month to `target` not already used by another milestone (within [0, maxM]). */
function nearestFreeMonth(target: number, used: Set<number>, maxM: number): number | null {
  const t = clamp(Math.round(target), 0, maxM);
  if (!used.has(t)) return t;
  for (let d = 1; d <= maxM; d++) {
    if (t - d >= 0 && !used.has(t - d)) return t - d;
    if (t + d <= maxM && !used.has(t + d)) return t + d;
  }
  return null;
}

const cumulative = (pct: number[]) => {
  const out: number[] = [];
  let s = 0;
  for (const v of pct) {
    s += v;
    out.push(s);
  }
  return out;
};

export default function GlidePathEditor({
  goalId,
  assetClasses,
  existing,
  horizonYears,
}: {
  goalId: string;
  assetClasses: AssetClass[];
  existing: GoalAllocation[];
  horizonYears: number;
}) {
  const horizon = Math.max(1, horizonYears);
  const colorOf = (id: string) => assetClassColor(id, assetClasses.map((c) => c.id));
  const nameOf = (id: string) => assetClasses.find((c) => c.id === id)?.name ?? "—";

  function init(): Plan {
    const byMonths = new Map<number, Map<string, number>>();
    for (const a of existing) {
      const map = byMonths.get(a.months_before_end) ?? new Map<string, number>();
      map.set(a.asset_class_id, Number(a.target_pct));
      byMonths.set(a.months_before_end, map);
    }

    if (byMonths.size === 0) {
      // No plan yet: default to an aggressive→conservative glide across all classes,
      // ranked by expected return (highest = most aggressive).
      const active = assetClasses.map((c) => c.id);
      const ranked = assetClasses
        .map((c) => ({ id: c.id, ret: Number(c.expected_return) }))
        .sort((a, b) => b.ret - a.ret);
      const aligned = (byRank: number[]): number[] => {
        const r = toHundred(byRank);
        const pct = new Array(active.length).fill(0);
        ranked.forEach((rk, k) => (pct[active.indexOf(rk.id)] = r[k]));
        return pct;
      };
      const farY = Math.max(2, horizon);
      if (active.length <= 1) return { active, milestones: [{ id: nextId(), years: farY, pct: [100] }] };
      return {
        active,
        milestones: [
          { id: nextId(), years: farY, pct: aligned(ranked.map((_, k) => active.length - k)) },
          { id: nextId(), years: 1, pct: aligned(ranked.map((_, k) => k + 1)) },
        ],
      };
    }

    const used = new Set<string>();
    for (const map of byMonths.values()) for (const [id, v] of map) if (v > 0) used.add(id);
    const active = assetClasses.filter((c) => used.has(c.id)).map((c) => c.id);
    const milestones = [...byMonths.entries()]
      .map(([months, map]) => ({
        id: nextId(),
        years: months / 12,
        pct: toHundred(active.map((id) => map.get(id) ?? 0)),
      }))
      .sort((a, b) => b.years - a.years);
    return { active, milestones };
  }

  const [plan, setPlan] = useState<Plan>(init);
  const { active, milestones } = plan;
  const na = active.length;

  const [drag, setDrag] = useState<Drag | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const guard = useGuard();

  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [w, setW] = useState(0);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const maxMonths = Math.round(horizon * 12);
  const plotW = w - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const xForYears = (y: number) => PAD.left + (1 - clamp(y, 0, horizon) / horizon) * plotW;
  const yForCum = (c: number) => PAD.top + (1 - clamp(c, 0, 100) / 100) * plotH;
  const yearsForX = (clientX: number) => {
    const rect = svgRef.current!.getBoundingClientRect();
    return clamp((1 - (clientX - rect.left - PAD.left) / plotW) * horizon, 0, horizon);
  };

  const setMs = (fn: (ms: Milestone[]) => Milestone[]) => setPlan((p) => ({ ...p, milestones: fn(p.milestones) }));
  function touch() {
    setSaved(false);
    setError(null);
  }

  function toggleClass(id: string) {
    setPlan((p) => {
      const on = p.active.includes(id);
      if (on && p.active.length <= 1) return p; // keep at least one class
      const nextActive = on
        ? p.active.filter((x) => x !== id)
        : assetClasses.filter((c) => p.active.includes(c.id) || c.id === id).map((c) => c.id);
      // A newly-added class comes in at an equal share so it has a visible band
      // and a grabbable boundary handle; the others scale down proportionally.
      const share = 100 / nextActive.length;
      const milestones = p.milestones.map((m) => {
        const byId = new Map(p.active.map((cid, i) => [cid, m.pct[i]]));
        const raw = nextActive.map((cid) => byId.get(cid) ?? share);
        // Either way the weights won't sum to 100 anymore — renormalize.
        return { ...m, pct: toHundred(raw) };
      });
      return { active: nextActive, milestones };
    });
    touch();
  }

  function startDrag(e: React.PointerEvent, d: Drag) {
    e.preventDefault();
    e.stopPropagation();
    svgRef.current?.setPointerCapture(e.pointerId);
    setDrag(d);
  }

  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    if (!drag) return;
    const rect = svgRef.current!.getBoundingClientRect();
    if (drag.type === "band") {
      const cum = clamp((1 - (e.clientY - rect.top - PAD.top) / plotH) * 100, 0, 100);
      setMs((ms) =>
        ms.map((m) => {
          if (m.id !== drag.id) return m;
          const b = drag.b;
          const lower = m.pct.slice(0, b).reduce((s, v) => s + v, 0);
          const upper = lower + m.pct[b] + m.pct[b + 1];
          const nc = clamp(cum, lower, upper);
          const pct = [...m.pct];
          pct[b] = nc - lower;
          pct[b + 1] = upper - nc;
          return { ...m, pct };
        }),
      );
    } else {
      const targetM = Math.round(yearsForX(e.clientX) * 12);
      setMs((ms) => {
        const ordered = [...ms].sort((a, b) => b.years - a.years);
        const i = ordered.findIndex((m) => m.id === drag.id);
        // Stay at least one whole month clear of either neighbour so no two
        // milestones ever round to the same months_before_end.
        const hiM = i > 0 ? Math.round(ordered[i - 1].years * 12) - 1 : maxMonths;
        const loM = i < ordered.length - 1 ? Math.round(ordered[i + 1].years * 12) + 1 : 0;
        const months = loM > hiM ? Math.round(ordered[i].years * 12) : clamp(targetM, loM, hiM);
        return ms.map((m) => (m.id === drag.id ? { ...m, years: months / 12 } : m));
      });
    }
    touch();
  }

  function endDrag(e: React.PointerEvent) {
    if (!drag) return;
    try {
      svgRef.current?.releasePointerCapture(e.pointerId);
    } catch {}
    setDrag(null);
  }

  function interpAt(y0: number): number[] {
    const ordered = [...milestones].sort((a, b) => b.years - a.years);
    if (y0 >= ordered[0].years) return [...ordered[0].pct];
    const last = ordered[ordered.length - 1];
    if (y0 <= last.years) return [...last.pct];
    for (let i = 0; i < ordered.length - 1; i++) {
      const a = ordered[i];
      const b = ordered[i + 1];
      if (y0 <= a.years && y0 >= b.years) {
        const t = (a.years - y0) / (a.years - b.years || 1);
        return a.pct.map((v, k) => v * (1 - t) + b.pct[k] * t);
      }
    }
    return [...last.pct];
  }

  function onDoubleClick(e: React.MouseEvent<SVGSVGElement>) {
    if (w <= 0) return;
    const used = new Set(milestones.map((m) => Math.round(m.years * 12)));
    const months = nearestFreeMonth(yearsForX(e.clientX) * 12, used, maxMonths);
    if (months == null) return; // every month already taken
    const yy = months / 12;
    const pct = interpAt(yy);
    setMs((ms) => [...ms, { id: nextId(), years: yy, pct }]);
    touch();
  }

  function removeMilestone(id: string) {
    setMs((ms) => (ms.length > 1 ? ms.filter((m) => m.id !== id) : ms));
    touch();
  }

  function addMilestone() {
    const used = new Set(milestones.map((m) => Math.round(m.years * 12)));
    const months = nearestFreeMonth(Math.round((horizon * 12) / 2), used, maxMonths);
    if (months == null) return; // every month already taken
    const yy = months / 12;
    const pct = interpAt(yy);
    setMs((ms) => [...ms, { id: nextId(), years: yy, pct }]);
    touch();
  }

  function onSave() {
    setError(null);
    setSaved(false);
    const rows: GlideRow[] = [];
    for (const m of milestones) {
      if (!Number.isFinite(m.years) || m.years < 0) continue;
      const months = Math.round(m.years * 12);
      const ints = toHundred(m.pct);
      active.forEach((id, i) => {
        if (ints[i] > 0) rows.push({ asset_class_id: id, months_before_end: months, target_pct: ints[i] });
      });
    }
    startTransition(() =>
      guard(async () => {
      const res = await saveGlidePath(goalId, rows);
      if (res?.error) setError(res.error);
      else setSaved(true);
    }),
    );
  }

  const ordered = [...milestones].sort((a, b) => b.years - a.years);
  const yearLabel = (y: number) => (Number.isInteger(y) ? `${y}y` : `${y.toFixed(1)}y`);

  // Band polygons: extend the first/last column flat to the chart edges (the
  // engine holds allocation flat past the outermost milestones).
  const cols =
    w > 0 && ordered.length > 0
      ? [
          { x: xForYears(horizon), cum: cumulative(ordered[0].pct) },
          ...ordered.map((m) => ({ x: xForYears(m.years), cum: cumulative(m.pct) })),
          { x: xForYears(0), cum: cumulative(ordered[ordered.length - 1].pct) },
        ]
      : [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {assetClasses.map((c) => {
          const on = active.includes(c.id);
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => toggleClass(c.id)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition ${
                on
                  ? "border-rule text-ink"
                  : "border-dashed border-rule text-ink-3 hover:text-ink-2"
              }`}
              title={on ? "Remove from this goal" : "Add to this goal"}
            >
              <span
                className="h-2.5 w-2.5 rounded-sm"
                style={on ? { backgroundColor: colorOf(c.id) } : { boxShadow: "inset 0 0 0 1px currentColor" }}
              />
              {c.name}
            </button>
          );
        })}
      </div>

      <div ref={wrapRef} className="rounded-lg border border-rule bg-surface">
        {w > 0 && (
          <svg
            ref={svgRef}
            width={w}
            height={H}
            style={{ touchAction: "none", display: "block", userSelect: "none" }}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onDoubleClick={onDoubleClick}
          >
            {/* bands */}
            {active.map((id, k) => {
              const top = cols.map((col) => `${col.x},${yForCum(col.cum[k])}`);
              const bottom = [...cols].reverse().map((col) => `${col.x},${yForCum(k > 0 ? col.cum[k - 1] : 0)}`);
              return (
                <polygon
                  key={id}
                  points={[...top, ...bottom].join(" ")}
                  fill={colorOf(id)}
                  fillOpacity={0.85}
                  stroke="white"
                  strokeOpacity={0.6}
                  strokeWidth={0.5}
                />
              );
            })}

            {/* y-axis % gridlines + labels */}
            {GRID.map((p) => {
              const gy = yForCum(p);
              return (
                <g key={`grid-${p}`} style={{ pointerEvents: "none" }}>
                  {p > 0 && p < 100 && (
                    <line x1={PAD.left} y1={gy} x2={w - PAD.right} y2={gy} stroke="var(--chart-surface)" strokeOpacity={0.45} strokeWidth={1} strokeDasharray="2 3" />
                  )}
                  <text x={PAD.left - 6} y={gy + 3} fontSize={9} fill="var(--ink-3)" textAnchor="end">{p}%</text>
                </g>
              );
            })}

            {/* x-axis baseline */}
            <line x1={PAD.left} y1={H - PAD.bottom} x2={w - PAD.right} y2={H - PAD.bottom} stroke="var(--chart-grid)" strokeWidth={1} />
            <text x={PAD.left} y={H - 8} fontSize={10} fill="var(--ink-3)">today</text>
            <text x={w - PAD.right} y={H - 8} fontSize={10} fill="var(--ink-3)" textAnchor="end">goal date</text>

            {/* per-milestone guides, handles, time control, remove */}
            {ordered.map((m, mi) => {
              const x = xForYears(m.years);
              const cum = cumulative(m.pct);
              return (
                <g key={m.id}>
                  <line x1={x} y1={PAD.top} x2={x} y2={H - PAD.bottom} stroke="var(--ink-3)" strokeOpacity={0.5} strokeDasharray="2 3" />
                  {/* per-band % labels at this milestone (when the band is tall enough) */}
                  {active.map((id, k) => {
                    const yTop = yForCum(cum[k]);
                    const yBottom = yForCum(k > 0 ? cum[k - 1] : 0);
                    if (yBottom - yTop < 16) return null;
                    return (
                      <text
                        key={`v-${id}`}
                        x={x}
                        y={(yTop + yBottom) / 2 + 3.5}
                        fontSize={10}
                        fontWeight={600}
                        fill="#16191d"
                        stroke="#ffffff"
                        strokeWidth={2.5}
                        paintOrder="stroke"
                        textAnchor="middle"
                        style={{ pointerEvents: "none" }}
                      >
                        {Math.round(m.pct[k])}%
                      </text>
                    );
                  })}
                  {/* boundary handles between consecutive bands */}
                  {active.slice(0, -1).map((_, b) => {
                    const hy = yForCum(cum[b]);
                    return (
                      <g key={b} style={{ cursor: "ns-resize" }} onPointerDown={(e) => startDrag(e, { type: "band", id: m.id, b })}>
                        <circle cx={x} cy={hy} r={11} fill="transparent" />
                        <circle cx={x} cy={hy} r={5.5} fill="var(--chart-surface)" stroke="var(--ink)" strokeWidth={1.5} />
                      </g>
                    );
                  })}
                  {/* time handle on the axis */}
                  <g style={{ cursor: "ew-resize" }} onPointerDown={(e) => startDrag(e, { type: "time", id: m.id })}>
                    <circle cx={x} cy={H - PAD.bottom} r={11} fill="transparent" />
                    <circle cx={x} cy={H - PAD.bottom} r={4} fill="rgb(63 63 70)" />
                  </g>
                  {/* The final milestone sits on the right edge; centring its label
                      there clipped the trailing character against PAD.right, and it
                      also overprinted the static "goal date" caption. */}
                  {m.years !== 0 && (
                    <text
                      x={x}
                      y={H - PAD.bottom + 16}
                      fontSize={10}
                      fill="var(--ink-3)"
                      textAnchor={mi === ordered.length - 1 ? "end" : "middle"}
                    >
                      {yearLabel(m.years)}
                    </text>
                  )}
                  {/* remove */}
                  {milestones.length > 1 && (
                    <g style={{ cursor: "pointer" }} onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); removeMilestone(m.id); }}>
                      <circle cx={x} cy={9} r={7} fill="var(--chart-surface)" stroke="var(--chart-grid)" />
                      <text x={x} y={12.5} fontSize={9} fill="var(--ink-3)" textAnchor="middle">✕</text>
                    </g>
                  )}
                  {/* live readout while dragging this milestone's band */}
                  {drag?.type === "band" && drag.id === m.id && na > 1 && (() => {
                    const b = drag.b;
                    const ty = yForCum(cum[b]);
                    const flip = x > PAD.left + plotW * 0.6;
                    return (
                      <text x={flip ? x - 10 : x + 10} y={ty - 6} fontSize={10} fill="var(--ink)" textAnchor={flip ? "end" : "start"}>
                        {nameOf(active[b])} {Math.round(m.pct[b])}% · {nameOf(active[b + 1])} {Math.round(m.pct[b + 1])}%
                      </text>
                    );
                  })()}
                </g>
              );
            })}
          </svg>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={onSave} disabled={pending} className="rounded-md bg-ink px-4 py-1.5 text-sm font-medium text-ground hover:opacity-90 disabled:opacity-60">
          {pending ? "Saving..." : "Save plan"}
        </button>
        <button type="button" onClick={addMilestone} className="rounded-md border border-rule px-3 py-1.5 text-sm text-ink hover:bg-surface-2">
          + Add milestone
        </button>
        {saved && <span className="text-xs text-up">Saved.</span>}
        {error && <span className="text-sm text-down">{error}</span>}
      </div>
      <p className="text-xs text-ink-3">
        Tap a class to add or remove it from this goal. Drag a dot up/down to shift the split at a
        milestone; drag the marker on the axis to move it in time. Use “+ Add milestone” (or
        double-click the chart) to add one, ✕ to remove. The column always totals 100%.
      </p>
    </div>
  );
}
