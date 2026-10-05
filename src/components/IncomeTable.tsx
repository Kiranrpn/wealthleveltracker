import { useState } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  averageMonthlyIncome,
  monthlyIncomeTotals,
  netIncomeAmount,
  sortIncomeNewestFirst,
} from "../lib/calc";
import { formatDate, formatINR, formatINRShort, formatMonth } from "../lib/format";
import type { IncomeEntry, Settings } from "../lib/types";
import { IncomeForm } from "./IncomeForm";
import { Card, ConfirmDialog } from "./ui";

interface Props {
  income: IncomeEntry[];
  settings: Settings;
  today: string;
  onUpsert: (e: IncomeEntry) => void;
  onDelete: (id: string) => void;
}

export function IncomeTable({ income, settings, today, onUpsert, onDelete }: Props) {
  const [editing, setEditing] = useState<IncomeEntry | "new" | null>(null);
  const [deleting, setDeleting] = useState<IncomeEntry | null>(null);
  const avg = averageMonthlyIncome(income, settings, today, 6);
  const months = monthlyIncomeTotals(income, settings, today, 12);
  const rows = sortIncomeNewestFirst(income);
  const chartData = months.map((m) => ({ label: formatMonth(m.month), total: m.total }));

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card title="6-month average">
          <p className="text-3xl font-bold text-accent">
            {avg === null ? "No data" : formatINRShort(avg)}
          </p>
          <p className="mt-1 text-sm text-muted">Net income per month</p>
        </Card>
        <Card title="Monthly totals, last 12 months" className="sm:col-span-2">
          <div className="h-40" role="img" aria-label="Bar chart of monthly income totals">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
                <XAxis
                  dataKey="label"
                  stroke="rgb(var(--c-muted))"
                  fontSize={10}
                  interval="preserveStartEnd"
                />
                <YAxis
                  stroke="rgb(var(--c-muted))"
                  fontSize={10}
                  tickFormatter={(v: number) => formatINRShort(v)}
                />
                <Tooltip
                  cursor={{ fill: "rgb(var(--c-raised))" }}
                  contentStyle={{
                    background: "rgb(var(--c-surface))",
                    border: "1px solid rgb(var(--c-line))",
                    borderRadius: 8,
                  }}
                  formatter={(v: number) => [formatINR(v), "Net income"]}
                />
                <Bar
                  dataKey="total"
                  fill="rgb(var(--c-accent))"
                  radius={[4, 4, 0, 0]}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <details className="mt-2 text-sm">
            <summary className="cursor-pointer text-muted">Show as table</summary>
            <table className="mt-2 w-full text-sm">
              <tbody>
                {[...months].reverse().map((m) => (
                  <tr key={m.month}>
                    <td className="py-1">{formatMonth(m.month)}</td>
                    <td className="num py-1">{formatINR(m.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </Card>
      </div>

      {editing !== null ? (
        <IncomeForm
          key={editing === "new" ? "new" : editing.id}
          initial={editing === "new" ? null : editing}
          today={today}
          tax={settings.tax}
          onSave={(e) => {
            onUpsert(e);
            setEditing(null);
          }}
          onCancel={() => setEditing(null)}
        />
      ) : (
        <button type="button" className="btn btn-primary" onClick={() => setEditing("new")}>
          + Add income
        </button>
      )}

      <Card title="Income entries">
        {rows.length === 0 ? (
          <p className="text-sm text-muted">No income logged yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Source</th>
                  <th scope="col" className="num">
                    Amount
                  </th>
                  <th scope="col" className="num">
                    Net
                  </th>
                  <th scope="col">Notes</th>
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={e.id}>
                    <td>{formatDate(e.date)}</td>
                    <td>{e.source}</td>
                    <td className="num">
                      {formatINR(e.amount)}
                      {e.isPretax && settings.tax.enabled && (
                        <div className="text-xs text-muted">pre-tax</div>
                      )}
                    </td>
                    <td className="num">{formatINR(netIncomeAmount(e, settings))}</td>
                    <td className="text-muted">{e.notes}</td>
                    <td>
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={() => setEditing(e)}
                          aria-label={`Edit ${e.source} on ${formatDate(e.date)}`}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-danger"
                          onClick={() => setDeleting(e)}
                          aria-label={`Delete ${e.source} on ${formatDate(e.date)}`}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={deleting !== null}
        title="Delete income entry?"
        message="This entry will be removed. This cannot be undone."
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
