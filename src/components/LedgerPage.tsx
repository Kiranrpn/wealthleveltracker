import { useState } from "react";
import { balances, monthlyFlows, sortNewestFirst } from "../lib/calc";
import { formatDate, formatINR, formatINRShort, formatMonth } from "../lib/format";
import { txTotal } from "../lib/ledger";
import { BUCKETS, type Bucket, type Settings, type Transaction, type TxKind } from "../lib/types";
import { AdjustForm, IncomeForm, SpendForm, TransferForm } from "./TransactionForms";
import { Card, ConfirmDialog } from "./ui";

const KIND_LABEL: Record<TxKind, string> = {
  INCOME: "Income",
  TRANSFER: "Move",
  SPEND: "Spend",
  ADJUST: "Adjust",
};

const KIND_STYLE: Record<TxKind, string> = {
  INCOME: "bg-ok/15 text-ok",
  TRANSFER: "bg-raised text-fg",
  SPEND: "bg-danger/15 text-danger",
  ADJUST: "bg-warn/15 text-warn",
};

const ACTIONS: { kind: TxKind; label: string }[] = [
  { kind: "INCOME", label: "+ Add income" },
  { kind: "SPEND", label: "Record spend" },
  { kind: "TRANSFER", label: "Move money" },
  { kind: "ADJUST", label: "Adjust balance" },
];

export type FormState = { kind: TxKind; editing: Transaction | null } | null;

interface Props {
  transactions: Transaction[];
  settings: Settings;
  today: string;
  form: FormState;
  setForm: (f: FormState) => void;
  onUpsert: (tx: Transaction) => void;
  onDelete: (id: string) => void;
}

function describe(tx: Transaction, labels: Record<Bucket, string>): string {
  switch (tx.kind) {
    case "INCOME":
      return tx.source;
    case "TRANSFER":
      return `${labels[tx.postings[0].bucket]} → ${labels[tx.postings[1].bucket]}`;
    case "SPEND":
      return tx.category
        ? `${tx.category} (${labels[tx.postings[0].bucket]})`
        : labels[tx.postings[0].bucket];
    case "ADJUST":
      return `${labels[tx.postings[0].bucket]} balance`;
  }
}

export function LedgerPage({
  transactions,
  settings,
  today,
  form,
  setForm,
  onUpsert,
  onDelete,
}: Props) {
  const [bucketFilter, setBucketFilter] = useState<Bucket | "ALL">("ALL");
  const [kindFilter, setKindFilter] = useState<TxKind | "ALL">("ALL");
  const [deleting, setDeleting] = useState<Transaction | null>(null);
  const labels = settings.labels.buckets;
  const bal = balances(transactions);
  const flows = monthlyFlows(transactions, today, 12);
  const thisMonth = flows[flows.length - 1];

  const rows = sortNewestFirst(transactions).filter(
    (t) =>
      (kindFilter === "ALL" || t.kind === kindFilter) &&
      (bucketFilter === "ALL" || t.postings.some((p) => p.bucket === bucketFilter)),
  );

  const save = (tx: Transaction) => {
    onUpsert(tx);
    setForm(null);
  };
  const common = { settings, transactions, today, onCancel: () => setForm(null) };
  const editing = form?.editing ?? null;

  return (
    <div className="space-y-4">
      <Card title="Balances">
        <div className="table-wrap">
          <ul className="flex min-w-max gap-2 sm:min-w-0 sm:flex-wrap">
            {BUCKETS.map((b) => (
              <li key={b} className="rounded-lg border border-line bg-raised/50 px-3 py-2">
                <p className="text-xs text-muted">{labels[b]}</p>
                <p
                  className={`font-semibold tabular-nums ${bal[b] < 0 ? "text-danger" : ""}`}
                  title={formatINR(bal[b])}
                >
                  {formatINRShort(bal[b])}
                </p>
              </li>
            ))}
          </ul>
        </div>
        <p className="mt-3 text-sm text-muted">
          This month: {formatINRShort(thisMonth.income)} in, {formatINRShort(thisMonth.spent)}{" "}
          spent.
        </p>
      </Card>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Add an entry">
        {ACTIONS.map((a) => (
          <button
            key={a.kind}
            type="button"
            className={`btn ${form?.kind === a.kind && !form.editing ? "btn-primary" : ""}`}
            aria-pressed={form?.kind === a.kind && !form.editing}
            onClick={() =>
              setForm(
                form?.kind === a.kind && !form.editing ? null : { kind: a.kind, editing: null },
              )
            }
          >
            {a.label}
          </button>
        ))}
      </div>

      {form?.kind === "INCOME" && (
        <IncomeForm
          key={editing?.id ?? "new"}
          {...common}
          initial={editing?.kind === "INCOME" ? editing : null}
          onSave={save}
        />
      )}
      {form?.kind === "TRANSFER" && (
        <TransferForm
          key={editing?.id ?? "new"}
          {...common}
          initial={editing?.kind === "TRANSFER" ? editing : null}
          onSave={save}
        />
      )}
      {form?.kind === "SPEND" && (
        <SpendForm
          key={editing?.id ?? "new"}
          {...common}
          initial={editing?.kind === "SPEND" ? editing : null}
          onSave={save}
        />
      )}
      {form?.kind === "ADJUST" && (
        <AdjustForm
          key={editing?.id ?? "new"}
          {...common}
          initial={editing?.kind === "ADJUST" ? editing : null}
          onSave={save}
        />
      )}

      <Card
        title="Ledger"
        action={
          <div className="flex flex-wrap gap-2">
            <label className="sr-only" htmlFor="kindFilter">
              Filter by type
            </label>
            <select
              id="kindFilter"
              className="input w-auto py-1"
              value={kindFilter}
              onChange={(e) => setKindFilter(e.target.value as TxKind | "ALL")}
            >
              <option value="ALL">All types</option>
              {ACTIONS.map((a) => (
                <option key={a.kind} value={a.kind}>
                  {KIND_LABEL[a.kind]}
                </option>
              ))}
            </select>
            <label className="sr-only" htmlFor="bucketFilter">
              Filter by bucket
            </label>
            <select
              id="bucketFilter"
              className="input w-auto py-1"
              value={bucketFilter}
              onChange={(e) => setBucketFilter(e.target.value as Bucket | "ALL")}
            >
              <option value="ALL">All buckets</option>
              {BUCKETS.map((b) => (
                <option key={b} value={b}>
                  {labels[b]}
                </option>
              ))}
            </select>
          </div>
        }
      >
        {rows.length === 0 ? (
          <p className="text-sm text-muted">
            {transactions.length === 0
              ? "No entries yet. Start with Adjust balance for money you already have, then Add income as it comes in."
              : "No entries match these filters."}
          </p>
        ) : (
          <ul className="divide-y divide-line/60">
            {rows.map((tx) => {
              const total = txTotal(tx);
              return (
                <li key={tx.id} className="flex flex-wrap items-start gap-x-3 gap-y-2 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${KIND_STYLE[tx.kind]}`}
                      >
                        {KIND_LABEL[tx.kind]}
                      </span>
                      <span className="font-medium">{describe(tx, labels)}</span>
                      <span className="text-xs text-muted">{formatDate(tx.date)}</span>
                    </div>
                    {tx.kind !== "TRANSFER" && tx.postings.length > 1 && (
                      <p className="mt-1 flex flex-wrap gap-1 text-xs">
                        {tx.postings.map((p) => (
                          <span
                            key={p.bucket}
                            className="rounded bg-raised px-1.5 py-0.5 tabular-nums text-muted"
                          >
                            {labels[p.bucket]} {formatINRShort(p.amount)}
                          </span>
                        ))}
                      </p>
                    )}
                    {tx.notes && <p className="mt-1 text-xs text-muted">{tx.notes}</p>}
                  </div>
                  <div className="text-right">
                    <p
                      className={`font-semibold tabular-nums ${total > 0 ? "text-ok" : total < 0 ? "text-danger" : ""}`}
                    >
                      {tx.kind === "TRANSFER"
                        ? formatINR(tx.postings[1].amount)
                        : `${total > 0 ? "+" : ""}${formatINR(total)}`}
                    </p>
                    {tx.kind === "INCOME" && tx.isPretax && (
                      <p className="text-xs text-muted">{formatINR(tx.amount)} pre-tax</p>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => setForm({ kind: tx.kind, editing: tx })}
                      aria-label={`Edit ${KIND_LABEL[tx.kind]} on ${formatDate(tx.date)}`}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-danger"
                      onClick={() => setDeleting(tx)}
                      aria-label={`Delete ${KIND_LABEL[tx.kind]} on ${formatDate(tx.date)}`}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card title="Last 12 months">
        <div className="table-wrap">
          <table className="table min-w-0">
            <thead>
              <tr>
                <th scope="col">Month</th>
                <th scope="col" className="num">
                  Income
                </th>
                <th scope="col" className="num">
                  Spent
                </th>
              </tr>
            </thead>
            <tbody>
              {[...flows].reverse().map((m) => (
                <tr key={m.month}>
                  <td>{formatMonth(m.month)}</td>
                  <td className="num">{formatINR(m.income)}</td>
                  <td className="num">{formatINR(m.spent)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <ConfirmDialog
        open={deleting !== null}
        title="Delete this entry?"
        message="Bucket balances will be recalculated without it. This cannot be undone."
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
