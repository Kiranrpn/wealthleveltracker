import {
  BUCKETS,
  LEVELS,
  LIQUID_BUCKETS,
  type AppData,
  type Bucket,
  type Holding,
  type Level,
  type Settings,
  type Snapshot,
  type Split,
  type Transaction,
} from "./types";

/* ------------------------------------------------------------------ */
/* Numeric safety                                                       */
/* ------------------------------------------------------------------ */

/** Coerces anything that is not a finite, non-negative number to 0. */
export function safeAmount(value: number | undefined | null): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

/** Any finite number (sign kept), else 0. */
export function finite(value: number | undefined | null): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** Division that never yields NaN or Infinity. Returns `fallback` when the result would not be finite. */
export function safeDivide(numerator: number, denominator: number, fallback = 0): number {
  if (denominator === 0) return fallback;
  const result = numerator / denominator;
  return Number.isFinite(result) ? result : fallback;
}

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/** Rounds to paise, avoiding floating point dust like 0.30000000000000004. */
export function roundMoney(value: number): number {
  return Math.round(finite(value) * 100) / 100;
}

/* ------------------------------------------------------------------ */
/* Ledger balances                                                      */
/* ------------------------------------------------------------------ */

export type Balances = Record<Bucket, number>;

export function zeroBalances(): Balances {
  return Object.fromEntries(BUCKETS.map((b) => [b, 0])) as Balances;
}

/** Balance of every bucket: the sum of all postings to it. */
export function balances(transactions: readonly Transaction[]): Balances {
  const out = zeroBalances();
  for (const tx of transactions) {
    for (const p of tx.postings) out[p.bucket] += finite(p.amount);
  }
  for (const b of BUCKETS) out[b] = roundMoney(out[b]);
  return out;
}

export function isLiquidBucket(bucket: Bucket): boolean {
  return LIQUID_BUCKETS.includes(bucket);
}

/** Sum of the Emergency and C1 Liquid balances. Negative balances count as 0. */
export function liquidTotal(bal: Balances): number {
  return LIQUID_BUCKETS.reduce((sum, b) => sum + safeAmount(bal[b]), 0);
}

/* ------------------------------------------------------------------ */
/* Levels                                                               */
/* ------------------------------------------------------------------ */

export type Thresholds = Settings["thresholds"];

export function annualB(monthlyB: number): number {
  return safeAmount(monthlyB) * 12;
}

/** Ratio floor of a level: L0 starts at 0. */
export function levelFloor(level: Level, thresholds: Thresholds): number {
  return level === "L0" ? 0 : thresholds[level];
}

export function nextLevel(level: Level): Level | null {
  const i = LEVELS.indexOf(level);
  return i < LEVELS.length - 1 ? LEVELS[i + 1] : null;
}

export function levelIndex(level: Level): number {
  return LEVELS.indexOf(level);
}

/**
 * Level from liquid total and annual B. Compares money against threshold money (not ratio
 * against threshold) so the level always agrees with the gap. A value exactly on a boundary
 * belongs to the higher level. Requires annual > 0.
 */
export function levelFor(liquid: number, annual: number, thresholds: Thresholds): Level {
  if (liquid >= thresholds.L3 * annual) return "L3";
  if (liquid >= thresholds.L2 * annual) return "L2";
  if (liquid >= thresholds.L1 * annual) return "L1";
  return "L0";
}

export const BUDGET_PROMPT = "Set your survival budget in Settings";

export interface NoBudgetStatus {
  kind: "NO_BUDGET";
  message: string;
  liquidTotal: number;
}

export interface LevelStatus {
  kind: "OK";
  liquidTotal: number;
  annualB: number;
  ratio: number;
  level: Level;
  nextLevel: Level | null;
  /** INR needed in liquid buckets to reach the next level. null at the final level. */
  nextThresholdValue: number | null;
  /** INR still missing. null at the final level. */
  gap: number | null;
  /** Progress within the current level, 0 to 100. */
  progressPct: number;
}

export type Status = NoBudgetStatus | LevelStatus;

export function computeStatus(settings: Settings, bal: Balances): Status {
  const liquid = liquidTotal(bal);
  const annual = annualB(settings.monthlySurvivalB);
  if (annual <= 0) return { kind: "NO_BUDGET", message: BUDGET_PROMPT, liquidTotal: liquid };

  const t = settings.thresholds;
  const level = levelFor(liquid, annual, t);
  const ratio = safeDivide(liquid, annual);
  const next = nextLevel(level);
  let nextThresholdValue: number | null = null;
  let gap: number | null = null;
  let progressPct = 100;
  if (next !== null) {
    nextThresholdValue = t[next as "L1" | "L2" | "L3"] * annual;
    gap = Math.max(0, nextThresholdValue - liquid);
    const floor = levelFloor(level, t);
    progressPct = clamp(safeDivide(ratio - floor, levelFloor(next, t) - floor) * 100, 0, 100);
  }
  return {
    kind: "OK",
    liquidTotal: liquid,
    annualB: annual,
    ratio,
    level,
    nextLevel: next,
    nextThresholdValue,
    gap,
    progressPct,
  };
}

/** Level used to pick the income split: the current level, or L0 when B is not set. */
export function currentLevel(settings: Settings, bal: Balances): Level {
  const s = computeStatus(settings, bal);
  return s.kind === "OK" ? s.level : "L0";
}

/* ------------------------------------------------------------------ */
/* What-if: lifestyle upgrade                                           */
/* ------------------------------------------------------------------ */

export interface WhatIfResult {
  valid: boolean;
  message?: string;
  currentLevel: Level | null;
  newLevel: Level | null;
  newRatio: number | null;
  /** True when the new budget puts the user on a lower level than today. */
  dropsLevel: boolean;
  /** INR of extra liquid money needed to stay on the current level with the new budget. */
  shortfallToKeepLevel: number;
}

export function whatIf(settings: Settings, bal: Balances, newMonthlyB: number): WhatIfResult {
  const current = computeStatus(settings, bal);
  const currentLvl = current.kind === "OK" ? current.level : null;
  if (!Number.isFinite(newMonthlyB) || newMonthlyB <= 0) {
    return {
      valid: false,
      message: "Enter a new monthly budget greater than 0",
      currentLevel: currentLvl,
      newLevel: null,
      newRatio: null,
      dropsLevel: false,
      shortfallToKeepLevel: 0,
    };
  }
  // Always OK because newMonthlyB > 0.
  const p = computeStatus({ ...settings, monthlySurvivalB: newMonthlyB }, bal) as LevelStatus;
  const dropsLevel = currentLvl !== null && levelIndex(p.level) < levelIndex(currentLvl);
  let shortfall = 0;
  if (dropsLevel) {
    // Dropping is only possible from L1 or above.
    const keep = settings.thresholds[currentLvl as "L1" | "L2" | "L3"];
    shortfall = Math.max(0, keep * p.annualB - p.liquidTotal);
  }
  return {
    valid: true,
    currentLevel: currentLvl,
    newLevel: p.level,
    newRatio: p.ratio,
    dropsLevel,
    shortfallToKeepLevel: shortfall,
  };
}

/* ------------------------------------------------------------------ */
/* Income split                                                         */
/* ------------------------------------------------------------------ */

/** Sum of a split's fractions. */
export function splitTotal(split: Split): number {
  return BUCKETS.reduce((s, b) => s + finite(split[b]), 0);
}

/** True when the split adds up to 100% (within 0.01%). */
export function isCompleteSplit(split: Split): boolean {
  return Math.abs(splitTotal(split) - 1) < 1e-4;
}

/** Post-tax amount of an income entry. Pre-tax amounts are reduced by the tax rate when tax mode is on. */
export function netIncome(amount: number, isPretax: boolean, settings: Settings): number {
  const a = safeAmount(amount);
  if (settings.tax.enabled && isPretax) return roundMoney(a * (1 - clamp(settings.tax.rate, 0, 1)));
  return roundMoney(a);
}

/**
 * Splits `net` across buckets by `split`, in whole paise, so the parts add up exactly.
 * Any rounding remainder goes to the bucket with the largest share.
 * Returns an amount for every bucket (0 where the share is 0).
 */
export function splitAmount(net: number, split: Split): Balances {
  const paise = Math.round(safeAmount(net) * 100);
  const out = zeroBalances();
  let allocated = 0;
  let largest: Bucket = BUCKETS[0];
  for (const b of BUCKETS) {
    const share = safeAmount(split[b]);
    if (share > safeAmount(split[largest])) largest = b;
    const part = Math.floor(paise * share);
    out[b] = part;
    allocated += part;
  }
  out[largest] += paise - allocated;
  for (const b of BUCKETS) out[b] = out[b] / 100;
  return out;
}

/* ------------------------------------------------------------------ */
/* Dates                                                                */
/* ------------------------------------------------------------------ */

const DAY_MS = 86_400_000;

function isoToUtcMs(iso: string): number {
  return Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
}

/** Whole days from `fromIso` to `toIso`. Invalid dates return 0. */
export function daysBetween(fromIso: string, toIso: string): number {
  const diff = Math.floor((isoToUtcMs(toIso) - isoToUtcMs(fromIso)) / DAY_MS);
  return Number.isFinite(diff) ? diff : 0;
}

/** "YYYY-MM" for an ISO date. */
export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

/** The `count` month keys ending with the month of `todayIso`, oldest first. */
export function lastMonthKeys(todayIso: string, count: number): string[] {
  const year = Number(todayIso.slice(0, 4));
  const month = Number(todayIso.slice(5, 7)) - 1;
  const keys: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    keys.push(new Date(Date.UTC(year, month - i, 1)).toISOString().slice(0, 7));
  }
  return keys;
}

/* ------------------------------------------------------------------ */
/* Ledger views                                                         */
/* ------------------------------------------------------------------ */

/** Newest first; same-day entries keep the order they were added (latest on top). */
export function sortNewestFirst<T extends { date: string }>(items: readonly T[]): T[] {
  return items
    .map((item, i) => ({ item, i }))
    .sort((a, b) => b.item.date.localeCompare(a.item.date) || b.i - a.i)
    .map((x) => x.item);
}

export interface MonthFlow {
  month: string; // YYYY-MM
  income: number;
  spent: number;
}

/** Net income and spending per calendar month for the `count` months ending this month, oldest first. */
export function monthlyFlows(
  transactions: readonly Transaction[],
  todayIso: string,
  count = 12,
): MonthFlow[] {
  const keys = lastMonthKeys(todayIso, count);
  const map: Record<string, MonthFlow> = Object.fromEntries(
    keys.map((k) => [k, { month: k, income: 0, spent: 0 }]),
  );
  for (const tx of transactions) {
    const row = map[monthKey(tx.date)];
    if (!row) continue;
    const total = tx.postings.reduce((s, p) => s + finite(p.amount), 0);
    if (tx.kind === "INCOME") row.income = roundMoney(row.income + total);
    if (tx.kind === "SPEND") row.spent = roundMoney(row.spent - total);
  }
  return keys.map((k) => map[k]);
}

/* ------------------------------------------------------------------ */
/* Holdings                                                             */
/* ------------------------------------------------------------------ */

/** Total current value of holdings in each bucket. */
export function parkedByBucket(holdings: readonly Holding[]): Balances {
  const out = zeroBalances();
  for (const h of holdings) out[h.bucket] = roundMoney(out[h.bucket] + safeAmount(h.currentValue));
  return out;
}

/** Holdings whose lastUpdated is more than `staleDays` days before `todayIso`. */
export function staleHoldings(
  holdings: readonly Holding[],
  staleDays: number,
  todayIso: string,
): Holding[] {
  return holdings.filter((h) => daysBetween(h.lastUpdated, todayIso) > staleDays);
}

/* ------------------------------------------------------------------ */
/* Snapshots                                                            */
/* ------------------------------------------------------------------ */

export function snapshotFromStatus(status: Status, todayIso: string): Snapshot | null {
  if (status.kind !== "OK") return null;
  return {
    date: todayIso,
    liquidTotal: status.liquidTotal,
    annualB: status.annualB,
    ratio: status.ratio,
    level: status.level,
  };
}

function sameSnapshot(a: Snapshot, b: Snapshot): boolean {
  return (
    a.date === b.date &&
    a.liquidTotal === b.liquidTotal &&
    a.annualB === b.annualB &&
    a.ratio === b.ratio &&
    a.level === b.level
  );
}

/**
 * Creates or overwrites the snapshot for the current calendar month (one per month max),
 * keeping the list sorted by date. Returns the same array instance when nothing changed.
 */
export function upsertSnapshot(
  snapshots: readonly Snapshot[],
  snapshot: Snapshot | null,
): readonly Snapshot[] {
  if (snapshot === null) return snapshots;
  const key = monthKey(snapshot.date);
  const idx = snapshots.findIndex((s) => monthKey(s.date) === key);
  if (idx >= 0 && sameSnapshot(snapshots[idx], snapshot)) return snapshots;
  const next = snapshots.filter((s) => monthKey(s.date) !== key);
  next.push(snapshot);
  next.sort((a, b) => a.date.localeCompare(b.date));
  return next;
}

/** Returns `data` with the current month's snapshot refreshed. Same instance when unchanged. */
export function withCurrentSnapshot(data: AppData, todayIso: string): AppData {
  const status = computeStatus(data.settings, balances(data.transactions));
  const snapshots = upsertSnapshot(data.snapshots, snapshotFromStatus(status, todayIso));
  return snapshots === data.snapshots ? data : { ...data, snapshots: [...snapshots] };
}

/* ------------------------------------------------------------------ */
/* Warnings                                                             */
/* ------------------------------------------------------------------ */

export type WarningKind = "NO_BUDGET" | "STALE" | "NEGATIVE";

export interface Warning {
  kind: WarningKind;
  message: string;
}

export function computeWarnings(
  settings: Settings,
  bal: Balances,
  holdings: readonly Holding[],
  todayIso: string,
): Warning[] {
  const warnings: Warning[] = [];
  if (annualB(settings.monthlySurvivalB) <= 0) {
    warnings.push({ kind: "NO_BUDGET", message: BUDGET_PROMPT });
  }
  const negative = BUCKETS.filter((b) => bal[b] < 0).map((b) => settings.labels.buckets[b]);
  if (negative.length > 0) {
    warnings.push({
      kind: "NEGATIVE",
      message: `${negative.join(", ")} ${negative.length === 1 ? "is" : "are"} below zero. Move money in or fix the entries that caused it.`,
    });
  }
  const stale = staleHoldings(holdings, settings.staleDays, todayIso).length;
  if (stale > 0) {
    warnings.push({
      kind: "STALE",
      message: `${stale} holding${stale === 1 ? "" : "s"} not updated in ${settings.staleDays}+ days. Your level may be inaccurate.`,
    });
  }
  return warnings;
}
