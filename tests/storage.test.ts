import { describe, expect, it } from "vitest";
import { defaultSettings, emptyAppData } from "../src/lib/defaults";
import { holdingSchema, isValidIsoDate, settingsSchema } from "../src/lib/schema";
import { balances } from "../src/lib/calc";
import {
  clearData,
  csvCell,
  exportJSON,
  holdingsToCSV,
  importJSON,
  loadData,
  migrate,
  newId,
  parseAppData,
  saveData,
  STORAGE_KEY,
  transactionsToCSV,
  type KeyValueStore,
} from "../src/lib/storage";
import type { AppData } from "../src/lib/types";
import { holding, opening, TODAY } from "./fixtures";

class MemoryStore implements KeyValueStore {
  map = new Map<string, string>();
  getItem(k: string) {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, v);
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
}

function sampleData(): AppData {
  return {
    ...emptyAppData(),
    settings: { ...defaultSettings(), monthlySurvivalB: 50_000 },
    transactions: [
      opening("C1_LIQUID", 400_000),
      {
        kind: "INCOME",
        id: "inc1",
        date: "2026-10-01",
        source: "Salary",
        amount: 150_000,
        postings: [
          { bucket: "SURVIVAL", amount: 60_000 },
          { bucket: "C1_LIQUID", amount: 82_500 },
          { bucket: "SPLURGE", amount: 7_500 },
        ],
        notes: 'Has "quotes", commas',
      },
      {
        kind: "TRANSFER",
        id: "tr1",
        date: "2026-10-02",
        postings: [
          { bucket: "SURVIVAL", amount: -10_000 },
          { bucket: "EMERGENCY", amount: 10_000 },
        ],
      },
      {
        kind: "SPEND",
        id: "sp1",
        date: "2026-10-03",
        category: "Rent",
        postings: [{ bucket: "SURVIVAL", amount: -25_000 }],
      },
    ],
    holdings: [holding("C1_LIQUID", 400_000, { notes: "Index fund" })],
    snapshots: [
      { date: "2026-10-05", liquidTotal: 492_500, annualB: 600_000, ratio: 0.82, level: "L0" },
    ],
  };
}

describe("14. export / import", () => {
  it("round-trips identical data", () => {
    const data = sampleData();
    const result = importJSON(exportJSON(data));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual(data);
  });

  it("rejects invalid JSON with an error", () => {
    const result = importJSON("{ not json");
    expect(result).toEqual({ ok: false, errors: ["File is not valid JSON"] });
  });

  it("rejects negative amounts, invalid dates and unknown buckets with clear messages", () => {
    const data = sampleData();
    const bad = {
      ...data,
      holdings: [
        { ...data.holdings[0], currentValue: -1 },
        { ...data.holdings[0], bucket: "CRYPTO" },
        { ...data.holdings[0], lastUpdated: "2026-02-30" },
      ],
    };
    const result = importJSON(JSON.stringify(bad));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain("holdings.0.currentValue: Current value cannot be negative");
      expect(
        result.errors.some((e) => e.startsWith("holdings.1.bucket: Bucket must be one of")),
      ).toBe(true);
      expect(result.errors).toContain("holdings.2.lastUpdated: Enter a valid date (YYYY-MM-DD)");
    }
  });

  it("rejects non-object JSON and future schema versions", () => {
    expect(importJSON("[]")).toEqual({ ok: false, errors: ["Backup must be a JSON object"] });
    const future = importJSON(JSON.stringify({ ...sampleData(), schemaVersion: 3 }));
    expect(future.ok).toBe(false);
    expect(importJSON(JSON.stringify({ schemaVersion: "x" })).ok).toBe(false);
  });
});

describe("ledger validation on import", () => {
  it("rejects malformed transactions", () => {
    const data = sampleData();
    const bad = {
      ...data,
      transactions: [
        { kind: "SPEND", id: "s", date: TODAY, postings: [{ bucket: "SURVIVAL", amount: 5 }] },
        {
          kind: "TRANSFER",
          id: "t",
          date: TODAY,
          postings: [
            { bucket: "SURVIVAL", amount: -5 },
            { bucket: "SPLURGE", amount: 4 },
          ],
        },
        { kind: "ADJUST", id: "a", date: TODAY, postings: [{ bucket: "SURVIVAL", amount: 0 }] },
        { kind: "MAGIC", id: "m", date: TODAY, postings: [] },
      ],
    };
    const r = importJSON(JSON.stringify(bad));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors).toContain(
        "transactions.0.postings.0.amount: A spend must reduce the bucket",
      );
      expect(r.errors.some((e) => e.includes("same amount to the other"))).toBe(true);
      expect(r.errors).toContain("transactions.2.postings.0: Adjustment cannot be 0");
      expect(r.errors.some((e) => e.startsWith("transactions.3.kind"))).toBe(true);
    }
  });

  it("rejects a split that does not add up to 100%", () => {
    const data = sampleData();
    data.settings.splits.L1 = { ...data.settings.splits.L1, SPLURGE: 0.5 };
    const r = importJSON(JSON.stringify(data));
    expect(!r.ok && r.errors).toContain("settings.splits.L1: Shares must add up to 100%");
  });
});

describe("migration from v1 (holdings as balances)", () => {
  const v1 = {
    schemaVersion: 1,
    settings: {
      monthlySurvivalB: 40_000,
      savingsShare: { L0: 0.45, L1: 0.55, L2: 0.6 },
      expectedReturn: 0.1,
    },
    holdings: [
      {
        id: "h1",
        name: "FD",
        bucket: "EMERGENCY",
        type: "FD",
        whereParked: "HDFC",
        investedAmount: 300_000,
        currentValue: 312_000,
        lastUpdated: "2026-09-30",
      },
      {
        id: "h2",
        name: "Shop",
        bucket: "C2A_BUSINESS",
        type: "Biz",
        whereParked: "Pune",
        investedAmount: 1,
        currentValue: 500_000,
        lastUpdated: "2026-09-30",
        netAnnualIncome: 120_000,
        incomeIsReliable: true,
      },
    ],
    income: [{ id: "i1", date: "2026-10-01", source: "Salary", amount: 180_000 }],
    snapshots: [
      { date: "2026-08-31", liquidTotal: 1, effectiveAnnualB: 480_000, ratio: 2.5, level: "L1" },
      { date: "2026-09-30", liquidTotal: 1, effectiveAnnualB: 0, ratio: null, level: "L3" },
    ],
  };

  it("keeps every bucket's value and every income entry", () => {
    const r = parseAppData(JSON.stringify(v1), TODAY);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const b = balances(r.data.transactions);
    expect(b).toMatchObject({ EMERGENCY: 312_000, C2A_BUSINESS: 500_000, SURVIVAL: 0 });
    expect(r.data.transactions.filter((t) => t.kind === "INCOME")).toHaveLength(1);
    expect(r.data.holdings[1]).not.toHaveProperty("netAnnualIncome");
    expect(r.data.settings).not.toHaveProperty("savingsShare");
    expect(r.data.settings.monthlySurvivalB).toBe(40_000);
    expect(r.data.snapshots).toEqual([
      { date: "2026-08-31", liquidTotal: 1, annualB: 480_000, ratio: 2.5, level: "L1" },
    ]);
  });

  it("treats data with no schemaVersion as v1 and fills defaults", () => {
    expect(migrate({ settings: { monthlySurvivalB: 1 } }).ok).toBe(true);
    const r = importJSON(JSON.stringify({ settings: { monthlySurvivalB: 40_000 } }));
    expect(r.ok && r.data.settings.labels.buckets.SURVIVAL).toBe("Survival");
    expect(r.ok && r.data.transactions).toEqual([]);
  });

  it("a saved split replaces the default split whole", () => {
    const data = sampleData();
    data.settings.splits.L0 = {
      SURVIVAL: 1,
      EMERGENCY: 0,
      C1_LIQUID: 0,
      C2A_BUSINESS: 0,
      C2B_ILLIQUID: 0,
      SPLURGE: 0,
    };
    const r = importJSON(JSON.stringify(data));
    expect(r.ok && r.data.settings.splits.L0.SURVIVAL).toBe(1);
  });
});

describe("localStorage", () => {
  it("saves and loads under one key", () => {
    const store = new MemoryStore();
    const data = sampleData();
    expect(saveData(store, data).ok).toBe(true);
    expect([...store.map.keys()]).toEqual([STORAGE_KEY]);
    expect(loadData(store)).toEqual({ data });
    clearData(store);
    expect(loadData(store).data).toEqual(emptyAppData());
  });

  it("sets corrupt data aside and starts fresh", () => {
    const store = new MemoryStore();
    store.setItem(STORAGE_KEY, "{broken");
    const r = loadData(store);
    expect(r.error).toMatch(/could not be read/);
    expect(r.data).toEqual(emptyAppData());
    expect([...store.map.keys()].some((k) => k.startsWith(`${STORAGE_KEY}-corrupt-`))).toBe(true);
  });

  it("handles storage that throws", () => {
    const broken: KeyValueStore = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("full");
      },
      removeItem: () => {
        throw new Error("denied");
      },
    };
    expect(loadData(broken).error).toMatch(/not available/);
    expect(saveData(broken, emptyAppData()).ok).toBe(false);
    expect(() => clearData(broken)).not.toThrow();
  });
});

describe("CSV", () => {
  it("escapes cells and blocks formula injection", () => {
    expect(csvCell(undefined)).toBe("");
    expect(csvCell(12)).toBe("12");
    expect(csvCell(true)).toBe("true");
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell('a "b", c')).toBe('"a ""b"", c"');
    expect(csvCell("=SUM(A1)")).toBe("'=SUM(A1)");
  });

  it("exports holdings and the ledger with headers", () => {
    const data = sampleData();
    const h = holdingsToCSV(data.holdings).split("\r\n");
    expect(h[0]).toMatch(/^id,name,bucket,type/);
    expect(h).toHaveLength(2);
    const t = transactionsToCSV(data.transactions).split("\r\n");
    expect(t[0]).toBe(
      "id,date,kind,source,category,enteredAmount,isPretax,SURVIVAL,EMERGENCY,C1_LIQUID,C2A_BUSINESS,C2B_ILLIQUID,SPLURGE,notes",
    );
    expect(t[2]).toBe(
      'inc1,2026-10-01,INCOME,Salary,,150000,,60000,,82500,,,7500,"Has ""quotes"", commas"',
    );
    expect(t[3]).toBe("tr1,2026-10-02,TRANSFER,,,,,-10000,10000,,,,,");
    expect(t[4]).toBe("sp1,2026-10-03,SPEND,,Rent,,,-25000,,,,,,");
  });
});

describe("schemas", () => {
  it("validates dates strictly", () => {
    expect(isValidIsoDate("2026-10-05")).toBe(true);
    expect(isValidIsoDate("2026-02-29")).toBe(false);
    expect(isValidIsoDate("05/10/2026")).toBe(false);
  });

  it("accepts a valid holding", () => {
    expect(holdingSchema.safeParse(holding("C1_LIQUID", 1)).success).toBe(true);
  });

  it("requires increasing thresholds", () => {
    const s = { ...defaultSettings(), thresholds: { L1: 10, L2: 5, L3: 35 } };
    const r = settingsSchema.safeParse(s);
    expect(r.success).toBe(false);
  });

  it("newId returns unique strings", () => {
    expect(newId()).not.toBe(newId());
  });
});
