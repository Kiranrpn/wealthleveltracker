import { balances, computeStatus, computeWarnings, parkedByBucket } from "../lib/calc";
import { formatINR } from "../lib/format";
import type { AppData, TxKind } from "../lib/types";
import { BucketsCard } from "./BucketsCard";
import { GapCard } from "./GapCard";
import { HistoryChart } from "./HistoryChart";
import { LevelCard } from "./LevelCard";
import { Alert, Card } from "./ui";
import { WhatIfCard } from "./WhatIfCard";

interface Props {
  data: AppData;
  today: string;
  onOpenSettings: () => void;
  onQuickAction: (kind: TxKind) => void;
}

export function Dashboard({ data, today, onOpenSettings, onQuickAction }: Props) {
  const { settings, holdings } = data;
  const bal = balances(data.transactions);
  const status = computeStatus(settings, bal);
  const warnings = computeWarnings(settings, bal, holdings, today);
  const labels = settings.labels;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {warnings.length > 0 && (
        <section aria-label="Warnings" className="space-y-2 sm:col-span-2">
          {warnings.map((w) => (
            <Alert
              key={w.kind}
              tone={w.kind === "NO_BUDGET" ? "info" : w.kind === "NEGATIVE" ? "danger" : "warn"}
            >
              {w.message}
            </Alert>
          ))}
        </section>
      )}

      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <button type="button" className="btn btn-primary" onClick={() => onQuickAction("INCOME")}>
          + Add income
        </button>
        <button type="button" className="btn" onClick={() => onQuickAction("SPEND")}>
          Record spend
        </button>
        <button type="button" className="btn" onClick={() => onQuickAction("TRANSFER")}>
          Move money
        </button>
      </div>

      <LevelCard status={status} labels={labels} onOpenSettings={onOpenSettings} />
      <GapCard status={status} labels={labels} />

      <Card title="Survival budget">
        {status.kind === "NO_BUDGET" ? (
          <p className="text-sm text-muted">{status.message}</p>
        ) : (
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt>Monthly B</dt>
              <dd className="tabular-nums">{formatINR(settings.monthlySurvivalB)}</dd>
            </div>
            <div className="flex justify-between border-t border-line pt-2 font-semibold">
              <dt>Annual B</dt>
              <dd className="tabular-nums">{formatINR(status.annualB)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Liquid total (counts to level)</dt>
              <dd className="tabular-nums">{formatINR(status.liquidTotal)}</dd>
            </div>
          </dl>
        )}
      </Card>

      <BucketsCard
        bal={bal}
        parked={parkedByBucket(holdings)}
        settings={settings}
        className="sm:col-span-2"
      />
      <WhatIfCard settings={settings} bal={bal} className="sm:col-span-2" />
      <HistoryChart snapshots={data.snapshots} settings={settings} />
    </div>
  );
}
