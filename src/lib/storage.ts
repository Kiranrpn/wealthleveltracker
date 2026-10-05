import { defaultSettings, emptyAppData } from "./defaults";
import { appDataSchema, formatZodIssues } from "./schema";
import type { AppData, Holding, IncomeEntry, Settings } from "./types";

export const STORAGE_KEY = "wealthy-app-data";
export const CURRENT_SCHEMA_VERSION = 1;

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

/** Deep-merges `patch` over `base` for plain objects. Arrays and primitives in `patch` win. */
function deepMerge<T>(base: T, patch: unknown): T {
  if (!isRecord(base) || !isRecord(patch)) return (patch === undefined ? base : patch) as T;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    out[k] = k in base ? deepMerge((base as Record<string, unknown>)[k], v) : v;
  }
  return out as T;
}

/**
 * Brings raw parsed JSON up to the current schema.
 * - No schemaVersion (pre-release v0): treated as v1 with missing fields filled.
 * - v1: settings deep-merged over defaults so settings added later (tax, labels) get defaults.
 * - Newer than supported: rejected.
 * Output still has to pass Zod validation.
 */
export function migrate(raw: unknown): Result<unknown> {
  if (!isRecord(raw)) return { ok: false, errors: ["Backup must be a JSON object"] };
  const version = raw.schemaVersion ?? 0;
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
  const settings: Settings = deepMerge(defaultSettings(), raw.settings ?? {});
  return {
    ok: true,
    data: {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      settings,
      holdings: raw.holdings ?? [],
      income: raw.income ?? [],
      snapshots: raw.snapshots ?? [],
    },
  };
}

/** Parse, migrate and validate an AppData JSON string. */
export function parseAppData(text: string): Result<AppData> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, errors: ["File is not valid JSON"] };
  }
  const migrated = migrate(raw);
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
      "netAnnualIncome",
      "incomeIsReliable",
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
      h.netAnnualIncome,
      h.incomeIsReliable,
      h.notes,
    ]),
  );
}

export function incomeToCSV(income: readonly IncomeEntry[]): string {
  return toCsv(
    ["id", "date", "source", "amount", "isPretax", "notes"],
    income.map((e) => [e.id, e.date, e.source, e.amount, e.isPretax, e.notes]),
  );
}

/** Random id. Uses crypto.randomUUID when available. */
export function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
