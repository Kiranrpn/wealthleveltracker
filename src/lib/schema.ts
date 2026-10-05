import { z } from "zod";
import { BUCKETS, C2_BUCKETS, INCOME_SOURCES, LEVELS } from "./types";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** True for a real calendar date in YYYY-MM-DD form (rejects 2026-02-30). */
export function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export const isoDateSchema = z
  .string({ required_error: "Date is required", invalid_type_error: "Date must be text" })
  .refine(isValidIsoDate, { message: "Enter a valid date (YYYY-MM-DD)" });

const money = (label: string) =>
  z
    .number({
      required_error: `${label} is required`,
      invalid_type_error: `${label} must be a number`,
    })
    .finite(`${label} must be a finite number`)
    .nonnegative(`${label} cannot be negative`);

const fraction = (label: string, max = 1) =>
  z
    .number({ invalid_type_error: `${label} must be a number` })
    .finite(`${label} must be a finite number`)
    .min(0, `${label} cannot be negative`)
    .max(max, `${label} cannot exceed ${Math.round(max * 100)}%`);

const label = (what: string, max: number) =>
  z
    .string()
    .trim()
    .min(1, `${what} cannot be empty`)
    .max(max, `${what} must be ${max} characters or fewer`);

export const bucketSchema = z.enum(BUCKETS, {
  errorMap: () => ({ message: `Bucket must be one of: ${BUCKETS.join(", ")}` }),
});

export const holdingSchema = z
  .object({
    id: z.string().min(1, "id is required"),
    name: label("Name", 120),
    bucket: bucketSchema,
    type: z.string().trim().max(80, "Type must be 80 characters or fewer"),
    whereParked: z.string().trim().max(120, "Where parked must be 120 characters or fewer"),
    investedAmount: money("Invested amount"),
    currentValue: money("Current value"),
    lastUpdated: isoDateSchema,
    netAnnualIncome: money("Net annual income").optional(),
    incomeIsReliable: z.boolean().optional(),
    notes: z.string().max(1000, "Notes must be 1000 characters or fewer").optional(),
  })
  .transform((h) => {
    // Income fields only mean something for C2 buckets; drop them elsewhere.
    if (C2_BUCKETS.includes(h.bucket)) return h;
    const { netAnnualIncome: _n, incomeIsReliable: _r, ...rest } = h;
    void _n;
    void _r;
    return rest;
  });

export const incomeEntrySchema = z.object({
  id: z.string().min(1, "id is required"),
  date: isoDateSchema,
  source: z.enum(INCOME_SOURCES, {
    errorMap: () => ({ message: `Source must be one of: ${INCOME_SOURCES.join(", ")}` }),
  }),
  amount: money("Amount").positive("Amount must be greater than 0"),
  isPretax: z.boolean().optional(),
  notes: z.string().max(1000, "Notes must be 1000 characters or fewer").optional(),
});

const levelLabelSchema = z.object({
  name: label("Level name", 30),
  meaning: label("Level meaning", 200),
});

export const settingsSchema = z.object({
  monthlySurvivalB: money("Monthly survival budget"),
  thresholds: z
    .object({
      L1: z.number().finite().positive("L1 threshold must be greater than 0"),
      L2: z.number().finite().positive("L2 threshold must be greater than 0"),
      L3: z.number().finite().positive("L3 threshold must be greater than 0"),
    })
    .refine((t) => t.L1 < t.L2 && t.L2 < t.L3, {
      message: "Thresholds must increase: L1 < L2 < L3",
    }),
  savingsShare: z.object({
    L0: fraction("L0 savings share"),
    L1: fraction("L1 savings share"),
    L2: fraction("L2 savings share"),
  }),
  expectedReturn: z
    .number()
    .finite()
    .min(-0.5, "Expected return cannot be below -50%")
    .max(1, "Expected return cannot exceed 100%"),
  inflationRate: fraction("Inflation rate", 0.5),
  staleDays: z
    .number()
    .int("Stale days must be a whole number")
    .min(1, "Stale days must be at least 1")
    .max(3650, "Stale days cannot exceed 3650"),
  tax: z.object({
    enabled: z.boolean(),
    rate: fraction("Tax rate", 0.99),
  }),
  labels: z.object({
    appName: label("App name", 40),
    levels: z.object({
      L0: levelLabelSchema,
      L1: levelLabelSchema,
      L2: levelLabelSchema,
      L3: levelLabelSchema,
    }),
    finalMessage: label("Final message", 80),
    buckets: z.object({
      EMERGENCY: label("Bucket label", 40),
      C1_LIQUID: label("Bucket label", 40),
      C2A_BUSINESS: label("Bucket label", 40),
      C2B_ILLIQUID: label("Bucket label", 40),
      SPLURGE: label("Bucket label", 40),
    }),
  }),
});

export const snapshotSchema = z.object({
  date: isoDateSchema,
  liquidTotal: money("Snapshot liquid total"),
  effectiveAnnualB: money("Snapshot effective annual B"),
  ratio: z.number().finite().nonnegative().nullable(),
  level: z.enum(LEVELS),
});

export const appDataSchema = z.object({
  schemaVersion: z.literal(1),
  settings: settingsSchema,
  holdings: z.array(holdingSchema),
  income: z.array(incomeEntrySchema),
  snapshots: z.array(snapshotSchema),
});

/** Flattens Zod issues into "path: message" strings for display. */
export function formatZodIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.join(".");
    return path ? `${path}: ${issue.message}` : issue.message;
  });
}

/** Maps Zod issues to a { fieldName: firstMessage } object for inline form errors. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}
