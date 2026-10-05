import { useState } from "react";
import { bucketTotals, daysBetween, isC2Bucket } from "../lib/calc";
import { formatDate, formatINR, formatINRShort, parseAmount } from "../lib/format";
import { BUCKETS, type Holding, type Labels } from "../lib/types";
import { HoldingForm } from "./HoldingForm";
import { Card, ConfirmDialog } from "./ui";

interface Props {
  holdings: Holding[];
  labels: Labels;
  staleDays: number;
  today: string;
  onUpsert: (h: Holding) => void;
  onDelete: (id: string) => void;
}

export function HoldingsTable({ holdings, labels, staleDays, today, onUpsert, onDelete }: Props) {
  const [editing, setEditing] = useState<Holding | "new" | null>(null);
  const [quickId, setQuickId] = useState<string | null>(null);
  const [quickValue, setQuickValue] = useState("");
  const [quickError, setQuickError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Holding | null>(null);
  const totals = bucketTotals(holdings);
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
    onUpsert({ ...h, currentValue: v, lastUpdated: today });
    setQuickId(null);
  }

  return (
    <div className="space-y-4">
      {editing !== null ? (
        <HoldingForm
          key={editing === "new" ? "new" : editing.id}
          initial={editing === "new" ? null : editing}
          today={today}
          labels={labels}
          onSave={(h) => {
            onUpsert(h);
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
                      <td className="num">
                        {isC2Bucket(h.bucket) && h.netAnnualIncome !== undefined ? (
                          <>
                            {formatINR(h.netAnnualIncome)}
                            <div className="text-xs text-muted">
                              {h.incomeIsReliable ? "Reliable" : "Not reliable"}
                            </div>
                          </>
                        ) : (
                          <span className="text-muted">n/a</span>
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
                {BUCKETS.map((b) => (
                  <tr key={b} className="text-muted">
                    <th scope="row" colSpan={3} className="text-left font-medium normal-case">
                      {labels.buckets[b]} total ({totals[b].count})
                      {!totals[b].countsTowardLevel && (
                        <span className="ml-1 text-xs">(excluded from level)</span>
                      )}
                    </th>
                    <td className="num">{formatINRShort(totals[b].invested)}</td>
                    <td className="num text-fg">{formatINRShort(totals[b].current)}</td>
                    <td colSpan={3} />
                  </tr>
                ))}
              </tfoot>
            </table>
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={deleting !== null}
        title="Delete holding?"
        message={`"${deleting?.name ?? ""}" will be removed. This cannot be undone.`}
        confirmLabel="Delete"
        danger
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) onDelete(deleting.id);
          setDeleting(null);
        }}
      />
    </div>
  );
}
