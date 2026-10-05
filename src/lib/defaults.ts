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
 * Default income splits. Savings shares follow the original spec (45% / 55% / 60%):
 * at L0 savings build the emergency fund, from L1 they grow the liquid corpus.
 */
export const DEFAULT_SETTINGS: Settings = {
  monthlySurvivalB: 0,
  thresholds: { L1: 1.25, L2: 10, L3: 35 },
  splits: {
    L0: split({ SURVIVAL: 0.5, EMERGENCY: 0.45, SPLURGE: 0.05 }),
    L1: split({ SURVIVAL: 0.4, C1_LIQUID: 0.55, SPLURGE: 0.05 }),
    L2: split({ SURVIVAL: 0.35, C1_LIQUID: 0.6, SPLURGE: 0.05 }),
    L3: split({ SURVIVAL: 0.35, C1_LIQUID: 0.55, SPLURGE: 0.1 }),
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
      C1_LIQUID: "C1 Liquid",
      C2A_BUSINESS: "C2a Business",
      C2B_ILLIQUID: "C2b Illiquid",
      SPLURGE: "Splurge",
    },
  },
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
