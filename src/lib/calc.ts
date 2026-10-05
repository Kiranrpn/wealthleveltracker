import {
  BUCKETS,
  C2_BUCKETS,
  LEVELS,
  LIQUID_BUCKETS,
  type AppData,
  type Bucket,
  type Holding,
  type IncomeEntry,
  type Level,
  type Settings,
  type Snapshot,
} from "./types";

/* ------------------------------------------------------------------ */
/* Numeric safety                                                       */
/* ------------------------------------------------------------------ */

/** Coerces anything that is not a finite, non-negative number to 0. */
export function safeAmount(value: number | undefined | null): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
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

/* ------------------------------------------------------------------ */
/* Holdings aggregates                                                  */
/* ------------------------------------------------------------------ */

export function isLiquidBucket(bucket: Bucket): boolean {
  return LIQUID_BUCKETS.includes(bucket);
}

export function isC2Bucket(bucket: Bucket): boolean {
  return C2_BUCKETS.includes(bucket);
}

/** Sum of currentValue for EMERGENCY and C1_LIQUID holdings only. */
export function liquidTotal(holdings: readonly Holding[]): number {
  return holdings
    .filter((h) => isLiquidBucket(h.bucket))
    .reduce((sum, h) => sum + safeAmount(h.currentValue), 0);
}

export interface BucketTotal {
  bucket: Bucket;
  invested: number;
  current: number;
  count: number;
  countsTowardLevel: boolean;
}

export function bucketTotals(holdings: readonly Holding[]): Record<Bucket, BucketTotal> {
  const totals = {} as Record<Bucket, BucketTotal>;
  for (const bucket of BUCKETS) {
    totals[bucket] = {
      bucket,
      invested: 0,
      current: 0,
      count: 0,
      countsTowardLevel: isLiquidBucket(bucket),
    };
  }
  for (const h of holdings) {
    const t = totals[h.bucket];
    t.invested += safeAmount(h.investedAmount);
    t.current += safeAmount(h.currentValue);
    t.count += 1;
  }
  return totals;
}

/** Net annual income from C2 holdings that the user marked as reliable. */
export function reliableC2Income(holdings: readonly Holding[]): number {
  return holdings
    .filter((h) => isC2Bucket(h.bucket) && h.incomeIsReliable === true)
    .reduce((sum, h) => sum + safeAmount(h.netAnnualIncome), 0);
}

export function countReliableC2(holdings: readonly Holding[]): number {
  return holdings.filter(
    (h) => isC2Bucket(h.bucket) && h.incomeIsReliable === true && safeAmount(h.netAnnualIncome) > 0,
  ).length;
}

/* ------------------------------------------------------------------ */
/* Budget                                                               */
/* ------------------------------------------------------------------ */

export function annualB(monthlyB: number): number {
  return safeAmount(monthlyB) * 12;
}

/**
 * Effective annual B = max(0, Annual B minus reliable C2 net income).
 * Reliable passive income from C2 holdings reduces what the liquid corpus must cover.
 */
export function effectiveAnnualB(annual: number, reliableIncome: number): number {
  return Math.max(0, safeAmount(annual) - safeAmount(reliableIncome));
}

/* ------------------------------------------------------------------ */
/* Levels                                                               */
/* ------------------------------------------------------------------ */

export type Thresholds = Settings["thresholds"];

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
 * Level from liquid total and effective annual B. Compares money against threshold
 * money (not ratio against threshold) so the level always agrees with the gap.
 * A value exactly on a boundary belongs to the higher level.
 */
export function levelFor(liquid: number, effAnnualB: number, thresholds: Thresholds): Level {
  if (effAnnualB <= 0) return "L3";
  if (liquid >= thresholds.L3 * effAnnualB) return "L3";
  if (liquid >= thresholds.L2 * effAnnualB) return "L2";
  if (liquid >= thresholds.L1 * effAnnualB) return "L1";
  return "L0";
}

/* ------------------------------------------------------------------ */
/* Full status                                                          */
/* ------------------------------------------------------------------ */

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
  reliableC2Income: number;
  effectiveAnnualB: number;
  /** null when effective annual B is 0: reliable income alone covers survival. */
  ratio: number | null;
  level: Level;
  /** True when reliable C2 income covers the whole annual B. */
  coveredByIncome: boolean;
  nextLevel: Level | null;
  /** INR needed in liquid buckets to reach the next level. null at the final level. */
  nextThresholdValue: number | null;
  /** INR still missing. null at the final level. */
  gap: number | null;
  /** Progress within the current level, 0 to 100. */
  progressPct: number;
}

export type Status = NoBudgetStatus | LevelStatus;

export function computeStatus(settings: Settings, holdings: readonly Holding[]): Status {
  const liquid = liquidTotal(holdings);
  const annual = annualB(settings.monthlySurvivalB);
  if (annual <= 0) {
    return { kind: "NO_BUDGET", message: BUDGET_PROMPT, liquidTotal: liquid };
  }
  const reliable = reliableC2Income(holdings);
  const eff = effectiveAnnualB(annual, reliable);
  const t = settings.thresholds;
  const level = levelFor(liquid, eff, t);
  const coveredByIncome = eff <= 0;
  const ratioValue = safeDivide(liquid, eff);
  const ratio = coveredByIncome ? null : ratioValue;
  const next = nextLevel(level);

  let nextThresholdValue: number | null = null;
  let gap: number | null = null;
  let progressPct = 100;
  // A next level only exists below L3, which implies eff > 0 and a finite ratio.
  if (next !== null) {
    nextThresholdValue = t[next as "L1" | "L2" | "L3"] * eff;
    gap = Math.max(0, nextThresholdValue - liquid);
    const floor = levelFloor(level, t);
    const ceil = levelFloor(next, t);
    progressPct = clamp(safeDivide(ratioValue - floor, ceil - floor) * 100, 0, 100);
  }

  return {
    kind: "OK",
    liquidTotal: liquid,
    annualB: annual,
    reliableC2Income: reliable,
    effectiveAnnualB: eff,
    ratio,
    level,
    coveredByIncome,
    nextLevel: next,
    nextThresholdValue,
    gap,
    progressPct,
  };
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
  newEffectiveAnnualB: number;
  /** True when the new budget puts the user on a lower level than today. */
  dropsLevel: boolean;
  /** INR of extra liquid needed to stay on the current level with the new budget. */
  shortfallToKeepLevel: number;
}

export function whatIf(
  settings: Settings,
  holdings: readonly Holding[],
  newMonthlyB: number,
): WhatIfResult {
  const current = computeStatus(settings, holdings);
  const currentLevel = current.kind === "OK" ? current.level : null;
  if (!Number.isFinite(newMonthlyB) || newMonthlyB <= 0) {
    return {
      valid: false,
      message: "Enter a new monthly budget greater than 0",
      currentLevel,
      newLevel: null,
      newRatio: null,
      newEffectiveAnnualB: 0,
      dropsLevel: false,
      shortfallToKeepLevel: 0,
    };
  }
  const projected = computeStatus({ ...settings, monthlySurvivalB: newMonthlyB }, holdings);
  // projected is always OK here because newMonthlyB > 0.
  const p = projected as LevelStatus;
  const dropsLevel = currentLevel !== null && levelIndex(p.level) < levelIndex(currentLevel);
  let shortfall = 0;
  if (dropsLevel) {
    // Dropping is only possible from L1 or above.
    const keep = settings.thresholds[currentLevel as "L1" | "L2" | "L3"];
    shortfall = Math.max(0, keep * p.effectiveAnnualB - p.liquidTotal);
  }
  return {
    valid: true,
    currentLevel,
    newLevel: p.level,
    newRatio: p.ratio,
    newEffectiveAnnualB: p.effectiveAnnualB,
    dropsLevel,
    shortfallToKeepLevel: shortfall,
  };
}

/* ------------------------------------------------------------------ */
/* Dates                                                                */
/* ------------------------------------------------------------------ */

const DAY_MS = 86_400_000;

function isoToUtcMs(iso: string): number {
  return Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
}

/** Whole days from `fromIso` to `toIso`. NaN-safe: invalid dates return 0. */
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
    const d = new Date(Date.UTC(year, month - i, 1));
    keys.push(d.toISOString().slice(0, 7));
  }
  return keys;
}

/* ------------------------------------------------------------------ */
/* Stale holdings                                                       */
/* ------------------------------------------------------------------ */

/** Holdings whose lastUpdated is more than `staleDays` days before `todayIso`. */
export function staleHoldings(
  holdings: readonly Holding[],
  staleDays: number,
  todayIso: string,
): Holding[] {
  return holdings.filter((h) => daysBetween(h.lastUpdated, todayIso) > staleDays);
}

/* ------------------------------------------------------------------ */
/* Income                                                               */
/* ------------------------------------------------------------------ */

/** Post-tax amount of an income entry. Pre-tax entries are reduced by the tax rate when tax mode is on. */
export function netIncomeAmount(entry: IncomeEntry, settings: Settings): number {
  const amount = safeAmount(entry.amount);
  if (settings.tax.enabled && entry.isPretax === true) {
    return amount * (1 - clamp(settings.tax.rate, 0, 1));
  }
  return amount;
}

export interface MonthTotal {
  month: string; // YYYY-MM
  total: number;
}

/** Net income per calendar month for the `count` months ending in the current month, oldest first. */
export function monthlyIncomeTotals(
  income: readonly IncomeEntry[],
  settings: Settings,
  todayIso: string,
  count = 12,
): MonthTotal[] {
  const keys = lastMonthKeys(todayIso, count);
  const totals: Record<string, number> = Object.fromEntries(keys.map((k) => [k, 0]));
  for (const entry of income) {
    const k = monthKey(entry.date);
    if (k in totals) totals[k] += netIncomeAmount(entry, settings);
  }
  return keys.map((k) => ({ month: k, total: totals[k] }));
}

/**
 * Average net monthly income over the last `window` calendar months (including the current one).
 * The divisor is the number of months since the first income entry inside the window, capped at
 * `window`, so a new user with one month of data is not divided by 6.
 * Returns null when there are no income entries in the window.
 */
export function averageMonthlyIncome(
  income: readonly IncomeEntry[],
  settings: Settings,
  todayIso: string,
  window = 6,
): number | null {
  const totals = monthlyIncomeTotals(income, settings, todayIso, window);
  const keys = totals.map((t) => t.month);
  const inWindow = income.filter((e) => keys.includes(monthKey(e.date)));
  if (inWindow.length === 0) return null;
  const firstKey = inWindow.map((e) => monthKey(e.date)).sort()[0];
  const months = window - keys.indexOf(firstKey);
  const sum = totals.reduce((s, t) => s + t.total, 0);
  return safeDivide(sum, months);
}

export function sortIncomeNewestFirst(income: readonly IncomeEntry[]): IncomeEntry[] {
  return [...income].sort((a, b) => b.date.localeCompare(a.date));
}

/* ------------------------------------------------------------------ */
/* Snapshots                                                            */
/* ------------------------------------------------------------------ */

export function snapshotFromStatus(status: Status, todayIso: string): Snapshot | null {
  if (status.kind !== "OK") return null;
  return {
    date: todayIso,
    liquidTotal: status.liquidTotal,
    effectiveAnnualB: status.effectiveAnnualB,
    ratio: status.ratio,
    level: status.level,
  };
}

function sameSnapshot(a: Snapshot, b: Snapshot): boolean {
  return (
    a.date === b.date &&
    a.liquidTotal === b.liquidTotal &&
    a.effectiveAnnualB === b.effectiveAnnualB &&
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
  const snap = snapshotFromStatus(computeStatus(data.settings, data.holdings), todayIso);
  const snapshots = upsertSnapshot(data.snapshots, snap);
  return snapshots === data.snapshots ? data : { ...data, snapshots: [...snapshots] };
}

/* ------------------------------------------------------------------ */
/* Warnings                                                             */
/* ------------------------------------------------------------------ */

export type WarningKind = "STALE" | "NO_BUDGET" | "RELIABLE_C2";

export interface Warning {
  kind: WarningKind;
  message: string;
}

export function computeWarnings(
  settings: Settings,
  holdings: readonly Holding[],
  todayIso: string,
): Warning[] {
  const warnings: Warning[] = [];
  if (annualB(settings.monthlySurvivalB) <= 0) {
    warnings.push({ kind: "NO_BUDGET", message: BUDGET_PROMPT });
  }
  const stale = staleHoldings(holdings, settings.staleDays, todayIso).length;
  if (stale > 0) {
    warnings.push({
      kind: "STALE",
      message: `${stale} holding${stale === 1 ? "" : "s"} not updated in ${settings.staleDays}+ days. Your level may be inaccurate.`,
    });
  }
  const reliable = countReliableC2(holdings);
  if (reliable > 0) {
    warnings.push({
      kind: "RELIABLE_C2",
      message: `${reliable} C2 holding${reliable === 1 ? " has" : "s have"} income marked reliable. Double-check it is net of costs and taxes and genuinely dependable: it lowers the corpus you need.`,
    });
  }
  return warnings;
}
