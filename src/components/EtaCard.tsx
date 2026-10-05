import type { EtaResult } from "../lib/eta";
import { formatDuration, formatINRShort, formatMonth, formatPct } from "../lib/format";
import type { Labels } from "../lib/types";
import { Card } from "./ui";

export function EtaCard({ eta, labels }: { eta: EtaResult; labels: Labels }) {
  let body;
  switch (eta.kind) {
    case "NO_BUDGET":
      body = <p className="text-muted">Set your survival budget to estimate an ETA.</p>;
      break;
    case "FINAL":
      body = <p className="text-xl font-semibold">Final tracked level reached</p>;
      break;
    case "NO_DATA":
      body = (
        <p className="text-muted">
          No data yet. Log income entries so the ETA can estimate how fast you are saving.
        </p>
      );
      break;
    case "NOT_REACHABLE":
      body = (
        <>
          <p className="text-xl font-semibold text-warn">Not reachable at this pace</p>
          <p className="mt-1 text-sm text-muted">
            {eta.reason} Saving {formatINRShort(eta.monthlyContribution)}/month from an average
            income of {formatINRShort(eta.averageIncome)}/month.
          </p>
        </>
      );
      break;
    case "REACHABLE":
      body = (
        <>
          <p className="text-3xl font-bold">{formatDuration(eta.months)}</p>
          <p className="mt-1 text-sm text-muted">
            {labels.levels[eta.nextLevel].name} around {formatMonth(eta.etaDate)}, saving{" "}
            {formatINRShort(eta.monthlyContribution)}/month ({formatPct(eta.savingsShare, 0)} of{" "}
            {formatINRShort(eta.averageIncome)} 6-month average income). The target rises with
            inflation to {formatINRShort(eta.targetAtEta)}.
          </p>
        </>
      );
      break;
  }
  return <Card title="ETA to next level">{body}</Card>;
}
