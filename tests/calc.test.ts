import { describe, expect, it } from "vitest";
import {
  annualB,
  averageMonthlyIncome,
  BUDGET_PROMPT,
  bucketTotals,
  clamp,
  computeStatus,
  computeWarnings,
  daysBetween,
  effectiveAnnualB,
  lastMonthKeys,
  levelFor,
  liquidTotal,
  monthlyIncomeTotals,
  netIncomeAmount,
  reliableC2Income,
  safeAmount,
  safeDivide,
  snapshotFromStatus,
  sortIncomeNewestFirst,
  staleHoldings,
  upsertSnapshot,
  whatIf,
  withCurrentSnapshot,
  type LevelStatus,
  type Status,
} from "../src/lib/calc";
import { emptyAppData } from "../src/lib/defaults";
import type { Snapshot } from "../src/lib/types";
import { B, holding, income, settingsWith, TODAY } from "./fixtures";

function ok(status: Status): LevelStatus {
  expect(status.kind).toBe("OK");
  return status as LevelStatus;
}

/** Walks any object and asserts no NaN or Infinity is present. */
function expectAllFinite(value: unknown): void {
  if (typeof value === "number") {
    expect(Number.isFinite(value)).toBe(true);
  } else if (value && typeof value === "object") {
    for (const v of Object.values(value)) expectAllFinite(v);
  }
}

describe("spec section 7: level cases (B = 50,000, Annual B = 6,00,000)", () => {
  const settings = settingsWith(B);

  it("1. liquid 5,00,000 -> ratio 0.83 -> L0, gap to L1 = 2,50,000", () => {
    const s = ok(computeStatus(settings, [holding("C1_LIQUID", 500_000)]));
    expect(s.annualB).toBe(600_000);
    expect(s.ratio).toBeCloseTo(0.8333, 4);
    expect(s.level).toBe("L0");
    expect(s.nextLevel).toBe("L1");
    expect(s.nextThresholdValue).toBe(750_000);
    expect(s.gap).toBe(250_000);
    expect(s.progressPct).toBeCloseTo((0.8333 / 1.25) * 100, 1);
  });

  it("2. liquid 7,50,000 -> ratio 1.25 -> L1 (boundary goes up), gap to L2 = 52,50,000", () => {
    const s = ok(computeStatus(settings, [holding("EMERGENCY", 750_000)]));
    expect(s.ratio).toBe(1.25);
    expect(s.level).toBe("L1");
    expect(s.nextThresholdValue).toBe(6_000_000);
    expect(s.gap).toBe(5_250_000);
    expect(s.progressPct).toBe(0);
  });

  it("3. liquid 60,00,000 -> ratio 10 -> L2, gap to L3 = 1,50,00,000", () => {
    const s = ok(computeStatus(settings, [holding("C1_LIQUID", 6_000_000)]));
    expect(s.ratio).toBe(10);
    expect(s.level).toBe("L2");
    expect(s.nextThresholdValue).toBe(21_000_000);
    expect(s.gap).toBe(15_000_000);
  });

  it("4. liquid 2,10,00,000 -> ratio 35 -> L3, no gap", () => {
    const s = ok(computeStatus(settings, [holding("C1_LIQUID", 21_000_000)]));
    expect(s.ratio).toBe(35);
    expect(s.level).toBe("L3");
    expect(s.nextLevel).toBeNull();
    expect(s.gap).toBeNull();
    expect(s.nextThresholdValue).toBeNull();
    expect(s.progressPct).toBe(100);
    expect(s.coveredByIncome).toBe(false);
  });

  it("5. C2 holdings worth 1 Cr with no income leave liquid total and level unchanged", () => {
    const base = [holding("C1_LIQUID", 500_000)];
    const before = ok(computeStatus(settings, base));
    const after = ok(
      computeStatus(settings, [
        ...base,
        holding("C2A_BUSINESS", 5_000_000),
        holding("C2B_ILLIQUID", 5_000_000),
      ]),
    );
    expect(after.liquidTotal).toBe(before.liquidTotal);
    expect(after.level).toBe(before.level);
    expect(after.effectiveAnnualB).toBe(600_000);
  });

  it("6. Splurge never counts toward liquid total", () => {
    const hs = [holding("EMERGENCY", 100_000), holding("SPLURGE", 9_000_000)];
    expect(liquidTotal(hs)).toBe(100_000);
    expect(ok(computeStatus(settings, hs)).level).toBe("L0");
    expect(bucketTotals(hs).SPLURGE.countsTowardLevel).toBe(false);
  });

  it("7. reliable C2 income above annual B -> effective B 0, L3 with special label, no NaN", () => {
    const hs = [
      holding("C1_LIQUID", 100_000),
      holding("C2B_ILLIQUID", 3_00_00_000, { netAnnualIncome: 900_000, incomeIsReliable: true }),
    ];
    const s = ok(computeStatus(settings, hs));
    expect(s.effectiveAnnualB).toBe(0);
    expect(s.level).toBe("L3");
    expect(s.coveredByIncome).toBe(true);
    expect(s.ratio).toBeNull();
    expect(s.gap).toBeNull();
    expectAllFinite(s);
  });

  it("8. B = 0 -> no level, settings prompt returned", () => {
    const s = computeStatus(settingsWith(0), [holding("C1_LIQUID", 1_000_000)]);
    expect(s).toEqual({ kind: "NO_BUDGET", message: BUDGET_PROMPT, liquidTotal: 1_000_000 });
    expect(s).not.toHaveProperty("level");
  });

  it("12. what-if: B 50,000 -> 1,00,000 with liquid 7,50,000 drops L1 -> L0 with warning flag", () => {
    const r = whatIf(settings, [holding("C1_LIQUID", 750_000)], 100_000);
    expect(r.valid).toBe(true);
    expect(r.currentLevel).toBe("L1");
    expect(r.newLevel).toBe("L0");
    expect(r.dropsLevel).toBe(true);
    expect(r.newEffectiveAnnualB).toBe(1_200_000);
    expect(r.newRatio).toBeCloseTo(0.625, 6);
    // Needs 1.25 x 12,00,000 = 15,00,000 to stay on L1.
    expect(r.shortfallToKeepLevel).toBe(750_000);
  });

  it("13. stale detection flags holdings older than staleDays", () => {
    const fresh = holding("C1_LIQUID", 1, { lastUpdated: "2026-07-07" }); // 90 days
    const stale = holding("C1_LIQUID", 1, { lastUpdated: "2026-07-06" }); // 91 days
    expect(staleHoldings([fresh, stale], 90, TODAY)).toEqual([stale]);
    const warnings = computeWarnings(settings, [fresh, stale], TODAY);
    expect(warnings.find((w) => w.kind === "STALE")?.message).toBe(
      "1 holding not updated in 90+ days. Your level may be inaccurate.",
    );
  });
});

describe("edge cases", () => {
  it("no holdings -> liquid 0, L0", () => {
    const s = ok(computeStatus(settingsWith(B), []));
    expect(s.liquidTotal).toBe(0);
    expect(s.level).toBe("L0");
    expect(s.ratio).toBe(0);
    expect(s.gap).toBe(750_000);
    expect(s.progressPct).toBe(0);
  });

  it("partial reliable income reduces effective B; unreliable or non-C2 income is ignored", () => {
    const hs = [
      holding("C2A_BUSINESS", 0, { netAnnualIncome: 120_000, incomeIsReliable: true }),
      holding("C2A_BUSINESS", 0, { netAnnualIncome: 500_000, incomeIsReliable: false }),
      holding("C1_LIQUID", 0, { netAnnualIncome: 500_000, incomeIsReliable: true }),
    ];
    expect(reliableC2Income(hs)).toBe(120_000);
    const s = ok(computeStatus(settingsWith(B), hs));
    expect(s.effectiveAnnualB).toBe(480_000);
  });

  it("level is L3 at exactly-zero effective B even with zero liquid", () => {
    expect(levelFor(0, 0, settingsWith(B).thresholds)).toBe("L3");
  });

  it("numeric helpers never return NaN or Infinity", () => {
    expect(safeAmount(Number.NaN)).toBe(0);
    expect(safeAmount(-5)).toBe(0);
    expect(safeAmount(undefined)).toBe(0);
    expect(safeAmount(null)).toBe(0);
    expect(safeAmount(Number.POSITIVE_INFINITY)).toBe(0);
    expect(safeDivide(1, 0)).toBe(0);
    expect(safeDivide(1, 0, 7)).toBe(7);
    expect(safeDivide(1e308, 1e-308)).toBe(0);
    expect(safeDivide(6, 3)).toBe(2);
    expect(clamp(Number.NaN, 0, 100)).toBe(0);
    expect(clamp(150, 0, 100)).toBe(100);
    expect(clamp(-1, 0, 100)).toBe(0);
    expect(annualB(Number.NaN)).toBe(0);
    expect(effectiveAnnualB(600_000, 700_000)).toBe(0);
    expect(daysBetween("garbage", TODAY)).toBe(0);
  });

  it("corrupt numbers in holdings do not leak NaN", () => {
    const hs = [holding("C1_LIQUID", Number.NaN), holding("EMERGENCY", Number.POSITIVE_INFINITY)];
    const s = computeStatus(settingsWith(B), hs);
    expectAllFinite(s);
  });

  it("bucketTotals sums invested and current per bucket", () => {
    const t = bucketTotals([
      holding("C1_LIQUID", 100, { investedAmount: 80 }),
      holding("C1_LIQUID", 50, { investedAmount: 40 }),
    ]);
    expect(t.C1_LIQUID).toMatchObject({
      invested: 120,
      current: 150,
      count: 2,
      countsTowardLevel: true,
    });
    expect(t.C2A_BUSINESS.count).toBe(0);
  });
});

describe("what-if", () => {
  const settings = settingsWith(B);

  it("lowering B does not flag a drop", () => {
    const r = whatIf(settings, [holding("C1_LIQUID", 750_000)], 40_000);
    expect(r.dropsLevel).toBe(false);
    expect(r.shortfallToKeepLevel).toBe(0);
    expect(r.newLevel).toBe("L1");
  });

  it("rejects zero, negative and non-finite budgets", () => {
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const r = whatIf(settings, [], bad);
      expect(r.valid).toBe(false);
      expect(r.message).toMatch(/greater than 0/);
      expect(r.newLevel).toBeNull();
    }
  });

  it("works when the current budget is not set (no current level, no drop)", () => {
    const r = whatIf(settingsWith(0), [holding("C1_LIQUID", 750_000)], 50_000);
    expect(r.currentLevel).toBeNull();
    expect(r.newLevel).toBe("L1");
    expect(r.dropsLevel).toBe(false);
  });
});

describe("warnings", () => {
  it("B not set", () => {
    const w = computeWarnings(settingsWith(0), [], TODAY);
    expect(w).toEqual([{ kind: "NO_BUDGET", message: BUDGET_PROMPT }]);
  });

  it("pluralises stale and reliable C2 messages", () => {
    const old = { lastUpdated: "2025-01-01" };
    const hs = [
      holding("C1_LIQUID", 1, old),
      holding("C1_LIQUID", 1, old),
      holding("C2A_BUSINESS", 1, { netAnnualIncome: 10, incomeIsReliable: true }),
      holding("C2B_ILLIQUID", 1, { netAnnualIncome: 10, incomeIsReliable: true }),
    ];
    const w = computeWarnings(settingsWith(B), hs, TODAY);
    expect(w.map((x) => x.kind)).toEqual(["STALE", "RELIABLE_C2"]);
    expect(w[0].message).toMatch(/^2 holdings not updated in 90\+ days/);
    expect(w[1].message).toMatch(/^2 C2 holdings have income marked reliable/);
  });

  it("single reliable C2 holding message", () => {
    const hs = [holding("C2A_BUSINESS", 1, { netAnnualIncome: 10, incomeIsReliable: true })];
    expect(computeWarnings(settingsWith(B), hs, TODAY)[0].message).toMatch(
      /^1 C2 holding has income marked reliable/,
    );
  });

  it("no warnings when all is well", () => {
    expect(computeWarnings(settingsWith(B), [holding("C1_LIQUID", 1)], TODAY)).toEqual([]);
  });
});

describe("income", () => {
  const taxed = settingsWith(B, { tax: { enabled: true, rate: 0.3 } });

  it("applies tax only to pre-tax entries when tax mode is on", () => {
    expect(netIncomeAmount(income(TODAY, 100_000, { isPretax: true }), taxed)).toBe(70_000);
    expect(netIncomeAmount(income(TODAY, 100_000), taxed)).toBe(100_000);
    expect(netIncomeAmount(income(TODAY, 100_000, { isPretax: true }), settingsWith(B))).toBe(
      100_000,
    );
  });

  it("month keys roll over year boundaries", () => {
    expect(lastMonthKeys("2026-02-10", 4)).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });

  it("monthly totals for the last 12 months ignore older entries", () => {
    const totals = monthlyIncomeTotals(
      [income("2026-10-01", 100), income("2026-10-20", 50), income("2025-10-31", 999)],
      settingsWith(B),
      TODAY,
    );
    expect(totals).toHaveLength(12);
    expect(totals[0]).toEqual({ month: "2025-11", total: 0 });
    expect(totals[11]).toEqual({ month: "2026-10", total: 150 });
  });

  it("6-month average divides by months since first entry in the window", () => {
    const s = settingsWith(B);
    expect(averageMonthlyIncome([], s, TODAY)).toBeNull();
    expect(averageMonthlyIncome([income("2026-10-01", 120_000)], s, TODAY)).toBe(120_000);
    expect(
      averageMonthlyIncome(
        [income("2026-09-01", 100_000), income("2026-10-01", 100_000)],
        s,
        TODAY,
      ),
    ).toBe(100_000);
    // First entry 6+ months back: full 6-month window.
    expect(
      averageMonthlyIncome([income("2026-01-01", 1), income("2026-05-01", 600_000)], s, TODAY),
    ).toBe(100_000);
  });

  it("sorts newest first", () => {
    const a = income("2026-01-01", 1);
    const b = income("2026-03-01", 1);
    const c = income("2026-02-01", 1);
    expect(sortIncomeNewestFirst([a, b, c]).map((e) => e.date)).toEqual([
      "2026-03-01",
      "2026-02-01",
      "2026-01-01",
    ]);
  });
});

describe("snapshots", () => {
  const settings = settingsWith(B);

  it("no snapshot without a budget", () => {
    expect(snapshotFromStatus(computeStatus(settingsWith(0), []), TODAY)).toBeNull();
    const snaps: Snapshot[] = [];
    expect(upsertSnapshot(snaps, null)).toBe(snaps);
  });

  it("creates one snapshot per month and overwrites the current month", () => {
    const sept: Snapshot = {
      date: "2026-09-15",
      liquidTotal: 1,
      effectiveAnnualB: 600_000,
      ratio: 0,
      level: "L0",
    };
    const first = upsertSnapshot(
      [sept],
      snapshotFromStatus(computeStatus(settings, []), "2026-10-01"),
    );
    expect(first).toHaveLength(2);
    const second = upsertSnapshot(
      first,
      snapshotFromStatus(computeStatus(settings, [holding("C1_LIQUID", 750_000)]), TODAY),
    );
    expect(second).toHaveLength(2);
    expect(second[1]).toMatchObject({ date: TODAY, level: "L1", ratio: 1.25 });
    expect(second[0]).toBe(sept);
  });

  it("returns the same instance when nothing changed", () => {
    const snap = snapshotFromStatus(computeStatus(settings, []), TODAY);
    const list = upsertSnapshot([], snap);
    expect(upsertSnapshot(list, snap)).toBe(list);
  });

  it("withCurrentSnapshot keeps identity when unchanged", () => {
    const data = { ...emptyAppData(), settings };
    const once = withCurrentSnapshot(data, TODAY);
    expect(once).not.toBe(data);
    expect(once.snapshots).toHaveLength(1);
    expect(withCurrentSnapshot(once, TODAY)).toBe(once);
  });

  it("stores ratio null when reliable income covers survival", () => {
    const hs = [holding("C2A_BUSINESS", 0, { netAnnualIncome: 1_000_000, incomeIsReliable: true })];
    const snap = snapshotFromStatus(computeStatus(settings, hs), TODAY);
    expect(snap).toMatchObject({ ratio: null, level: "L3", effectiveAnnualB: 0 });
  });
});
