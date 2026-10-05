import { describe, expect, it } from "vitest";
import {
  annualB,
  balances,
  bucketGoals,
  bucketTarget,
  goalStatus,
  reconcile,
  BUDGET_PROMPT,
  clamp,
  computeStatus,
  computeWarnings,
  currentLevel,
  daysBetween,
  finite,
  isCompleteSplit,
  isLiquidBucket,
  lastMonthKeys,
  liquidTotal,
  monthlyFlows,
  netIncome,
  parkedByBucket,
  roundMoney,
  safeAmount,
  safeDivide,
  snapshotFromStatus,
  sortNewestFirst,
  splitAmount,
  splitTotal,
  staleHoldings,
  upsertSnapshot,
  whatIf,
  withCurrentSnapshot,
  zeroBalances,
  type LevelStatus,
  type Status,
} from "../src/lib/calc";
import { defaultSettings, emptyAppData } from "../src/lib/defaults";
import type { Snapshot, Transaction } from "../src/lib/types";
import { B, bal, holding, opening, settingsWith, TODAY } from "./fixtures";

function ok(status: Status): LevelStatus {
  expect(status.kind).toBe("OK");
  return status as LevelStatus;
}

function expectAllFinite(value: unknown): void {
  if (typeof value === "number") expect(Number.isFinite(value)).toBe(true);
  else if (value && typeof value === "object")
    for (const v of Object.values(value)) expectAllFinite(v);
}

describe("spec cases (B = 50,000, Annual B = 6,00,000)", () => {
  const settings = settingsWith(B);

  it("1. liquid 5,00,000 -> ratio 0.83 -> L0, gap to L1 = 2,50,000", () => {
    const s = ok(computeStatus(settings, bal(["C1_LIQUID", 500_000])));
    expect(s.annualB).toBe(600_000);
    expect(s.ratio).toBeCloseTo(0.8333, 4);
    expect(s.level).toBe("L0");
    expect(s.nextThresholdValue).toBe(750_000);
    expect(s.gap).toBe(250_000);
    expect(s.progressPct).toBeCloseTo((0.8333 / 1.25) * 100, 1);
  });

  it("2. liquid 7,50,000 -> ratio 1.25 -> L1 (boundary goes up), gap to L2 = 52,50,000", () => {
    const s = ok(computeStatus(settings, bal(["EMERGENCY", 750_000])));
    expect(s.ratio).toBe(1.25);
    expect(s.level).toBe("L1");
    expect(s.gap).toBe(5_250_000);
    expect(s.progressPct).toBe(0);
  });

  it("3. liquid 60,00,000 -> ratio 10 -> L2, gap to L3 = 1,50,00,000", () => {
    const s = ok(computeStatus(settings, bal(["C1_LIQUID", 6_000_000])));
    expect(s.level).toBe("L2");
    expect(s.gap).toBe(15_000_000);
  });

  it("4. liquid 2,10,00,000 -> ratio 35 -> L3, no gap", () => {
    const s = ok(computeStatus(settings, bal(["C1_LIQUID", 21_000_000])));
    expect(s.level).toBe("L3");
    expect(s.nextLevel).toBeNull();
    expect(s.gap).toBeNull();
    expect(s.progressPct).toBe(100);
  });

  it("5. 1 Cr in C2 buckets leaves liquid total and level unchanged", () => {
    const before = ok(computeStatus(settings, bal(["C1_LIQUID", 500_000])));
    const after = ok(
      computeStatus(
        settings,
        bal(["C1_LIQUID", 500_000], ["C2A_BUSINESS", 5_000_000], ["C2B_ILLIQUID", 5_000_000]),
      ),
    );
    expect(after.liquidTotal).toBe(before.liquidTotal);
    expect(after.level).toBe(before.level);
  });

  it("6. Splurge and Survival never count toward liquid total", () => {
    const b = bal(["EMERGENCY", 100_000], ["SPLURGE", 9_000_000], ["SURVIVAL", 9_000_000]);
    expect(liquidTotal(b)).toBe(100_000);
    expect(ok(computeStatus(settings, b)).level).toBe("L0");
    expect(isLiquidBucket("SPLURGE")).toBe(false);
    expect(isLiquidBucket("SURVIVAL")).toBe(false);
    expect(isLiquidBucket("EMERGENCY")).toBe(true);
  });

  it("8. B = 0 -> no level, settings prompt returned", () => {
    const s = computeStatus(settingsWith(0), bal(["C1_LIQUID", 1_000_000]));
    expect(s).toEqual({ kind: "NO_BUDGET", message: BUDGET_PROMPT, liquidTotal: 1_000_000 });
  });

  it("12. what-if: B 50,000 -> 1,00,000 with liquid 7,50,000 drops L1 -> L0 with warning flag", () => {
    const r = whatIf(settings, bal(["C1_LIQUID", 750_000]), 100_000);
    expect(r).toMatchObject({ valid: true, currentLevel: "L1", newLevel: "L0", dropsLevel: true });
    expect(r.newRatio).toBeCloseTo(0.625, 6);
    expect(r.shortfallToKeepLevel).toBe(750_000);
  });

  it("13. stale detection flags holdings older than staleDays", () => {
    const fresh = holding("C1_LIQUID", 1, { lastUpdated: "2026-07-07" }); // 90 days
    const stale = holding("C1_LIQUID", 1, { lastUpdated: "2026-07-06" }); // 91 days
    expect(staleHoldings([fresh, stale], 90, TODAY)).toEqual([stale]);
    const w = computeWarnings(settings, zeroBalances(), [fresh, stale], TODAY);
    expect(w).toEqual([
      {
        kind: "STALE",
        message: "1 holding not updated in 90+ days. Your level may be inaccurate.",
      },
    ]);
  });
});

describe("balances", () => {
  it("sums postings per bucket across all kinds and rounds to paise", () => {
    const txs: Transaction[] = [
      {
        kind: "INCOME",
        id: "i",
        date: TODAY,
        source: "Salary",
        amount: 100,
        postings: [
          { bucket: "SURVIVAL", amount: 50.1 },
          { bucket: "EMERGENCY", amount: 49.9 },
        ],
      },
      {
        kind: "TRANSFER",
        id: "t",
        date: TODAY,
        postings: [
          { bucket: "SURVIVAL", amount: -0.2 },
          { bucket: "SPLURGE", amount: 0.2 },
        ],
      },
      { kind: "SPEND", id: "s", date: TODAY, postings: [{ bucket: "SPLURGE", amount: -0.1 }] },
    ];
    const b = balances(txs);
    expect(b.SURVIVAL).toBe(49.9);
    expect(b.EMERGENCY).toBe(49.9);
    expect(b.SPLURGE).toBe(0.1);
    expect(b.C1_LIQUID).toBe(0);
  });

  it("ignores corrupt numbers and negative liquid balances", () => {
    const b = bal(["C1_LIQUID", Number.NaN], ["EMERGENCY", -500]);
    expect(b.C1_LIQUID).toBe(0);
    expect(liquidTotal(b)).toBe(0);
    expectAllFinite(computeStatus(settingsWith(B), b));
  });

  it("no transactions -> liquid 0, L0", () => {
    const s = ok(computeStatus(settingsWith(B), zeroBalances()));
    expect(s).toMatchObject({
      liquidTotal: 0,
      level: "L0",
      ratio: 0,
      gap: 750_000,
      progressPct: 0,
    });
  });

  it("currentLevel falls back to L0 without a budget", () => {
    expect(currentLevel(settingsWith(0), bal(["C1_LIQUID", 1e9]))).toBe("L0");
    expect(currentLevel(settingsWith(B), bal(["C1_LIQUID", 750_000]))).toBe("L1");
  });
});

describe("numeric helpers", () => {
  it("never return NaN or Infinity", () => {
    expect(safeAmount(Number.NaN)).toBe(0);
    expect(safeAmount(-5)).toBe(0);
    expect(safeAmount(undefined)).toBe(0);
    expect(safeAmount(null)).toBe(0);
    expect(finite(-5)).toBe(-5);
    expect(finite(Number.POSITIVE_INFINITY)).toBe(0);
    expect(safeDivide(1, 0)).toBe(0);
    expect(safeDivide(1, 0, 7)).toBe(7);
    expect(safeDivide(1e308, 1e-308)).toBe(0);
    expect(clamp(Number.NaN, 0, 100)).toBe(0);
    expect(clamp(150, 0, 100)).toBe(100);
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
    expect(annualB(Number.NaN)).toBe(0);
    expect(daysBetween("garbage", TODAY)).toBe(0);
  });
});

describe("what-if", () => {
  const settings = settingsWith(B);

  it("lowering B does not flag a drop", () => {
    const r = whatIf(settings, bal(["C1_LIQUID", 750_000]), 40_000);
    expect(r).toMatchObject({ dropsLevel: false, shortfallToKeepLevel: 0, newLevel: "L1" });
  });

  it("rejects zero, negative and non-finite budgets", () => {
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const r = whatIf(settings, zeroBalances(), bad);
      expect(r.valid).toBe(false);
      expect(r.message).toMatch(/greater than 0/);
    }
  });

  it("works when the current budget is not set", () => {
    const r = whatIf(settingsWith(0), bal(["C1_LIQUID", 750_000]), 50_000);
    expect(r).toMatchObject({ currentLevel: null, newLevel: "L1", dropsLevel: false });
  });
});

describe("income split", () => {
  it("default splits are complete and keep the spec's savings shares", () => {
    const s = defaultSettings().splits;
    for (const lv of ["L0", "L1", "L2", "L3"] as const) expect(isCompleteSplit(s[lv])).toBe(true);
    expect(s.L0.EMERGENCY).toBe(0.45);
    expect(s.L1.C1_LIQUID).toBe(0.55);
    expect(s.L2.C1_LIQUID).toBe(0.6);
  });

  it("splits 1,00,000 by the L1 split exactly", () => {
    const parts = splitAmount(100_000, defaultSettings().splits.L1);
    expect(parts).toMatchObject({
      SURVIVAL: 40_000,
      C1_LIQUID: 55_000,
      SPLURGE: 5_000,
      EMERGENCY: 0,
    });
  });

  it("parts always add up exactly; remainder goes to the largest share", () => {
    const split = {
      ...defaultSettings().splits.L0,
      SURVIVAL: 1 / 3,
      EMERGENCY: 1 / 3,
      SPLURGE: 1 / 3,
    };
    const parts = splitAmount(100, split);
    const sum = Object.values(parts).reduce((a, b) => a + b, 0);
    expect(roundMoney(sum)).toBe(100);
    expect(parts.SURVIVAL).toBe(33.34);
    expect(parts.EMERGENCY).toBe(33.33);
  });

  it("detects incomplete splits", () => {
    const split = { ...defaultSettings().splits.L1, SPLURGE: 0 };
    expect(splitTotal(split)).toBeCloseTo(0.95, 6);
    expect(isCompleteSplit(split)).toBe(false);
  });

  it("applies tax only to pre-tax income when tax mode is on", () => {
    const taxed = settingsWith(B, { tax: { enabled: true, rate: 0.3 } });
    expect(netIncome(100_000, true, taxed)).toBe(70_000);
    expect(netIncome(100_000, false, taxed)).toBe(100_000);
    expect(netIncome(100_000, true, settingsWith(B))).toBe(100_000);
  });
});

describe("ledger views", () => {
  it("month keys roll over year boundaries", () => {
    expect(lastMonthKeys("2026-02-10", 4)).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });

  it("monthly flows count income and spending, not transfers or adjustments", () => {
    const txs: Transaction[] = [
      {
        kind: "INCOME",
        id: "1",
        date: "2026-10-01",
        source: "Salary",
        amount: 100,
        postings: [{ bucket: "SURVIVAL", amount: 100 }],
      },
      {
        kind: "SPEND",
        id: "2",
        date: "2026-10-03",
        postings: [{ bucket: "SURVIVAL", amount: -30 }],
      },
      {
        kind: "TRANSFER",
        id: "3",
        date: "2026-10-03",
        postings: [
          { bucket: "SURVIVAL", amount: -10 },
          { bucket: "SPLURGE", amount: 10 },
        ],
      },
      opening("C1_LIQUID", 999, "2026-10-02"),
      {
        kind: "SPEND",
        id: "4",
        date: "2025-01-01",
        postings: [{ bucket: "SURVIVAL", amount: -5 }],
      },
    ];
    const flows = monthlyFlows(txs, TODAY);
    expect(flows).toHaveLength(12);
    expect(flows[11]).toEqual({ month: "2026-10", income: 100, spent: 30 });
    expect(flows[0]).toEqual({ month: "2025-11", income: 0, spent: 0 });
  });

  it("sorts newest first, keeping later-added entries on top within a day", () => {
    const items = [
      { date: "2026-01-01", n: 1 },
      { date: "2026-03-01", n: 2 },
      { date: "2026-01-01", n: 3 },
    ];
    expect(sortNewestFirst(items).map((i) => i.n)).toEqual([2, 3, 1]);
  });

  it("parked value per bucket", () => {
    const p = parkedByBucket([
      holding("C1_LIQUID", 100),
      holding("C1_LIQUID", 50.5),
      holding("SPLURGE", 1),
    ]);
    expect(p.C1_LIQUID).toBe(150.5);
    expect(p.SPLURGE).toBe(1);
  });
});

describe("warnings", () => {
  it("B not set", () => {
    expect(computeWarnings(settingsWith(0), zeroBalances(), [], TODAY)).toEqual([
      { kind: "NO_BUDGET", message: BUDGET_PROMPT },
    ]);
  });

  it("negative buckets, singular and plural", () => {
    const one = computeWarnings(settingsWith(B), bal(["SPLURGE", -1]), [], TODAY);
    expect(one[0].message).toMatch(/^Splurge is below zero/);
    const two = computeWarnings(settingsWith(B), bal(["SPLURGE", -1], ["SURVIVAL", -1]), [], TODAY);
    expect(two[0].message).toMatch(/^Survival, Splurge are below zero/);
  });

  it("pluralises stale holdings", () => {
    const old = { lastUpdated: "2025-01-01" };
    const w = computeWarnings(
      settingsWith(B),
      zeroBalances(),
      [holding("C1_LIQUID", 1, old), holding("C1_LIQUID", 1, old)],
      TODAY,
    );
    expect(w[0].message).toMatch(/^2 holdings not updated/);
  });

  it("no warnings when all is well", () => {
    expect(
      computeWarnings(settingsWith(B), bal(["C1_LIQUID", 1]), [holding("C1_LIQUID", 1)], TODAY),
    ).toEqual([]);
  });
});

describe("snapshots", () => {
  const settings = settingsWith(B);

  it("no snapshot without a budget", () => {
    expect(snapshotFromStatus(computeStatus(settingsWith(0), zeroBalances()), TODAY)).toBeNull();
    const snaps: Snapshot[] = [];
    expect(upsertSnapshot(snaps, null)).toBe(snaps);
  });

  it("one snapshot per month, current month overwritten", () => {
    const sept: Snapshot = {
      date: "2026-09-15",
      liquidTotal: 1,
      annualB: 600_000,
      ratio: 0,
      level: "L0",
    };
    const first = upsertSnapshot(
      [sept],
      snapshotFromStatus(computeStatus(settings, zeroBalances()), "2026-10-01"),
    );
    expect(first).toHaveLength(2);
    const second = upsertSnapshot(
      first,
      snapshotFromStatus(computeStatus(settings, bal(["C1_LIQUID", 750_000])), TODAY),
    );
    expect(second).toHaveLength(2);
    expect(second[1]).toMatchObject({ date: TODAY, level: "L1", ratio: 1.25 });
    expect(second[0]).toBe(sept);
  });

  it("withCurrentSnapshot keeps identity when unchanged", () => {
    const data = { ...emptyAppData(), settings, transactions: [opening("C1_LIQUID", 10)] };
    const once = withCurrentSnapshot(data, TODAY);
    expect(once).not.toBe(data);
    expect(once.snapshots[0].liquidTotal).toBe(10);
    expect(withCurrentSnapshot(once, TODAY)).toBe(once);
  });
});

describe("bucket goals", () => {
  const settings = settingsWith(B);

  it("defaults: Survival 1 month of B, Emergency 15 months (the L1 line), C1 to the next level", () => {
    const b = bal(["SURVIVAL", 40_000], ["EMERGENCY", 800_000], ["C1_LIQUID", 1_000_000]);
    const g = bucketGoals(settings, b);
    expect(g.SURVIVAL).toEqual({ kind: "SHORT", target: 50_000, shortBy: 10_000 });
    expect(g.EMERGENCY).toEqual({ kind: "MET", target: 750_000, surplus: 50_000 });
    // Liquid 18 L -> L1; next level L2 needs 60 L; Emergency covers 8 L, so C1 needs 52 L.
    expect(g.C1_LIQUID).toEqual({ kind: "SHORT", target: 5_200_000, shortBy: 4_200_000 });
    expect(g.SPLURGE).toEqual({ kind: "NONE" });
  });

  it("4 L goal: 3.5 L is 50 K short, 4.5 L is achieved with 50 K surplus", () => {
    expect(goalStatus(350_000, 400_000)).toEqual({
      kind: "SHORT",
      target: 400_000,
      shortBy: 50_000,
    });
    expect(goalStatus(450_000, 400_000)).toEqual({ kind: "MET", target: 400_000, surplus: 50_000 });
    expect(goalStatus(400_000, 400_000)).toEqual({ kind: "MET", target: 400_000, surplus: 0 });
    expect(goalStatus(1, null)).toEqual({ kind: "NONE" });
    expect(goalStatus(1, 0)).toEqual({ kind: "NONE" });
  });

  it("fixed goals, goals without B, and next-level at L3", () => {
    const zero = zeroBalances();
    expect(bucketTarget("SPLURGE", { mode: "FIXED", amount: 400_000 }, settings, zero)).toBe(
      400_000,
    );
    expect(
      bucketTarget("EMERGENCY", { mode: "MONTHS_OF_B", months: 6 }, settingsWith(0), zero),
    ).toBeNull();
    expect(bucketTarget("C1_LIQUID", { mode: "NEXT_LEVEL" }, settingsWith(0), zero)).toBeNull();
    expect(bucketTarget("SPLURGE", { mode: "NEXT_LEVEL" }, settings, zero)).toBeNull();
    const rich = bal(["C1_LIQUID", 25_000_000], ["EMERGENCY", 1_000_000]);
    // At L3 the goal is staying at L3: 35 x 6 L minus Emergency.
    expect(bucketTarget("C1_LIQUID", { mode: "NEXT_LEVEL" }, settings, rich)).toBe(20_000_000);
    const big = bal(["EMERGENCY", 9_000_000]);
    expect(bucketTarget("C1_LIQUID", { mode: "NEXT_LEVEL" }, settings, big)).toBe(12_000_000);
  });
});

describe("ledger vs holdings", () => {
  it("flags unrecorded money and holdings that exceed the ledger", () => {
    const b = bal(["EMERGENCY", 300_000], ["C1_LIQUID", 100_000], ["SPLURGE", 1000.4]);
    const r = reconcile(b, [
      holding("EMERGENCY", 250_000),
      holding("C1_LIQUID", 120_000),
      holding("SPLURGE", 1000),
    ]);
    const by = Object.fromEntries(r.map((m) => [m.bucket, m]));
    expect(by.EMERGENCY).toMatchObject({
      ledger: 300_000,
      recorded: 250_000,
      diff: 50_000,
      state: "UNRECORDED",
    });
    expect(by.C1_LIQUID).toMatchObject({ diff: -20_000, state: "EXCESS" });
    expect(by.SPLURGE.state).toBe("MATCHED");
    expect(by.SURVIVAL.state).toBe("MATCHED");
  });
});
