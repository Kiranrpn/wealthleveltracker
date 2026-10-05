import type { Status } from "../lib/calc";
import { formatRatio } from "../lib/format";
import type { Labels } from "../lib/types";
import { Card, ProgressBar } from "./ui";

interface Props {
  status: Status;
  labels: Labels;
  onOpenSettings: () => void;
}

export function LevelCard({ status, labels, onOpenSettings }: Props) {
  if (status.kind === "NO_BUDGET") {
    return (
      <Card title="Your level" className="sm:col-span-2">
        <p className="text-lg font-semibold">{status.message}</p>
        <p className="mt-1 text-sm text-muted">
          Your level is measured against what you need to survive each month.
        </p>
        <button type="button" className="btn btn-primary mt-4" onClick={onOpenSettings}>
          Open Settings
        </button>
      </Card>
    );
  }

  const meta = labels.levels[status.level];
  const isFinal = status.nextLevel === null;
  const nextName = status.nextLevel ? labels.levels[status.nextLevel].name : "";

  return (
    <Card title="Your level" className="sm:col-span-2">
      <div className="flex flex-wrap items-center gap-4">
        <div
          className={`flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl text-4xl font-black ${
            isFinal ? "bg-accent text-accent-fg" : "bg-raised text-accent"
          }`}
          aria-label={`Level ${meta.name}`}
        >
          {meta.name}
        </div>
        <div className="min-w-0 flex-1">
          {isFinal && (
            <p className="text-2xl font-black tracking-tight text-accent">{labels.finalMessage}</p>
          )}
          <p className="text-lg font-semibold">{meta.meaning}</p>
          <p className="mt-1 text-sm text-muted">
            <span className="text-2xl font-bold text-fg">{formatRatio(status.ratio)}</span> of
            annual survival
          </p>
        </div>
      </div>
      {!isFinal && (
        <div className="mt-4">
          <div className="mb-1 flex justify-between text-xs text-muted">
            <span>{meta.name}</span>
            <span>{Math.floor(status.progressPct)}% of the way</span>
            <span>{nextName}</span>
          </div>
          <ProgressBar
            value={status.progressPct}
            label={`Progress from ${meta.name} to ${nextName}`}
          />
        </div>
      )}
    </Card>
  );
}
