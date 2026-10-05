import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { defaultSettings } from "../lib/defaults";
import { parseAmount } from "../lib/format";
import { fieldErrors, settingsSchema } from "../lib/schema";
import { exportJSON, holdingsToCSV, importJSON, incomeToCSV } from "../lib/storage";
import { BUCKETS, LEVELS, type AppData, type Settings } from "../lib/types";
import { downloadText } from "./download";
import { Alert, Card, ConfirmDialog, Field } from "./ui";

interface Props {
  data: AppData;
  today: string;
  onSaveSettings: (s: Settings) => void;
  onReplaceData: (d: AppData) => void;
  onDeleteAll: () => void;
}

/** Form state: numbers as typed strings, percentages as whole-number percent strings. */
interface Draft {
  monthlySurvivalB: string;
  L1: string;
  L2: string;
  L3: string;
  shareL0: string;
  shareL1: string;
  shareL2: string;
  expectedReturn: string;
  inflationRate: string;
  staleDays: string;
  taxEnabled: boolean;
  taxRate: string;
  labels: Settings["labels"];
}

const pct = (f: number) => String(Math.round(f * 10000) / 100);
const fromPct = (s: string) => parseAmount(s) / 100;

function toDraft(s: Settings): Draft {
  return {
    monthlySurvivalB: String(s.monthlySurvivalB),
    L1: String(s.thresholds.L1),
    L2: String(s.thresholds.L2),
    L3: String(s.thresholds.L3),
    shareL0: pct(s.savingsShare.L0),
    shareL1: pct(s.savingsShare.L1),
    shareL2: pct(s.savingsShare.L2),
    expectedReturn: pct(s.expectedReturn),
    inflationRate: pct(s.inflationRate),
    staleDays: String(s.staleDays),
    taxEnabled: s.tax.enabled,
    taxRate: pct(s.tax.rate),
    labels: JSON.parse(JSON.stringify(s.labels)) as Settings["labels"],
  };
}

function fromDraft(d: Draft): unknown {
  return {
    monthlySurvivalB: parseAmount(d.monthlySurvivalB),
    thresholds: { L1: parseAmount(d.L1), L2: parseAmount(d.L2), L3: parseAmount(d.L3) },
    savingsShare: { L0: fromPct(d.shareL0), L1: fromPct(d.shareL1), L2: fromPct(d.shareL2) },
    expectedReturn: fromPct(d.expectedReturn),
    inflationRate: fromPct(d.inflationRate),
    staleDays: parseAmount(d.staleDays),
    tax: { enabled: d.taxEnabled, rate: fromPct(d.taxRate) },
    labels: d.labels,
  };
}

type Pending = { kind: "reset" } | { kind: "delete" } | { kind: "import"; data: AppData } | null;

export function SettingsPanel({ data, today, onSaveSettings, onReplaceData, onDeleteAll }: Props) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(data.settings));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [pending, setPending] = useState<Pending>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => {
    setSaved(false);
    setDraft((d) => ({ ...d, [k]: v }));
  };
  const setLabels = (fn: (l: Settings["labels"]) => Settings["labels"]) => {
    setSaved(false);
    setDraft((d) => ({ ...d, labels: fn(d.labels) }));
  };

  function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = settingsSchema.safeParse(fromDraft(draft));
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      setSaved(false);
      return;
    }
    setErrors({});
    onSaveSettings(parsed.data);
    setDraft(toDraft(parsed.data));
    setSaved(true);
  }

  function save(filename: string, content: string, mime: string) {
    setExportError(null);
    downloadText(filename, content, mime).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      // Closing the Android share sheet is not an error.
      if (!/cancel/i.test(msg)) setExportError(`Export failed: ${msg}`);
    });
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const result = importJSON(await file.text());
    if (!result.ok) {
      setImportErrors(result.errors);
      return;
    }
    setImportErrors([]);
    setPending({ kind: "import", data: result.data });
  }

  const num = (
    key: keyof Draft,
    label: string,
    opts: { hint?: string; errKey?: string; suffix?: string } = {},
  ) => (
    <Field label={label} error={errors[opts.errKey ?? key]} hint={opts.hint}>
      {(p) => (
        <div className="flex items-center gap-2">
          <input
            {...p}
            className="input"
            inputMode="decimal"
            value={draft[key] as string}
            onChange={(e) => set(key, e.target.value as never)}
          />
          {opts.suffix && <span className="text-sm text-muted">{opts.suffix}</span>}
        </div>
      )}
    </Field>
  );

  const thresholdError = errors.thresholds;

  return (
    <div className="space-y-4">
      <form onSubmit={submit} noValidate className="space-y-4">
        <Card title="Survival budget">
          <div className="grid gap-3 sm:grid-cols-2">
            {num("monthlySurvivalB", "Monthly survival budget, B (₹)", {
              hint: "Your essential monthly spend, post-tax.",
            })}
            {num("staleDays", "Stale after (days)", {
              hint: "Holdings not updated for longer than this are flagged.",
            })}
          </div>
        </Card>

        <Card title="Level thresholds (coverage ratio)">
          <div className="grid gap-3 sm:grid-cols-3">
            {num("L1", "L1 from", { errKey: "thresholds.L1", suffix: "x" })}
            {num("L2", "L2 from", { errKey: "thresholds.L2", suffix: "x" })}
            {num("L3", "L3 from", { errKey: "thresholds.L3", suffix: "x" })}
          </div>
          {thresholdError && (
            <p className="error" role="alert">
              {thresholdError}
            </p>
          )}
        </Card>

        <Card title="ETA assumptions">
          <p className="mb-3 text-sm text-muted">
            Share of your average monthly income that goes into liquid buckets, by level.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            {num("shareL0", "Savings share at L0", { errKey: "savingsShare.L0", suffix: "%" })}
            {num("shareL1", "Savings share at L1", { errKey: "savingsShare.L1", suffix: "%" })}
            {num("shareL2", "Savings share at L2", { errKey: "savingsShare.L2", suffix: "%" })}
            {num("expectedReturn", "Expected annual return", { suffix: "%" })}
            {num("inflationRate", "Inflation rate", { suffix: "%" })}
          </div>
        </Card>

        <Card title="Tax">
          <div className="flex items-center gap-2">
            <input
              id="taxEnabled"
              type="checkbox"
              className="h-4 w-4 accent-[rgb(var(--c-accent))]"
              checked={draft.taxEnabled}
              onChange={(e) => set("taxEnabled", e.target.checked)}
            />
            <label htmlFor="taxEnabled" className="text-sm">
              Let me enter some income pre-tax and deduct tax automatically
            </label>
          </div>
          {draft.taxEnabled && (
            <div className="mt-3 max-w-xs">
              {num("taxRate", "Tax rate", { errKey: "tax.rate", suffix: "%" })}
            </div>
          )}
        </Card>

        <Card title="Names and labels">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="App name" error={errors["labels.appName"]}>
              {(p) => (
                <input
                  {...p}
                  className="input"
                  value={draft.labels.appName}
                  onChange={(e) => setLabels((l) => ({ ...l, appName: e.target.value }))}
                />
              )}
            </Field>
            <Field label="Final level message" error={errors["labels.finalMessage"]}>
              {(p) => (
                <input
                  {...p}
                  className="input"
                  value={draft.labels.finalMessage}
                  onChange={(e) => setLabels((l) => ({ ...l, finalMessage: e.target.value }))}
                />
              )}
            </Field>
            {LEVELS.map((lv) => (
              <fieldset key={lv} className="rounded-lg border border-line p-3 sm:col-span-2">
                <legend className="px-1 text-xs font-semibold text-muted">Level {lv}</legend>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Name" error={errors[`labels.levels.${lv}.name`]}>
                    {(p) => (
                      <input
                        {...p}
                        className="input"
                        value={draft.labels.levels[lv].name}
                        onChange={(e) =>
                          setLabels((l) => ({
                            ...l,
                            levels: {
                              ...l.levels,
                              [lv]: { ...l.levels[lv], name: e.target.value },
                            },
                          }))
                        }
                      />
                    )}
                  </Field>
                  <Field
                    label="Meaning"
                    error={errors[`labels.levels.${lv}.meaning`]}
                    className="sm:col-span-2"
                  >
                    {(p) => (
                      <input
                        {...p}
                        className="input"
                        value={draft.labels.levels[lv].meaning}
                        onChange={(e) =>
                          setLabels((l) => ({
                            ...l,
                            levels: {
                              ...l.levels,
                              [lv]: { ...l.levels[lv], meaning: e.target.value },
                            },
                          }))
                        }
                      />
                    )}
                  </Field>
                </div>
              </fieldset>
            ))}
            {BUCKETS.map((b) => (
              <Field key={b} label={`Bucket label: ${b}`} error={errors[`labels.buckets.${b}`]}>
                {(p) => (
                  <input
                    {...p}
                    className="input"
                    value={draft.labels.buckets[b]}
                    onChange={(e) =>
                      setLabels((l) => ({ ...l, buckets: { ...l.buckets, [b]: e.target.value } }))
                    }
                  />
                )}
              </Field>
            ))}
          </div>
        </Card>

        <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-2 border-t border-line bg-bg/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border">
          <button type="submit" className="btn btn-primary">
            Save settings
          </button>
          <button type="button" className="btn" onClick={() => setPending({ kind: "reset" })}>
            Reset to defaults
          </button>
          <span aria-live="polite" className="text-sm">
            {saved && <span className="text-ok">Saved.</span>}
            {Object.keys(errors).length > 0 && (
              <span className="text-danger">Fix the highlighted fields.</span>
            )}
          </span>
        </div>
      </form>

      <Card title="Data and backup">
        <p className="mb-3 text-sm text-muted">
          Everything is stored only on this device. Export a backup regularly.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn"
            onClick={() =>
              save(`wealthy-backup-${today}.json`, exportJSON(data), "application/json")
            }
          >
            Export data (JSON)
          </button>
          <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
            Import data (JSON)
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json,text/plain,application/octet-stream"
            className="sr-only"
            aria-label="Choose a JSON backup file to import"
            tabIndex={-1}
            onChange={onFile}
          />
          <button
            type="button"
            className="btn"
            onClick={() =>
              save(`wealthy-holdings-${today}.csv`, holdingsToCSV(data.holdings), "text/csv")
            }
          >
            Export holdings (CSV)
          </button>
          <button
            type="button"
            className="btn"
            onClick={() =>
              save(`wealthy-income-${today}.csv`, incomeToCSV(data.income), "text/csv")
            }
          >
            Export income (CSV)
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => setPending({ kind: "delete" })}
          >
            Delete all data
          </button>
        </div>
        {exportError && (
          <div className="mt-3" role="alert">
            <Alert tone="danger">{exportError}</Alert>
          </div>
        )}
        {importErrors.length > 0 && (
          <div className="mt-3" role="alert">
            <Alert tone="danger">
              <p className="font-semibold">Import rejected. Nothing was changed.</p>
              <ul className="mt-1 list-disc pl-5">
                {importErrors.slice(0, 10).map((err) => (
                  <li key={err}>{err}</li>
                ))}
              </ul>
              {importErrors.length > 10 && <p>and {importErrors.length - 10} more.</p>}
            </Alert>
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={pending?.kind === "reset"}
        title="Reset settings to defaults?"
        message="Your survival budget will be kept. Thresholds, assumptions, tax and labels go back to defaults. Holdings and income are not touched."
        confirmLabel="Reset"
        onCancel={() => setPending(null)}
        onConfirm={() => {
          const next = { ...defaultSettings(), monthlySurvivalB: data.settings.monthlySurvivalB };
          onSaveSettings(next);
          setDraft(toDraft(next));
          setErrors({});
          setPending(null);
        }}
      />
      <ConfirmDialog
        open={pending?.kind === "import"}
        title="Overwrite all data?"
        message={
          pending?.kind === "import"
            ? `Import ${pending.data.holdings.length} holdings, ${pending.data.income.length} income entries and ${pending.data.snapshots.length} snapshots. Your current data will be replaced.`
            : ""
        }
        confirmLabel="Overwrite"
        danger
        onCancel={() => setPending(null)}
        onConfirm={() => {
          if (pending?.kind === "import") {
            onReplaceData(pending.data);
            setDraft(toDraft(pending.data.settings));
          }
          setPending(null);
        }}
      />
      <ConfirmDialog
        open={pending?.kind === "delete"}
        title="Delete all data?"
        message="All holdings, income, history and settings will be erased from this browser. Export a backup first if you might need it."
        confirmLabel="Delete everything"
        danger
        onCancel={() => setPending(null)}
        onConfirm={() => {
          onDeleteAll();
          setDraft(toDraft(defaultSettings()));
          setPending(null);
        }}
      />
    </div>
  );
}
