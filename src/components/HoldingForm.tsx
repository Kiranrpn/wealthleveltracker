import { useState, type FormEvent } from "react";
import { parkedByBucket, roundMoney, type Balances } from "../lib/calc";
import { formatINR, parseAmount } from "../lib/format";
import { fundedHoldingError, type HoldingAddMode } from "../lib/ledger";
import { fieldErrors, holdingSchema } from "../lib/schema";
import { newId } from "../lib/storage";
import { BUCKETS, type Bucket, type Holding, type HoldingKind, type Labels } from "../lib/types";
import { Card, Field } from "./ui";

interface Draft {
  kind: HoldingKind;
  name: string;
  bucket: Bucket;
  type: string;
  whereParked: string;
  investedAmount: string;
  currentValue: string;
  lastUpdated: string;
  notes: string;
}

export interface Preset {
  bucket: Bucket;
  value?: number;
}

function toDraft(h: Holding | null, today: string, preset?: Preset): Draft {
  const value = preset?.value ? String(preset.value) : "";
  return {
    kind: h?.kind ?? (h ? "INVESTMENT" : "CASH"),
    name: h?.name ?? "",
    bucket: h?.bucket ?? preset?.bucket ?? "C1_LIQUID",
    type: h?.type ?? "",
    whereParked: h?.whereParked ?? "",
    investedAmount: h ? String(h.investedAmount) : value,
    currentValue: h ? String(h.currentValue) : value,
    lastUpdated: h?.lastUpdated ?? today,
    notes: h?.notes ?? "",
  };
}

interface Props {
  initial: Holding | null;
  preset?: Preset;
  today: string;
  labels: Labels;
  bal: Balances;
  holdings: Holding[];
  onSave: (h: Holding, mode: HoldingAddMode) => void;
  onCancel: () => void;
}

export function HoldingForm({
  initial,
  preset,
  today,
  labels,
  bal,
  holdings,
  onSave,
  onCancel,
}: Props) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(initial, today, preset));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const unrecorded = (b: Bucket) => roundMoney(Math.max(0, bal[b] - parkedByBucket(holdings)[b]));
  const free = unrecorded(draft.bucket);
  // Default to "bought with bucket money" only when the bucket has unrecorded money.
  const [addMode, setAddMode] = useState<HoldingAddMode>(() =>
    unrecorded(preset?.bucket ?? "C1_LIQUID") > 0 ? "FUNDED" : "ADD_VALUE",
  );
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const isCash = draft.kind === "CASH";
  const bucketName = labels.buckets[draft.bucket];

  function submit(e: FormEvent) {
    e.preventDefault();
    const value = parseAmount(draft.currentValue);
    const candidate = {
      id: initial?.id ?? newId(),
      kind: draft.kind,
      name: draft.name,
      bucket: draft.bucket,
      type: isCash ? "Cash" : draft.type,
      whereParked: draft.whereParked,
      // A cash balance has no separate cost: invested = balance.
      investedAmount: isCash ? value : parseAmount(draft.investedAmount),
      currentValue: value,
      lastUpdated: draft.lastUpdated,
      notes: draft.notes.trim() === "" ? undefined : draft.notes,
    };
    const parsed = holdingSchema.safeParse(candidate);
    if (!parsed.success) {
      const errs = fieldErrors(parsed.error);
      if (isCash && errs.investedAmount && !errs.currentValue)
        errs.currentValue = errs.investedAmount;
      setErrors(errs);
      return;
    }
    if (initial === null && addMode === "FUNDED") {
      const err = fundedHoldingError(parsed.data, bal, holdings, labels.buckets);
      if (err) {
        setErrors(isCash ? { currentValue: err } : { investedAmount: err });
        return;
      }
    }
    setErrors({});
    onSave(parsed.data, addMode);
  }

  const money = (key: "investedAmount" | "currentValue", label: string, hint?: string) => (
    <Field label={label} error={errors[key]} hint={hint}>
      {(p) => (
        <input
          {...p}
          className="input"
          inputMode="decimal"
          value={draft[key]}
          onChange={(e) => set(key, e.target.value)}
        />
      )}
    </Field>
  );

  const gain = roundMoney(parseAmount(draft.currentValue) - parseAmount(draft.investedAmount));

  return (
    <Card title={initial ? "Edit holding" : "Add holding"}>
      <form onSubmit={submit} noValidate className="grid gap-3 sm:grid-cols-2">
        <Field label="What is it?">
          {(p) => (
            <select
              {...p}
              className="input"
              value={draft.kind}
              onChange={(e) => set("kind", e.target.value as HoldingKind)}
            >
              <option value="CASH">Cash balance (bank, wallet, cash)</option>
              <option value="INVESTMENT">Investment (fund, FD, stock, property)</option>
            </select>
          )}
        </Field>
        <Field
          label="Bucket"
          error={errors.bucket}
          hint={
            draft.bucket === "EMERGENCY" || draft.bucket === "C1_LIQUID"
              ? "Counts toward your level"
              : "Shown, but never counts toward your level"
          }
        >
          {(p) => (
            <select
              {...p}
              className="input"
              value={draft.bucket}
              onChange={(e) => set("bucket", e.target.value as Bucket)}
            >
              {BUCKETS.map((b) => (
                <option key={b} value={b}>
                  {labels.buckets[b]}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Name" error={errors.name}>
          {(p) => (
            <input
              {...p}
              className="input"
              placeholder={isCash ? "HDFC savings account" : "Nifty 50 index fund"}
              value={draft.name}
              onChange={(e) => set("name", e.target.value)}
            />
          )}
        </Field>
        <Field
          label={isCash ? "Bank or where it is kept" : "Where parked"}
          error={errors.whereParked}
        >
          {(p) => (
            <input
              {...p}
              className="input"
              placeholder={isCash ? "HDFC, wallet, home" : "Platform, bank or location"}
              value={draft.whereParked}
              onChange={(e) => set("whereParked", e.target.value)}
            />
          )}
        </Field>

        {isCash ? (
          money("currentValue", "Balance (₹)")
        ) : (
          <>
            <Field label="Type" error={errors.type}>
              {(p) => (
                <input
                  {...p}
                  className="input"
                  placeholder="Mutual fund, FD, Land"
                  value={draft.type}
                  onChange={(e) => set("type", e.target.value)}
                />
              )}
            </Field>
            {money("investedAmount", "Invested amount (₹)", "What you paid from the bucket")}
            {money(
              "currentValue",
              "Current value (₹)",
              Number.isFinite(gain) && gain !== 0
                ? `${gain > 0 ? "Gain" : "Loss"} of ${formatINR(Math.abs(gain))} is posted to ${bucketName}`
                : "What it is worth today",
            )}
          </>
        )}
        <Field label="As of" error={errors.lastUpdated}>
          {(p) => (
            <input
              {...p}
              type="date"
              className="input"
              value={draft.lastUpdated}
              max={today}
              onChange={(e) => set("lastUpdated", e.target.value)}
            />
          )}
        </Field>

        {initial === null ? (
          <fieldset className="rounded-lg border border-line p-3 sm:col-span-2">
            <legend className="px-1 text-sm font-medium">Where did the money come from?</legend>
            <div className="space-y-2 text-sm">
              <label className="flex items-start gap-2">
                <input
                  type="radio"
                  name="addMode"
                  className="mt-1 accent-[rgb(var(--c-accent))]"
                  checked={addMode === "FUNDED"}
                  onChange={() => setAddMode("FUNDED")}
                />
                <span>
                  Already in {bucketName}. {formatINR(free)} of it is not yet recorded in holdings,
                  so the {isCash ? "balance" : "invested amount"} can be up to that.
                </span>
              </label>
              <label className="flex items-start gap-2">
                <input
                  type="radio"
                  name="addMode"
                  className="mt-1 accent-[rgb(var(--c-accent))]"
                  checked={addMode === "ADD_VALUE"}
                  onChange={() => setAddMode("ADD_VALUE")}
                />
                <span>
                  Owned before I started this ledger. Add its {isCash ? "balance" : "current value"}{" "}
                  to {bucketName}.
                </span>
              </label>
            </div>
          </fieldset>
        ) : (
          <p className="text-sm text-muted sm:col-span-2">
            Changing the {isCash ? "balance" : "current value"} posts the difference to the bucket.
            Moving it to another bucket moves its value too.
          </p>
        )}
        <Field label="Notes" error={errors.notes} className="sm:col-span-2">
          {(p) => (
            <textarea
              {...p}
              className="input"
              rows={2}
              value={draft.notes}
              onChange={(e) => set("notes", e.target.value)}
            />
          )}
        </Field>
        <div className="flex gap-2 sm:col-span-2">
          <button type="submit" className="btn btn-primary">
            {initial ? "Save changes" : "Add holding"}
          </button>
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </Card>
  );
}
