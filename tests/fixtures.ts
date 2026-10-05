import { defaultSettings } from "../src/lib/defaults";
import type { Bucket, Holding, IncomeEntry, Settings } from "../src/lib/types";

let seq = 0;

export function settingsWith(monthlyB: number, patch: Partial<Settings> = {}): Settings {
  return { ...defaultSettings(), monthlySurvivalB: monthlyB, ...patch };
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

export function income(
  date: string,
  amount: number,
  extra: Partial<IncomeEntry> = {},
): IncomeEntry {
  seq += 1;
  return { id: `i${seq}`, date, source: "Salary", amount, ...extra };
}

/** B = 50,000 per month, Annual B = 6,00,000 (spec section 7). */
export const B = 50_000;
export const TODAY = "2026-10-05";
