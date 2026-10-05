export const BUCKETS = [
  "SURVIVAL",
  "EMERGENCY",
  "C1_LIQUID",
  "C2A_BUSINESS",
  "C2B_ILLIQUID",
  "SPLURGE",
] as const;
export type Bucket = (typeof BUCKETS)[number];

/** Buckets whose ledger balance counts toward the liquid total (and therefore the level). */
export const LIQUID_BUCKETS: readonly Bucket[] = ["EMERGENCY", "C1_LIQUID"];

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

/** Share of each income entry that goes to each bucket, as fractions summing to 1. */
export type Split = Record<Bucket, number>;

/** One line of a transaction: positive adds to the bucket, negative takes from it. */
export interface Posting {
  bucket: Bucket;
  amount: number;
}

interface TxBase {
  id: string;
  date: string; // ISO date (YYYY-MM-DD)
  notes?: string;
  postings: Posting[];
}

/** Income split across buckets. Postings are positive and sum to the net amount. */
export interface IncomeTx extends TxBase {
  kind: "INCOME";
  source: IncomeSource;
  /** Amount as entered. Post-tax unless isPretax is true. */
  amount: number;
  isPretax?: boolean;
}

/** Money moved from one bucket to another. Two postings: -amount and +amount. */
export interface TransferTx extends TxBase {
  kind: "TRANSFER";
}

/** Money spent out of one bucket. One negative posting. */
export interface SpendTx extends TxBase {
  kind: "SPEND";
  category?: string;
}

/**
 * Balance correction: opening balances, market value changes of holdings, write-offs.
 * One posting, positive or negative.
 */
export interface AdjustTx extends TxBase {
  kind: "ADJUST";
  /** Set when the adjustment was created by a holding change. */
  holdingId?: string;
}

export type Transaction = IncomeTx | TransferTx | SpendTx | AdjustTx;
export type TxKind = Transaction["kind"];

/** Where part of a bucket's money is parked. The bucket's balance lives in the ledger. */
export interface Holding {
  id: string;
  name: string; // e.g. "Nifty 50 index fund"
  bucket: Bucket;
  type: string; // free text, e.g. "Mutual fund", "FD", "Land"
  whereParked: string; // platform, bank, or location
  investedAmount: number; // INR, >= 0
  currentValue: number; // INR, >= 0
  lastUpdated: string; // ISO date
  notes?: string;
}

export interface TaxSettings {
  /** When true, income can be entered pre-tax. */
  enabled: boolean;
  /** Tax rate applied to pre-tax income, 0 to 0.99. */
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

/**
 * What a bucket should hold.
 * - NONE: no goal.
 * - FIXED: a fixed INR amount.
 * - MONTHS_OF_B: a number of months of the survival budget B.
 * - NEXT_LEVEL (C1 Liquid only): enough, together with Emergency, to reach the next level.
 */
export type BucketTarget =
  | { mode: "NONE" }
  | { mode: "FIXED"; amount: number }
  | { mode: "MONTHS_OF_B"; months: number }
  | { mode: "NEXT_LEVEL" };
export type TargetMode = BucketTarget["mode"];

export interface Settings {
  monthlySurvivalB: number;
  thresholds: { L1: number; L2: number; L3: number }; // defaults 1.25, 10, 35
  /** Income split for each level. The split for your current level is used by default. */
  splits: Record<Level, Split>;
  /** Goal for each bucket, used to show what is short or surplus. */
  targets: Record<Bucket, BucketTarget>;
  staleDays: number; // default 90
  tax: TaxSettings;
  labels: Labels;
}

export interface Snapshot {
  date: string; // ISO date, one per calendar month max
  liquidTotal: number;
  annualB: number;
  ratio: number;
  level: Level;
}

export interface AppData {
  schemaVersion: 2;
  settings: Settings;
  transactions: Transaction[];
  holdings: Holding[];
  snapshots: Snapshot[];
}
