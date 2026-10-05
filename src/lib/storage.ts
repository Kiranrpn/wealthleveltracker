import { defaultSettings, emptyAppData, LEGACY_DEFAULTS } from "./defaults";
import { appDataSchema, formatZodIssues } from "./schema";
import { todayISO } from "./format";
import { BUCKETS, type AppData, type Holding, type Settings, type Transaction } from "./types";

export const STORAGE_KEY = "wealthy-app-data";
export const CURRENT_SCHEMA_VERSION = 2;

export type Result<T> = { ok: true; data: T } | { ok: false; errors: string[] };

/** Minimal Storage interface so tests can pass an in-memory implementation. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** Deep-merges `patch` over `base` for plain objects. Arrays and primitives in `patch` win. */
function deepMerge<T>(base: T, patch: unknown): T {
  if (!isRecord(base) || !isRecord(patch)) return (patch === undefined ? base : patch) as T;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    out[k] = k in base ? deepMerge((base as Record<string, unknown>)[k], v) : v;
  }
  return out as T;
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/**
 * v1 (holdings were the balances, income was a plain list) to v2 (ledger).
 * Nothing is lost and every bucket ends on the same value the v1 holdings showed:
 * - each v1 income entry becomes an INCOME transaction posted to Survival;
 * - one "Opening balance (migrated)" adjustment per bucket makes the balance equal the
 *   bucket's v1 holdings total (Survival gets minus the migrated income, so it nets to 0);
 * - C2 income fields and the ETA settings are dropped (features removed);
 * - snapshots with no ratio (income covered survival) are dropped.
 */
function migrateV1(raw: Record<string, unknown>, todayIso: string): Record<string, unknown> {
  const holdings = asArray(raw.holdings).filter(isRecord);
  const income = asArray(raw.income).filter(isRecord);
  const target: Record<string, number> = {};
  for (const h of holdings) {
    const b = String(h.bucket);
    target[b] = (target[b] ?? 0) + num(h.currentValue);
  }
  const transactions: Record<string, unknown>[] = income.map((e) => ({
    kind: "INCOME",
    id: e.id,
    date: e.date,
    source: e.source,
    amount: e.amount,
    ...(e.isPretax === true ? { isPretax: true } : {}),
    postings: [{ bucket: "SURVIVAL", amount: num(e.amount) }],
    notes: typeof e.notes === "string" && e.notes ? e.notes : "Migrated from v1",
  }));
  const incomeTotal = income.reduce((s, e) => s + num(e.amount), 0);
  target.SURVIVAL = (target.SURVIVAL ?? 0) - incomeTotal;
  for (const [bucket, amount] of Object.entries(target)) {
    const rounded = Math.round(amount * 100) / 100;
    if (rounded === 0) continue;
    transactions.push({
      kind: "ADJUST",
      id: `migrated-opening-${bucket}`,
      date: todayIso,
      postings: [{ bucket, amount: rounded }],
      notes: "Opening balance (migrated)",
    });
  }
  const snapshots = asArray(raw.snapshots)
    .filter(isRecord)
    .filter((s) => typeof s.ratio === "number")
    .map((s) => ({
      date: s.date,
      liquidTotal: s.liquidTotal,
      annualB: s.effectiveAnnualB,
      ratio: s.ratio,
      level: s.level,
    }));
  return {
    settings: raw.settings,
    transactions,
    holdings: holdings.map((h) => ({
      id: h.id,
      name: h.name,
      bucket: h.bucket,
      type: h.type,
      whereParked: h.whereParked,
      investedAmount: h.investedAmount,
      currentValue: h.currentValue,
      lastUpdated: h.lastUpdated,
      ...(h.notes !== undefined ? { notes: h.notes } : {}),
    })),
    snapshots,
  };
}

function sameSplit(a: Record<string, unknown>, b: Record<string, number>): boolean {
  return Object.keys(b).every((k) => a[k] === b[k]);
}

/**
 * Replaces settings that still hold an older version's default with the current default.
 * Anything the user changed is left alone.
 */
function upgradeUntouchedDefaults(settings: Settings): void {
  const d = defaultSettings();
  for (const [bucket, old] of Object.entries(LEGACY_DEFAULTS.bucketLabels)) {
    const b = bucket as keyof Settings["labels"]["buckets"];
    if (settings.labels.buckets[b] === old) settings.labels.buckets[b] = d.labels.buckets[b];
  }
  for (const [level, old] of Object.entries(LEGACY_DEFAULTS.splits)) {
    const lv = level as keyof Settings["splits"];
    const current = settings.splits[lv] as unknown;
    if (isRecord(current) && old && sameSplit(current, old)) settings.splits[lv] = d.splits[lv];
  }
}

/**
 * Brings raw parsed JSON up to the current schema.
 * - No schemaVersion (pre-release) or 1: migrated to the v2 ledger (see migrateV1).
 * - 2: settings deep-merged over defaults so settings added later get defaults.
 * - Newer than supported: rejected.
 * Output still has to pass Zod validation.
 */
export function migrate(raw: unknown, todayIso: string = todayISO()): Result<unknown> {
  if (!isRecord(raw)) return { ok: false, errors: ["Backup must be a JSON object"] };
  const version = raw.schemaVersion ?? 1;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 0) {
    return { ok: false, errors: ["schemaVersion must be a whole number"] };
  }
  if (version > CURRENT_SCHEMA_VERSION) {
    return {
      ok: false,
      errors: [
        `This backup uses schema version ${version}, but this app supports up to ${CURRENT_SCHEMA_VERSION}. Update the app first.`,
      ],
    };
  }
  const body = version < 2 ? migrateV1(raw, todayIso) : raw;
  const settings: Settings = deepMerge(defaultSettings(), body.settings ?? {});
  // Splits are replaced whole, never merged, so a saved split cannot pick up default shares.
  if (isRecord(body.settings) && isRecord(body.settings.splits)) {
    settings.splits = {
      ...defaultSettings().splits,
      ...(body.settings.splits as Settings["splits"]),
    };
  }
  upgradeUntouchedDefaults(settings);
  return {
    ok: true,
    data: {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      settings,
      transactions: body.transactions ?? [],
      holdings: body.holdings ?? [],
      snapshots: body.snapshots ?? [],
    },
  };
}

/** Parse, migrate and validate an AppData JSON string. */
export function parseAppData(text: string, todayIso: string = todayISO()): Result<AppData> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, errors: ["File is not valid JSON"] };
  }
  const migrated = migrate(raw, todayIso);
  if (!migrated.ok) return migrated;
  const parsed = appDataSchema.safeParse(migrated.data);
  if (!parsed.success) return { ok: false, errors: formatZodIssues(parsed.error) };
  return { ok: true, data: parsed.data as AppData };
}

export function exportJSON(data: AppData): string {
  return JSON.stringify(data, null, 2);
}

export function importJSON(text: string): Result<AppData> {
  return parseAppData(text);
}

export interface LoadResult {
  data: AppData;
  /** Set when stored data existed but could not be read. The raw text is kept under a backup key. */
  error?: string;
}

export function loadData(store: KeyValueStore): LoadResult {
  let text: string | null;
  try {
    text = store.getItem(STORAGE_KEY);
  } catch {
    return {
      data: emptyAppData(),
      error: "Browser storage is not available. Changes will not be saved.",
    };
  }
  if (text === null) return { data: emptyAppData() };
  const result = parseAppData(text);
  if (result.ok) return { data: result.data };
  try {
    store.setItem(`${STORAGE_KEY}-corrupt-${Date.now()}`, text);
  } catch {
    // Ignore: best effort only.
  }
  return {
    data: emptyAppData(),
    error: `Saved data could not be read and was set aside (${result.errors[0]}). Starting fresh.`,
  };
}

export function saveData(store: KeyValueStore, data: AppData): Result<true> {
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(data));
    return { ok: true, data: true };
  } catch {
    return {
      ok: false,
      errors: ["Could not save to browser storage (it may be full or disabled)."],
    };
  }
}

export function clearData(store: KeyValueStore): void {
  try {
    store.removeItem(STORAGE_KEY);
  } catch {
    // Ignore.
  }
}

/* ------------------------------------------------------------------ */
/* CSV                                                                  */
/* ------------------------------------------------------------------ */

/** Escapes a CSV cell. Guards against spreadsheet formula injection for text cells. */
export function csvCell(value: string | number | boolean | undefined): string {
  if (value === undefined) return "";
  if (typeof value !== "string") return String(value);
  let s = value;
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(header: string[], rows: (string | number | boolean | undefined)[][]): string {
  return [header.join(","), ...rows.map((r) => r.map(csvCell).join(","))].join("\r\n");
}

export function holdingsToCSV(holdings: readonly Holding[]): string {
  return toCsv(
    [
      "id",
      "name",
      "bucket",
      "type",
      "whereParked",
      "investedAmount",
      "currentValue",
      "lastUpdated",
      "notes",
    ],
    holdings.map((h) => [
      h.id,
      h.name,
      h.bucket,
      h.type,
      h.whereParked,
      h.investedAmount,
      h.currentValue,
      h.lastUpdated,
      h.notes,
    ]),
  );
}

/** One row per transaction with a signed column per bucket. */
export function transactionsToCSV(transactions: readonly Transaction[]): string {
  return toCsv(
    ["id", "date", "kind", "source", "category", "enteredAmount", "isPretax", ...BUCKETS, "notes"],
    transactions.map((t) => {
      const byBucket = BUCKETS.map((b) => {
        const v = t.postings.filter((p) => p.bucket === b).reduce((s, p) => s + p.amount, 0);
        return v === 0 ? undefined : Math.round(v * 100) / 100;
      });
      return [
        t.id,
        t.date,
        t.kind,
        t.kind === "INCOME" ? t.source : undefined,
        t.kind === "SPEND" ? t.category : undefined,
        t.kind === "INCOME" ? t.amount : undefined,
        t.kind === "INCOME" ? t.isPretax : undefined,
        ...byBucket,
        t.notes,
      ];
    }),
  );
}

/** Random id. Uses crypto.randomUUID when available. */
export function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
