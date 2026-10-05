import { bucketGoals, clamp, isLiquidBucket, safeDivide, type Balances } from "../lib/calc";
import { formatINR, formatINRShort } from "../lib/format";
import { BUCKETS, type Bucket, type Settings } from "../lib/types";
import { Card } from "./ui";

interface Props {
  bal: Balances;
  settings: Settings;
  title?: string;
  className?: string;
  /** When set, buckets with a surplus show a "Move surplus" button. */
  onMoveSurplus?: (bucket: Bucket, amount: number) => void;
}

function goalText(settings: Settings, bucket: Bucket): string {
  const t = settings.targets[bucket];
  switch (t.mode) {
    case "MONTHS_OF_B":
      return `${t.months} month${t.months === 1 ? "" : "s"} of survival budget`;
    case "NEXT_LEVEL":
      return "to reach your next level";
    case "FIXED":
      return "fixed goal";
    case "NONE":
      return "";
  }
}

export function BucketsCard({
  bal,
  settings,
  title = "Buckets",
  className = "",
  onMoveSurplus,
}: Props) {
  const goals = bucketGoals(settings, bal);
  const labels = settings.labels.buckets;
  return (
    <Card title={title} className={className}>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {BUCKETS.map((b) => {
          const g = goals[b];
          const counts = isLiquidBucket(b);
          return (
            <li key={b} className="flex flex-col rounded-xl border border-line bg-raised/40 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{labels[b]}</span>
                <span
                  className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
                    counts ? "bg-accent/15 text-accent" : "bg-raised text-muted"
                  }`}
                >
                  {counts ? "Counts to level" : "Excluded"}
                </span>
              </div>
              <p
                className={`mt-1 text-2xl font-bold tabular-nums ${bal[b] < 0 ? "text-danger" : ""}`}
                title={formatINR(bal[b])}
              >
                {formatINRShort(bal[b])}
              </p>

              {g.kind === "SHORT" && (
                <div className="mt-2 rounded-lg border border-warn/50 bg-warn/10 px-2.5 py-2 text-sm">
                  <p className="font-semibold text-warn">{formatINRShort(g.shortBy)} short</p>
                  <p className="text-xs text-muted">
                    Goal {formatINRShort(g.target)} · {goalText(settings, b)}
                  </p>
                  <div
                    className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-raised"
                    aria-hidden="true"
                  >
                    <div
                      className="h-full rounded-full bg-warn"
                      style={{ width: `${clamp(safeDivide(bal[b], g.target) * 100, 0, 100)}%` }}
                    />
                  </div>
                </div>
              )}
              {g.kind === "MET" && (
                <div className="mt-2 rounded-lg border border-ok/50 bg-ok/10 px-2.5 py-2 text-sm">
                  <p className="font-semibold text-ok">Goal {formatINRShort(g.target)} achieved</p>
                  <p className="text-xs text-muted">
                    {g.surplus > 0
                      ? `${formatINRShort(g.surplus)} surplus to allocate`
                      : "Exactly on goal"}
                  </p>
                  {onMoveSurplus && g.surplus > 0 && (
                    <button
                      type="button"
                      className="btn btn-sm mt-2"
                      onClick={() => onMoveSurplus(b, g.surplus)}
                      aria-label={`Move ${formatINRShort(g.surplus)} surplus out of ${labels[b]}`}
                    >
                      Move surplus
                    </button>
                  )}
                </div>
              )}
              {g.kind === "NONE" && (
                <p className="mt-2 text-xs text-muted">
                  {settings.targets[b].mode === "NONE"
                    ? "No goal set"
                    : "Set your survival budget to see this goal"}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
