import { useMemo, useState } from "react";
import { monthKey, monthlyFlows, sortNewestFirst } from "../lib/calc";
import { formatDate, formatINR, formatINRShort, formatMonth } from "../lib/format";
import { txTotal } from "../lib/ledger";
import { BUCKETS, type Bucket, type Settings, type Transaction, type TxKind } from "../lib/types";
import { describeTx, KIND_LABEL } from "./txText";
import { Card, Chevron, ConfirmDialog } from "./ui";

const KIND_STYLE: Record<TxKind, string> = {
  INCOME: "bg-ok/15 text-ok",
  TRANSFER: "bg-raised text-fg",
  SPEND: "bg-danger/15 text-danger",
  ADJUST: "bg-warn/15 text-warn",
};

function amountText(tx: Transaction): { text: string; tone: string } {
  if (tx.kind === "TRANSFER") return { text: formatINR(tx.postings[1].amount), tone: "" };
  const t = txTotal(tx);
  return { text: `${t > 0 ? "+" : ""}${formatINR(t)}`, tone: t > 0 ? "text-ok" : "text-danger" };
}

interface Props {
  transactions: Transaction[];
  settings: Settings;
  today: string;
  onEdit: (tx: Transaction) => void;
  onDelete: (id: string) => void;
}

export function TransactionsPage({ transactions, settings, today, onEdit, onDelete }: Props) {
  const labels = settings.labels.buckets;
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<TxKind | "ALL">("ALL");
  const [bucket, setBucket] = useState<Bucket | "ALL">("ALL");
  const [month, setMonth] = useState<string>("ALL");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState<Transaction | null>(null);

  const months = useMemo(
    () => [...new Set(transactions.map((t) => monthKey(t.date)))].sort().reverse(),
    [transactions],
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sortNewestFirst(transactions).filter((t) => {
      if (kind !== "ALL" && t.kind !== kind) return false;
      if (bucket !== "ALL" && !t.postings.some((p) => p.bucket === bucket)) return false;
      if (month !== "ALL" && monthKey(t.date) !== month) return false;
      if (q) {
        const hay = [
          describeTx(t, labels),
          t.notes ?? "",
          KIND_LABEL[t.kind],
          ...t.postings.map((p) => labels[p.bucket]),
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [transactions, kind, bucket, month, query, labels]);

  const groups = useMemo(() => {
    const out: { month: string; items: Transaction[]; income: number; spent: number }[] = [];
    for (const t of rows) {
      const key = monthKey(t.date);
      let g = out[out.length - 1];
      if (!g || g.month !== key) {
        g = { month: key, items: [], income: 0, spent: 0 };
        out.push(g);
      }
      g.items.push(t);
      if (t.kind === "INCOME") g.income += txTotal(t);
      if (t.kind === "SPEND") g.spent -= txTotal(t);
    }
    return out;
  }, [rows]);

  const filtered = kind !== "ALL" || bucket !== "ALL" || month !== "ALL" || query.trim() !== "";
  const toggle = (id: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const flows = monthlyFlows(transactions, today, 12);

  return (
    <div className="space-y-4">
      <Card title="Filter">
        <div className="grid gap-2 sm:grid-cols-4">
          <div className="sm:col-span-4">
            <label htmlFor="txSearch" className="sr-only">
              Search transactions
            </label>
            <input
              id="txSearch"
              type="search"
              className="input"
              placeholder="Search source, category, notes, bucket"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="txKind" className="label">
              Type
            </label>
            <select
              id="txKind"
              className="input"
              value={kind}
              onChange={(e) => setKind(e.target.value as TxKind | "ALL")}
            >
              <option value="ALL">All types</option>
              {(Object.keys(KIND_LABEL) as TxKind[]).map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="txBucket" className="label">
              Bucket
            </label>
            <select
              id="txBucket"
              className="input"
              value={bucket}
              onChange={(e) => setBucket(e.target.value as Bucket | "ALL")}
            >
              <option value="ALL">All buckets</option>
              {BUCKETS.map((b) => (
                <option key={b} value={b}>
                  {labels[b]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="txMonth" className="label">
              Month
            </label>
            <select
              id="txMonth"
              className="input"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            >
              <option value="ALL">All time</option>
              {months.map((m) => (
                <option key={m} value={m}>
                  {formatMonth(m)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end gap-2">
            {filtered && (
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setQuery("");
                  setKind("ALL");
                  setBucket("ALL");
                  setMonth("ALL");
                }}
              >
                Clear filters
              </button>
            )}
          </div>
        </div>
      </Card>

      <Card
        title={
          filtered ? `${rows.length} of ${transactions.length}` : `${transactions.length} entries`
        }
        action={
          rows.length > 0 && (
            <div className="flex gap-1">
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => setOpen(new Set(rows.map((r) => r.id)))}
              >
                Expand
              </button>
              <button type="button" className="btn btn-sm" onClick={() => setOpen(new Set())}>
                Collapse
              </button>
            </div>
          )
        }
      >
        {rows.length === 0 ? (
          <p className="text-sm text-muted">
            {transactions.length === 0
              ? "No entries yet. Add income, spends and moves from the Ledger tab."
              : "No entries match these filters."}
          </p>
        ) : (
          <div className="space-y-5">
            {groups.map((g) => (
              <section key={g.month} aria-label={formatMonth(g.month)}>
                <h3 className="mb-1 flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-1 text-sm font-semibold">
                  {formatMonth(g.month)}
                  <span className="text-xs font-normal text-muted">
                    {formatINRShort(g.income)} in · {formatINRShort(g.spent)} spent
                  </span>
                </h3>
                <ul className="divide-y divide-line/50">
                  {g.items.map((tx) => {
                    const isOpen = open.has(tx.id);
                    const amt = amountText(tx);
                    return (
                      <li key={tx.id}>
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 py-2.5 text-left"
                          aria-expanded={isOpen}
                          aria-controls={`tx-${tx.id}`}
                          onClick={() => toggle(tx.id)}
                        >
                          <Chevron open={isOpen} />
                          <span
                            className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold ${KIND_STYLE[tx.kind]}`}
                          >
                            {KIND_LABEL[tx.kind]}
                          </span>
                          <span className="min-w-0 flex-1 truncate font-medium">
                            {describeTx(tx, labels)}
                          </span>
                          <span className="hidden text-xs text-muted sm:inline">
                            {formatDate(tx.date)}
                          </span>
                          <span className={`shrink-0 font-semibold tabular-nums ${amt.tone}`}>
                            {amt.text}
                          </span>
                        </button>
                        {isOpen && (
                          <div
                            id={`tx-${tx.id}`}
                            className="mb-3 ml-5 rounded-lg border border-line bg-raised/40 p-3 text-sm"
                          >
                            <p className="text-xs text-muted">
                              {formatDate(tx.date)}
                              {tx.kind === "INCOME" && tx.isPretax && (
                                <> · {formatINR(tx.amount)} entered pre-tax</>
                              )}
                            </p>
                            <table className="mt-2 w-full">
                              <tbody>
                                {tx.postings.map((p) => (
                                  <tr key={p.bucket}>
                                    <td className="py-0.5">{labels[p.bucket]}</td>
                                    <td
                                      className={`num py-0.5 ${p.amount > 0 ? "text-ok" : "text-danger"}`}
                                    >
                                      {p.amount > 0 ? "+" : ""}
                                      {formatINR(p.amount)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            {tx.notes && tx.kind !== "ADJUST" && (
                              <p className="mt-2 text-muted">{tx.notes}</p>
                            )}
                            <div className="mt-3 flex gap-2">
                              <button
                                type="button"
                                className="btn btn-sm"
                                onClick={() => onEdit(tx)}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="btn btn-sm btn-danger"
                                onClick={() => setDeleting(tx)}
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </Card>

      <Card title="Last 12 months">
        <details>
          <summary className="cursor-pointer text-sm text-muted">
            Show income and spending by month
          </summary>
          <table className="table mt-2 min-w-0">
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
        </details>
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
