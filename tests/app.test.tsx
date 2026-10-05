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

describe("App", () => {
  it("prompts for a budget, then shows a level after settings and a holding are added", async () => {
    window.location.hash = "";
    const user = userEvent.setup();
    const store = memory();
    render(<App store={store} />);

    expect(screen.getAllByText("Set your survival budget in Settings").length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: "Open Settings" }));
    const budget = screen.getByLabelText("Monthly survival budget, B (₹)");
    await user.clear(budget);
    await user.type(budget, "50000");
    await user.click(screen.getByRole("button", { name: "Save settings" }));
    expect(screen.getByText("Saved.")).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "Holdings" }));
    await user.click(screen.getByRole("button", { name: "+ Add holding" }));
    await user.type(screen.getByLabelText("Name"), "Liquid fund");
    await user.type(screen.getByLabelText("Invested amount (₹)"), "700000");
    await user.type(screen.getByLabelText("Current value (₹)"), "-5");
    await user.click(screen.getByRole("button", { name: "Add holding" }));
    expect(screen.getByText("Current value cannot be negative")).toBeInTheDocument();

    const current = screen.getByLabelText("Current value (₹)");
    await user.clear(current);
    await user.type(current, "750000");
    await user.click(screen.getByRole("button", { name: "Add holding" }));
    expect(screen.getByRole("cell", { name: /Liquid fund/ })).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "Dashboard" }));
    expect(screen.getByLabelText("Level L1")).toBeInTheDocument();
    expect(screen.getByText("₹52.5 L")).toBeInTheDocument();

    // What-if drop warning.
    await user.type(screen.getByLabelText("New monthly budget (₹)"), "100000");
    const alert = screen.getByText(/this upgrade drops you from/);
    expect(within(alert.parentElement as HTMLElement).getByText(/L1 to/)).toBeInTheDocument();

    expect(document.body.textContent).not.toMatch(/NaN|Infinity/);
    const saved = JSON.parse(store.map.get("wealthy-app-data") as string);
    expect(saved.holdings).toHaveLength(1);
    expect(saved.snapshots).toHaveLength(1);
  });
});
