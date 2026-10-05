import { useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import { isCompleteSplit, splitTotal } from "../lib/calc";
import { defaultSettings } from "../lib/defaults";
import { formatPct, parseAmount } from "../lib/format";
import { fieldErrors, settingsSchema } from "../lib/schema";
import { exportJSON, holdingsToCSV, importJSON, transactionsToCSV } from "../lib/storage";
import { BUCKETS, LEVELS, type AppData, type Level, type Settings, type Split } from "../lib/types";
import { downloadText } from "./download";
import { Alert, Card, ConfirmDialog, Field } from "./ui";

export type Theme = "dark" | "light";

const SECTIONS = [
  { id: "budget", label: "Budget & levels" },
  { id: "split", label: "Income split" },
  { id: "tax", label: "Tax" },
  { id: "appearance", label: "Appearance" },
  { id: "labels", label: "Names & labels" },
  { id: "data", label: "Backup & data" },
] as const;
type SectionId = (typeof SECTIONS)[number]["id"];

interface Props {
  data: AppData;
  today: string;
  theme: Theme;
  onTheme: (t: Theme) => void;
  onSaveSettings: (s: Settings) => void;
  onReplaceData: (d: AppData) => void;
  onDeleteAll: () => void;
}

const pct = (f: number) => String(Math.round(f * 10000) / 100);
const fromPct = (s: string) => (s.trim() === "" ? 0 : parseAmount(s) / 100);

/** Validates a section's changes against the full settings schema and saves them. */
function useSectionSave(onSave: (s: Settings) => void) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  return {
    errors,
    saved,
    touch: () => setSaved(false),
    save(next: unknown) {
      const parsed = settingsSchema.safeParse(next);
      if (!parsed.success) {
        setErrors(fieldErrors(parsed.error));
        setSaved(false);
        return false;
      }
      setErrors({});
      onSave(parsed.data);
      setSaved(true);
      return true;
    },
  };
}

function SaveBar({
  saved,
  hasErrors,
  extra,
}: {
  saved: boolean;
  hasErrors: boolean;
  extra?: ReactNode;
}) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
      <button type="submit" className="btn btn-primary">
        Save
      </button>
      {extra}
      <span aria-live="polite" className="text-sm">
        {saved && <span className="text-ok">Saved.</span>}
        {hasErrors && <span className="text-danger">Fix the highlighted fields.</span>}
      </span>
    </div>
  );
}

function NumInput({
  label,
  value,
  onChange,
  error,
  hint,
  suffix,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  hint?: string;
  suffix?: string;
}) {
  return (
    <Field label={label} error={error} hint={hint}>
      {(p) => (
        <div className="flex items-center gap-2">
          <input
            {...p}
            className="input"
            inputMode="decimal"
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
          {suffix && <span className="text-sm text-muted">{suffix}</span>}
        </div>
      )}
    </Field>
  );
}

/* ------------------------------------------------------------------ */
/* Budget & levels                                                      */
/* ------------------------------------------------------------------ */

function BudgetSection({
  settings,
  onSave,
}: {
  settings: Settings;
  onSave: (s: Settings) => void;
}) {
  const s = useSectionSave(onSave);
  const [d, setD] = useState({
    b: String(settings.monthlySurvivalB),
    L1: String(settings.thresholds.L1),
    L2: String(settings.thresholds.L2),
    L3: String(settings.thresholds.L3),
    stale: String(settings.staleDays),
  });
  const set = (k: keyof typeof d) => (v: string) => {
    s.touch();
    setD((x) => ({ ...x, [k]: v }));
  };
  function submit(e: FormEvent) {
    e.preventDefault();
    s.save({
      ...settings,
      monthlySurvivalB: parseAmount(d.b),
      thresholds: { L1: parseAmount(d.L1), L2: parseAmount(d.L2), L3: parseAmount(d.L3) },
      staleDays: parseAmount(d.stale),
    });
  }
  return (
    <form onSubmit={submit} noValidate>
      <Card title="Budget & levels">
        <div className="grid gap-3 sm:grid-cols-2">
          <NumInput
            label="Monthly survival budget, B (₹)"
            value={d.b}
            onChange={set("b")}
            error={s.errors.monthlySurvivalB}
            hint="Your essential monthly spend, post-tax."
          />
          <NumInput
            label="Flag holdings as stale after (days)"
            value={d.stale}
            onChange={set("stale")}
            error={s.errors.staleDays}
          />
        </div>
        <h3 className="mb-2 mt-5 text-sm font-semibold">
          Level thresholds (years of annual B in liquid buckets)
        </h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <NumInput
            label={`${settings.labels.levels.L1.name} from`}
            value={d.L1}
            onChange={set("L1")}
            error={s.errors["thresholds.L1"]}
            suffix="x"
          />
          <NumInput
            label={`${settings.labels.levels.L2.name} from`}
            value={d.L2}
            onChange={set("L2")}
            error={s.errors["thresholds.L2"]}
            suffix="x"
          />
          <NumInput
            label={`${settings.labels.levels.L3.name} from`}
            value={d.L3}
            onChange={set("L3")}
            error={s.errors["thresholds.L3"]}
            suffix="x"
          />
        </div>
        {s.errors.thresholds && (
          <p className="error" role="alert">
            {s.errors.thresholds}
          </p>
        )}
        <SaveBar saved={s.saved} hasErrors={Object.keys(s.errors).length > 0} />
      </Card>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* Income split                                                         */
/* ------------------------------------------------------------------ */

function SplitSection({ settings, onSave }: { settings: Settings; onSave: (s: Settings) => void }) {
  const s = useSectionSave(onSave);
  const [level, setLevel] = useState<Level>("L0");
  const [d, setD] = useState<Record<Level, Record<string, string>>>(
    () =>
      Object.fromEntries(
        LEVELS.map((lv) => [
          lv,
          Object.fromEntries(BUCKETS.map((b) => [b, pct(settings.splits[lv][b])])),
        ]),
      ) as Record<Level, Record<string, string>>,
  );
  const toSplit = (lv: Level) =>
    Object.fromEntries(BUCKETS.map((b) => [b, fromPct(d[lv][b])])) as Split;
  const current = toSplit(level);
  const total = splitTotal(current);

  function submit(e: FormEvent) {
    e.preventDefault();
    s.save({ ...settings, splits: Object.fromEntries(LEVELS.map((lv) => [lv, toSplit(lv)])) });
  }

  return (
    <form onSubmit={submit} noValidate>
      <Card title="Income split">
        <p className="mb-3 text-sm text-muted">
          How each income entry is divided between buckets. The split for your current level is used
          by default; you can still change the amounts on any single entry.
        </p>
        <div role="tablist" aria-label="Level" className="mb-4 flex flex-wrap gap-1">
          {LEVELS.map((lv) => {
            const okSplit = isCompleteSplit(toSplit(lv));
            return (
              <button
                key={lv}
                type="button"
                role="tab"
                aria-selected={level === lv}
                className={`btn btn-sm ${level === lv ? "btn-primary" : ""}`}
                onClick={() => setLevel(lv)}
              >
                {settings.labels.levels[lv].name}
                {!okSplit && (
                  <span className="text-danger" aria-label="does not add up">
                    {" "}
                    !
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {BUCKETS.map((b) => (
            <NumInput
              key={`${level}-${b}`}
              label={settings.labels.buckets[b]}
              value={d[level][b]}
              suffix="%"
              onChange={(v) => {
                s.touch();
                setD((x) => ({ ...x, [level]: { ...x[level], [b]: v } }));
              }}
            />
          ))}
        </div>
        <p
          className={`mt-3 text-sm font-medium ${isCompleteSplit(current) ? "text-ok" : "text-danger"}`}
          aria-live="polite"
        >
          Total for {settings.labels.levels[level].name}: {formatPct(total, 2)}
          {!isCompleteSplit(current) && " (must be 100%)"}
        </p>
        {LEVELS.filter((lv) => s.errors[`splits.${lv}`]).map((lv) => (
          <p key={lv} className="error" role="alert">
            {settings.labels.levels[lv].name}: {s.errors[`splits.${lv}`]}
          </p>
        ))}
        <SaveBar
          saved={s.saved}
          hasErrors={Object.keys(s.errors).length > 0}
          extra={
            <button
              type="button"
              className="btn"
              onClick={() => {
                const src = d[level];
                s.touch();
                setD(
                  Object.fromEntries(LEVELS.map((lv) => [lv, { ...src }])) as Record<
                    Level,
                    Record<string, string>
                  >,
                );
              }}
            >
              Use this split for all levels
            </button>
          }
        />
      </Card>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* Tax                                                                  */
/* ------------------------------------------------------------------ */

function TaxSection({ settings, onSave }: { settings: Settings; onSave: (s: Settings) => void }) {
  const s = useSectionSave(onSave);
  const [enabled, setEnabled] = useState(settings.tax.enabled);
  const [rate, setRate] = useState(pct(settings.tax.rate));
  function submit(e: FormEvent) {
    e.preventDefault();
    s.save({ ...settings, tax: { enabled, rate: fromPct(rate) } });
  }
  return (
    <form onSubmit={submit} noValidate>
      <Card title="Tax">
        <div className="flex items-center gap-2">
          <input
            id="taxEnabled"
            type="checkbox"
            className="h-4 w-4 accent-[rgb(var(--c-accent))]"
            checked={enabled}
            onChange={(e) => {
              s.touch();
              setEnabled(e.target.checked);
            }}
          />
          <label htmlFor="taxEnabled" className="text-sm">
            Let me enter income pre-tax and deduct tax before splitting it
          </label>
        </div>
        {enabled && (
          <div className="mt-3 max-w-xs">
            <NumInput
              label="Tax rate"
              value={rate}
              onChange={(v) => {
                s.touch();
                setRate(v);
              }}
              error={s.errors["tax.rate"]}
              suffix="%"
            />
          </div>
        )}
        <SaveBar saved={s.saved} hasErrors={Object.keys(s.errors).length > 0} />
      </Card>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* Appearance                                                           */
/* ------------------------------------------------------------------ */

function AppearanceSection({ theme, onTheme }: { theme: Theme; onTheme: (t: Theme) => void }) {
  return (
    <Card title="Appearance">
      <fieldset>
        <legend className="label">Theme</legend>
        <div className="mt-2 grid max-w-md grid-cols-2 gap-2">
          {(["dark", "light"] as const).map((t) => (
            <label
              key={t}
              className={`flex cursor-pointer items-center gap-2 rounded-xl border p-3 text-sm ${theme === t ? "border-accent" : "border-line"}`}
            >
              <input
                type="radio"
                name="theme"
                value={t}
                checked={theme === t}
                onChange={() => onTheme(t)}
                className="accent-[rgb(var(--c-accent))]"
              />
              {t === "dark" ? "Dark" : "Light"}
            </label>
          ))}
        </div>
        <p className="hint">Applies immediately and is remembered on this device.</p>
      </fieldset>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Names & labels                                                       */
/* ------------------------------------------------------------------ */

function LabelsSection({
  settings,
  onSave,
}: {
  settings: Settings;
  onSave: (s: Settings) => void;
}) {
  const s = useSectionSave(onSave);
  const [l, setL] = useState<Settings["labels"]>(() => JSON.parse(JSON.stringify(settings.labels)));
  const update = (fn: (x: Settings["labels"]) => Settings["labels"]) => {
    s.touch();
    setL(fn);
  };
  function submit(e: FormEvent) {
    e.preventDefault();
    s.save({ ...settings, labels: l });
  }
  const text = (
    label: string,
    value: string,
    onChange: (v: string) => void,
    error?: string,
    className = "",
  ) => (
    <Field label={label} error={error} className={className}>
      {(p) => (
        <input {...p} className="input" value={value} onChange={(e) => onChange(e.target.value)} />
      )}
    </Field>
  );
  return (
    <form onSubmit={submit} noValidate>
      <Card title="Names & labels">
        <div className="grid gap-3 sm:grid-cols-2">
          {text(
            "App name",
            l.appName,
            (v) => update((x) => ({ ...x, appName: v })),
            s.errors["labels.appName"],
          )}
          {text(
            "Final level message",
            l.finalMessage,
            (v) => update((x) => ({ ...x, finalMessage: v })),
            s.errors["labels.finalMessage"],
          )}
        </div>
        <h3 className="mb-2 mt-5 text-sm font-semibold">Levels</h3>
        <div className="space-y-3">
          {LEVELS.map((lv) => (
            <div key={lv} className="grid gap-3 sm:grid-cols-3">
              {text(
                `${lv} name`,
                l.levels[lv].name,
                (v) =>
                  update((x) => ({
                    ...x,
                    levels: { ...x.levels, [lv]: { ...x.levels[lv], name: v } },
                  })),
                s.errors[`labels.levels.${lv}.name`],
              )}
              {text(
                `${lv} meaning`,
                l.levels[lv].meaning,
                (v) =>
                  update((x) => ({
                    ...x,
                    levels: { ...x.levels, [lv]: { ...x.levels[lv], meaning: v } },
                  })),
                s.errors[`labels.levels.${lv}.meaning`],
                "sm:col-span-2",
              )}
            </div>
          ))}
        </div>
        <h3 className="mb-2 mt-5 text-sm font-semibold">Buckets</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          {BUCKETS.map((b) => (
            <div key={b}>
              {text(
                defaultSettings().labels.buckets[b],
                l.buckets[b],
                (v) => update((x) => ({ ...x, buckets: { ...x.buckets, [b]: v } })),
                s.errors[`labels.buckets.${b}`],
              )}
            </div>
          ))}
        </div>
        <SaveBar saved={s.saved} hasErrors={Object.keys(s.errors).length > 0} />
      </Card>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* Backup & data                                                        */
/* ------------------------------------------------------------------ */

type Pending = { kind: "reset" } | { kind: "delete" } | { kind: "import"; data: AppData } | null;

function DataSection({
  data,
  today,
  onSaveSettings,
  onReplaceData,
  onDeleteAll,
  onAfterReset,
}: Pick<Props, "data" | "today" | "onSaveSettings" | "onReplaceData" | "onDeleteAll"> & {
  onAfterReset: () => void;
}) {
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [exportError, setExportError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [done, setDone] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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

  return (
    <div className="space-y-4">
      <Card title="Backup">
        <p className="mb-3 text-sm text-muted">
          Everything is stored only on this device. Export a backup regularly.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() =>
              save(`wealthy-backup-${today}.json`, exportJSON(data), "application/json")
            }
          >
            Export backup (JSON)
          </button>
          <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
            Import backup (JSON)
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
        </div>
        <h3 className="mb-2 mt-5 text-sm font-semibold">Spreadsheets</h3>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn"
            onClick={() =>
              save(`wealthy-ledger-${today}.csv`, transactionsToCSV(data.transactions), "text/csv")
            }
          >
            Export ledger (CSV)
          </button>
          <button
            type="button"
            className="btn"
            onClick={() =>
              save(`wealthy-holdings-${today}.csv`, holdingsToCSV(data.holdings), "text/csv")
            }
          >
            Export holdings (CSV)
          </button>
        </div>
        {done && (
          <div className="mt-3">
            <Alert tone="ok">{done}</Alert>
          </div>
        )}
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

      <Card title="Reset and delete">
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn" onClick={() => setPending({ kind: "reset" })}>
            Reset settings to defaults
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => setPending({ kind: "delete" })}
          >
            Delete all data
          </button>
        </div>
      </Card>

      <ConfirmDialog
        open={pending?.kind === "reset"}
        title="Reset settings to defaults?"
        message="Your survival budget is kept. Thresholds, income splits, tax and labels go back to defaults. Your ledger and holdings are not touched."
        confirmLabel="Reset"
        onCancel={() => setPending(null)}
        onConfirm={() => {
          onSaveSettings({
            ...defaultSettings(),
            monthlySurvivalB: data.settings.monthlySurvivalB,
          });
          onAfterReset();
          setDone("Settings reset to defaults.");
          setPending(null);
        }}
      />
      <ConfirmDialog
        open={pending?.kind === "import"}
        title="Overwrite all data?"
        message={
          pending?.kind === "import"
            ? `Import ${pending.data.transactions.length} ledger entries, ${pending.data.holdings.length} holdings and ${pending.data.snapshots.length} history points. Your current data will be replaced.`
            : ""
        }
        confirmLabel="Overwrite"
        danger
        onCancel={() => setPending(null)}
        onConfirm={() => {
          if (pending?.kind === "import") {
            onReplaceData(pending.data);
            onAfterReset();
            setDone("Backup imported.");
          }
          setPending(null);
        }}
      />
      <ConfirmDialog
        open={pending?.kind === "delete"}
        title="Delete all data?"
        message="Your whole ledger, holdings, history and settings will be erased from this device. Export a backup first if you might need it."
        confirmLabel="Delete everything"
        danger
        onCancel={() => setPending(null)}
        onConfirm={() => {
          onDeleteAll();
          onAfterReset();
          setDone("All data deleted.");
          setPending(null);
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Shell                                                                */
/* ------------------------------------------------------------------ */

export function SettingsPanel(props: Props) {
  const [section, setSection] = useState<SectionId>("budget");
  // Bumped after a reset/import so section forms re-read the new settings.
  const [version, setVersion] = useState(0);
  const { data, onSaveSettings } = props;
  const settings = data.settings;
  const key = `${section}-${version}`;

  return (
    <div className="grid gap-4 md:grid-cols-[200px_minmax(0,1fr)]">
      <nav aria-label="Settings sections" className="min-w-0 md:sticky md:top-28 md:self-start">
        <ul className="-mx-4 flex gap-1 overflow-x-auto px-4 md:mx-0 md:flex-col md:px-0">
          {SECTIONS.map((sct) => (
            <li key={sct.id}>
              <button
                type="button"
                aria-current={section === sct.id ? "page" : undefined}
                onClick={() => setSection(sct.id)}
                className={`w-full whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm font-medium ${
                  section === sct.id
                    ? "bg-accent/15 text-accent"
                    : "text-muted hover:bg-raised hover:text-fg"
                }`}
              >
                {sct.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <div className="min-w-0">
        {section === "budget" && (
          <BudgetSection key={key} settings={settings} onSave={onSaveSettings} />
        )}
        {section === "split" && (
          <SplitSection key={key} settings={settings} onSave={onSaveSettings} />
        )}
        {section === "tax" && <TaxSection key={key} settings={settings} onSave={onSaveSettings} />}
        {section === "appearance" && (
          <AppearanceSection theme={props.theme} onTheme={props.onTheme} />
        )}
        {section === "labels" && (
          <LabelsSection key={key} settings={settings} onSave={onSaveSettings} />
        )}
        {section === "data" && (
          <DataSection {...props} onAfterReset={() => setVersion((v) => v + 1)} />
        )}
      </div>
    </div>
  );
}
