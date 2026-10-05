import { z } from "zod";
import { BUCKETS, INCOME_SOURCES, LEVELS } from "./types";

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

export const holdingSchema = z.object({
  id: z.string().min(1, "id is required"),
  name: label("Name", 120),
  bucket: bucketSchema,
  type: z.string().trim().max(80, "Type must be 80 characters or fewer"),
  whereParked: z.string().trim().max(120, "Where parked must be 120 characters or fewer"),
  investedAmount: money("Invested amount"),
  currentValue: money("Current value"),
  lastUpdated: isoDateSchema,
  notes: z.string().max(1000, "Notes must be 1000 characters or fewer").optional(),
});

const signedMoney = z
  .number({ invalid_type_error: "Amount must be a number" })
  .finite("Amount must be a finite number");

const postingSchema = z.object({ bucket: bucketSchema, amount: signedMoney });

const txBase = {
  id: z.string().min(1, "id is required"),
  date: isoDateSchema,
  notes: z.string().max(1000, "Notes must be 1000 characters or fewer").optional(),
};

const incomeTxSchema = z.object({
  ...txBase,
  kind: z.literal("INCOME"),
  source: z.enum(INCOME_SOURCES, {
    errorMap: () => ({ message: `Source must be one of: ${INCOME_SOURCES.join(", ")}` }),
  }),
  amount: money("Amount").positive("Amount must be greater than 0"),
  isPretax: z.boolean().optional(),
  postings: z
    .array(postingSchema.extend({ amount: money("Bucket amount") }))
    .min(1, "Income must go to at least one bucket"),
});

const transferTxSchema = z.object({
  ...txBase,
  kind: z.literal("TRANSFER"),
  postings: z
    .array(postingSchema)
    .length(2, "A transfer has exactly two buckets")
    .refine((p) => p[0].bucket !== p[1].bucket, "A transfer needs two different buckets")
    .refine(
      (p) => p[0].amount < 0 && Math.abs(p[0].amount + p[1].amount) < 0.005,
      "A transfer must take from one bucket and add the same amount to the other",
    ),
});

const spendTxSchema = z.object({
  ...txBase,
  kind: z.literal("SPEND"),
  category: z.string().max(80, "Category must be 80 characters or fewer").optional(),
  postings: z
    .array(postingSchema.extend({ amount: signedMoney.negative("A spend must reduce the bucket") }))
    .length(1, "A spend comes from exactly one bucket"),
});

const adjustTxSchema = z.object({
  ...txBase,
  kind: z.literal("ADJUST"),
  holdingId: z.string().optional(),
  postings: z
    .array(postingSchema.refine((p) => p.amount !== 0, "Adjustment cannot be 0"))
    .length(1, "An adjustment changes exactly one bucket"),
});

export const transactionSchema = z.discriminatedUnion("kind", [
  incomeTxSchema,
  transferTxSchema,
  spendTxSchema,
  adjustTxSchema,
]);

const levelLabelSchema = z.object({
  name: label("Level name", 30),
  meaning: label("Level meaning", 200),
});

const splitSchema = z
  .object({
    SURVIVAL: fraction("Survival share"),
    EMERGENCY: fraction("Emergency share"),
    C1_LIQUID: fraction("C1 Liquid share"),
    C2A_BUSINESS: fraction("C2a Business share"),
    C2B_ILLIQUID: fraction("C2b Illiquid share"),
    SPLURGE: fraction("Splurge share"),
  })
  .refine((s) => Math.abs(Object.values(s).reduce((a, b) => a + b, 0) - 1) < 1e-4, {
    message: "Shares must add up to 100%",
  });

const targetSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("NONE") }),
  z.object({ mode: z.literal("FIXED"), amount: money("Goal amount") }),
  z.object({
    mode: z.literal("MONTHS_OF_B"),
    months: z
      .number({ invalid_type_error: "Months must be a number" })
      .finite("Months must be a finite number")
      .positive("Months must be greater than 0")
      .max(1200, "Months cannot exceed 1200"),
  }),
  z.object({ mode: z.literal("NEXT_LEVEL") }),
]);

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
  splits: z.object({ L0: splitSchema, L1: splitSchema, L2: splitSchema, L3: splitSchema }),
  targets: z
    .object({
      SURVIVAL: targetSchema,
      EMERGENCY: targetSchema,
      C1_LIQUID: targetSchema,
      C2A_BUSINESS: targetSchema,
      C2B_ILLIQUID: targetSchema,
      SPLURGE: targetSchema,
    })
    .refine(
      (t) => Object.entries(t).every(([b, v]) => v.mode !== "NEXT_LEVEL" || b === "C1_LIQUID"),
      {
        message: "Only C1 Liquid can use the next-level goal",
      },
    ),
  staleDays: z
    .number({ invalid_type_error: "Stale days must be a number" })
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
      SURVIVAL: label("Bucket label", 40),
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
  annualB: money("Snapshot annual B"),
  ratio: z.number().finite().nonnegative(),
  level: z.enum(LEVELS),
});

export const appDataSchema = z.object({
  schemaVersion: z.literal(2),
  settings: settingsSchema,
  transactions: z.array(transactionSchema),
  holdings: z.array(holdingSchema),
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
