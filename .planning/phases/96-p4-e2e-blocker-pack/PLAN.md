# Phase 96 — P4: E2E Blocker Pack

**Workstream:** P4 (release-gate coverage for P0–P3)
**Status:** **NOT IMPLEMENTED.** Plan only. No code or spec changed in commit
`20c7fa5` or in this documentation pass.
**Depends on:** 92 (P0), 93 (P1), 94 (P2), 95 (P3)

---

## 1. Why this phase exists

P0–P3 changed persistence, forecast math, the OSINT gate, alert delivery and
every honesty-sensitive UI surface. The only automated coverage added was
backend unit tests. The browser-level release gate still has:

1. a **known failing spec** (`multi-client-routing-isolation`), and
2. **no coverage at all** for the new contracts (alert delivery, OD
   preservation, proximity gate, write idempotency).

**Recorded blocker**

> "Open (pre-existing, unrelated to this change): `e2e/multi-client-routing-isolation.spec.ts`
> fails on this tree with and without the fix (`corridor-summary-pill` never
> renders under the test webServer) — needs a live-app debugging pass, not
> caused here."
>
> — `.planning/STATE.md:152`

**Harness precondition**

| Fact | Evidence |
|---|---|
| Playwright serves the production standalone bundle, not `next dev` | `frontend/playwright.config.ts:27-32` (`command: 'node .next/standalone/server.js'`) |
| `next.config.mjs` uses `output: 'standalone'` | `frontend/next.config.mjs:9` |
| The bundle is absent in this working tree, so all specs currently fail at webServer startup | `Test-Path frontend/.next/standalone/server.js` → `False` (checked this session) |
| The multi-client spec waits for the pill with a 30 s timeout | `frontend/e2e/multi-client-routing-isolation.spec.ts:22-23` |
| The pill is rendered by `CrisisSimulatorBar` | `frontend/components/map/CrisisSimulatorBar.tsx:220` |

---

## 2. Defect register (E2E-D*)

E2E-D1 is an **observed** failure. E2E-D2…D5 are **missing coverage**, not
observed product failures.

| ID | Blocker / gap | Current evidence | Required outcome |
|---|---|---|---|
| E2E-D1 | `multi-client-routing-isolation` never reaches the corridor pill; the two-context isolation claim is unverified | `STATE.md:152`; spec `:22-23`; pill `CrisisSimulatorBar.tsx:220` | `1/1` pass under the standalone webServer, with both contexts asserting their own `origin/dest/route` |
| E2E-D2 | No browser test that a validated alert reaches the client (WS `validated_alert` or SSE `simulation_complete.alert`) | `alert_fanout.py:57-84`; `main.py:386-415`; `agent_worker.py:200-216`; no matching spec under `frontend/e2e/` | A spec asserts the alert payload (crisis_id, summary, confidence) on at least the SSE path, and the WS path when a socket is opened |
| E2E-D3 | No browser test for the honesty contract (no `0.92`/`0.94`, no invented Rupiah, no invented citations on an empty payload) | `EvidenceTab.tsx:65-75`, `:260-272`; `MitigationTab.tsx:1031`, `:1064`, `:1186`, `:1275`; `CrisisMap.tsx:2943-2972` | Stub an incident with no confidence/citations/hedging; assert "Belum tersedia" copy and absence of fabricated values |
| E2E-D4 | No browser test that OD/cargo selections survive into the simulation request and that an unresolvable OD surfaces `no_route` | `agents/state.py:92-111`; `route_optimization.py:334-392`; `useCrisisSimulationStream.ts:79-93` | Intercept `POST /api/v1/simulate/stream`; assert snake_case `origin/destination/origin_coords/dest_coords/cargo_tonnage`; assert the routing banner shows the reason when `status: "no_route"` |
| E2E-D5 | No DB-level (or contract-level) test that replaying the same `crisis_id` writes one row and returns the same `incident_id` | `supabase_tools.py:355-449`; no test references `_persist_incident` | A test against a PostgREST-compatible fake or live project: two writes → one row, same id, second logs "reused" |
| E2E-D6 | E2E cannot start on a clean checkout without a production build | config `:27-32`; `.next/standalone` absent | Documented `npm run build` gate + CI step; failure message must say "build standalone first", not time out |

---

## 3. Test plan (to be implemented)

### 3.1 Unblock the harness

1. Add an npm script (e.g. `test:e2e`) that runs `next build` before
   `playwright test`, or document the two-step gate in the README.
2. Keep `reuseExistingServer: true`; do not weaken the 30 s selector timeout.
3. Capture the browser console on failure (`playwright.config.ts` currently
   sets `trace/video/screenshot: 'off'`; add `trace: 'retain-on-failure'` for
   this suite).

### 3.2 Fix E2E-D1 (debug, do not rewrite the test)

Reproduce with the standalone server, then determine which of these is true:

- `/dashboard` is not hydrated because the deep link requires `<Suspense>` and
  the query params are read after the pill's render gate;
- the pill is gated on a simulation/demo state that a bare deep link never
  sets;
- the standalone server is serving a stale build (no `.next/standalone`).

Only after the root cause is known may the spec or the component change. The
assertions on `origin/dest/route` and cross-context isolation
(`spec:25-58`) must remain.

### 3.3 New specs

| Spec (suggested) | Covers | Key assertions |
|---|---|---|
| `e2e/validated-alert-delivery.spec.ts` | E2E-D2 | Start a mock-agent simulation; terminal SSE contains `alert.crisis_id`; a `/ws/crisis/{id}` client receives `event: "validated_alert"` with the same id; late subscriber receives the replay |
| `e2e/ui-honesty-empty-payload.spec.ts` | E2E-D3 | Stub incident detail with `overall_confidence: null`, no citations, no hedging; assert `Keyakinan belum tersedia`, `BELUM ADA SITASI`, `Hedging biaya … belum tersedia`, `Belum tersedia` for cost; assert page has no `0.92`/`0.94` text |
| `e2e/od-contract-simulation.spec.ts` | E2E-D4 | Route interception captures the POST body; assert snake_case keys and no `cabai_merah`/`10.0`/`true`/`18.0` defaults; second case returns `status: "no_route"` and asserts the banner reason |
| `backend/tests/test_incident_idempotency.py` | E2E-D5 | Two `write_incident` calls for one `crisis_id` → one row, identical id, `reused` path exercised; missing service key → `""` + `supabase_write_disabled` |
| `backend/tests/test_alert_fanout.py` | E2E-D2 (unit) | `broadcast_validated_alert` delivers to a registered queue; no listener → 0; last alert replay; queue-full drops without raising |

---

## 4. Acceptance gate

```powershell
cd D:\College\Pidi.id\frontend
npm run build
npx playwright test e2e/multi-client-routing-isolation.spec.ts e2e/toll-bypass-routing.spec.ts e2e/mapbox-turn-by-turn.spec.ts e2e/validated-alert-delivery.spec.ts e2e/ui-honesty-empty-payload.spec.ts e2e/od-contract-simulation.spec.ts
```

Required result:

| Suite | Required |
|---|---|
| `multi-client-routing-isolation` | 1/1 pass (blocker cleared) |
| `toll-bypass-routing` | 7/7 pass (no routing regression) |
| `mapbox-turn-by-turn` | 3/3 pass (no geometry regression) |
| `validated-alert-delivery` | all pass |
| `ui-honesty-empty-payload` | all pass |
| `od-contract-simulation` | all pass |
| Console errors | none in the map/dashboard specs |

Backend gate:

```powershell
cd D:\College\Pidi.id\backend
.\.venv\Scripts\python.exe -m pytest tests/test_incident_idempotency.py tests/test_alert_fanout.py -q -p no:cacheprovider
```

- Replay idempotency and alert fan-out green.
- No test may depend on a live Supabase project; use the existing mock-client
  pattern or a PostgREST-compatible fake.

**Current status: gate not runnable in this tree** — the standalone server is
absent and no P4 spec exists.

---

## 5. Sequencing

1. E2E-D6 (build script) — otherwise nothing else is measurable.
2. E2E-D1 (debug the pill) — this is the actual release blocker.
3. E2E-D5 + `test_alert_fanout.py` (backend, fast, deterministic).
4. E2E-D2 (alert delivery) — depends on the fan-out unit test.
5. E2E-D4 (OD contract) — depends on the routing payload shape.
6. E2E-D3 (honesty) — last, because it touches every sidebar tab.

---

## 6. Explicit non-goals

- Do not "fix" E2E-D1 by weakening the isolation assertions or extending the
  timeout without a root cause.
- Do not add `data-testid` shims that render an empty pill just to satisfy the
  selector.
- Do not convert the honesty check into a snapshot test; the requirement is
  semantic ("absent renders as absent").
- Do not point E2E at `next dev`; the standalone server is the deployment
  parity path.
