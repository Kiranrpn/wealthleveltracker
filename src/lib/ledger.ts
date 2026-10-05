import { balances, finite, netIncome, roundMoney, safeAmount, type Balances } from "./calc";
import { isValidIsoDate } from "./schema";
import {
  BUCKETS,
  type AdjustTx,
  type Bucket,
  type Holding,
  type IncomeSource,
  type IncomeTx,
  type Posting,
  type Settings,
  type SpendTx,
  type Transaction,
  type TransferTx,
} from "./types";

export type Built<T> = { ok: true; tx: T } | { ok: false; errors: Record<string, string> };

/** Tolerance for "adds up" checks, in rupees. */
const EPS = 0.005;

function fmt(n: number): string {
  return `₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(n)}`;
}

function checkDate(date: string, errors: Record<string, string>) {
  if (!isValidIsoDate(date)) errors.date = "Enter a valid date";
}

function cleanNotes(notes?: string): string | undefined {
  const n = notes?.trim();
  return n ? n : undefined;
}

/** Balances as they would be without the transaction being edited. */
export function balancesExcluding(
  transactions: readonly Transaction[],
  excludeId?: string,
): Balances {
  return balances(excludeId ? transactions.filter((t) => t.id !== excludeId) : transactions);
}

/* ------------------------------------------------------------------ */
/* Income                                                               */
/* ------------------------------------------------------------------ */

export interface IncomeInput {
  id: string;
  date: string;
  source: IncomeSource;
  amount: number;
  isPretax: boolean;
  /** Amount going to each bucket. Must add up to the net income. */
  allocation: Partial<Record<Bucket, number>>;
  notes?: string;
}

export function buildIncome(input: IncomeInput, settings: Settings): Built<IncomeTx> {
  const errors: Record<string, string> = {};
  checkDate(input.date, errors);
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    errors.amount = "Amount must be greater than 0";
  }
  const postings: Posting[] = [];
  for (const b of BUCKETS) {
    const v = input.allocation[b];
    if (v === undefined || v === 0) continue;
    if (!Number.isFinite(v) || v < 0) {
      errors[`allocation.${b}`] = "Must be 0 or more";
      continue;
    }
    postings.push({ bucket: b, amount: roundMoney(v) });
  }
  if (!errors.amount) {
    const net = netIncome(input.amount, input.isPretax, settings);
    const sum = roundMoney(postings.reduce((s, p) => s + p.amount, 0));
    if (Math.abs(sum - net) > EPS) {
      errors.allocation = `Bucket amounts add up to ${fmt(sum)} but the income is ${fmt(net)}. Difference: ${fmt(roundMoney(net - sum))}.`;
    }
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    tx: {
      kind: "INCOME",
      id: input.id,
      date: input.date,
      source: input.source,
      amount: roundMoney(input.amount),
      ...(settings.tax.enabled && input.isPretax ? { isPretax: true } : {}),
      postings,
      ...(cleanNotes(input.notes) ? { notes: cleanNotes(input.notes) } : {}),
    },
  };
}

/* ------------------------------------------------------------------ */
/* Transfer (reallocation)                                              */
/* ------------------------------------------------------------------ */

export interface TransferInput {
  id: string;
  date: string;
  from: Bucket;
  to: Bucket;
  amount: number;
  notes?: string;
}

export function buildTransfer(
  input: TransferInput,
  available: Balances,
  labels: Record<Bucket, string>,
): Built<TransferTx> {
  const errors: Record<string, string> = {};
  checkDate(input.date, errors);
  if (input.from === input.to) errors.to = "Pick a different bucket to move money into";
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    errors.amount = "Amount must be greater than 0";
  } else if (roundMoney(input.amount) > roundMoney(available[input.from]) + EPS) {
    errors.amount = `${labels[input.from]} has only ${fmt(Math.max(0, available[input.from]))}`;
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  const amount = roundMoney(input.amount);
  return {
    ok: true,
    tx: {
      kind: "TRANSFER",
      id: input.id,
      date: input.date,
      postings: [
        { bucket: input.from, amount: -amount },
        { bucket: input.to, amount },
      ],
      ...(cleanNotes(input.notes) ? { notes: cleanNotes(input.notes) } : {}),
    },
  };
}

/* ------------------------------------------------------------------ */
/* Spend                                                                */
/* ------------------------------------------------------------------ */

export interface SpendInput {
  id: string;
  date: string;
  bucket: Bucket;
  amount: number;
  category?: string;
  notes?: string;
}

export function buildSpend(
  input: SpendInput,
  available: Balances,
  labels: Record<Bucket, string>,
): Built<SpendTx> {
  const errors: Record<string, string> = {};
  checkDate(input.date, errors);
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    errors.amount = "Amount must be greater than 0";
  } else if (roundMoney(input.amount) > roundMoney(available[input.bucket]) + EPS) {
    errors.amount = `${labels[input.bucket]} has only ${fmt(Math.max(0, available[input.bucket]))}`;
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  const category = input.category?.trim();
  return {
    ok: true,
    tx: {
      kind: "SPEND",
      id: input.id,
      date: input.date,
      postings: [{ bucket: input.bucket, amount: -roundMoney(input.amount) }],
      ...(category ? { category } : {}),
      ...(cleanNotes(input.notes) ? { notes: cleanNotes(input.notes) } : {}),
    },
  };
}

/* ------------------------------------------------------------------ */
/* Adjust (opening balance, correction)                                 */
/* ------------------------------------------------------------------ */

export interface AdjustInput {
  id: string;
  date: string;
  bucket: Bucket;
  /** Positive adds to the bucket, negative takes from it. */
  amount: number;
  notes?: string;
  holdingId?: string;
}

export function buildAdjust(input: AdjustInput): Built<AdjustTx> {
  const errors: Record<string, string> = {};
  checkDate(input.date, errors);
  if (!Number.isFinite(input.amount) || roundMoney(input.amount) === 0) {
    errors.amount = "Enter an amount other than 0 (use a minus sign to reduce)";
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    tx: {
      kind: "ADJUST",
      id: input.id,
      date: input.date,
      postings: [{ bucket: input.bucket, amount: roundMoney(input.amount) }],
      ...(input.holdingId ? { holdingId: input.holdingId } : {}),
      ...(cleanNotes(input.notes) ? { notes: cleanNotes(input.notes) } : {}),
    },
  };
}

/* ------------------------------------------------------------------ */
/* Holdings <-> ledger                                                  */
/* ------------------------------------------------------------------ */

/**
 * How a new holding affects its bucket:
 * - FUNDED: bought with money already in the bucket. Only the gain or loss (current value
 *   minus invested amount) is posted.
 * - ADD_VALUE: an asset the ledger does not know about yet. Its value is added to the bucket.
 */
export type HoldingAddMode = "FUNDED" | "ADD_VALUE";

/**
 * How removing a holding affects its bucket:
 * - KEEP_CASH: sold, the money stays in the bucket. No ledger change.
 * - REMOVE_VALUE: the value leaves the bucket (written off, or it was never real money).
 */
export type HoldingRemoveMode = "KEEP_CASH" | "REMOVE_VALUE";

/**
 * A holding bought with bucket money cannot cost more than the part of the bucket not yet
 * recorded in holdings. The cap is on the invested amount: what the holding is worth above
 * that is a gain, posted separately. Returns an error message or null.
 * `excludeId` leaves out the holding being edited.
 */
export function fundedHoldingError(
  h: Holding,
  bal: Balances,
  holdings: readonly Holding[],
  labels: Record<Bucket, string>,
  excludeId?: string,
): string | null {
  const recorded = holdings
    .filter((x) => x.bucket === h.bucket && x.id !== excludeId)
    .reduce((s, x) => s + safeAmount(x.currentValue), 0);
  const free = roundMoney(Math.max(0, bal[h.bucket] - recorded));
  const cost = roundMoney(safeAmount(costOf(h)));
  if (cost <= free + EPS) return null;
  const what = h.kind === "CASH" ? "balance" : "invested amount";
  return `Only ${fmt(free)} of ${labels[h.bucket]} is not yet recorded in holdings, so the ${what} can be at most that. Choose "Owned before I started" to add the extra ${fmt(roundMoney(cost - free))} as new money, or record the income first.`;
}

/** What a holding cost out of its bucket: the invested amount, or the balance for cash. */
export function costOf(h: Holding): number {
  return h.kind === "CASH" ? h.currentValue : h.investedAmount;
}

export function holdingAddEffects(
  h: Holding,
  mode: HoldingAddMode,
  date: string,
  newId: () => string,
): Transaction[] {
  const value = safeAmount(h.currentValue);
  if (mode === "FUNDED") {
    // Bought with bucket money: the cost is already in the ledger; post any gain or loss on top.
    const delta = roundMoney(value - safeAmount(costOf(h)));
    if (delta === 0) return [];
    return [
      {
        kind: "ADJUST",
        id: newId(),
        date,
        holdingId: h.id,
        postings: [{ bucket: h.bucket, amount: delta }],
        notes: `Value ${delta > 0 ? "gain" : "loss"}: ${h.name}`,
      },
    ];
  }
  if (value === 0) return [];
  return [
    {
      kind: "ADJUST",
      id: newId(),
      date,
      holdingId: h.id,
      postings: [{ bucket: h.bucket, amount: roundMoney(value) }],
      notes: `Added holding: ${h.name}`,
    },
  ];
}

/**
 * Ledger entries for an edited holding:
 * - moved to another bucket: its old value is transferred across;
 * - value changed: the gain or loss is posted to the (new) bucket.
 */
export function holdingUpdateEffects(
  prev: Holding,
  next: Holding,
  date: string,
  newId: () => string,
): Transaction[] {
  const out: Transaction[] = [];
  const oldValue = safeAmount(prev.currentValue);
  if (prev.bucket !== next.bucket && oldValue > 0) {
    out.push({
      kind: "TRANSFER",
      id: newId(),
      date,
      postings: [
        { bucket: prev.bucket, amount: -roundMoney(oldValue) },
        { bucket: next.bucket, amount: roundMoney(oldValue) },
      ],
      notes: `Holding moved: ${next.name}`,
    });
  }
  const delta = roundMoney(safeAmount(next.currentValue) - oldValue);
  if (delta !== 0) {
    out.push({
      kind: "ADJUST",
      id: newId(),
      date,
      holdingId: next.id,
      postings: [{ bucket: next.bucket, amount: delta }],
      notes: `Value ${delta > 0 ? "gain" : "loss"}: ${next.name}`,
    });
  }
  return out;
}

export function holdingRemoveEffects(
  h: Holding,
  mode: HoldingRemoveMode,
  date: string,
  newId: () => string,
): Transaction[] {
  const value = safeAmount(h.currentValue);
  if (mode === "KEEP_CASH" || value === 0) return [];
  return [
    {
      kind: "ADJUST",
      id: newId(),
      date,
      holdingId: h.id,
      postings: [{ bucket: h.bucket, amount: -roundMoney(value) }],
      notes: `Removed holding: ${h.name}`,
    },
  ];
}

/** Signed total of a transaction's postings (income: +net, spend: -amount, transfer: 0). */
export function txTotal(tx: Transaction): number {
  return roundMoney(tx.postings.reduce((s, p) => s + finite(p.amount), 0));
}
