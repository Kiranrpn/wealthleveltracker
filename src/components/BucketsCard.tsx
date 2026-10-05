import { isLiquidBucket, safeDivide, type Balances } from "../lib/calc";
import { formatINR, formatINRShort, formatNumber } from "../lib/format";
import { BUCKETS, type Settings } from "../lib/types";
import { Card } from "./ui";

export function BucketsCard({
  bal,
  parked,
  settings,
  className = "",
}: {
  bal: Balances;
  parked: Balances;
  settings: Settings;
  className?: string;
}) {
  const labels = settings.labels.buckets;
  const survivalMonths = safeDivide(bal.SURVIVAL, settings.monthlySurvivalB);
  return (
    <Card title="Bucket balances" className={className}>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {BUCKETS.map((b) => {
          const counts = isLiquidBucket(b);
          return (
            <li key={b} className="rounded-xl border border-line bg-raised/50 p-3">
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
                className={`mt-1 text-xl font-bold tabular-nums ${bal[b] < 0 ? "text-danger" : ""}`}
                title={formatINR(bal[b])}
              >
                {formatINRShort(bal[b])}
              </p>
              <p className="text-xs text-muted">
                {parked[b] > 0 ? `${formatINRShort(parked[b])} in holdings` : "No holdings"}
                {b === "SURVIVAL" && settings.monthlySurvivalB > 0 && (
                  <>
                    {" "}
                    · covers {formatNumber(Math.max(0, Math.round(survivalMonths * 10) / 10))}{" "}
                    months of B
                  </>
                )}
              </p>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
