import { useCallback, useEffect, useMemo, useState } from "react";
import { Dashboard } from "./components/Dashboard";
import { HoldingsTable } from "./components/HoldingsTable";
import { IncomeTable } from "./components/IncomeTable";
import { SettingsPanel } from "./components/SettingsPanel";
import { Alert } from "./components/ui";
import { withCurrentSnapshot } from "./lib/calc";
import { emptyAppData } from "./lib/defaults";
import { todayISO } from "./lib/format";
import { clearData, loadData, saveData, type KeyValueStore } from "./lib/storage";
import type { AppData } from "./lib/types";

const PAGES = [
  { id: "dashboard", label: "Dashboard" },
  { id: "holdings", label: "Holdings" },
  { id: "income", label: "Income" },
  { id: "settings", label: "Settings" },
] as const;
type PageId = (typeof PAGES)[number]["id"];

const THEME_KEY = "wealthy-theme";

/** In-memory fallback when localStorage is blocked (private mode, sandboxed iframes). */
function memoryStore(): KeyValueStore {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
  };
}

function browserStore(): KeyValueStore {
  try {
    return window.localStorage;
  } catch {
    return memoryStore();
  }
}

const defaultStore = browserStore();

function pageFromHash(): PageId {
  const id = window.location.hash.replace(/^#\/?/, "");
  return PAGES.some((p) => p.id === id) ? (id as PageId) : "dashboard";
}

function readTheme(): "dark" | "light" {
  try {
    return window.localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

export default function App({ store = defaultStore }: { store?: KeyValueStore }) {
  const today = todayISO();
  const [initial] = useState(() => loadData(store));
  const [data, setData] = useState<AppData>(() => withCurrentSnapshot(initial.data, today));
  const [saveError, setSaveError] = useState<string | null>(null);
  const [page, setPage] = useState<PageId>(pageFromHash);
  const [theme, setTheme] = useState<"dark" | "light">(readTheme);

  // Persist on every change.
  useEffect(() => {
    const r = saveData(store, data);
    setSaveError(r.ok ? null : r.errors[0]);
  }, [store, data]);

  useEffect(() => {
    const onHash = () => setPage(pageFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", theme === "dark" ? "#0b0f19" : "#f5f7fb");
    try {
      window.localStorage.setItem(THEME_KEY, theme);
    } catch {
      // Ignore.
    }
  }, [theme]);

  useEffect(() => {
    document.title = data.settings.labels.appName;
  }, [data.settings.labels.appName]);

  /** Every data change also refreshes the current month's snapshot. */
  const update = useCallback(
    (fn: (d: AppData) => AppData) => setData((d) => withCurrentSnapshot(fn(d), todayISO())),
    [],
  );

  const actions = useMemo(
    () => ({
      upsertHolding: (h: AppData["holdings"][number]) =>
        update((d) => {
          const exists = d.holdings.some((x) => x.id === h.id);
          return {
            ...d,
            holdings: exists ? d.holdings.map((x) => (x.id === h.id ? h : x)) : [...d.holdings, h],
          };
        }),
      deleteHolding: (id: string) =>
        update((d) => ({ ...d, holdings: d.holdings.filter((x) => x.id !== id) })),
      upsertIncome: (e: AppData["income"][number]) =>
        update((d) => {
          const exists = d.income.some((x) => x.id === e.id);
          return {
            ...d,
            income: exists ? d.income.map((x) => (x.id === e.id ? e : x)) : [...d.income, e],
          };
        }),
      deleteIncome: (id: string) =>
        update((d) => ({ ...d, income: d.income.filter((x) => x.id !== id) })),
      saveSettings: (s: AppData["settings"]) => update((d) => ({ ...d, settings: s })),
      replaceData: (next: AppData) => update(() => next),
      deleteAll: () => {
        clearData(store);
        update(() => emptyAppData());
      },
    }),
    [update, store],
  );

  const go = (id: PageId) => {
    window.location.hash = `/${id}`;
    setPage(id);
  };

  return (
    <div className="min-h-screen pb-10">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-accent focus:px-3 focus:py-2 focus:text-accent-fg"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-40 border-b border-line bg-bg/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-3">
          <h1 className="text-xl font-black tracking-tight">
            <span className="text-accent">{data.settings.labels.appName}</span>
          </h1>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          >
            <span aria-hidden="true">{theme === "dark" ? "\u2600" : "\u263E"}</span>
            {theme === "dark" ? "Light" : "Dark"}
          </button>
        </div>
        <nav aria-label="Main" className="mx-auto max-w-5xl overflow-x-auto px-4">
          <ul className="flex gap-1">
            {PAGES.map((p) => (
              <li key={p.id}>
                <a
                  href={`#/${p.id}`}
                  onClick={(e) => {
                    e.preventDefault();
                    go(p.id);
                  }}
                  aria-current={page === p.id ? "page" : undefined}
                  className={`block whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${
                    page === p.id
                      ? "border-accent text-fg"
                      : "border-transparent text-muted hover:text-fg"
                  }`}
                >
                  {p.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <main id="main" className="mx-auto max-w-5xl space-y-4 px-4 pt-4">
        {initial.error && <Alert tone="danger">{initial.error}</Alert>}
        {saveError && <Alert tone="danger">{saveError}</Alert>}

        {page === "dashboard" && (
          <Dashboard data={data} today={today} onOpenSettings={() => go("settings")} />
        )}
        {page === "holdings" && (
          <HoldingsTable
            holdings={data.holdings}
            labels={data.settings.labels}
            staleDays={data.settings.staleDays}
            today={today}
            onUpsert={actions.upsertHolding}
            onDelete={actions.deleteHolding}
          />
        )}
        {page === "income" && (
          <IncomeTable
            income={data.income}
            settings={data.settings}
            today={today}
            onUpsert={actions.upsertIncome}
            onDelete={actions.deleteIncome}
          />
        )}
        {page === "settings" && (
          <SettingsPanel
            data={data}
            today={today}
            onSaveSettings={actions.saveSettings}
            onReplaceData={actions.replaceData}
            onDeleteAll={actions.deleteAll}
          />
        )}
      </main>

      <footer className="mx-auto mt-10 max-w-5xl px-4 text-xs text-muted">
        Personal tracking tool, not financial advice. Data stays in this browser.
      </footer>
    </div>
  );
}
