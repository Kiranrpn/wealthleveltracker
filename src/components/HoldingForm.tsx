import { useState, type FormEvent } from "react";
import { parseAmount } from "../lib/format";
import type { HoldingAddMode } from "../lib/ledger";
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
    notes: h?.notes ?? "",
  };
}

interface Props {
  initial: Holding | null;
  today: string;
  labels: Labels;
  onSave: (h: Holding, mode: HoldingAddMode) => void;
  onCancel: () => void;
}

export function HoldingForm({ initial, today, labels, onSave, onCancel }: Props) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(initial, today));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [addMode, setAddMode] = useState<HoldingAddMode>("FUNDED");
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
      notes: draft.notes.trim() === "" ? undefined : draft.notes,
    };
    const parsed = holdingSchema.safeParse(candidate);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
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
        {initial === null ? (
          <fieldset className="rounded-lg border border-line p-3 sm:col-span-2">
            <legend className="px-1 text-sm font-medium">
              How does this affect the {labels.buckets[draft.bucket]} balance?
            </legend>
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
                  Bought with money already in {labels.buckets[draft.bucket]}. The balance stays the
                  same.
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
                  Owned before I started this ledger. Add its current value to{" "}
                  {labels.buckets[draft.bucket]}.
                </span>
              </label>
            </div>
          </fieldset>
        ) : (
          <p className="text-sm text-muted sm:col-span-2">
            Changing the current value posts the gain or loss to the bucket. Moving it to another
            bucket moves its value too.
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
