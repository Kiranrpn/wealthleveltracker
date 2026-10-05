import { balances, type Balances } from "../src/lib/calc";
import { defaultSettings } from "../src/lib/defaults";
import type { Bucket, Holding, Settings, Transaction } from "../src/lib/types";

let seq = 0;

export function settingsWith(monthlyB: number, patch: Partial<Settings> = {}): Settings {
  return { ...defaultSettings(), monthlySurvivalB: monthlyB, ...patch };
}

/** An opening-balance adjustment. */
export function opening(bucket: Bucket, amount: number, date = "2026-10-01"): Transaction {
  seq += 1;
  return { kind: "ADJUST", id: `a${seq}`, date, postings: [{ bucket, amount }] };
}

/** Balances from a list of [bucket, amount] opening entries. */
export function bal(...entries: [Bucket, number][]): Balances {
  return balances(entries.map(([b, a]) => opening(b, a)));
}

export function holding(
  bucket: Bucket,
  currentValue: number,
  extra: Partial<Holding> = {},
): Holding {
  seq += 1;
  return {
    id: `h${seq}`,
    name: `Holding ${seq}`,
    bucket,
    type: "Test",
    whereParked: "Test bank",
    investedAmount: currentValue,
    currentValue,
    lastUpdated: "2026-10-01",
    ...extra,
  };
}

export function ids(prefix = "x"): () => string {
  let n = 0;
  return () => `${prefix}${++n}`;
}

/** B = 50,000 per month, Annual B = 6,00,000 (spec section 7). */
export const B = 50_000;
export const TODAY = "2026-10-05";
