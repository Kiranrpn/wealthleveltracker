import type { BucketMatch } from "../lib/calc";
import { formatINRShort } from "../lib/format";
import type { Bucket } from "../lib/types";

/**
 * Persistent bar listing buckets whose ledger balance and holdings do not match.
 * Phones get a one-line summary; wider screens get one chip per bucket.
 */
export function MismatchBar({
  matches,
  labels,
  onFix,
  onReview,
}: {
  matches: BucketMatch[];
  labels: Record<Bucket, string>;
  onFix: (m: BucketMatch) => void;
  onReview: () => void;
}) {
  const open = matches.filter((m) => m.state !== "MATCHED");
  if (open.length === 0) return null;
  const excess = open.some((m) => m.state === "EXCESS");
  return (
    <div
      role="status"
      className={`border-b ${excess ? "border-danger/40 bg-danger/10" : "border-warn/40 bg-warn/10"}`}
    >
      <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-2 text-sm sm:hidden">
        <span className="min-w-0 flex-1">
          {open.length} bucket{open.length === 1 ? "" : "s"} don&apos;t match holdings
        </span>
        <button type="button" className="btn btn-sm" onClick={onReview}>
          Review
        </button>
      </div>
      <div className="mx-auto hidden max-w-5xl flex-wrap items-center gap-2 px-4 py-2 text-sm sm:flex">
        <span className="font-semibold">Ledger and holdings don&apos;t match:</span>
        {open.map((m) => (
          <button
            key={m.bucket}
            type="button"
            onClick={() => onFix(m)}
            className={`rounded-full border px-2.5 py-0.5 text-xs font-medium hover:bg-surface ${
              m.state === "UNRECORDED" ? "border-warn/60 text-fg" : "border-danger/60 text-danger"
            }`}
          >
            {m.state === "UNRECORDED"
              ? `${labels[m.bucket]}: ${formatINRShort(m.diff)} not in holdings`
              : `${labels[m.bucket]}: holdings ${formatINRShort(-m.diff)} over ledger`}
          </button>
        ))}
      </div>
    </div>
  );
}
