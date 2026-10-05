import type { AppData, Settings, Split } from "./types";

function split(p: Partial<Split>): Split {
  return {
    SURVIVAL: 0,
    EMERGENCY: 0,
    C1_LIQUID: 0,
    C2A_BUSINESS: 0,
    C2B_ILLIQUID: 0,
    SPLURGE: 0,
    ...p,
  };
}

/**
 * Default income splits.
 * - Savings share of income by level: 45% / 55% / 60% / 55% (original spec).
 * - Savings split between liquid and illiquid corpus: L0 100/0, L1 80/20, L2 60/40, L3 40/60.
 *   At L0 the liquid part builds the emergency fund.
 */
export const DEFAULT_SETTINGS: Settings = {
  monthlySurvivalB: 0,
  thresholds: { L1: 1.25, L2: 10, L3: 35 },
  splits: {
    L0: split({ SURVIVAL: 0.5, EMERGENCY: 0.45, SPLURGE: 0.05 }),
    L1: split({ SURVIVAL: 0.4, C1_LIQUID: 0.44, C2B_ILLIQUID: 0.11, SPLURGE: 0.05 }),
    L2: split({ SURVIVAL: 0.35, C1_LIQUID: 0.36, C2B_ILLIQUID: 0.24, SPLURGE: 0.05 }),
    L3: split({ SURVIVAL: 0.35, C1_LIQUID: 0.22, C2B_ILLIQUID: 0.33, SPLURGE: 0.1 }),
  },
  targets: {
    SURVIVAL: { mode: "MONTHS_OF_B", months: 1 },
    // 15 months = 1.25 years of B, the same line that marks L1.
    EMERGENCY: { mode: "MONTHS_OF_B", months: 15 },
    C1_LIQUID: { mode: "NEXT_LEVEL" },
    C2A_BUSINESS: { mode: "NONE" },
    C2B_ILLIQUID: { mode: "NONE" },
    SPLURGE: { mode: "NONE" },
  },
  staleDays: 90,
  tax: { enabled: false, rate: 0.3 },
  labels: {
    appName: "Wealthy?",
    levels: {
      L0: { name: "L0", meaning: "Building your emergency fund" },
      L1: { name: "L1", meaning: "Emergency fund done, growing corpus to sustainability" },
      L2: { name: "L2", meaning: "Corpus pays part of survival" },
      L3: { name: "L3", meaning: "Corpus can cover survival. Salary job is a choice" },
    },
    finalMessage: "YOU DID IT",
    buckets: {
      SURVIVAL: "Survival",
      EMERGENCY: "Emergency",
      C1_LIQUID: "Corpus - Liquid",
      C2A_BUSINESS: "Corpus - Own Business",
      C2B_ILLIQUID: "Corpus - Illiquid",
      SPLURGE: "Splurge",
    },
  },
};

/** Defaults from earlier versions. Saved values still equal to these are upgraded on load. */
export const LEGACY_DEFAULTS = {
  bucketLabels: {
    C1_LIQUID: "C1 Liquid",
    C2A_BUSINESS: "C2a Business",
    C2B_ILLIQUID: "C2b Illiquid",
  },
  splits: {
    L1: {
      SURVIVAL: 0.4,
      EMERGENCY: 0,
      C1_LIQUID: 0.55,
      C2A_BUSINESS: 0,
      C2B_ILLIQUID: 0,
      SPLURGE: 0.05,
    },
    L2: {
      SURVIVAL: 0.35,
      EMERGENCY: 0,
      C1_LIQUID: 0.6,
      C2A_BUSINESS: 0,
      C2B_ILLIQUID: 0,
      SPLURGE: 0.05,
    },
    L3: {
      SURVIVAL: 0.35,
      EMERGENCY: 0,
      C1_LIQUID: 0.55,
      C2A_BUSINESS: 0,
      C2B_ILLIQUID: 0,
      SPLURGE: 0.1,
    },
  } as Partial<Record<"L1" | "L2" | "L3", Split>>,
};

export function defaultSettings(): Settings {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as Settings;
}

export function emptyAppData(): AppData {
  return {
    schemaVersion: 2,
    settings: defaultSettings(),
    transactions: [],
    holdings: [],
    snapshots: [],
  };
}
