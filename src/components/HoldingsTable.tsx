import { useState } from "react";
import { daysBetween, parkedByBucket, roundMoney, type Balances } from "../lib/calc";
import { formatDate, formatINR, formatINRShort, parseAmount } from "../lib/format";
import type { HoldingAddMode, HoldingRemoveMode } from "../lib/ledger";
import { BUCKETS, type Holding, type Labels } from "../lib/types";
import { HoldingForm } from "./HoldingForm";
import { Card, ConfirmDialog } from "./ui";

interface Props {
  holdings: Holding[];
  bal: Balances;
  labels: Labels;
  staleDays: number;
  today: string;
  onAdd: (h: Holding, mode: HoldingAddMode) => void;
  onUpdate: (h: Holding) => void;
  onRemove: (h: Holding, mode: HoldingRemoveMode) => void;
}

export function HoldingsTable({
  holdings,
  bal,
  labels,
  staleDays,
  today,
  onAdd,
  onUpdate,
  onRemove,
}: Props) {
  const [editing, setEditing] = useState<Holding | "new" | null>(null);
  const [quickId, setQuickId] = useState<string | null>(null);
  const [quickValue, setQuickValue] = useState("");
  const [quickError, setQuickError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Holding | null>(null);
  const parked = parkedByBucket(holdings);
  const invested = Object.fromEntries(
    BUCKETS.map((b) => [
      b,
      holdings.filter((h) => h.bucket === b).reduce((s, h) => s + h.investedAmount, 0),
    ]),
  ) as Record<string, number>;
  const sorted = [...holdings].sort(
    (a, b) => BUCKETS.indexOf(a.bucket) - BUCKETS.indexOf(b.bucket) || a.name.localeCompare(b.name),
  );

  function startQuick(h: Holding) {
    setQuickId(h.id);
    setQuickValue(String(h.currentValue));
    setQuickError(null);
  }

  function saveQuick(h: Holding) {
    const v = parseAmount(quickValue);
    if (!Number.isFinite(v) || v < 0) {
      setQuickError("Enter a value of 0 or more");
      return;
    }
    onUpdate({ ...h, currentValue: v, lastUpdated: today });
    setQuickId(null);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Holdings show where each bucket&apos;s money is parked. Balances live in the ledger:
        updating a holding&apos;s value posts the gain or loss to its bucket automatically.
      </p>
      {editing !== null ? (
        <HoldingForm
          key={editing === "new" ? "new" : editing.id}
          initial={editing === "new" ? null : editing}
          today={today}
          labels={labels}
          onSave={(h, mode) => {
            if (editing === "new") onAdd(h, mode);
            else onUpdate(h);
            setEditing(null);
          }}
          onCancel={() => setEditing(null)}
        />
      ) : (
        <button type="button" className="btn btn-primary" onClick={() => setEditing("new")}>
          + Add holding
        </button>
      )}

      <Card title="Holdings">
        {holdings.length === 0 ? (
          <p className="text-sm text-muted">No holdings yet. Add your first one above.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Bucket</th>
                  <th scope="col">Type / where</th>
                  <th scope="col" className="num">
                    Invested
                  </th>
                  <th scope="col" className="num">
                    Current
                  </th>
                  <th scope="col">Updated</th>
                  <th scope="col" className="num">
                    Net income/yr
                  </th>
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((h) => {
                  const stale = daysBetween(h.lastUpdated, today) > staleDays;
                  return (
                    <tr key={h.id}>
                      <td className="font-medium">
                        {h.name}
                        {h.notes && <div className="text-xs text-muted">{h.notes}</div>}
                      </td>
                      <td>{labels.buckets[h.bucket]}</td>
                      <td className="text-muted">
                        {h.type}
                        {h.whereParked && <div className="text-xs">{h.whereParked}</div>}
                      </td>
                      <td className="num">{formatINR(h.investedAmount)}</td>
                      <td className="num">
                        {quickId === h.id ? (
                          <form
                            className="flex flex-col items-end gap-1"
                            onSubmit={(e) => {
                              e.preventDefault();
                              saveQuick(h);
                            }}
                          >
                            <label className="sr-only" htmlFor={`quick-${h.id}`}>
                              New current value for {h.name}
                            </label>
                            <input
                              id={`quick-${h.id}`}
                              className="input w-32 text-right"
                              inputMode="decimal"
                              autoFocus
                              value={quickValue}
                              aria-invalid={Boolean(quickError)}
                              onChange={(e) => setQuickValue(e.target.value)}
                              onKeyDown={(e) => e.key === "Escape" && setQuickId(null)}
                            />
                            {quickError && (
                              <span className="error" role="alert">
                                {quickError}
                              </span>
                            )}
                            <span className="flex gap-1">
                              <button type="submit" className="btn btn-sm btn-primary">
                                Save
                              </button>
                              <button
                                type="button"
                                className="btn btn-sm"
                                onClick={() => setQuickId(null)}
                              >
                                Cancel
                              </button>
                            </span>
                          </form>
                        ) : (
                          formatINR(h.currentValue)
                        )}
                      </td>
                      <td>
                        {formatDate(h.lastUpdated)}
                        {stale && (
                          <div className="text-xs font-medium text-warn">
                            Stale ({staleDays}+ days)
                          </div>
                        )}
                      </td>
                      <td>
                        <div className="flex flex-wrap justify-end gap-1">
                          <button
                            type="button"
                            className="btn btn-sm"
                            onClick={() => startQuick(h)}
                            aria-label={`Update current value of ${h.name}`}
                          >
                            Update value
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm"
                            onClick={() => setEditing(h)}
                            aria-label={`Edit ${h.name}`}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-danger"
                            onClick={() => setDeleting(h)}
                            aria-label={`Delete ${h.name}`}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                {BUCKETS.filter((b) => parked[b] > 0 || bal[b] !== 0).map((b) => (
                  <tr key={b} className="text-muted">
                    <th scope="row" colSpan={3} className="text-left font-medium normal-case">
                      {labels.buckets[b]}: balance {formatINRShort(bal[b])}, cash not in holdings{" "}
                      <span className={bal[b] - parked[b] < 0 ? "text-danger" : "text-fg"}>
                        {formatINRShort(roundMoney(bal[b] - parked[b]))}
                      </span>
                    </th>
                    <td className="num">{formatINRShort(invested[b])}</td>
                    <td className="num text-fg">{formatINRShort(parked[b])}</td>
                    <td colSpan={2} />
                  </tr>
                ))}
              </tfoot>
            </table>
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={deleting !== null}
        title="Remove holding?"
        message={
          deleting ? (
            <>
              What happened to &quot;{deleting.name}&quot; ({formatINRShort(deleting.currentValue)}
              )? If you sold it and the money is still in {labels.buckets[deleting.bucket]}, keep
              the cash. Otherwise its value is taken out of the bucket.
            </>
          ) : (
            ""
          )
        }
        altLabel="Sold, keep cash in bucket"
        onAlt={() => {
          if (deleting) onRemove(deleting, "KEEP_CASH");
          setDeleting(null);
        }}
        confirmLabel="Remove value from bucket"
        danger
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) onRemove(deleting, "REMOVE_VALUE");
          setDeleting(null);
        }}
      />
    </div>
  );
}
