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
import { LEVELS, type Settings, type Snapshot } from "../lib/types";
import { Card } from "./ui";

/**
 * Coverage ratio per month. The y-axis stops just above the next threshold you have not
 * reached yet, so early progress is visible instead of squashed under the 35x line.
 */
export function HistoryChart({
  snapshots,
  settings,
}: {
  snapshots: Snapshot[];
  settings: Settings;
}) {
  const t = settings.thresholds;
  const lines = (["L1", "L2", "L3"] as const).map((lv) => ({ lv, y: t[lv] }));
  const points = snapshots.map((s) => ({ month: formatMonth(s.date), ratio: s.ratio }));
  const maxRatio = Math.max(0, ...points.map((p) => p.ratio));
  const ceiling = lines.find((l) => l.y > maxRatio)?.y ?? maxRatio;
  const yMax = Math.max(ceiling, maxRatio) * 1.15;

  return (
    <Card title="Coverage history" className="sm:col-span-2">
      {points.length === 0 ? (
        <p className="text-sm text-muted">
          History appears once your survival budget is set. One point is saved per month.
        </p>
      ) : (
        <div className="h-64 w-full" role="img" aria-label="Coverage ratio by month">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 10, right: 16, bottom: 0, left: -8 }}>
              <CartesianGrid stroke="rgb(var(--c-line))" strokeDasharray="3 3" />
              <XAxis dataKey="month" stroke="rgb(var(--c-muted))" fontSize={12} />
              <YAxis
                stroke="rgb(var(--c-muted))"
                fontSize={12}
                domain={[0, yMax]}
                tickFormatter={(v: number) => `${Math.round(v * 10) / 10}x`}
              />
              <Tooltip
                contentStyle={{
                  background: "rgb(var(--c-surface))",
                  border: "1px solid rgb(var(--c-line))",
                  borderRadius: 8,
                }}
                formatter={(v: number) => [formatRatio(v), "Coverage"]}
              />
              {lines
                .filter((l) => l.y <= yMax)
                .map((l) => (
                  <ReferenceLine
                    key={l.lv}
                    y={l.y}
                    stroke={l.lv === LEVELS[3] ? "rgb(var(--c-ok))" : "rgb(var(--c-warn))"}
                    strokeDasharray="4 4"
                    label={{
                      value: `${settings.labels.levels[l.lv].name} ${l.y}x`,
                      fill: "rgb(var(--c-muted))",
                      fontSize: 11,
                      position: "insideTopLeft",
                    }}
                  />
                ))}
              <Line
                type="monotone"
                dataKey="ratio"
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
