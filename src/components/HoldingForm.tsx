import { useState, type FormEvent } from "react";
import { isC2Bucket } from "../lib/calc";
import { parseAmount } from "../lib/format";
import { fieldErrors, holdingSchema } from "../lib/schema";
import { newId } from "../lib/storage";
import { BUCKETS, type Bucket, type Holding, type Labels } from "../lib/types";
import { Card, Field } from "./ui";

interface Draft {
  name: string;
  bucket: Bucket;
  type: string;
  whereParked: string;
  investedAmount: string;
  currentValue: string;
  lastUpdated: string;
  netAnnualIncome: string;
  incomeIsReliable: boolean;
  notes: string;
}

function toDraft(h: Holding | null, today: string): Draft {
  return {
    name: h?.name ?? "",
    bucket: h?.bucket ?? "C1_LIQUID",
    type: h?.type ?? "",
    whereParked: h?.whereParked ?? "",
    investedAmount: h ? String(h.investedAmount) : "",
    currentValue: h ? String(h.currentValue) : "",
    lastUpdated: h?.lastUpdated ?? today,
    netAnnualIncome: h?.netAnnualIncome !== undefined ? String(h.netAnnualIncome) : "",
    incomeIsReliable: h?.incomeIsReliable ?? false,
    notes: h?.notes ?? "",
  };
}

interface Props {
  initial: Holding | null;
  today: string;
  labels: Labels;
  onSave: (h: Holding) => void;
  onCancel: () => void;
}

export function HoldingForm({ initial, today, labels, onSave, onCancel }: Props) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(initial, today));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const showC2 = isC2Bucket(draft.bucket);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  function submit(e: FormEvent) {
    e.preventDefault();
    const candidate = {
      id: initial?.id ?? newId(),
      name: draft.name,
      bucket: draft.bucket,
      type: draft.type,
      whereParked: draft.whereParked,
      investedAmount: parseAmount(draft.investedAmount),
      currentValue: parseAmount(draft.currentValue),
      lastUpdated: draft.lastUpdated,
      ...(showC2
        ? {
            netAnnualIncome:
              draft.netAnnualIncome.trim() === "" ? undefined : parseAmount(draft.netAnnualIncome),
            incomeIsReliable: draft.incomeIsReliable,
          }
        : {}),
      notes: draft.notes.trim() === "" ? undefined : draft.notes,
    };
    const parsed = holdingSchema.safeParse(candidate);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    onSave(parsed.data as Holding);
  }

  const money = (
    key: "investedAmount" | "currentValue" | "netAnnualIncome",
    label: string,
    hint?: string,
  ) => (
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

  return (
    <Card title={initial ? "Edit holding" : "Add holding"}>
      <form onSubmit={submit} noValidate className="grid gap-3 sm:grid-cols-2">
        <Field label="Name" error={errors.name}>
          {(p) => (
            <input
              {...p}
              className="input"
              placeholder="Nifty 50 index fund"
              value={draft.name}
              onChange={(e) => set("name", e.target.value)}
            />
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
        <Field label="Where parked" error={errors.whereParked}>
          {(p) => (
            <input
              {...p}
              className="input"
              placeholder="Platform, bank or location"
              value={draft.whereParked}
              onChange={(e) => set("whereParked", e.target.value)}
            />
          )}
        </Field>
        {money("investedAmount", "Invested amount (₹)")}
        {money("currentValue", "Current value (₹)")}
        <Field label="Last updated" error={errors.lastUpdated}>
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
        {showC2 && (
          <>
            {money("netAnnualIncome", "Net annual income (₹)", "After all costs and taxes")}
            <div className="flex items-center gap-2 sm:col-span-2">
              <input
                id="incomeIsReliable"
                type="checkbox"
                className="h-4 w-4 accent-[rgb(var(--c-accent))]"
                checked={draft.incomeIsReliable}
                onChange={(e) => set("incomeIsReliable", e.target.checked)}
              />
              <label htmlFor="incomeIsReliable" className="text-sm">
                Income is reliable (it will reduce the corpus you need)
              </label>
            </div>
          </>
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
