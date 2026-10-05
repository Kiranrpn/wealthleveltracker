import { bucketTotals, computeStatus, computeWarnings } from "../lib/calc";
import { computeEta } from "../lib/eta";
import { formatINR, formatINRShort } from "../lib/format";
import { BUCKETS, type AppData } from "../lib/types";
import { EtaCard } from "./EtaCard";
import { GapCard } from "./GapCard";
import { HistoryChart } from "./HistoryChart";
import { LevelCard } from "./LevelCard";
import { Alert, Card } from "./ui";
import { WhatIfCard } from "./WhatIfCard";

interface Props {
  data: AppData;
  today: string;
  onOpenSettings: () => void;
}

export function Dashboard({ data, today, onOpenSettings }: Props) {
  const { settings, holdings, income } = data;
  const status = computeStatus(settings, holdings);
  const eta = computeEta(settings, holdings, income, today);
  const warnings = computeWarnings(settings, holdings, today);
  const totals = bucketTotals(holdings);
  const labels = settings.labels;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {warnings.length > 0 && (
        <section aria-label="Warnings" className="space-y-2 sm:col-span-2">
          {warnings.map((w) => (
            <Alert key={w.kind} tone={w.kind === "NO_BUDGET" ? "info" : "warn"}>
              {w.message}
            </Alert>
          ))}
        </section>
      )}

      <LevelCard status={status} labels={labels} onOpenSettings={onOpenSettings} />
      <GapCard status={status} labels={labels} />
      <EtaCard eta={eta} labels={labels} />

      <Card title="Breakdown">
        <ul className="divide-y divide-line/60">
          {BUCKETS.map((b) => (
            <li key={b} className="flex items-center justify-between gap-2 py-2 text-sm">
              <span>
                {labels.buckets[b]}
                <span
                  className={`ml-2 rounded px-1.5 py-0.5 text-[11px] font-medium ${
                    totals[b].countsTowardLevel
                      ? "bg-accent/15 text-accent"
                      : "bg-raised text-muted"
                  }`}
                >
                  {totals[b].countsTowardLevel ? "Counts" : "Excluded"}
                </span>
              </span>
              <span className="tabular-nums" title={formatINR(totals[b].current)}>
                {formatINRShort(totals[b].current)}
              </span>
            </li>
          ))}
          <li className="flex justify-between py-2 text-sm font-semibold">
            <span>Liquid total (counts toward level)</span>
            <span className="whitespace-nowrap tabular-nums">
              {formatINRShort(status.liquidTotal)}
            </span>
          </li>
        </ul>
      </Card>

      <Card title="Survival budget">
        {status.kind === "NO_BUDGET" ? (
          <p className="text-sm text-muted">{status.message}</p>
        ) : (
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt>Annual B</dt>
              <dd className="tabular-nums">{formatINR(status.annualB)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Reliable C2 income (net, yearly)</dt>
              <dd className="tabular-nums">- {formatINR(status.reliableC2Income)}</dd>
            </div>
            <div className="flex justify-between border-t border-line pt-2 font-semibold">
              <dt>Effective annual B</dt>
              <dd className="tabular-nums">{formatINR(status.effectiveAnnualB)}</dd>
            </div>
          </dl>
        )}
      </Card>

      <WhatIfCard settings={settings} holdings={holdings} />
      <HistoryChart snapshots={data.snapshots} settings={settings} />
    </div>
  );
}
