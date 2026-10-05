import { averageMonthlyIncome, computeStatus, safeAmount } from "./calc";
import type { Holding, IncomeEntry, Level, Settings } from "./types";

/** Simulation stops after this many months (50 years) and reports "not reachable". */
export const MAX_ETA_MONTHS = 600;

export interface EtaSimulationInput {
  /** Liquid total today, INR. */
  startLiquid: number;
  /** INR added to liquid buckets at the end of every month. Held flat (conservative). */
  monthlyContribution: number;
  /** Next level's threshold value today, INR. Grows with inflation each month. */
  target: number;
  /** Nominal annual return on liquid holdings, e.g. 0.10. Applied as annualReturn / 12 per month. */
  annualReturn: number;
  /** Annual inflation, e.g. 0.06. Applied as annualInflation / 12 per month to the target. */
  annualInflation: number;
  maxMonths?: number;
}

export interface EtaPoint {
  month: number;
  liquid: number;
  target: number;
}

export type EtaSimulationResult =
  | { kind: "NOT_REACHABLE"; reason: string }
  | { kind: "REACHABLE"; months: number; finalLiquid: number; finalTarget: number };

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

/**
 * Month-by-month simulation. Each month:
 *   liquid = liquid * (1 + annualReturn / 12) + contribution
 *   target = target * (1 + annualInflation / 12)
 * Returns the first month where liquid >= target (0 when already there).
 *
 * Rule: with no contribution the goal is "not reachable" even if returns beat inflation,
 * because the ETA is meant to measure progress you are funding, not a market bet.
 */
export function simulateEta(input: EtaSimulationInput): EtaSimulationResult {
  const maxMonths = input.maxMonths ?? MAX_ETA_MONTHS;
  let liquid = safeAmount(input.startLiquid);
  let target = safeAmount(input.target);
  const contribution = safeAmount(input.monthlyContribution);
  const r = finiteOr(input.annualReturn, 0) / 12;
  const i = finiteOr(input.annualInflation, 0) / 12;

  if (liquid >= target) {
    return { kind: "REACHABLE", months: 0, finalLiquid: liquid, finalTarget: target };
  }
  if (contribution <= 0) {
    return { kind: "NOT_REACHABLE", reason: "No money is being added to liquid buckets." };
  }

  for (let month = 1; month <= maxMonths; month++) {
    liquid = liquid * (1 + r) + contribution;
    target = target * (1 + i);
    if (!Number.isFinite(liquid) || !Number.isFinite(target)) break;
    if (liquid >= target) {
      return { kind: "REACHABLE", months: month, finalLiquid: liquid, finalTarget: target };
    }
  }
  return {
    kind: "NOT_REACHABLE",
    reason: `Not reached within ${Math.round(maxMonths / 12)} years at the current pace.`,
  };
}

export type EtaResult =
  | { kind: "NO_BUDGET" }
  | { kind: "FINAL" }
  | { kind: "NO_DATA" }
  | { kind: "NOT_REACHABLE"; reason: string; monthlyContribution: number; averageIncome: number }
  | {
      kind: "REACHABLE";
      months: number;
      /** ISO date (YYYY-MM-DD, first of the month) when the next level is projected. */
      etaDate: string;
      nextLevel: Level;
      monthlyContribution: number;
      averageIncome: number;
      savingsShare: number;
      targetAtEta: number;
    };

function addMonths(todayIso: string, months: number): string {
  const y = Number(todayIso.slice(0, 4));
  const m = Number(todayIso.slice(5, 7)) - 1;
  return new Date(Date.UTC(y, m + months, 1)).toISOString().slice(0, 10);
}

/**
 * ETA to the next level.
 * Monthly contribution = 6-month average net income x savings share for the current level.
 */
export function computeEta(
  settings: Settings,
  holdings: readonly Holding[],
  income: readonly IncomeEntry[],
  todayIso: string,
): EtaResult {
  const status = computeStatus(settings, holdings);
  if (status.kind === "NO_BUDGET") return { kind: "NO_BUDGET" };
  if (status.nextLevel === null) return { kind: "FINAL" };

  const avg = averageMonthlyIncome(income, settings, todayIso, 6);
  if (avg === null) return { kind: "NO_DATA" };

  const share = settings.savingsShare[status.level as "L0" | "L1" | "L2"];
  const contribution = avg * share;
  const sim = simulateEta({
    startLiquid: status.liquidTotal,
    monthlyContribution: contribution,
    target: status.nextThresholdValue as number,
    annualReturn: settings.expectedReturn,
    annualInflation: settings.inflationRate,
  });

  if (sim.kind === "NOT_REACHABLE") {
    return {
      kind: "NOT_REACHABLE",
      reason: sim.reason,
      monthlyContribution: contribution,
      averageIncome: avg,
    };
  }
  return {
    kind: "REACHABLE",
    months: sim.months,
    etaDate: addMonths(todayIso, sim.months),
    nextLevel: status.nextLevel,
    monthlyContribution: contribution,
    averageIncome: avg,
    savingsShare: share,
    targetAtEta: sim.finalTarget,
  };
}
