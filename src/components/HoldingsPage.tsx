import { useEffect, useRef, useState } from "react";
import { daysBetween, reconcile, roundMoney, safeDivide, type Balances } from "../lib/calc";
import { formatDate, formatINR, formatINRShort, formatPct, parseAmount } from "../lib/format";
import type { HoldingAddMode, HoldingRemoveMode } from "../lib/ledger";
import { BUCKETS, type Bucket, type Holding, type Settings } from "../lib/types";
import { HoldingForm, type Preset } from "./HoldingForm";
import { Card, Chevron, ConfirmDialog } from "./ui";

export type HoldingsIntent = { bucket: Bucket; addValue?: number } | null;

interface Props {
  holdings: Holding[];
  bal: Balances;
  settings: Settings;
  today: string;
  intent: HoldingsIntent;
  clearIntent: () => void;
  onAdd: (h: Holding, mode: HoldingAddMode) => void;
  onUpdate: (h: Holding) => void;
  onRemove: (h: Holding, mode: HoldingRemoveMode) => void;
}

type Editing = { holding: Holding | null; preset?: Preset } | null;

export function HoldingsPage({
  holdings,
  bal,
  settings,
  today,
  intent,
  clearIntent,
  onAdd,
  onUpdate,
  onRemove,
}: Props) {
  const labels = settings.labels;
  const [editing, setEditing] = useState<Editing>(null);
  const [quickId, setQuickId] = useState<string | null>(null);
  const [quickValue, setQuickValue] = useState("");
  const [quickError, setQuickError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Holding | null>(null);
  const [expanded, setExpanded] = useState<Set<Bucket>>(new Set());
  const toggle = (b: Bucket) =>
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(b)) n.delete(b);
      else n.add(b);
      return n;
    });
  const formRef = useRef<HTMLDivElement>(null);
  const matches = Object.fromEntries(reconcile(bal, holdings).map((m) => [m.bucket, m]));

  // Arriving from the mismatch bar: open the add form for that bucket, or jump to it.
  useEffect(() => {
    if (!intent) return;
    setExpanded((s) => new Set(s).add(intent.bucket));
    if (intent.addValue && intent.addValue > 0) {
      setEditing({ holding: null, preset: { bucket: intent.bucket, value: intent.addValue } });
      setTimeout(() => formRef.current?.scrollIntoView?.({ block: "start" }), 0);
    } else {
      setTimeout(
        () =>
          document.getElementById(`bucket-${intent.bucket}`)?.scrollIntoView?.({ block: "start" }),
        0,
      );
    }
    clearIntent();
  }, [intent, clearIntent]);

  const totalValue = holdings.reduce((s, h) => s + h.currentValue, 0);
  const totalInvested = holdings.reduce((s, h) => s + h.investedAmount, 0);
  const totalGain = roundMoney(totalValue - totalInvested);

  function saveQuick(h: Holding) {
    const v = parseAmount(quickValue);
    if (!Number.isFinite(v) || v < 0) {
      setQuickError("Enter a value of 0 or more");
      return;
    }
    // A cash balance is a straight replace: no separate cost, so no gain or loss.
    const isCash = h.kind === "CASH";
    onUpdate({
      ...h,
      currentValue: v,
      investedAmount: isCash ? v : h.investedAmount,
      lastUpdated: today,
    });
    setQuickId(null);
  }

  const startAdd = (bucket: Bucket) => {
    const m = matches[bucket];
    setExpanded((s) => new Set(s).add(bucket));
    setEditing({ holding: null, preset: { bucket, value: m.diff > 0 ? m.diff : undefined } });
    setTimeout(() => formRef.current?.scrollIntoView?.({ block: "start" }), 0);
  };

  return (
    <div className="space-y-4">
      <Card title="Holdings">
        <p className="text-sm text-muted">
          Where each bucket&apos;s money is parked. Balances live in the ledger; changing a
          holding&apos;s value posts the gain or loss to its bucket.
        </p>
        <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
          <div>
            <dt className="text-xs text-muted">Current value</dt>
            <dd className="font-semibold tabular-nums">{formatINRShort(totalValue)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Invested</dt>
            <dd className="font-semibold tabular-nums">{formatINRShort(totalInvested)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Gain / loss</dt>
            <dd
              className={`font-semibold tabular-nums ${totalGain >= 0 ? "text-ok" : "text-danger"}`}
            >
              {totalGain >= 0 ? "+" : ""}
              {formatINRShort(totalGain)}
            </dd>
          </div>
        </dl>
      </Card>

      <div ref={formRef} className="scroll-mt-32">
        {editing && (
          <HoldingForm
            key={
              editing.holding?.id ?? `new-${editing.preset?.bucket}-${editing.preset?.value ?? ""}`
            }
            initial={editing.holding}
            preset={editing.preset}
            today={today}
            labels={labels}
            bal={bal}
            holdings={holdings}
            onSave={(h, mode) => {
              if (editing.holding) onUpdate(h);
              else onAdd(h, mode);
              setEditing(null);
            }}
            onCancel={() => setEditing(null)}
          />
        )}
      </div>

      {BUCKETS.map((b) => {
        const m = matches[b];
        const items = holdings
          .filter((h) => h.bucket === b)
          .sort((x, y) => y.currentValue - x.currentValue);
        const empty = items.length === 0 && m.ledger === 0;
        const isOpen = expanded.has(b);
        return (
          <section
            key={b}
            id={`bucket-${b}`}
            aria-label={labels.buckets[b]}
            className="card scroll-mt-32 py-3 sm:py-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="min-w-0 basis-full sm:basis-0 sm:flex-1">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 text-left"
                  aria-expanded={isOpen}
                  aria-controls={`bucket-body-${b}`}
                  onClick={() => toggle(b)}
                >
                  <Chevron open={isOpen} />
                  <span className="min-w-0">
                    <span className="block font-semibold">{labels.buckets[b]}</span>
                    <span className="block text-xs font-normal text-muted">
                      {empty
                        ? "Empty"
                        : `${items.length} holding${items.length === 1 ? "" : "s"} · Ledger ${formatINRShort(m.ledger)} · In holdings ${formatINRShort(m.recorded)}`}
                    </span>
                  </span>
                </button>
              </h2>
              <div className="ml-6 flex flex-wrap items-center gap-2 sm:ml-0">
                {m.state === "MATCHED" && !empty && (
                  <span className="rounded-full bg-ok/15 px-2 py-0.5 text-xs font-medium text-ok">
                    Matched
                  </span>
                )}
                {m.state === "UNRECORDED" && (
                  <span className="rounded-full bg-warn/15 px-2 py-0.5 text-xs font-medium text-warn">
                    {formatINRShort(m.diff)} not in holdings
                  </span>
                )}
                {m.state === "EXCESS" && (
                  <span className="rounded-full bg-danger/15 px-2 py-0.5 text-xs font-medium text-danger">
                    Holdings {formatINRShort(-m.diff)} over ledger
                  </span>
                )}
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => startAdd(b)}
                  aria-label={`Add holding to ${labels.buckets[b]}`}
                >
                  + Add
                </button>
              </div>
            </div>

            <div id={`bucket-body-${b}`} hidden={!isOpen}>
              {m.state === "EXCESS" && (
                <p className="mt-2 text-xs text-danger">
                  The ledger says {labels.buckets[b]} holds less than these holdings are worth.
                  Update a holding&apos;s value, remove one you sold, or add the missing money with
                  Adjust balance on the Ledger tab.
                </p>
              )}

              {items.length > 0 && (
                <ul className="mt-3 space-y-2">
                  {items.map((h) => {
                    const isCash = h.kind === "CASH";
                    const gain = roundMoney(h.currentValue - h.investedAmount);
                    const gainPct = safeDivide(gain, h.investedAmount);
                    const stale = daysBetween(h.lastUpdated, today) > settings.staleDays;
                    return (
                      <li key={h.id} className="rounded-xl border border-line bg-raised/40 p-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-medium">{h.name}</p>
                            <p className="text-xs text-muted">
                              {(isCash ? [h.whereParked] : [h.type, h.whereParked])
                                .filter(Boolean)
                                .join(" · ") || "No details"}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold tabular-nums">
                              {formatINR(h.currentValue)}
                            </p>
                            {!isCash && (
                              <p
                                className={`text-xs tabular-nums ${gain >= 0 ? "text-ok" : "text-danger"}`}
                              >
                                {gain >= 0 ? "+" : ""}
                                {formatINRShort(gain)}
                                {h.investedAmount > 0 && <> ({formatPct(gainPct)})</>} on{" "}
                                {formatINRShort(h.investedAmount)}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                          <p
                            className={`text-xs ${stale ? "font-medium text-warn" : "text-muted"}`}
                          >
                            Updated {formatDate(h.lastUpdated)}
                            {stale && ` · not updated in ${settings.staleDays}+ days`}
                          </p>
                          {quickId === h.id ? (
                            <form
                              className="flex flex-wrap items-center gap-1"
                              onSubmit={(e) => {
                                e.preventDefault();
                                saveQuick(h);
                              }}
                            >
                              <label className="sr-only" htmlFor={`quick-${h.id}`}>
                                New {isCash ? "balance" : "current value"} for {h.name}
                              </label>
                              <input
                                id={`quick-${h.id}`}
                                className="input w-32 py-1 text-right"
                                inputMode="decimal"
                                autoFocus
                                value={quickValue}
                                aria-invalid={Boolean(quickError)}
                                onChange={(e) => setQuickValue(e.target.value)}
                                onKeyDown={(e) => e.key === "Escape" && setQuickId(null)}
                              />
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
                              {quickError && (
                                <span className="error w-full" role="alert">
                                  {quickError}
                                </span>
                              )}
                            </form>
                          ) : (
                            <div className="flex gap-1">
                              <button
                                type="button"
                                className="btn btn-sm"
                                aria-label={`Update current value of ${h.name}`}
                                onClick={() => {
                                  setQuickId(h.id);
                                  setQuickValue(String(h.currentValue));
                                  setQuickError(null);
                                }}
                              >
                                {isCash ? "Update balance" : "Update value"}
                              </button>
                              <button
                                type="button"
                                className="btn btn-sm"
                                aria-label={`Edit ${h.name}`}
                                onClick={() => {
                                  setEditing({ holding: h });
                                  setTimeout(
                                    () => formRef.current?.scrollIntoView?.({ block: "start" }),
                                    0,
                                  );
                                }}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="btn btn-sm btn-danger"
                                aria-label={`Remove ${h.name}`}
                                onClick={() => setDeleting(h)}
                              >
                                Remove
                              </button>
                            </div>
                          )}
                        </div>
                        {h.notes && <p className="mt-1 text-xs text-muted">{h.notes}</p>}
                      </li>
                    );
                  })}
                </ul>
              )}
              {items.length === 0 && (
                <p className="mt-2 text-xs text-muted">No holdings recorded in this bucket yet.</p>
              )}
            </div>
          </section>
        );
      })}

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
