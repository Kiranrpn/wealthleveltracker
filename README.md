# Wealthy?

A private, single-user money app that answers one question: **which wealth level am I at, and how much more liquid money do I need to reach the next one?**

Every rupee you earn is split into buckets and tracked as a ledger. Currency is Indian Rupees (INR) with lakh and crore formatting. No backend, no login, no external calls: everything stays on your device.

> **Disclaimer:** Wealthy? is a personal tracking tool, not financial advice. The numbers are only as good as what you enter.

## Screenshots

_Add screenshots here (`docs/dashboard.png`, `docs/ledger.png`)._

## How it works

### Buckets and the ledger

Six buckets, each with a running balance:

| Bucket       | What it is for                            | Counts toward level |
| ------------ | ----------------------------------------- | ------------------- |
| Survival     | Money for this month's essential spending | No                  |
| Emergency    | Emergency fund                            | **Yes**             |
| C1 Liquid    | Liquid corpus (index funds, FDs, cash)    | **Yes**             |
| C2a Business | Business stakes                           | No                  |
| C2b Illiquid | Land, locked-in assets                    | No                  |
| Splurge      | Guilt-free spending                       | No                  |

A bucket's balance is the sum of its ledger entries. There are four kinds:

- **Income**: split across buckets. The split for your current level fills in automatically; you can change any bucket's amount for that one entry (for example a bonus 100% to C1 Liquid). The amounts must add up to the income.
- **Spend**: takes money out of one bucket. You cannot spend more than the bucket holds.
- **Move money**: moves an amount from one bucket to another (reallocation). Same rule: no overdrawing.
- **Adjust balance**: opening balances (money you had before starting) and corrections.

Default income splits (edit them in Settings > Income split):

| Level | Survival | Emergency | C1 Liquid | Splurge |
| ----- | -------- | --------- | --------- | ------- |
| L0    | 50%      | 45%       | 0%        | 5%      |
| L1    | 40%      | 0%        | 55%       | 5%      |
| L2    | 35%      | 0%        | 60%       | 5%      |
| L3    | 35%      | 0%        | 55%       | 10%     |

The savings shares (45 / 55 / 60%) come from the original spec. At L0 savings build the emergency fund; from L1 they grow the corpus.

### Bucket goals

Each bucket can have a goal: none, a fixed amount, a number of months of B, or (C1 Liquid only) "enough for the next level". Balances then show either a yellow box with how much is short, or a green "Goal achieved" box with the surplus and a **Move surplus** button that opens a pre-filled move.

| Bucket            | Default goal                                                           |
| ----------------- | ---------------------------------------------------------------------- |
| Survival          | 1 month of B                                                           |
| Emergency         | 15 months of B (1.25 years, the line that marks L1)                    |
| C1 Liquid         | Enough, with Emergency, to reach the next level (at L3: to stay there) |
| C2a, C2b, Splurge | No goal                                                                |

Change them in Settings > Bucket goals.

### Transactions

Every entry lives in the **Transactions** tab: grouped by month with income and spending totals, each row expandable to show its bucket breakdown, notes, and Edit / Delete. Filter by text, type, bucket and month. The Ledger tab only holds balances, goals and the forms; after saving there is an Undo.

### Holdings

Holdings show where a bucket's money is parked (which fund, which bank). The ledger stays the single source of truth, so nothing is counted twice:

- Adding a holding: choose "bought with money already in the bucket" (balance unchanged) or "owned before I started" (its value is added as an opening balance).
- Updating a holding's value posts the gain or loss to its bucket automatically.
- Moving a holding to another bucket moves its value.
- Removing a holding: "sold, keep the cash" (balance unchanged) or "remove its value".
- A holding "bought with bucket money" cannot be worth more than the part of the bucket not yet recorded in holdings. Anything above that must be added as new money, so holdings never silently exceed the ledger.

The Holdings page is grouped by bucket: ledger balance, value in holdings, gain or loss per holding, stale warnings, and a status per bucket (Matched, not in holdings, or over ledger). Whenever a bucket's ledger and holdings differ, a bar at the top of every page says so until they match; tapping a bucket opens a pre-filled "Add holding".

### The level formula

1. **B** is your monthly survival budget. Annual B = B x 12.
2. **Liquid total** = Emergency balance + C1 Liquid balance.
3. **Coverage ratio** = Liquid total / Annual B. "12.4x" means your liquid money covers 12.4 years of survival spending.

| Level | Coverage ratio (defaults) | Meaning                                                           |
| ----- | ------------------------- | ----------------------------------------------------------------- |
| L0    | below 1.25                | Building your emergency fund                                      |
| L1    | 1.25 to below 10          | Emergency fund done, growing corpus to sustainability             |
| L2    | 10 to below 35            | Corpus pays part of survival                                      |
| L3    | 35 and above              | Corpus can cover survival. Salary job is a choice. **YOU DID IT** |

- A value exactly on a boundary belongs to the higher level.
- **Gap to next level** = next level's ratio x Annual B, minus Liquid total.
- **Progress** = how far your ratio is between the current level's floor and the next one.
- **What-if**: type a new monthly B to see if a lifestyle upgrade would drop you a level, and how much extra liquid money you would need to stay.
- **Coverage history**: one point per month. The axis stops just above the next threshold you have not reached, so early progress is visible.

### Settings

Organised into sections: Budget & levels, Income split, Tax, Appearance (dark / light theme), Names & labels, Backup & data. Every name, label, threshold and split is editable.

### Decisions where the spec was silent

| Topic              | Decision                                                                                                                                                                          |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ledger vs holdings | Ledger is the source of truth; holding changes post ledger entries. Avoids double counting.                                                                                       |
| Overspending       | Spends and moves cannot exceed the bucket balance at entry time. Deleting old entries can still push a bucket below zero; the dashboard then warns.                               |
| Pre-tax income     | Settings > Tax turns on pre-tax entry with your tax %. The after-tax amount is what gets split.                                                                                   |
| Rounding           | Splits are calculated in paise; any leftover paisa goes to the bucket with the largest share, so parts always add up exactly.                                                     |
| Level vs gap       | Level is decided by comparing rupees to rupees, so level and gap can never disagree because of rounding.                                                                          |
| Removed features   | ETA and reliable C2 income were removed to keep the flow simple.                                                                                                                  |
| Data from v1       | Old backups import cleanly: holdings become opening balances, old income entries are kept (posted to Survival with an offsetting opening entry), so every bucket keeps its value. |

## Run locally

Requires Node.js 20+ (CI uses 22).

```bash
npm install
npm run dev        # http://localhost:5173
```

Other scripts:

```bash
npm run build      # typecheck + production build into dist/
npm run preview    # serve the production build
npm test           # run all tests once
npm run coverage   # tests + coverage (calc.ts and ledger.ts must be 100%)
npm run typecheck
npm run lint
npm run format
```

## Tests

`tests/calc.test.ts` (levels, balances, splits, what-if, snapshots, warnings), `tests/ledger.test.ts` (income, spend, move, adjust, holding effects) and `tests/storage.test.ts` (validation, export/import round trip, v1 migration, CSV). `tests/app.test.tsx` drives the real UI: add income with a split, overspend blocked, move money, goals, undo, the Transactions tab filters and expandable rows, the ledger/holdings mismatch bar and holding cap, holding revaluation, theme. Coverage of `src/lib/calc.ts` and `src/lib/ledger.ts` is enforced at 100%.

## Try it in your browser

- **Locally:** `npm install && npm run dev`, then open http://localhost:5173.
- **On the web (any device):** one-time setup in GitHub: **Settings > Pages > Build and deployment > Source: GitHub Actions**. After that, every push runs `.github/workflows/deploy-pages.yml` and the app is live at `https://<your-username>.github.io/wealthleveltracker/`. Re-run the workflow from the **Actions** tab after enabling Pages the first time.

## Android APK

`.github/workflows/build-apk.yml` wraps the web app with Capacitor and builds an installable APK.

1. GitHub > **Actions** > **Build Android APK** > **Run workflow**.
2. When it finishes (about 5 to 8 minutes) the APK is attached to a new **Release** (`apk-1.0.<run number>`) on the repo's Releases page, and also to the workflow run as an artifact.
3. On your phone, open the Release, download the `.apk`, and allow installs from that app when Android asks.

Notes:

- Builds are signed with the fixed debug key in `android-signing/` and get a rising version number, so a new APK installs as an update and keeps your data. See `android-signing/README.md` for why this key is committed.
- In the app, **Export** opens the Android share sheet (save to Files, Drive, email). **Import** opens the file picker.
- App data lives inside the app on that phone. It is separate from any browser copy, and uninstalling the app deletes it. Export a backup first.

## Deploy

It is a static site. Build with `npm run build` and host the `dist/` folder anywhere:

- **GitHub Pages:** the build uses relative asset paths (`base: "./"`), so it works on a project sub-path. Push `dist/` to a `gh-pages` branch, or use the official "Deploy static content to Pages" Actions workflow with `path: dist`.
- **Netlify / Vercel / Cloudflare Pages:** build command `npm run build`, output directory `dist`.

Data lives in each browser's localStorage under the key `wealthy-app-data`. Export a JSON backup from Settings regularly; clearing browser data deletes it.

## Project structure

```
src/
  lib/          pure logic, no React (types, schema, calc, ledger, format, storage, defaults)
  components/   UI only: display results and collect input
  App.tsx       state, persistence, routing
tests/          Vitest + React Testing Library
```

## License

MIT, see [LICENSE](LICENSE).
