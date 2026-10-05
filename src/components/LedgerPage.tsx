import { useState } from "react";
import { balances } from "../lib/calc";
import { formatINR } from "../lib/format";
import { txTotal } from "../lib/ledger";
import type { Bucket, Settings, Transaction, TxKind } from "../lib/types";
import { BucketsCard } from "./BucketsCard";
import { AdjustForm, IncomeForm, SpendForm, TransferForm } from "./TransactionForms";
import { describeTx, KIND_LABEL } from "./txText";
import { Alert } from "./ui";

const ACTIONS: { kind: TxKind; label: string }[] = [
  { kind: "INCOME", label: "+ Add income" },
  { kind: "SPEND", label: "Record spend" },
  { kind: "TRANSFER", label: "Move money" },
  { kind: "ADJUST", label: "Adjust balance" },
];

export type FormState = {
  kind: TxKind;
  editing: Transaction | null;
  prefill?: { from?: Bucket; amount?: number };
} | null;

interface Props {
  transactions: Transaction[];
  settings: Settings;
  today: string;
  form: FormState;
  setForm: (f: FormState) => void;
  onUpsert: (tx: Transaction) => void;
  onDelete: (id: string) => void;
  onViewAll: () => void;
}

/** The last change made from this page, so it can be undone. */
type LastChange = { tx: Transaction; previous: Transaction | null } | null;

export function LedgerPage({
  transactions,
  settings,
  today,
  form,
  setForm,
  onUpsert,
  onDelete,
  onViewAll,
}: Props) {
  const [last, setLast] = useState<LastChange>(null);
  const bal = balances(transactions);
  const labels = settings.labels.buckets;

  const save = (tx: Transaction) => {
    setLast({ tx, previous: form?.editing ?? null });
    onUpsert(tx);
    setForm(null);
  };
  const undo = () => {
    if (!last) return;
    if (last.previous) onUpsert(last.previous);
    else onDelete(last.tx.id);
    setLast(null);
  };
  const common = { settings, transactions, today, onCancel: () => setForm(null) };
  const editing = form?.editing ?? null;
  const key =
    editing?.id ?? `new-${form?.kind}-${form?.prefill?.from ?? ""}-${form?.prefill?.amount ?? ""}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Add an entry">
        {ACTIONS.map((a) => {
          const active = form?.kind === a.kind && !form.editing;
          return (
            <button
              key={a.kind}
              type="button"
              className={`btn ${active ? "btn-primary" : ""}`}
              aria-pressed={active}
              onClick={() => setForm(active ? null : { kind: a.kind, editing: null })}
            >
              {a.label}
            </button>
          );
        })}
        <button type="button" className="btn ml-auto" onClick={onViewAll}>
          All transactions ({transactions.length})
        </button>
      </div>

      {last && !form && (
        <Alert tone="ok">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              {last.previous ? "Updated" : "Saved"}: {KIND_LABEL[last.tx.kind]},{" "}
              {describeTx(last.tx, labels)},{" "}
              {formatINR(
                last.tx.kind === "TRANSFER"
                  ? last.tx.postings[1].amount
                  : Math.abs(txTotal(last.tx)),
              )}
              .
            </span>
            <span className="flex gap-1">
              <button type="button" className="btn btn-sm" onClick={undo}>
                Undo
              </button>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => setLast(null)}
                aria-label="Dismiss"
              >
                OK
              </button>
            </span>
          </div>
        </Alert>
      )}

      {form?.kind === "INCOME" && (
        <IncomeForm
          key={key}
          {...common}
          initial={editing?.kind === "INCOME" ? editing : null}
          onSave={save}
        />
      )}
      {form?.kind === "TRANSFER" && (
        <TransferForm
          key={key}
          {...common}
          initial={editing?.kind === "TRANSFER" ? editing : null}
          prefill={form.prefill}
          onSave={save}
        />
      )}
      {form?.kind === "SPEND" && (
        <SpendForm
          key={key}
          {...common}
          initial={editing?.kind === "SPEND" ? editing : null}
          onSave={save}
        />
      )}
      {form?.kind === "ADJUST" && (
        <AdjustForm
          key={key}
          {...common}
          initial={editing?.kind === "ADJUST" ? editing : null}
          onSave={save}
        />
      )}

      <BucketsCard
        title="Balances and goals"
        bal={bal}
        settings={settings}
        onMoveSurplus={(from, amount) => {
          setForm({ kind: "TRANSFER", editing: null, prefill: { from, amount } });
          window.scrollTo?.({ top: 0, behavior: "smooth" });
        }}
      />
    </div>
  );
}
