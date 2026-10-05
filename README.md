# Wealthy?

A private, single-user web app that answers one question: **which wealth level am I at, and how much more liquid money do I need to reach the next one?**

You log holdings and income. The app works out the rest. Currency is Indian Rupees (INR) with lakh and crore formatting. No backend, no login, no external calls: everything stays in your browser.

> **Disclaimer:** Wealthy? is a personal tracking tool, not financial advice. The numbers are only as good as what you enter. Consult a qualified adviser before making financial decisions.

## Screenshots

_Add screenshots here (`docs/dashboard.png`, `docs/holdings.png`)._

## The level formula, in plain language

1. **B** is your monthly survival budget: what you must spend each month to live. Annual B = B x 12.
2. **Liquid total** is the current value of everything in the **Emergency** and **C1 Liquid** buckets. Business stakes (C2a), illiquid assets like land (C2b) and Splurge money are shown but **never count** toward your level.
3. **Effective annual B** = Annual B minus any **net, reliable** yearly income from C2 holdings (never below 0). Dependable passive income means your corpus has less to cover.
4. **Coverage ratio** = Liquid total / Effective annual B. "12.4x" means your liquid money covers 12.4 years of survival spending.

| Level | Coverage ratio (defaults) | Meaning                                                           |
| ----- | ------------------------- | ----------------------------------------------------------------- |
| L0    | below 1.25                | Building your emergency fund                                      |
| L1    | 1.25 to below 10          | Emergency fund done, growing corpus to sustainability             |
| L2    | 10 to below 35            | Corpus pays part of survival                                      |
| L3    | 35 and above              | Corpus can cover survival. Salary job is a choice. **YOU DID IT** |

A value exactly on a boundary belongs to the higher level.

- **Gap to next level** = next level's ratio x Effective annual B, minus Liquid total.
- **Progress** = how far your ratio is between the current level's floor and the next level's floor (0 to 100%).
- At L3 tracking stops; the ratio keeps updating.
- If reliable C2 income covers all of Annual B, effective B is 0 and you are at L3 with the label "Reliable C2 income covers your full survival budget".
- If B is not set, no level is calculated and the app asks you to set it.

### ETA

Monthly contribution = your **6-month average net income** x the **savings share** for your current level (defaults 45% / 55% / 60% at L0 / L1 / L2). The app then simulates month by month:

```
liquid = liquid x (1 + expectedReturn / 12) + contribution
target = target x (1 + inflationRate / 12)
```

and reports the first month where liquid reaches the target. Rules:

- No income entries: "no data".
- Zero contribution and liquid below target: "not reachable" (even if returns beat inflation; the ETA measures progress you fund, not a market bet).
- Not reached within 50 years: "not reachable".

### What-if: lifestyle upgrade

Type a new monthly B to see the level you would be at with the same holdings. If it would drop you a level, you get a warning plus the extra liquid money needed to stay where you are.

## Decisions where the spec was silent or contradictory

| Topic                       | Decision                                                                                                                                                             |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Effective annual B          | The spec defines it as `max(0, Annual B)` but test 7 requires reliable C2 income to bring it to 0. Implemented as `max(0, Annual B - reliable C2 net income)`.       |
| Ratio when effective B is 0 | Shown as "covered by income" instead of a number; stored as `null` in snapshots. Never Infinity.                                                                     |
| Level vs gap consistency    | Level is decided by comparing liquid money to threshold money, so the level and gap can never disagree because of floating-point rounding.                           |
| 6-month average             | Covers the last 6 calendar months including the current one. Divided by the months since your first entry in that window (max 6), so a new user is not divided by 6. |
| Return and inflation        | Simple monthly rates (annual / 12). Contribution is held flat (conservative).                                                                                        |
| Pre-tax income              | Settings > Tax lets you turn on pre-tax entry and set a tax %. Each income entry can then be flagged pre-tax; the net amount is `amount x (1 - tax%)`.               |
| Editable names              | App name, level names, level meanings, final message and bucket labels are all editable in Settings. Internal bucket keys stay fixed so backups stay compatible.     |
| Snapshots                   | One per calendar month, overwritten on load and on every data change. Only created once B is set.                                                                    |
| Reset to defaults           | Resets thresholds, assumptions, tax and labels; keeps your B.                                                                                                        |
| Theme                       | Dark by default, light available from the header (remembered per browser).                                                                                           |
| Corrupt saved data          | Set aside under a `wealthy-app-data-corrupt-<time>` key and the app starts fresh with a visible error.                                                               |

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
npm run coverage   # tests + coverage (calc.ts and eta.ts must be 100%)
npm run typecheck
npm run lint
npm run format
```

## Tests

`tests/calc.test.ts`, `tests/eta.test.ts` and `tests/storage.test.ts` cover every case in the spec (numbered 1 to 14 in the test names), plus edge cases. `tests/app.test.tsx` drives the UI end to end in jsdom. Coverage of `src/lib/calc.ts` and `src/lib/eta.ts` is enforced at 100%.

## Deploy

It is a static site. Build with `npm run build` and host the `dist/` folder anywhere:

- **GitHub Pages:** the build uses relative asset paths (`base: "./"`), so it works on a project sub-path. Push `dist/` to a `gh-pages` branch, or use the official "Deploy static content to Pages" Actions workflow with `path: dist`.
- **Netlify / Vercel / Cloudflare Pages:** build command `npm run build`, output directory `dist`.

Data lives in each browser's localStorage under the key `wealthy-app-data`. Export a JSON backup from Settings regularly; clearing browser data deletes it.

## Project structure

```
src/
  lib/          pure logic, no React (types, schema, calc, eta, format, storage, defaults)
  components/   UI only: display results and collect input
  App.tsx       state, persistence, routing
tests/          Vitest + React Testing Library
```

## License

MIT, see [LICENSE](LICENSE).
