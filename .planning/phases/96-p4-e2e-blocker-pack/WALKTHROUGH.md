# Phase 96 — P4 Walkthrough (what was actually implemented)

**Code commit:** `20c7fa5` (2026-10-23) — **contains no `frontend/e2e/` change**.
Verified with `git show --name-status 20c7fa5`; no `e2e/*` path appears.
**This documentation pass changed code/specs:** no.
**Status:** plan only; the release blocker is still open.

---

## 1. What was implemented

**Nothing in P4.** No spec was added, fixed, or skipped. No application code was
changed for E2E. The only P4 artefact is `PLAN.md`.

This is deliberate: the blocker is a live-app hydration/debug problem, and the
session's code commit was already large. Inventing a selector workaround would
hide the defect.

---

## 2. Evidence collected in this session

| Check | Command | Result |
|---|---|---|
| P4 has no code change | `git show --name-status 20c7fa5` | 40 files; none under `frontend/e2e/` |
| Standalone server required by Playwright | `frontend/playwright.config.ts:27-32` | `command: 'node .next/standalone/server.js'` |
| Production output mode | `frontend/next.config.mjs:9` | `output: 'standalone'` |
| Standalone bundle present? | `Test-Path frontend/.next/standalone/server.js` | **False** |
| Known failing spec | `.planning/STATE.md:152` | `corridor-summary-pill` never renders under the test webServer |
| Pill exists in source | `frontend/components/map/CrisisSimulatorBar.tsx:220` | `data-testid="corridor-summary-pill"` |
| Spec expects pill after deep link | `frontend/e2e/multi-client-routing-isolation.spec.ts:15-23` | 30 s `waitForSelector` per context |
| Existing routing coverage | `frontend/e2e/toll-bypass-routing.spec.ts:74-206` | 7 tests |
| Existing geometry coverage | `frontend/e2e/mapbox-turn-by-turn.spec.ts:13-48` | 3 tests |

Because the standalone bundle is absent, `playwright test` cannot boot its
webServer in this tree. No E2E command was executed; reporting a pass/fail here
would be fabricated.

---

## 3. What is green (not P4)

| Suite | Command | Result |
|---|---|---|
| Backend agents + calibration | `backend/.venv/Scripts/python.exe -m pytest tests/test_agents.py tests/test_consensus_calibration.py -q -p no:cacheprovider` | 33 passed |
| OSINT/news/scrapers | 7-file pytest command (see Phase 94) | 128 passed |
| TypeScript | `npx tsc --noEmit` | exit 0 |
| Frontend arbiter | `npm test` | 3/3 pass |

None of these cover E2E-D1…D6.

---

## 4. Commands the next context window should run

```powershell
cd D:\College\Pidi.id\frontend
npm run build
Test-Path .next\standalone\server.js          # must be True before Playwright
npx playwright test e2e/multi-client-routing-isolation.spec.ts --reporter=list
```

Expected before the fix: the spec fails at
`waitForSelector('[data-testid="corridor-summary-pill"]')` (spec `:22-23`).

Then, once the root cause is known:

```powershell
npx playwright test e2e/toll-bypass-routing.spec.ts e2e/mapbox-turn-by-turn.spec.ts --reporter=list
```

Do not change `playwright.config.ts` timeouts or `reuseExistingServer` to make
the failure disappear.

---

## 5. Open items handed forward

1. **E2E-D6** — no script/CI step builds the standalone bundle before tests.
2. **E2E-D1** — the pill hydration failure is undiagnosed; no console capture is
   enabled (`trace/video/screenshot: 'off'` in `playwright.config.ts`).
3. **E2E-D2** — alert delivery (WS + SSE) has no browser test.
4. **E2E-D3** — honesty copy has no browser test.
5. **E2E-D4** — OD payload/no_route has no browser test.
6. **E2E-D5** — idempotent replay has no DB-level or contract-level test;
   `_persist_incident` is referenced by no test.
7. Backend tests for `alert_fanout`, `resolve_node_result`, `init_write_health`,
   `_incident_key`, `normalize_operational_fields`, and the GraphRAG loader do
   not exist.

No commits were made by this documentation pass.
