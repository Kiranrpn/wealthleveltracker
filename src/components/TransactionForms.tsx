import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { currentLevel, netIncome, roundMoney, splitAmount, type Balances } from "../lib/calc";
import { formatINR, formatPct, parseAmount } from "../lib/format";
import {
  balancesExcluding,
  buildAdjust,
  buildIncome,
  buildSpend,
  buildTransfer,
  type Built,
} from "../lib/ledger";
import { newId } from "../lib/storage";
import {
  BUCKETS,
  INCOME_SOURCES,
  LEVELS,
  type AdjustTx,
  type Bucket,
  type IncomeSource,
  type IncomeTx,
  type Level,
  type Settings,
  type SpendTx,
  type Transaction,
  type TransferTx,
} from "../lib/types";
import { Card, Field } from "./ui";

interface FormProps<T extends Transaction> {
  initial: T | null;
  settings: Settings;
  transactions: Transaction[];
  today: string;
  onSave: (tx: T) => void;
  onCancel: () => void;
}

function useAvailable(transactions: Transaction[], editingId?: string): Balances {
  return useMemo(() => balancesExcluding(transactions, editingId), [transactions, editingId]);
}

function FormShell({
  title,
  editing,
  onSubmit,
  onCancel,
  submitLabel,
  children,
}: {
  title: string;
  editing: boolean;
  onSubmit: (e: FormEvent) => void;
  onCancel: () => void;
  submitLabel: string;
  children: ReactNode;
}) {
  return (
    <Card title={editing ? `Edit: ${title}` : title}>
      <form onSubmit={onSubmit} noValidate className="grid gap-3 sm:grid-cols-2">
        {children}
        <div className="flex gap-2 sm:col-span-2">
          <button type="submit" className="btn btn-primary">
            {editing ? "Save changes" : submitLabel}
          </button>
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </Card>
  );
}

function DateField({
  value,
  onChange,
  error,
  today,
}: {
  value: string;
  onChange: (v: string) => void;
  error?: string;
  today: string;
}) {
  return (
    <Field label="Date" error={error}>
      {(p) => (
        <input
          {...p}
          type="date"
          className="input"
          value={value}
          max={today}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </Field>
  );
}

function AmountField({
  label = "Amount (₹)",
  value,
  onChange,
  error,
  hint,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  hint?: string;
}) {
  return (
    <Field label={label} error={error} hint={hint}>
      {(p) => (
        <input
          {...p}
          className="input"
          inputMode="decimal"
          placeholder="0"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </Field>
  );
}

function BucketField({
  label,
  value,
  onChange,
  error,
  labels,
  hint,
}: {
  label: string;
  value: Bucket;
  onChange: (b: Bucket) => void;
  error?: string;
  labels: Record<Bucket, string>;
  hint?: string;
}) {
  return (
    <Field label={label} error={error} hint={hint}>
      {(p) => (
        <select
          {...p}
          className="input"
          value={value}
          onChange={(e) => onChange(e.target.value as Bucket)}
        >
          {BUCKETS.map((b) => (
            <option key={b} value={b}>
              {labels[b]}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

function NotesField({
  value,
  onChange,
  error,
  label = "Notes",
}: {
  value: string;
  onChange: (v: string) => void;
  error?: string;
  label?: string;
}) {
  return (
    <Field label={label} error={error} className="sm:col-span-2">
      {(p) => (
        <input {...p} className="input" value={value} onChange={(e) => onChange(e.target.value)} />
      )}
    </Field>
  );
}

function handle<T>(
  r: Built<T>,
  setErrors: (e: Record<string, string>) => void,
  onSave: (tx: T) => void,
) {
  if (!r.ok) {
    setErrors(r.errors);
    return;
  }
  setErrors({});
  onSave(r.tx);
}

/* ------------------------------------------------------------------ */
/* Income                                                               */
/* ------------------------------------------------------------------ */

export function IncomeForm({
  initial,
  settings,
  transactions,
  today,
  onSave,
  onCancel,
}: FormProps<IncomeTx>) {
  const available = useAvailable(transactions, initial?.id);
  const [date, setDate] = useState(initial?.date ?? today);
  const [source, setSource] = useState<IncomeSource>(initial?.source ?? "Salary");
  const [amount, setAmount] = useState(initial ? String(initial.amount) : "");
  const [isPretax, setIsPretax] = useState(initial?.isPretax ?? false);
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [splitLevel, setSplitLevel] = useState<Level>(() => currentLevel(settings, available));
  // Manual mode keeps the user's own bucket amounts instead of following the split.
  const [manual, setManual] = useState(initial !== null);
  const [alloc, setAlloc] = useState<Record<Bucket, string>>(() => {
    const out = Object.fromEntries(BUCKETS.map((b) => [b, ""])) as Record<Bucket, string>;
    for (const p of initial?.postings ?? []) out[p.bucket] = String(p.amount);
    return out;
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const gross = parseAmount(amount);
  const net = Number.isFinite(gross) && gross > 0 ? netIncome(gross, isPretax, settings) : 0;
  const split = settings.splits[splitLevel];
  const auto = splitAmount(net, split);
  const shown: Record<Bucket, string> = manual
    ? alloc
    : (Object.fromEntries(BUCKETS.map((b) => [b, auto[b] ? String(auto[b]) : ""])) as Record<
        Bucket,
        string
      >);
  const allocated = roundMoney(
    BUCKETS.reduce(
      (s, b) => s + (Number.isFinite(parseAmount(shown[b])) ? parseAmount(shown[b]) : 0),
      0,
    ),
  );
  const remaining = roundMoney(net - allocated);

  function editBucket(b: Bucket, v: string) {
    setAlloc({ ...(manual ? alloc : shown), [b]: v });
    setManual(true);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const allocation: Partial<Record<Bucket, number>> = {};
    for (const b of BUCKETS) {
      if (shown[b].trim() !== "") allocation[b] = parseAmount(shown[b]);
    }
    handle(
      buildIncome(
        { id: initial?.id ?? newId(), date, source, amount: gross, isPretax, allocation, notes },
        settings,
      ),
      setErrors,
      onSave,
    );
  }

  return (
    <FormShell
      title="Add income"
      editing={initial !== null}
      onSubmit={submit}
      onCancel={onCancel}
      submitLabel="Save income"
    >
      <DateField value={date} onChange={setDate} error={errors.date} today={today} />
      <Field label="Source">
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
      <AmountField
        value={amount}
        onChange={setAmount}
        error={errors.amount}
        hint={settings.tax.enabled ? undefined : "Post-tax amount"}
      />
      {settings.tax.enabled ? (
        <div className="flex items-center gap-2 self-end pb-2">
          <input
            id="isPretax"
            type="checkbox"
            className="h-4 w-4 accent-[rgb(var(--c-accent))]"
            checked={isPretax}
            onChange={(e) => setIsPretax(e.target.checked)}
          />
          <label htmlFor="isPretax" className="text-sm">
            Pre-tax (deduct {formatPct(settings.tax.rate)})
          </label>
        </div>
      ) : (
        <div className="hidden sm:block" />
      )}

      <fieldset className="rounded-xl border border-line p-3 sm:col-span-2">
        <legend className="px-1 text-sm font-semibold">Split into buckets</legend>
        <div className="mb-3 flex flex-wrap items-end gap-2">
          <Field label="Use split for level" className="w-40">
            {(p) => (
              <select
                {...p}
                className="input"
                value={splitLevel}
                onChange={(e) => {
                  setSplitLevel(e.target.value as Level);
                  setManual(false);
                }}
              >
                {LEVELS.map((lv) => (
                  <option key={lv} value={lv}>
                    {settings.labels.levels[lv].name}
                  </option>
                ))}
              </select>
            )}
          </Field>
          {manual && (
            <button type="button" className="btn btn-sm" onClick={() => setManual(false)}>
              Reset to split
            </button>
          )}
          <p className="text-xs text-muted">
            {manual ? "Custom amounts." : "Follows the split. Edit any amount to customise."}
            {isPretax && settings.tax.enabled && net > 0 && (
              <> Splitting {formatINR(net)} after tax.</>
            )}
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          {BUCKETS.map((b) => (
            <Field
              key={b}
              label={`${settings.labels.buckets[b]} (${formatPct(split[b], 1)})`}
              error={errors[`allocation.${b}`]}
            >
              {(p) => (
                <input
                  {...p}
                  className="input"
                  inputMode="decimal"
                  placeholder="0"
                  value={shown[b]}
                  onChange={(e) => editBucket(b, e.target.value)}
                />
              )}
            </Field>
          ))}
        </div>
        <p
          className={`mt-2 text-sm font-medium ${Math.abs(remaining) > 0.005 ? "text-warn" : "text-ok"}`}
          aria-live="polite"
        >
          {Math.abs(remaining) > 0.005
            ? `${remaining > 0 ? "Unallocated" : "Over-allocated"}: ${formatINR(Math.abs(remaining))}`
            : net > 0
              ? `All ${formatINR(net)} allocated`
              : "Enter an amount to see the split"}
        </p>
        {errors.allocation && (
          <p className="error" role="alert">
            {errors.allocation}
          </p>
        )}
      </fieldset>
      <NotesField value={notes} onChange={setNotes} />
    </FormShell>
  );
}

/* ------------------------------------------------------------------ */
/* Move money                                                           */
/* ------------------------------------------------------------------ */

export function TransferForm({
  initial,
  settings,
  transactions,
  today,
  onSave,
  onCancel,
  prefill,
}: FormProps<TransferTx> & { prefill?: { from?: Bucket; amount?: number } }) {
  const available = useAvailable(transactions, initial?.id);
  const labels = settings.labels.buckets;
  const [date, setDate] = useState(initial?.date ?? today);
  const startFrom = initial?.postings[0].bucket ?? prefill?.from ?? "SURVIVAL";
  const [from, setFrom] = useState<Bucket>(startFrom);
  const [to, setTo] = useState<Bucket>(
    initial?.postings[1].bucket ?? (startFrom === "C1_LIQUID" ? "EMERGENCY" : "C1_LIQUID"),
  );
  const [amount, setAmount] = useState(
    initial ? String(initial.postings[1].amount) : prefill?.amount ? String(prefill.amount) : "",
  );
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});

  function submit(e: FormEvent) {
    e.preventDefault();
    handle(
      buildTransfer(
        { id: initial?.id ?? newId(), date, from, to, amount: parseAmount(amount), notes },
        available,
        labels,
      ),
      setErrors,
      onSave,
    );
  }

  return (
    <FormShell
      title="Move money between buckets"
      editing={initial !== null}
      onSubmit={submit}
      onCancel={onCancel}
      submitLabel="Save move"
    >
      <DateField value={date} onChange={setDate} error={errors.date} today={today} />
      <AmountField value={amount} onChange={setAmount} error={errors.amount} />
      <BucketField
        label="From"
        value={from}
        onChange={setFrom}
        labels={labels}
        hint={`Available: ${formatINR(Math.max(0, available[from]))}`}
      />
      <BucketField label="To" value={to} onChange={setTo} error={errors.to} labels={labels} />
      <NotesField value={notes} onChange={setNotes} />
    </FormShell>
  );
}

/* ------------------------------------------------------------------ */
/* Spend                                                                */
/* ------------------------------------------------------------------ */

export function SpendForm({
  initial,
  settings,
  transactions,
  today,
  onSave,
  onCancel,
}: FormProps<SpendTx>) {
  const available = useAvailable(transactions, initial?.id);
  const labels = settings.labels.buckets;
  const [date, setDate] = useState(initial?.date ?? today);
  const [bucket, setBucket] = useState<Bucket>(initial?.postings[0].bucket ?? "SURVIVAL");
  const [amount, setAmount] = useState(initial ? String(-initial.postings[0].amount) : "");
  const [category, setCategory] = useState(initial?.category ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});

  function submit(e: FormEvent) {
    e.preventDefault();
    handle(
      buildSpend(
        { id: initial?.id ?? newId(), date, bucket, amount: parseAmount(amount), category, notes },
        available,
        labels,
      ),
      setErrors,
      onSave,
    );
  }

  return (
    <FormShell
      title="Record a spend"
      editing={initial !== null}
      onSubmit={submit}
      onCancel={onCancel}
      submitLabel="Save spend"
    >
      <DateField value={date} onChange={setDate} error={errors.date} today={today} />
      <AmountField value={amount} onChange={setAmount} error={errors.amount} />
      <BucketField
        label="Paid from"
        value={bucket}
        onChange={setBucket}
        labels={labels}
        hint={`Available: ${formatINR(Math.max(0, available[bucket]))}`}
      />
      <Field label="What was it for?">
        {(p) => (
          <input
            {...p}
            className="input"
            placeholder="Rent, groceries, trip"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          />
        )}
      </Field>
      <NotesField value={notes} onChange={setNotes} />
    </FormShell>
  );
}

/* ------------------------------------------------------------------ */
/* Adjust                                                               */
/* ------------------------------------------------------------------ */

export function AdjustForm({ initial, settings, today, onSave, onCancel }: FormProps<AdjustTx>) {
  const labels = settings.labels.buckets;
  const start = initial?.postings[0].amount ?? 0;
  const [date, setDate] = useState(initial?.date ?? today);
  const [bucket, setBucket] = useState<Bucket>(initial?.postings[0].bucket ?? "C1_LIQUID");
  const [direction, setDirection] = useState<"add" | "reduce">(start < 0 ? "reduce" : "add");
  const [amount, setAmount] = useState(initial ? String(Math.abs(start)) : "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});

  function submit(e: FormEvent) {
    e.preventDefault();
    const a = Math.abs(parseAmount(amount));
    handle(
      buildAdjust({
        id: initial?.id ?? newId(),
        date,
        bucket,
        amount: direction === "add" ? a : -a,
        notes,
        holdingId: initial?.holdingId,
      }),
      setErrors,
      onSave,
    );
  }

  return (
    <FormShell
      title="Adjust a balance"
      editing={initial !== null}
      onSubmit={submit}
      onCancel={onCancel}
      submitLabel="Save adjustment"
    >
      <p className="text-sm text-muted sm:col-span-2">
        For opening balances (money you already had before using the app) and corrections. Use
        Record spend for spending, and Move money to shift money between buckets.
      </p>
      <DateField value={date} onChange={setDate} error={errors.date} today={today} />
      <BucketField label="Bucket" value={bucket} onChange={setBucket} labels={labels} />
      <fieldset className="sm:col-span-1">
        <legend className="label">Direction</legend>
        <div className="flex gap-4 pt-2 text-sm">
          {(["add", "reduce"] as const).map((d) => (
            <label key={d} className="flex items-center gap-2">
              <input
                type="radio"
                name="direction"
                value={d}
                checked={direction === d}
                onChange={() => setDirection(d)}
                className="accent-[rgb(var(--c-accent))]"
              />
              {d === "add" ? "Add to balance" : "Reduce balance"}
            </label>
          ))}
        </div>
      </fieldset>
      <AmountField value={amount} onChange={setAmount} error={errors.amount} />
      <NotesField value={notes} onChange={setNotes} label="Reason" />
    </FormShell>
  );
}
