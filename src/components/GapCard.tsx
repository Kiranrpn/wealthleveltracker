import type { Status } from "../lib/calc";
import { formatINR, formatINRShort } from "../lib/format";
import type { Labels } from "../lib/types";
import { Card } from "./ui";

export function GapCard({ status, labels }: { status: Status; labels: Labels }) {
  if (status.kind === "NO_BUDGET") {
    return (
      <Card title="Gap to next level">
        <p className="text-muted">Set your survival budget to see your gap.</p>
      </Card>
    );
  }
  if (status.nextLevel === null || status.gap === null || status.nextThresholdValue === null) {
    return (
      <Card title="Gap to next level">
        <p className="text-xl font-semibold">Final tracked level reached</p>
        <p className="mt-1 text-sm text-muted">Coverage keeps updating as your corpus changes.</p>
      </Card>
    );
  }
  const next = labels.levels[status.nextLevel].name;
  return (
    <Card title={`Gap to ${next}`}>
      <p className="text-3xl font-bold text-accent" title={formatINR(status.gap)}>
        {formatINRShort(status.gap)}
      </p>
      <p className="mt-1 text-sm text-muted">
        more liquid money needed. Target {formatINRShort(status.nextThresholdValue)}, you have{" "}
        {formatINRShort(status.liquidTotal)}.
      </p>
    </Card>
  );
}
