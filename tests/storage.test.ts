import { describe, expect, it } from "vitest";
import { defaultSettings, emptyAppData } from "../src/lib/defaults";
import { holdingSchema, isValidIsoDate, settingsSchema } from "../src/lib/schema";
import {
  clearData,
  csvCell,
  exportJSON,
  holdingsToCSV,
  importJSON,
  incomeToCSV,
  loadData,
  migrate,
  newId,
  saveData,
  STORAGE_KEY,
  type KeyValueStore,
} from "../src/lib/storage";
import type { AppData } from "../src/lib/types";
import { holding, income } from "./fixtures";

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
    holdings: [
      holding("C1_LIQUID", 500_000, { notes: 'Has "quotes", commas' }),
      holding("C2A_BUSINESS", 1_000_000, { netAnnualIncome: 120_000, incomeIsReliable: true }),
    ],
    income: [income("2026-10-01", 150_000, { notes: "Oct salary" })],
    snapshots: [
      {
        date: "2026-10-05",
        liquidTotal: 500_000,
        effectiveAnnualB: 480_000,
        ratio: 1.04,
        level: "L0",
      },
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
    const data = sampleData() as unknown as Record<string, unknown>;
    const bad = {
      ...data,
      holdings: [
        { ...sampleData().holdings[0], currentValue: -1 },
        { ...sampleData().holdings[0], bucket: "CRYPTO" },
        { ...sampleData().holdings[0], lastUpdated: "2026-02-30" },
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
    const future = importJSON(JSON.stringify({ ...sampleData(), schemaVersion: 2 }));
    expect(future.ok).toBe(false);
    expect(importJSON(JSON.stringify({ schemaVersion: "x" })).ok).toBe(false);
  });
});

describe("migration", () => {
  it("fills missing settings from defaults for legacy (v0) data", () => {
    const legacy = { settings: { monthlySurvivalB: 40_000 }, holdings: [] };
    const m = migrate(legacy);
    expect(m.ok).toBe(true);
    const result = importJSON(JSON.stringify(legacy));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.schemaVersion).toBe(1);
      expect(result.data.settings.monthlySurvivalB).toBe(40_000);
      expect(result.data.settings.thresholds).toEqual({ L1: 1.25, L2: 10, L3: 35 });
      expect(result.data.settings.labels.appName).toBe("Wealthy?");
      expect(result.data.income).toEqual([]);
    }
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

  it("exports holdings and income with headers", () => {
    const data = sampleData();
    const h = holdingsToCSV(data.holdings).split("\r\n");
    expect(h[0]).toMatch(/^id,name,bucket,type/);
    expect(h).toHaveLength(3);
    const i = incomeToCSV(data.income).split("\r\n");
    expect(i[0]).toBe("id,date,source,amount,isPretax,notes");
    expect(i[1]).toContain("2026-10-01,Salary,150000,,Oct salary");
  });
});

describe("schemas", () => {
  it("validates dates strictly", () => {
    expect(isValidIsoDate("2026-10-05")).toBe(true);
    expect(isValidIsoDate("2026-02-29")).toBe(false);
    expect(isValidIsoDate("05/10/2026")).toBe(false);
  });

  it("drops income fields from non-C2 holdings", () => {
    const parsed = holdingSchema.parse(
      holding("C1_LIQUID", 1, { netAnnualIncome: 5, incomeIsReliable: true }),
    );
    expect(parsed).not.toHaveProperty("netAnnualIncome");
    expect(parsed).not.toHaveProperty("incomeIsReliable");
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
