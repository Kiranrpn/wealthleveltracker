import { useCallback, useEffect, useMemo, useState } from "react";
import { Dashboard } from "./components/Dashboard";
import { HoldingsTable } from "./components/HoldingsTable";
import { LedgerPage, type FormState } from "./components/LedgerPage";
import { SettingsPanel, type Theme } from "./components/SettingsPanel";
import { Alert } from "./components/ui";
import { balances, withCurrentSnapshot } from "./lib/calc";
import { emptyAppData } from "./lib/defaults";
import { todayISO } from "./lib/format";
import {
  holdingAddEffects,
  holdingRemoveEffects,
  holdingUpdateEffects,
  type HoldingAddMode,
  type HoldingRemoveMode,
} from "./lib/ledger";
import { clearData, loadData, newId, saveData, type KeyValueStore } from "./lib/storage";
import type { AppData, Holding, Transaction, TxKind } from "./lib/types";

const PAGES = [
  { id: "dashboard", label: "Dashboard" },
  { id: "ledger", label: "Ledger" },
  { id: "holdings", label: "Holdings" },
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

function readTheme(): Theme {
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
  const [theme, setTheme] = useState<Theme>(readTheme);
  const [ledgerForm, setLedgerForm] = useState<FormState>(null);

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
      upsertTx: (tx: Transaction) =>
        update((d) => {
          const exists = d.transactions.some((x) => x.id === tx.id);
          return {
            ...d,
            transactions: exists
              ? d.transactions.map((x) => (x.id === tx.id ? tx : x))
              : [...d.transactions, tx],
          };
        }),
      deleteTx: (id: string) =>
        update((d) => ({ ...d, transactions: d.transactions.filter((x) => x.id !== id) })),
      addHolding: (h: Holding, mode: HoldingAddMode) =>
        update((d) => ({
          ...d,
          holdings: [...d.holdings, h],
          transactions: [...d.transactions, ...holdingAddEffects(h, mode, todayISO(), newId)],
        })),
      updateHolding: (h: Holding) =>
        update((d) => {
          const prev = d.holdings.find((x) => x.id === h.id);
          if (!prev) return d;
          return {
            ...d,
            holdings: d.holdings.map((x) => (x.id === h.id ? h : x)),
            transactions: [...d.transactions, ...holdingUpdateEffects(prev, h, todayISO(), newId)],
          };
        }),
      removeHolding: (h: Holding, mode: HoldingRemoveMode) =>
        update((d) => ({
          ...d,
          holdings: d.holdings.filter((x) => x.id !== h.id),
          transactions: [...d.transactions, ...holdingRemoveEffects(h, mode, todayISO(), newId)],
        })),
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
    window.scrollTo?.(0, 0);
  };

  const quickAction = (kind: TxKind) => {
    setLedgerForm({ kind, editing: null });
    go("ledger");
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
        <div className="mx-auto max-w-5xl px-4 pt-3">
          <h1 className="text-xl font-black tracking-tight text-accent">
            {data.settings.labels.appName}
          </h1>
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
          <Dashboard
            data={data}
            today={today}
            onOpenSettings={() => go("settings")}
            onQuickAction={quickAction}
          />
        )}
        {page === "ledger" && (
          <LedgerPage
            transactions={data.transactions}
            settings={data.settings}
            today={today}
            form={ledgerForm}
            setForm={setLedgerForm}
            onUpsert={actions.upsertTx}
            onDelete={actions.deleteTx}
          />
        )}
        {page === "holdings" && (
          <HoldingsTable
            holdings={data.holdings}
            bal={balances(data.transactions)}
            labels={data.settings.labels}
            staleDays={data.settings.staleDays}
            today={today}
            onAdd={actions.addHolding}
            onUpdate={actions.updateHolding}
            onRemove={actions.removeHolding}
          />
        )}
        {page === "settings" && (
          <SettingsPanel
            data={data}
            today={today}
            theme={theme}
            onTheme={setTheme}
            onSaveSettings={actions.saveSettings}
            onReplaceData={actions.replaceData}
            onDeleteAll={actions.deleteAll}
          />
        )}
      </main>

      <footer className="mx-auto mt-10 max-w-5xl px-4 text-xs text-muted">
        Personal tracking tool, not financial advice. Data stays on this device.
      </footer>
    </div>
  );
}
