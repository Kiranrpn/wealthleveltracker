import { describe, expect, it } from "vitest";
import {
  formatDate,
  formatDuration,
  formatINR,
  formatINRShort,
  formatMonth,
  formatPct,
  formatRatio,
  parseAmount,
  todayISO,
} from "../src/lib/format";

describe("format", () => {
  it("formats INR with Indian grouping", () => {
    expect(formatINR(1234567)).toBe("₹12,34,567");
    expect(formatINR(Number.NaN)).toBe("₹0");
  });

  it("formats lakh and crore", () => {
    expect(formatINRShort(5_250_000)).toBe("₹52.5 L");
    expect(formatINRShort(21_000_000)).toBe("₹2.1 Cr");
    expect(formatINRShort(15_000_000)).toBe("₹1.5 Cr");
    expect(formatINRShort(45_000)).toBe("₹45,000");
    expect(formatINRShort(-250_000)).toBe("-₹2.5 L");
    expect(formatINRShort(Number.POSITIVE_INFINITY)).toBe("₹0");
  });

  it("formats ratios and never shows NaN or Infinity", () => {
    expect(formatRatio(12.44)).toBe("12.4x");
    expect(formatRatio(0.8333)).toBe("0.83x");
    expect(formatRatio(null)).toBe("n/a");
    expect(formatRatio(Number.NaN)).toBe("n/a");
    expect(formatPct(0.45)).toBe("45%");
    expect(formatPct(Number.NaN)).toBe("0%");
  });

  it("formats dates and durations", () => {
    expect(formatDate("2026-10-05")).toBe("5 Oct 2026");
    expect(formatMonth("2026-10")).toBe("Oct 2026");
    expect(formatDate("bad")).toBe("bad");
    expect(todayISO(new Date(2026, 0, 9))).toBe("2026-01-09");
    expect(formatDuration(40)).toBe("3 yrs 4 mos");
    expect(formatDuration(13)).toBe("1 yr 1 mo");
    expect(formatDuration(0)).toBe("now");
  });

  it("parses typed amounts", () => {
    expect(parseAmount("1,50,000")).toBe(150000);
    expect(parseAmount("₹ 52.5")).toBe(52.5);
    expect(parseAmount("")).toBeNaN();
    expect(parseAmount("abc")).toBeNaN();
  });
});
