import type { AppData, Settings } from "./types";

export const DEFAULT_SETTINGS: Settings = {
  monthlySurvivalB: 0,
  thresholds: { L1: 1.25, L2: 10, L3: 35 },
  savingsShare: { L0: 0.45, L1: 0.55, L2: 0.6 },
  expectedReturn: 0.1,
  inflationRate: 0.06,
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
    schemaVersion: 1,
    settings: defaultSettings(),
    holdings: [],
    income: [],
    snapshots: [],
  };
}
