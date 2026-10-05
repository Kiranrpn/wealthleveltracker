import { useState, type FormEvent } from "react";
import { formatPct, parseAmount } from "../lib/format";
import { fieldErrors, incomeEntrySchema } from "../lib/schema";
import { newId } from "../lib/storage";
import {
  INCOME_SOURCES,
  type IncomeEntry,
  type IncomeSource,
  type TaxSettings,
} from "../lib/types";
import { Card, Field } from "./ui";

interface Props {
  initial: IncomeEntry | null;
  today: string;
  tax: TaxSettings;
  onSave: (e: IncomeEntry) => void;
  onCancel: () => void;
}

export function IncomeForm({ initial, today, tax, onSave, onCancel }: Props) {
  const [date, setDate] = useState(initial?.date ?? today);
  const [source, setSource] = useState<IncomeSource>(initial?.source ?? "Salary");
  const [amount, setAmount] = useState(initial ? String(initial.amount) : "");
  const [isPretax, setIsPretax] = useState(initial?.isPretax ?? false);
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});

  function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = incomeEntrySchema.safeParse({
      id: initial?.id ?? newId(),
      date,
      source,
      amount: parseAmount(amount),
      ...(tax.enabled
        ? { isPretax }
        : initial?.isPretax !== undefined
          ? { isPretax: initial.isPretax }
          : {}),
      notes: notes.trim() === "" ? undefined : notes,
    });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    onSave(parsed.data);
  }

  return (
    <Card title={initial ? "Edit income" : "Add income"}>
      <form onSubmit={submit} noValidate className="grid gap-3 sm:grid-cols-3">
        <Field label="Date" error={errors.date}>
          {(p) => (
            <input
              {...p}
              type="date"
              className="input"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          )}
        </Field>
        <Field label="Source" error={errors.source}>
          {(p) => (
            <select
              {...p}
              className="input"
              value={source}
              onChange={(e) => setSource(e.target.value as IncomeSource)}
            >
              {INCOME_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field
          label="Amount (₹)"
          error={errors.amount}
          hint={tax.enabled ? undefined : "Post-tax amount"}
        >
          {(p) => (
            <input
              {...p}
              className="input"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          )}
        </Field>
        {tax.enabled && (
          <div className="flex items-center gap-2 sm:col-span-3">
            <input
              id="isPretax"
              type="checkbox"
              className="h-4 w-4 accent-[rgb(var(--c-accent))]"
              checked={isPretax}
              onChange={(e) => setIsPretax(e.target.checked)}
            />
            <label htmlFor="isPretax" className="text-sm">
              Amount is pre-tax (deduct {formatPct(tax.rate)} tax)
            </label>
          </div>
        )}
        <Field label="Notes" error={errors.notes} className="sm:col-span-3">
          {(p) => (
            <input
              {...p}
              className="input"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          )}
        </Field>
        <div className="flex gap-2 sm:col-span-3">
          <button type="submit" className="btn btn-primary">
            {initial ? "Save changes" : "Add income"}
          </button>
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </Card>
  );
}
