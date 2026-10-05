export const BUCKETS = [
  "EMERGENCY",
  "C1_LIQUID",
  "C2A_BUSINESS",
  "C2B_ILLIQUID",
  "SPLURGE",
] as const;
export type Bucket = (typeof BUCKETS)[number];

/** Buckets whose currentValue counts toward the liquid total (and therefore the level). */
export const LIQUID_BUCKETS: readonly Bucket[] = ["EMERGENCY", "C1_LIQUID"];
/** Buckets that may carry a net annual income. */
export const C2_BUCKETS: readonly Bucket[] = ["C2A_BUSINESS", "C2B_ILLIQUID"];

export const INCOME_SOURCES = [
  "Salary",
  "Dividend",
  "Rent",
  "Business profit",
  "Interest",
  "Exit/Secondary",
  "Other",
] as const;
export type IncomeSource = (typeof INCOME_SOURCES)[number];

export const LEVELS = ["L0", "L1", "L2", "L3"] as const;
export type Level = (typeof LEVELS)[number];

export interface Holding {
  id: string;
  name: string; // e.g. "Nifty 50 index fund"
  bucket: Bucket;
  type: string; // free text, e.g. "Mutual fund", "FD", "Land"
  whereParked: string; // platform, bank, or location
  investedAmount: number; // INR, >= 0
  currentValue: number; // INR, >= 0
  lastUpdated: string; // ISO date (YYYY-MM-DD)
  netAnnualIncome?: number; // only meaningful for C2 buckets
  incomeIsReliable?: boolean; // only meaningful for C2 buckets
  notes?: string;
}

export interface IncomeEntry {
  id: string;
  date: string; // ISO date (YYYY-MM-DD)
  source: IncomeSource;
  amount: number; // INR, > 0. Post-tax unless isPretax is true.
  /** Only used when tax mode is enabled in Settings. The tax % is deducted at calculation time. */
  isPretax?: boolean;
  notes?: string;
}

export interface TaxSettings {
  /** When true, income entries can be flagged as pre-tax. */
  enabled: boolean;
  /** Tax rate applied to pre-tax entries, 0 to 0.99. */
  rate: number;
}

export interface LevelLabel {
  name: string;
  meaning: string;
}

export interface Labels {
  appName: string;
  levels: Record<Level, LevelLabel>;
  /** Message shown at the final tracked level. */
  finalMessage: string;
  buckets: Record<Bucket, string>;
}

export interface Settings {
  monthlySurvivalB: number;
  thresholds: { L1: number; L2: number; L3: number }; // defaults 1.25, 10, 35
  savingsShare: { L0: number; L1: number; L2: number }; // defaults 0.45, 0.55, 0.60
  expectedReturn: number; // default 0.10
  inflationRate: number; // default 0.06
  staleDays: number; // default 90
  tax: TaxSettings;
  labels: Labels;
}

export interface Snapshot {
  date: string; // ISO date, one per calendar month max
  liquidTotal: number;
  effectiveAnnualB: number;
  /** null when effective annual B is 0 (reliable income covers survival, ratio is unbounded). */
  ratio: number | null;
  level: Level;
}

export interface AppData {
  schemaVersion: 1;
  settings: Settings;
  holdings: Holding[];
  income: IncomeEntry[];
  snapshots: Snapshot[];
}
