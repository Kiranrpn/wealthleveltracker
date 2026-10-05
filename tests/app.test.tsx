import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it } from "vitest";
import App from "../src/App";
import type { KeyValueStore } from "../src/lib/storage";

function memory(): KeyValueStore & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

beforeAll(() => {
  // Recharts' ResponsiveContainer needs ResizeObserver.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

function balanceOf(label: string): string {
  const card = screen.getByRole("region", { name: "Balances" });
  const item = within(card).getByText(label).closest("li") as HTMLElement;
  return item.textContent?.replace(label, "") ?? "";
}

describe("App", () => {
  it("splits income into buckets, records spends and moves, and updates the level", async () => {
    window.location.hash = "";
    const user = userEvent.setup();
    const store = memory();
    render(<App store={store} />);

    expect(screen.getAllByText("Set your survival budget in Settings").length).toBeGreaterThan(0);

    // Set B in Settings > Budget & levels.
    await user.click(screen.getByRole("button", { name: "Open Settings" }));
    const budget = screen.getByLabelText("Monthly survival budget, B (₹)");
    await user.clear(budget);
    await user.type(budget, "50000");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText("Saved.")).toBeInTheDocument();

    // Add income from the dashboard quick action: L0 split is 50 / 45 / 5.
    await user.click(screen.getByRole("link", { name: "Dashboard" }));
    await user.click(screen.getByRole("button", { name: "+ Add income" }));
    await user.type(screen.getByLabelText("Amount (₹)"), "100000");
    expect(screen.getByLabelText("Survival (50%)")).toHaveValue("50000");
    expect(screen.getByLabelText("Emergency (45%)")).toHaveValue("45000");
    expect(screen.getByText("All ₹1,00,000 allocated")).toBeInTheDocument();

    // Customise one bucket: the form must catch the mismatch.
    const splurge = screen.getByLabelText("Splurge (5%)");
    await user.clear(splurge);
    await user.type(splurge, "4000");
    expect(screen.getByText("Unallocated: ₹1,000")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save income" }));
    expect(screen.getByText(/Difference: ₹1,000/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reset to split" }));
    await user.click(screen.getByRole("button", { name: "Save income" }));

    expect(balanceOf("Survival")).toBe("₹50,000");
    expect(balanceOf("Emergency")).toBe("₹45,000");
    expect(balanceOf("Splurge")).toBe("₹5,000");

    // Spend from Splurge; overspending is blocked.
    await user.click(screen.getByRole("button", { name: "Record spend" }));
    await user.selectOptions(screen.getByLabelText("Paid from"), "SPLURGE");
    await user.type(screen.getByLabelText("Amount (₹)"), "6000");
    await user.click(screen.getByRole("button", { name: "Save spend" }));
    expect(screen.getByText("Splurge has only ₹5,000")).toBeInTheDocument();
    const amount = screen.getByLabelText("Amount (₹)");
    await user.clear(amount);
    await user.type(amount, "2000");
    await user.click(screen.getByRole("button", { name: "Save spend" }));
    expect(balanceOf("Splurge")).toBe("₹3,000");

    // Move money from Survival to Emergency.
    await user.click(screen.getByRole("button", { name: "Move money" }));
    await user.selectOptions(screen.getByLabelText("From"), "SURVIVAL");
    await user.selectOptions(screen.getByLabelText("To"), "EMERGENCY");
    await user.type(screen.getByLabelText("Amount (₹)"), "20000");
    await user.click(screen.getByRole("button", { name: "Save move" }));
    expect(balanceOf("Survival")).toBe("₹30,000");
    expect(balanceOf("Emergency")).toBe("₹65,000");

    // Opening balance pushes liquid to 7,50,000 -> L1.
    await user.click(screen.getByRole("button", { name: "Adjust balance" }));
    await user.selectOptions(screen.getByLabelText("Bucket"), "C1_LIQUID");
    await user.type(screen.getByLabelText("Amount (₹)"), "685000");
    await user.click(screen.getByRole("button", { name: "Save adjustment" }));

    await user.click(screen.getByRole("link", { name: "Dashboard" }));
    expect(screen.getByLabelText("Level L1")).toBeInTheDocument();
    expect(screen.getByText("₹52.5 L")).toBeInTheDocument();

    await user.type(screen.getByLabelText("New monthly budget (₹)"), "100000");
    expect(screen.getByText(/this upgrade drops you from/)).toBeInTheDocument();

    expect(document.body.textContent).not.toMatch(/NaN|Infinity/);
    const saved = JSON.parse(store.map.get("wealthy-app-data") as string);
    expect(saved.schemaVersion).toBe(2);
    expect(saved.transactions.map((t: { kind: string }) => t.kind)).toEqual([
      "INCOME",
      "SPEND",
      "TRANSFER",
      "ADJUST",
    ]);
  });

  it("updating a holding's value posts the change to its bucket", async () => {
    window.location.hash = "#/holdings";
    const user = userEvent.setup();
    render(<App store={memory()} />);

    await user.click(screen.getByRole("button", { name: "+ Add holding" }));
    await user.type(screen.getByLabelText("Name"), "Index fund");
    await user.type(screen.getByLabelText("Invested amount (₹)"), "100000");
    await user.type(screen.getByLabelText("Current value (₹)"), "100000");
    await user.click(screen.getByLabelText(/Owned before I started this ledger/));
    await user.click(screen.getByRole("button", { name: "Add holding" }));

    await user.click(screen.getByRole("button", { name: "Update current value of Index fund" }));
    const input = screen.getByLabelText("New current value for Index fund");
    await user.clear(input);
    await user.type(input, "110000");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await user.click(screen.getByRole("link", { name: "Ledger" }));
    expect(balanceOf("C1 Liquid")).toBe("₹1.1 L");
    expect(screen.getByText("Value gain: Index fund")).toBeInTheDocument();
    expect(screen.getByText("Added holding: Index fund")).toBeInTheDocument();
  });
});

describe("theme", () => {
  it("is set in Settings > Appearance, not in the header, and is remembered", async () => {
    window.localStorage.removeItem("wealthy-theme");
    window.location.hash = "#/settings";
    const user = userEvent.setup();
    const { unmount } = render(<App store={memory()} />);
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(screen.queryByRole("button", { name: /mode/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Appearance" }));
    await user.click(screen.getByLabelText("Light"));
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(window.localStorage.getItem("wealthy-theme")).toBe("light");
    unmount();

    render(<App store={memory()} />);
    expect(document.documentElement.dataset.theme).toBe("light");
    await user.click(screen.getByRole("button", { name: "Appearance" }));
    await user.click(screen.getByLabelText("Dark"));
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});
