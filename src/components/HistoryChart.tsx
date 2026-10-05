import { useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatMonth, formatRatio } from "../lib/format";
import type { Settings, Snapshot } from "../lib/types";
import { Card } from "./ui";

const LOG_FLOOR = 0.1;

export function HistoryChart({
  snapshots,
  settings,
}: {
  snapshots: Snapshot[];
  settings: Settings;
}) {
  const [scale, setScale] = useState<"linear" | "log">("log");
  const t = settings.thresholds;
  const L = settings.labels.levels;

  const points = snapshots.map((s) => ({
    month: formatMonth(s.date),
    // Ratio is null when income covers survival; plot it at the L3 line.
    ratio: s.ratio === null ? t.L3 : s.ratio,
    covered: s.ratio === null,
  }));
  const maxRatio = Math.max(t.L3 * 1.1, ...points.map((p) => p.ratio));
  const plotted =
    scale === "log"
      ? points.map((p) => ({ ...p, plot: Math.max(LOG_FLOOR, p.ratio) }))
      : points.map((p) => ({ ...p, plot: p.ratio }));

  return (
    <Card
      title="Coverage history"
      className="sm:col-span-2"
      action={
        <div role="group" aria-label="Chart scale" className="flex gap-1">
          {(["log", "linear"] as const).map((s) => (
            <button
              key={s}
              type="button"
              className={`btn btn-sm ${scale === s ? "btn-primary" : ""}`}
              aria-pressed={scale === s}
              onClick={() => setScale(s)}
            >
              {s === "log" ? "Log" : "Linear"}
            </button>
          ))}
        </div>
      }
    >
      {points.length === 0 ? (
        <p className="text-sm text-muted">
          History appears here once your survival budget is set. One point is saved per month.
        </p>
      ) : (
        <div className="h-64 w-full" role="img" aria-label="Coverage ratio over time">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={plotted} margin={{ top: 10, right: 16, bottom: 0, left: -8 }}>
              <CartesianGrid stroke="rgb(var(--c-line))" strokeDasharray="3 3" />
              <XAxis dataKey="month" stroke="rgb(var(--c-muted))" fontSize={12} />
              <YAxis
                stroke="rgb(var(--c-muted))"
                fontSize={12}
                scale={scale}
                domain={scale === "log" ? [LOG_FLOOR, maxRatio] : [0, maxRatio]}
                allowDataOverflow
                tickFormatter={(v: number) => `${v}x`}
              />
              <Tooltip
                contentStyle={{
                  background: "rgb(var(--c-surface))",
                  border: "1px solid rgb(var(--c-line))",
                  borderRadius: 8,
                }}
                formatter={(_v, _n, item) => {
                  const p = item.payload as (typeof plotted)[number];
                  return [p.covered ? "Income covers survival" : formatRatio(p.ratio), "Coverage"];
                }}
              />
              <ReferenceLine
                y={t.L1}
                stroke="rgb(var(--c-warn))"
                strokeDasharray="4 4"
                label={{
                  value: `${L.L1.name} ${t.L1}x`,
                  fill: "rgb(var(--c-muted))",
                  fontSize: 11,
                  position: "insideTopLeft",
                }}
              />
              <ReferenceLine
                y={t.L2}
                stroke="rgb(var(--c-warn))"
                strokeDasharray="4 4"
                label={{
                  value: `${L.L2.name} ${t.L2}x`,
                  fill: "rgb(var(--c-muted))",
                  fontSize: 11,
                  position: "insideTopLeft",
                }}
              />
              <ReferenceLine
                y={t.L3}
                stroke="rgb(var(--c-ok))"
                strokeDasharray="4 4"
                label={{
                  value: `${L.L3.name} ${t.L3}x`,
                  fill: "rgb(var(--c-muted))",
                  fontSize: 11,
                  position: "insideTopLeft",
                }}
              />
              <Line
                type="monotone"
                dataKey="plot"
                stroke="rgb(var(--c-accent))"
                strokeWidth={2}
                dot={{ r: 3 }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
