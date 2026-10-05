import { describe, expect, it } from "vitest";
import { computeEta, MAX_ETA_MONTHS, simulateEta } from "../src/lib/eta";
import { B, holding, income, settingsWith, TODAY } from "./fixtures";

describe("computeEta", () => {
  const settings = settingsWith(B);

  it("9. no income entries -> NO_DATA", () => {
    expect(computeEta(settings, [holding("C1_LIQUID", 100_000)], [], TODAY)).toEqual({
      kind: "NO_DATA",
    });
  });

  it("10. contribution 0 and liquid below target -> NOT_REACHABLE", () => {
    const zeroShare = settingsWith(B, { savingsShare: { L0: 0, L1: 0, L2: 0 } });
    const r = computeEta(
      zeroShare,
      [holding("C1_LIQUID", 100_000)],
      [income(TODAY, 100_000)],
      TODAY,
    );
    expect(r.kind).toBe("NOT_REACHABLE");
    if (r.kind === "NOT_REACHABLE") {
      expect(r.monthlyContribution).toBe(0);
      expect(r.reason).toMatch(/No money/);
    }
    // Also directly in the simulator, even with returns beating inflation.
    expect(
      simulateEta({
        startLiquid: 100,
        monthlyContribution: 0,
        target: 200,
        annualReturn: 0.2,
        annualInflation: 0,
      }).kind,
    ).toBe("NOT_REACHABLE");
  });

  it("no budget -> NO_BUDGET; L3 -> FINAL", () => {
    expect(computeEta(settingsWith(0), [], [income(TODAY, 1)], TODAY)).toEqual({
      kind: "NO_BUDGET",
    });
    expect(computeEta(settings, [holding("C1_LIQUID", 21_000_000)], [], TODAY)).toEqual({
      kind: "FINAL",
    });
  });

  it("returns an ETA using 6-month avg income x savings share for the current level", () => {
    // L0, liquid 7,40,000, target 7,50,000. Avg income 1,00,000 x 0.45 = 45,000/month.
    const r = computeEta(
      settings,
      [holding("C1_LIQUID", 740_000)],
      [income("2026-10-01", 100_000)],
      TODAY,
    );
    expect(r.kind).toBe("REACHABLE");
    if (r.kind === "REACHABLE") {
      expect(r.monthlyContribution).toBe(45_000);
      expect(r.savingsShare).toBe(0.45);
      expect(r.averageIncome).toBe(100_000);
      expect(r.months).toBe(1);
      expect(r.etaDate).toBe("2026-11-01");
      expect(r.nextLevel).toBe("L1");
      expect(Number.isFinite(r.targetAtEta)).toBe(true);
    }
  });

  it("reports not reachable when the horizon is exceeded", () => {
    const r = computeEta(
      settingsWith(B, { expectedReturn: 0, inflationRate: 0.2 }),
      [holding("C1_LIQUID", 0)],
      [income(TODAY, 100)],
      TODAY,
    );
    expect(r.kind).toBe("NOT_REACHABLE");
    if (r.kind === "NOT_REACHABLE") expect(r.reason).toMatch(/50 years/);
  });
});

describe("simulateEta", () => {
  it("11. matches a hand-calculated month-by-month example", () => {
    // liquid 100, +10/month, 12% return (1%/month), target 132, 12% inflation (1%/month)
    // m1: liquid 100*1.01+10 = 111.00       target 132*1.01 = 133.32
    // m2: liquid 111*1.01+10 = 122.11       target 134.6532
    // m3: liquid 122.11*1.01+10 = 133.3311  target 135.999732
    // m4: liquid 133.3311*1.01+10 = 144.664411  target 137.35972932 -> reached
    const r = simulateEta({
      startLiquid: 100,
      monthlyContribution: 10,
      target: 132,
      annualReturn: 0.12,
      annualInflation: 0.12,
    });
    expect(r.kind).toBe("REACHABLE");
    if (r.kind === "REACHABLE") {
      expect(r.months).toBe(4);
      expect(r.finalLiquid).toBeCloseTo(144.664411, 6);
      expect(r.finalTarget).toBeCloseTo(137.35972932, 6);
    }
    // Same inputs without inflation: reached in month 3 (133.3311 >= 132).
    const noInflation = simulateEta({
      startLiquid: 100,
      monthlyContribution: 10,
      target: 132,
      annualReturn: 0.12,
      annualInflation: 0,
    });
    expect(noInflation).toMatchObject({ kind: "REACHABLE", months: 3 });
  });

  it("already at target -> 0 months", () => {
    expect(
      simulateEta({
        startLiquid: 200,
        monthlyContribution: 0,
        target: 100,
        annualReturn: 0,
        annualInflation: 0,
      }),
    ).toEqual({ kind: "REACHABLE", months: 0, finalLiquid: 200, finalTarget: 100 });
  });

  it("respects a custom horizon and treats non-finite rates as 0", () => {
    const r = simulateEta({
      startLiquid: 0,
      monthlyContribution: 1,
      target: 100,
      annualReturn: Number.NaN,
      annualInflation: Number.POSITIVE_INFINITY,
      maxMonths: 12,
    });
    expect(r).toEqual({
      kind: "NOT_REACHABLE",
      reason: "Not reached within 1 years at the current pace.",
    });
    expect(MAX_ETA_MONTHS).toBe(600);
  });

  it("stops instead of overflowing to Infinity", () => {
    const liquidOverflow = simulateEta({
      startLiquid: 1e308,
      monthlyContribution: 1e308,
      target: 1.7e308,
      annualReturn: 0,
      annualInflation: 0,
    });
    expect(liquidOverflow.kind).toBe("NOT_REACHABLE");
    const targetOverflow = simulateEta({
      startLiquid: 0,
      monthlyContribution: 1,
      target: 1.7e308,
      annualReturn: 0,
      annualInflation: 12,
    });
    expect(targetOverflow.kind).toBe("NOT_REACHABLE");
  });
});
