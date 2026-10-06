import { describe, expect, it } from "vitest";
import { balances, splitAmount } from "../src/lib/calc";
import { defaultSettings } from "../src/lib/defaults";
import {
  balancesExcluding,
  buildAdjust,
  buildIncome,
  buildSpend,
  buildTransfer,
  fundedHoldingError,
  holdingAddEffects,
  holdingRemoveEffects,
  holdingUpdateEffects,
  txTotal,
} from "../src/lib/ledger";
import type { Transaction } from "../src/lib/types";
import { B, bal, holding, ids, opening, settingsWith, TODAY } from "./fixtures";

const labels = defaultSettings().labels.buckets;

describe("income", () => {
  const settings = settingsWith(B);

  it("splits income across buckets and updates balances", () => {
    const r = buildIncome(
      {
        id: "i1",
        date: TODAY,
        source: "Salary",
        amount: 100_000,
        isPretax: false,
        allocation: splitAmount(100_000, settings.splits.L1),
      },
      settings,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.tx.postings).toEqual([
      { bucket: "SURVIVAL", amount: 40_000 },
      { bucket: "C1_LIQUID", amount: 44_000 },
      { bucket: "C2B_ILLIQUID", amount: 11_000 },
      { bucket: "SPLURGE", amount: 5_000 },
    ]);
    expect(balances([r.tx])).toMatchObject({
      SURVIVAL: 40_000,
      C1_LIQUID: 44_000,
      C2B_ILLIQUID: 11_000,
    });
    expect(txTotal(r.tx)).toBe(100_000);
  });

  it("accepts a custom allocation, e.g. a bonus 100% to corpus", () => {
    const r = buildIncome(
      {
        id: "i",
        date: TODAY,
        source: "Other",
        amount: 50_000,
        isPretax: false,
        allocation: { C1_LIQUID: 50_000 },
        notes: " Bonus ",
      },
      settings,
    );
    expect(r.ok && r.tx).toMatchObject({
      postings: [{ bucket: "C1_LIQUID", amount: 50_000 }],
      notes: "Bonus",
    });
  });

  it("rejects an allocation that does not add up, with the difference", () => {
    const r = buildIncome(
      {
        id: "i",
        date: TODAY,
        source: "Salary",
        amount: 1000,
        isPretax: false,
        allocation: { SURVIVAL: 900 },
      },
      settings,
    );
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect(r.errors.allocation).toMatch(
        /add up to ₹900 but the income is ₹1,000. Difference: ₹100/,
      );
  });

  it("splits the post-tax amount for pre-tax income when tax mode is on", () => {
    const taxed = settingsWith(B, { tax: { enabled: true, rate: 0.3 } });
    const r = buildIncome(
      {
        id: "i",
        date: TODAY,
        source: "Salary",
        amount: 100_000,
        isPretax: true,
        allocation: { SURVIVAL: 70_000 },
      },
      taxed,
    );
    expect(r.ok && r.tx).toMatchObject({ amount: 100_000, isPretax: true });
    const off = buildIncome(
      {
        id: "i",
        date: TODAY,
        source: "Salary",
        amount: 100,
        isPretax: true,
        allocation: { SURVIVAL: 100 },
      },
      settings,
    );
    expect(off.ok && off.tx).not.toHaveProperty("isPretax");
  });

  it("rejects bad amounts, dates and negative bucket amounts", () => {
    const r = buildIncome(
      {
        id: "i",
        date: "2026-13-01",
        source: "Salary",
        amount: 0,
        isPretax: false,
        allocation: { SURVIVAL: -5, SPLURGE: Number.NaN },
      },
      settings,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors).toMatchObject({
        date: "Enter a valid date",
        amount: "Amount must be greater than 0",
        "allocation.SURVIVAL": "Must be 0 or more",
        "allocation.SPLURGE": "Must be 0 or more",
      });
    }
  });
});

describe("transfer (reallocation)", () => {
  const available = bal(["SURVIVAL", 10_000]);

  it("moves money between buckets", () => {
    const r = buildTransfer(
      { id: "t", date: TODAY, from: "SURVIVAL", to: "C1_LIQUID", amount: 4000, notes: "" },
      available,
      labels,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.tx).not.toHaveProperty("notes");
    const after = balances([opening("SURVIVAL", 10_000), r.tx]);
    expect(after).toMatchObject({ SURVIVAL: 6000, C1_LIQUID: 4000 });
    expect(txTotal(r.tx)).toBe(0);
    const noted = buildTransfer(
      { id: "t", date: TODAY, from: "SURVIVAL", to: "SPLURGE", amount: 1, notes: "Trip" },
      available,
      labels,
    );
    expect(noted.ok && noted.tx.notes).toBe("Trip");
  });

  it("blocks overdrawing and same-bucket moves", () => {
    const over = buildTransfer(
      { id: "t", date: TODAY, from: "SURVIVAL", to: "SPLURGE", amount: 10_001 },
      available,
      labels,
    );
    expect(!over.ok && over.errors.amount).toBe("Survival has only ₹10,000");
    const same = buildTransfer(
      { id: "t", date: TODAY, from: "SURVIVAL", to: "SURVIVAL", amount: 1 },
      available,
      labels,
    );
    expect(!same.ok && same.errors.to).toMatch(/different bucket/);
    const zero = buildTransfer(
      { id: "t", date: "x", from: "SPLURGE", to: "SURVIVAL", amount: -1 },
      available,
      labels,
    );
    expect(!zero.ok && zero.errors).toMatchObject({
      amount: "Amount must be greater than 0",
      date: "Enter a valid date",
    });
    const empty = buildTransfer(
      { id: "t", date: TODAY, from: "SPLURGE", to: "SURVIVAL", amount: 1 },
      bal(["SPLURGE", -50]),
      labels,
    );
    expect(!empty.ok && empty.errors.amount).toBe("Splurge has only ₹0");
  });
});

describe("spend", () => {
  it("reduces a bucket and blocks overspending", () => {
    const available = bal(["SPLURGE", 5000]);
    const r = buildSpend(
      {
        id: "s",
        date: TODAY,
        bucket: "SPLURGE",
        amount: 4999.5,
        category: " Travel ",
        notes: "Goa",
      },
      available,
      labels,
    );
    expect(r.ok && r.tx).toMatchObject({
      category: "Travel",
      notes: "Goa",
      postings: [{ bucket: "SPLURGE", amount: -4999.5 }],
    });
    const over = buildSpend(
      { id: "s", date: TODAY, bucket: "SPLURGE", amount: 5000.01 },
      available,
      labels,
    );
    expect(!over.ok && over.errors.amount).toBe("Splurge has only ₹5,000");
    const bad = buildSpend(
      { id: "s", date: "", bucket: "SPLURGE", amount: Number.NaN, category: "  " },
      available,
      labels,
    );
    expect(!bad.ok && Object.keys(bad.errors).sort()).toEqual(["amount", "date"]);
    const exact = buildSpend(
      { id: "s", date: TODAY, bucket: "SPLURGE", amount: 5000, category: "  " },
      available,
      labels,
    );
    expect(exact.ok && exact.tx).not.toHaveProperty("category");
  });

  it("editing an entry checks against balances without that entry", () => {
    const txs: Transaction[] = [
      opening("SPLURGE", 100),
      { kind: "SPEND", id: "s1", date: TODAY, postings: [{ bucket: "SPLURGE", amount: -100 }] },
    ];
    expect(balancesExcluding(txs).SPLURGE).toBe(0);
    expect(balancesExcluding(txs, "s1").SPLURGE).toBe(100);
  });
});

describe("adjust", () => {
  it("adds or removes from one bucket, never 0", () => {
    expect(
      buildAdjust({ id: "a", date: TODAY, bucket: "C1_LIQUID", amount: -250, holdingId: "h" }),
    ).toMatchObject({
      ok: true,
      tx: { kind: "ADJUST", holdingId: "h", postings: [{ bucket: "C1_LIQUID", amount: -250 }] },
    });
    const zero = buildAdjust({ id: "a", date: "bad", bucket: "C1_LIQUID", amount: 0.001 });
    expect(!zero.ok && zero.errors).toMatchObject({ date: "Enter a valid date" });
    expect(!zero.ok && zero.errors.amount).toMatch(/other than 0/);
    const plain = buildAdjust({
      id: "a",
      date: TODAY,
      bucket: "SPLURGE",
      amount: 5,
      notes: "Opening",
    });
    expect(plain.ok && plain.tx).not.toHaveProperty("holdingId");
  });
});

describe("holdings and the ledger", () => {
  const h = holding("C1_LIQUID", 100_000, { name: "Index fund" });

  it("adding a holding funded from the bucket posts only its gain; a new asset adds its value", () => {
    expect(holdingAddEffects(h, "FUNDED", TODAY, ids())).toEqual([]);
    const bought = { ...h, investedAmount: 80_000 };
    expect(holdingAddEffects(bought, "FUNDED", TODAY, ids())).toEqual([
      {
        kind: "ADJUST",
        id: "x1",
        date: TODAY,
        holdingId: h.id,
        postings: [{ bucket: "C1_LIQUID", amount: 20_000 }],
        notes: "Value gain: Index fund",
      },
    ]);
    const down = holdingAddEffects({ ...h, investedAmount: 120_000 }, "FUNDED", TODAY, ids());
    expect(down[0]).toMatchObject({
      notes: "Value loss: Index fund",
      postings: [{ amount: -20_000 }],
    });
    const cash = { ...h, kind: "CASH" as const, investedAmount: 0 };
    expect(holdingAddEffects(cash, "FUNDED", TODAY, ids())).toEqual([]);
    expect(holdingAddEffects({ ...h, currentValue: 0 }, "ADD_VALUE", TODAY, ids())).toEqual([]);
    expect(holdingAddEffects(h, "ADD_VALUE", TODAY, ids())).toEqual([
      {
        kind: "ADJUST",
        id: "x1",
        date: TODAY,
        holdingId: h.id,
        postings: [{ bucket: "C1_LIQUID", amount: 100_000 }],
        notes: "Added holding: Index fund",
      },
    ]);
  });

  it("a value change posts the gain or loss", () => {
    const gain = holdingUpdateEffects(h, { ...h, currentValue: 112_500 }, TODAY, ids());
    expect(gain).toHaveLength(1);
    expect(gain[0]).toMatchObject({
      kind: "ADJUST",
      notes: "Value gain: Index fund",
      postings: [{ bucket: "C1_LIQUID", amount: 12_500 }],
    });
    const loss = holdingUpdateEffects(h, { ...h, currentValue: 90_000 }, TODAY, ids());
    expect(loss[0]).toMatchObject({
      notes: "Value loss: Index fund",
      postings: [{ amount: -10_000 }],
    });
    expect(holdingUpdateEffects(h, { ...h, name: "Renamed" }, TODAY, ids())).toEqual([]);
  });

  it("a cash balance change replaces the balance with no gain or loss entry", () => {
    const cash: typeof h = { ...h, kind: "CASH", investedAmount: 50_000, currentValue: 50_000 };
    const next = { ...cash, investedAmount: 80_000, currentValue: 80_000 };
    expect(holdingUpdateEffects(cash, next, TODAY, ids())).toEqual([]);
    // Moving it still carries the old balance across.
    const moved = holdingUpdateEffects(cash, { ...next, bucket: "EMERGENCY" }, TODAY, ids());
    expect(moved.map((t) => t.kind)).toEqual(["TRANSFER"]);
  });

  it("moving a holding to another bucket transfers its value, then posts any change", () => {
    const fx = holdingUpdateEffects(
      h,
      { ...h, bucket: "EMERGENCY", currentValue: 101_000 },
      TODAY,
      ids(),
    );
    expect(fx.map((t) => t.kind)).toEqual(["TRANSFER", "ADJUST"]);
    expect(balances([opening("C1_LIQUID", 100_000), ...fx])).toMatchObject({
      C1_LIQUID: 0,
      EMERGENCY: 101_000,
    });
    const empty = holdingUpdateEffects(
      { ...h, currentValue: 0 },
      { ...h, currentValue: 0, bucket: "SPLURGE" },
      TODAY,
      ids(),
    );
    expect(empty).toEqual([]);
  });

  it("removing a holding keeps the cash or removes the value", () => {
    expect(holdingRemoveEffects(h, "KEEP_CASH", TODAY, ids())).toEqual([]);
    expect(holdingRemoveEffects({ ...h, currentValue: 0 }, "REMOVE_VALUE", TODAY, ids())).toEqual(
      [],
    );
    const fx = holdingRemoveEffects(h, "REMOVE_VALUE", TODAY, ids());
    expect(fx[0]).toMatchObject({
      notes: "Removed holding: Index fund",
      postings: [{ bucket: "C1_LIQUID", amount: -100_000 }],
    });
  });
});

describe("funded holdings cannot exceed the ledger", () => {
  const b = bal(["EMERGENCY", 300_000]);
  const existing = holding("EMERGENCY", 250_000);

  it("caps the invested amount, not the current value", () => {
    expect(fundedHoldingError(holding("EMERGENCY", 50_000), b, [existing], labels)).toBeNull();
    // Bought for 50 K, now worth 70 K: allowed, the 20 K is a gain.
    expect(
      fundedHoldingError(
        holding("EMERGENCY", 70_000, { investedAmount: 50_000 }),
        b,
        [existing],
        labels,
      ),
    ).toBeNull();
  });

  it("rejects a cost above the unrecorded money, and explains the way out", () => {
    const err = fundedHoldingError(holding("EMERGENCY", 60_000), b, [existing], labels);
    expect(err).toBe(
      'Only ₹50,000 of Emergency is not yet recorded in holdings, so the invested amount can be at most that. Choose "Owned before I started" to add the extra ₹10,000 as new money, or record the income first.',
    );
    const cash = fundedHoldingError(
      holding("EMERGENCY", 60_000, { kind: "CASH", investedAmount: 0 }),
      b,
      [existing],
      labels,
    );
    expect(cash).toMatch(/so the balance can be at most that/);
  });

  it("ignores the holding being edited", () => {
    expect(
      fundedHoldingError(
        { ...existing, currentValue: 300_000 },
        b,
        [existing],
        labels,
        existing.id,
      ),
    ).toBeNull();
    expect(fundedHoldingError(holding("EMERGENCY", 1), bal(["EMERGENCY", -5]), [], labels)).toMatch(
      /Only ₹0/,
    );
  });
});
