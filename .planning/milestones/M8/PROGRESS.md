# M8 — Fast & Durable · PROGRESS

**Milestone goal:** Make the authenticated PreHub dashboard fast on first load and durable across sessions on the zero-cost Render/Vercel stack (session refresh, thin web + external tick, DB-backed bootstrap snapshot, proxy cache hardening, Playwright proof + 7-day soak) — no visual redesign, $0 budget.
**Spec:** `.planning/M8-SPEC.md` · **Roadmap:** `.planning/ROADMAP.md` (M8, phases 160–166)
**Branch:** `m8-operational-truth` · **Registered:** 2026-10-27

---

## Phase status

| Phase | Name | Status | Evidence |
|---|---|---|---|
| 160 | Baseline, audit, state repair | **DONE** | See §160 evidence below |
| 161 | Auth session durability | **DONE** | See §161 evidence below |
| 162 | Thin web + tick | **DONE** | See §162 evidence below |
| 163 | Bootstrap snapshot + read path | **163a DONE / 163b TODO** | See §163a evidence below |
| 164 | Backend hot-path + proxy hardening | TODO | — |
| 165 | Production verification + SLO gate | TODO | — |
| 166 | Soak start + review | TODO | — |
| 167–170 | *not defined* | TODO | `ROADMAP.md` and `M8-SPEC.md` define only 160–166; no 167–170 scope exists yet. Create them in the roadmap before planning. |

---

## Phase 160 — Baseline, Audit, State Repair · DONE

Baseline recorded and the backend read path audited **before** any M8 fix, so every
later SLO claim has a measured starting point. Shipped with it: the world-truth
hazard counters (toggle-independent), the keep-alive probe rewrite, and the
reconciled M8 planning state.

### Delivered

| Deliverable | Path |
|---|---|
| Backend audit (81 routes / 24 auth-dependent / cache status / sync I/O / ranked findings) | `.planning/phases/160-baseline-audit-state-repair/BACKEND-AUDIT.md` |
| Keep-alive probe rewrite + timeout math | `.github/workflows/keep-alive.yml`, `.../KEEPALIVE-FIX.md` |
| World-truth weather summary endpoint (Redis-cached, uncapped, toggle-free) | `backend/app/routers/routing_router.py`, `backend/app/services/weather_fusion_service.py` |
| Dashboard counters read world truth; `degraded` renders `—`, verified-empty renders `0` | `frontend/components/dashboard/DashboardClient.tsx`, `TopNavTelemetry.tsx`, `frontend/lib/api.ts`, `frontend/lib/types.ts` |
| Backend contract test | `backend/tests/test_weather_summary_contract.py` |
| Playwright truth spec (hermetic, all `/api/` intercepted) | `frontend/e2e/hazard-counter-truth.spec.ts` |
| Playwright baseline scaffold (local + production, redacting) | `frontend/e2e/m8-baseline.spec.ts`, `frontend/playwright.m8.config.ts`, `frontend/e2e/m8/README.md` |
| Milestone spec / state | `SPEC.md` (rewritten to M8), `.planning/M8-SPEC.md`, `ROADMAP.md`, `STATE.md`, `PROJECT.md`, `REQUIREMENTS.md` |

### Evidence

| Gate | Result | Source |
|---|---|---|
| Backend tests (phase-160 selection) | **17 passed** | Reported by the phase run |
| `npx tsc --noEmit` | **exit 0** | Re-verified this session |
| `npm run build` | **0 errors**, all static routes emitted | Reported by the phase run |
| Playwright (truth spec) | **4 passed** | Reported by the phase run |

**Re-verification note (this session, 2026-10-27):** `npx tsc --noEmit` → exit 0
(confirmed). `pytest backend/tests/test_weather_summary_contract.py -q` → **7
passed** — the contract file contains 7 test cases, so the "17 pytest" figure is a
wider selection than that file and its exact selection was not recorded. `npm run
build` and the 4 Playwright cases were **not** re-run here (build writes `.next`,
and the truth spec needs a live local server), so they stand on the phase's own
record. Treat 17 / build-0 / 4-playwright as reported-not-reproduced until the
next gate re-runs them.

### Baseline failures (pre-existing, carried into M8)

Full suite at baseline: **380 passed, 4 failed, 14 warnings in 436.77s** — see
`.planning/baseline-pytest.txt` (untracked run log).

| # | Test | Note |
|---|---|---|
| 1 | `tests/test_impact_assessment.py::test_disruption_impact_assessment_spatial_filtering` | Pre-existing; not caused by phase 160 |
| 2 | `tests/test_news_pipeline.py::test_news_stampede_guard_prevents_duplicate_runs` | Pre-existing; Redis lock state coupled |
| 3 | `tests/test_travel_fuel_guard.py::test_patch_120L_for_73km_rejected_422` | Pre-existing; fuel-guard threshold |
| 4 | `tests/test_travel_fuel_guard.py::test_patch_1L_for_73km_rejected_too_efficient` | Pre-existing; fuel-guard threshold |

These four are the honest baseline: later phases must not claim them as
regressions, and phase 165 must not close the SLO gate with them still red
without stating so.

### Baseline metrics (production, 2026-10-27)

Source: `.planning/phases/160-baseline-audit-state-repair/artifacts/m8-baseline-2026-10-27T08-45-38-331Z.md` (untracked, per repo convention artifacts stay out of git).

| Account | Login | First data | Requests | Token lifetime | Role / company |
|---|---|---|---|---|---|
| DISPATCHER | 7771 ms | 73812 ms | 91 (66 distinct) | 3600 s | DISPATCHER / pos_logistik |
| REGULATOR | 5238 ms | 23740 ms | 74 (65 distinct) | 3600 s | REGULATOR / bapanas |
| GUEST | 4835 ms | 9777 ms | 51 (47 distinct) | 3600 s | GUEST / demo_sandbox |

### Known open items handed to later phases

1. Audit counts are pinned to base commit `2eeb1ca` (81 routes / 24 auth-dependent). The new `GET /api/v1/weather/summary` makes the working tree **82 routes / 25 auth-dependent**; re-pin the baseline now that it is committed (see `BACKEND-AUDIT.md` §1.1a).
2. `GET /api/v1/weather/summary` uses sync `cache_get`/`cache_set` inside `async def` — same defect class finding **F13** assigns to phase 164.
3. `keep-alive.yml` is rewritten and lint-validated but **never dispatched** (no GitHub token assumed). A manual `workflow_dispatch` is still owed.
4. Production baseline was captured with throttling **off**; the SLO target (first data < 5s on Fast 4G) needs a throttled re-capture in phase 165.

---

## Phase 161 — Auth session durability · DONE

Closes the two P0 findings from `BACKEND-AUDIT.md` **and** wires the client refresh
path, so an expired token can no longer masquerade as a guest session. Plan:
`.planning/phases/161-auth-session-durability/PLAN.md`.

**Branch note:** committed on the session branch `m9-operational-truth` as
`b76baa1`; the concurrent M9 weather work was deliberately left unstaged.
M8's own branch is `m8-operational-truth` — cherry-pick pending.

### Delivered

| Deliverable | Path |
|---|---|
| Fail-closed `get_optional_user` (+ `WWW-Authenticate: Bearer`), async auth deps, JWKS pre-warm, cached relay/admin clients | `backend/app/auth/supabase_auth.py` |
| `/auth/session` contract, guest-session/switch-role evaluator policy | `backend/app/routers/auth_router.py` |
| `M8_EVALUATOR_EMAILS` / `M8_EVALUATOR_COMPANIES` settings | `backend/app/config.py` |
| Cached service-role client (write path) | `backend/app/db/supabase_client.py` |
| Non-fatal JWKS pre-warm task in lifespan | `backend/app/main.py` |
| Auth exports | `backend/app/auth/__init__.py` |
| Hermetic contract test (21 cases) | `backend/tests/test_m8_auth_contract.py` |
| RBAC expectations updated to the new policy | `backend/tests/test_auth_rbac.py` |
| Live-seed tool no longer relies on anonymous minting | `backend/scripts/seed_laporan_render.py` |
| Session durability (Supabase boot, refresh mirror, optimistic hydration, re-auth, logout race, cross-tab) | `frontend/lib/authContext.tsx` |
| Magic-link copy + re-auth notice | `frontend/components/auth/AuthModal.tsx` |
| `exp` required by the edge check | `frontend/middleware.ts` |
| Supabase flags documented as load-bearing | `frontend/lib/supabaseClient.ts` |
| Playwright durability spec + config match | `frontend/e2e/m8-auth.spec.ts`, `frontend/playwright.m8.config.ts`, `frontend/e2e/m8/README.md` |

### Policy shipped

| Caller | `/auth/guest-session` | `/auth/switch-role` |
|---|---|---|
| no header | GUEST only, tenant forced to `demo_sandbox` (else `403`) | `401` |
| authenticated evaluator† | any role inside `M8_EVALUATOR_COMPANIES` (default `demo_sandbox`) | `200`, tenant forced to caller's `company_id` |
| authenticated non-evaluator | `403` | `403` |
| supplied-but-invalid token | `401`, never a guest downgrade | `401` |

† evaluator = `company_id == "demo_sandbox"` or email in `M8_EVALUATOR_EMAILS`
(default `evaluator@kompetisi-lrip.id`). The anonymous preview, evaluator login and
1-click persona switch inside `demo_sandbox` are unchanged.

### Evidence

| Gate | Result | Source |
|---|---|---|
| `pytest backend/tests/test_m8_auth_contract.py -q` | **21 passed** (4.09 s) | run in this session |
| `pytest backend/tests -q` | **408 passed, 3 failed** (332.50 s) | run in this session |
| `cd frontend; npx tsc --noEmit` | **exit 0** | run in this session (twice, after the final edit) |
| Playwright `e2e/m8-auth.spec.ts` | **3 passed** (1.7m) locally with the DISPATCHER test account: 7-day cookie, stale-token recovery, cross-tab logout; backend acceptance asserted directly via `/api/v1/auth/me` | run in this session |

**Full-suite delta vs. the phase-160 baseline (380 pass / 4 fail):**

- Still failing and known: `test_impact_assessment.py::test_disruption_impact_assessment_spatial_filtering`,
  `test_news_pipeline.py::test_news_stampede_guard_prevents_duplicate_runs`.
- New in this tree, **not auth-related**: `test_cpu_routing_weather.py::test_cpu_routing_service_flags_seed_fallback_when_tomtom_unavailable`
  (`optimize_fleet_routes_cpu` reports `is_fallback=False` with TomTom degraded;
  reproducible in isolation). Owned by the concurrent routing/weather work.
- Baseline fuel-guard pair (`test_travel_fuel_guard.py`) **passes** here and in
  isolation — the baseline failure was order/state-coupled.
- No auth test regressed.

### Behaviour changes

1. Invalid/expired stored token → login modal with an explicit "session ended"
   notice (previously: silent read-only guest).
2. Anonymous `guest-session` for DISPATCHER/REGULATOR → `403` (previously: a valid
   operator JWT for any tenant).
3. `switch-role` from a real operator tenant → `403`; the demo sandbox flow is intact.
4. Magic-link send no longer claims the session is live; the session is applied on
   landing via `detectSessionInUrl` + `SIGNED_IN`.

### Open items handed on

1. Session survival **past access-token expiry** is still unmeasured (needs a
   short-TTL token or a 1 h wait) — the client now refreshes and mirrors correctly,
   but the Supabase refresh-token TTL is a project setting (M8-SPEC open item #1).
2. The 7-day cookie is only meaningful if the refresh-token TTL is ≥ 7 days.
3. Anonymous GUEST minting remains enabled (restricted to `demo_sandbox`); the
   fallback signing secret when `SUPABASE_JWT_SECRET` is unset is still a
   production risk (audit §7.1) — phase 164/165.
4. Cross-tenant gaps (audit F6) and client-wide 401 handling outside the auth
   context are untouched.
5. `backend/scripts/seed_laporan_render.py` now requires `DISPATCHER_TOKEN`; the
   documented one-shot mint is gone by design.

---

## Phase 162 — Thin web + external tick · DONE

Batch ingestion no longer competes with boot or with user requests: the web
process is thin and one protected, idempotent tick drives ingestion from outside.
Plan: `.planning/phases/162-thin-web-external-tick/PLAN.md`.

**Branch note:** implemented on `m9-operational-truth`, **uncommitted**; the
concurrent M9 weather/retention files were left unstaged and untouched.

### Delivered

| Deliverable | Path |
|---|---|
| `POST /internal/tick` — constant-time `X-Internal-Token`, 404 when disabled, 202 + background task, process lock | `backend/app/routers/internal_tick.py` |
| Job registry (8 cadences), fair due selection, Supabase state, lease, budget, retry | `backend/app/services/job_scheduler.py` |
| `scheduler_jobs` table + `acquire_scheduler_job` / `release_scheduler_job` RPCs | `infra/supabase/migrations/023_scheduler_jobs.sql` |
| One-cycle poller bodies + thin-web gate + deferred supervised AIS/fan-out | `backend/app/main.py` |
| Settings: `INPROCESS_BATCH_POLLERS`, `INTERNAL_TICK_TOKEN`, `TICK_MAX_JOBS`, `TICK_BUDGET_SECONDS`, `CONTINUOUS_TASK_DELAY_SECONDS` | `backend/app/config.py` |
| `run_once()` seam so PIHPS/social reuse one cycle instead of a second loop | `backend/app/scrapers/base_scraper.py` |
| Production env (thin web, tick secret, budget) | `render.yaml` |
| Runbook: cron-job.org POST tick + token, catch-up, state queries | `docs/KEEPALIVE_RUNBOOK.md` |
| Hermetic contract tests (17) | `backend/tests/test_internal_tick.py` |

### Tick contract

| Case | Response |
|---|---|
| `INTERNAL_TICK_TOKEN` empty | `404` (endpoint disabled; empty header never matches) |
| wrong/missing token | `401` + `WWW-Authenticate: Bearer` |
| valid | `202 {"accepted": true, "due": [...], "skipped": [...], "run_id": "..."}` |
| concurrent tick | `202 {"accepted": false, "reason": "already_running"}` |
| planning failed | `202 {"accepted": true, "reason": "plan_failed", "due": []}` |

Job cadences: `news 300 · bmkg 300 · tomtom 1800 · open_meteo 21600 · firms 10800 ·
pihps 86400 · social 3600 · bnpb 3600`. `last_finished_at` is the durable
`last_run_at` (advances only on success); failures set `last_error` +
`retry_after=120s`; the per-tick cap is 2 jobs / 120s and the remainder stays due
(ordered by `age / cadence`, so daily jobs cannot be starved by 5-minute ones).

### What still runs in-process (production)

| Worker | Runs? |
|---|---|
| 8 batch pollers | **no** — driven by `POST /internal/tick` |
| AISstream WebSocket | yes — deferred 75s, supervised with backoff |
| validated-alert Redis fan-out | yes — deferred 75s, supervised (still per-process for `/ws/crisis`) |
| JWKS pre-warm, Redis ping, `init_write_health` | yes — unchanged |
| `/health` | yes — constant dict, never touches the scheduler |

`POLLERS_ENABLED=false` still disables everything (HTTP-only replica), unchanged.

### Evidence

| Gate | Result | Source |
|---|---|---|
| `pytest tests/test_internal_tick.py -q` | **17 passed** (2.38 s), exit 0 | run in this session |
| `pytest tests/test_m8_auth_contract.py -q` | **21 passed** (4.61 s), exit 0 | run in this session |
| `pytest tests -q` | **431 passed, 5 failed** (288.34 s) | run in this session |
| `python -c "import app.main"` | `import ok`; `/internal/tick` registered, alias hidden from OpenAPI | run in this session |
| `python -X importtime -c "import app.main"` | ~2.8 s total; **numpy/scipy/langgraph/pandas/agents not imported** | run in this session |
| `yaml.safe_load(render.yaml)` | parses; plan `free`, region `singapore`, healthCheckPath `/health` unchanged | run in this session |

**Full-suite failures (not fixed here, per instruction):**

| Test | Cause | Attribution |
|---|---|---|
| `test_cpu_routing_weather.py::test_cpu_routing_service_flags_seed_fallback_when_tomtom_unavailable` | `assert False is True` (`is_fallback`) | Concurrent M9 routing/weather work |
| `test_impact_assessment.py::test_disruption_impact_assessment_spatial_filtering` | `assert 674.4 < 250.0` (perf budget) | Known pre-existing (baseline #1) |
| `test_news_pipeline.py::test_news_stampede_guard_prevents_duplicate_runs` | `Lock is bound to a different event loop` | Known pre-existing (baseline #2) |
| `test_travel_fuel_guard.py::test_patch_120L_for_73km_rejected_422` | test expects `starlette.status.HTTP_422_UNPROCESSABLE_CONTENT` (absent in the pinned starlette) | Known baseline #3 (env/version) |
| `test_travel_fuel_guard.py::test_patch_1L_for_73km_rejected_too_efficient` | same `starlette.status` attribute error | Known baseline #4 (env/version) |

No phase-162 test failed; no auth test regressed. The full-suite count rose from
408 to 431 because this phase adds 17 tests (the rest is concurrent M9 test churn).

### Open items handed on

1. **Migration 023 must be applied** before production can tick; without it the
   scheduler logs `state_unavailable` and the fallback CAS path is used only if
   the table exists but the RPC does not.
2. **Capacity:** 2 jobs × 5 min ≈ 576 slots/day vs ~661 scheduled runs/day at the
   configured cadences. Fair ordering prevents starvation, but `pihps` (daily) can
   lag by a tick. Watch `scheduler_jobs.last_finished_at` in phase 165.
3. **Redis writes inside cycle bodies are still sync** (audit F13) — phase 164.
4. `POST /internal/tick` has only been verified hermetically; the live RPC +
   cron-job.org smoke belongs to phase 165.
5. `app.main` still imports every router eagerly (≈2.8 s here, `corridor_router`
   pulls `app.adapters`); router-level lazy import is phase 164 scope.

---

## Phase 163a — DB-backed dashboard bootstrap snapshot (backend) · DONE

The first dashboard paint no longer has to fan out to ~25–30 endpoints. The 15
public dashboard sections are composed **once per tick** and persisted in Supabase;
`GET /api/v1/dashboard/bootstrap` reads that row in one authenticated request
(`Cache-Control: private, no-store`), with a bounded live fallback and tenant-scoped
`fleet`/`erp` for DISPATCHER/REGULATOR. Plan:
`.planning/phases/163-bootstrap-snapshot-read-path/PLAN.md`.

**Branch note:** implemented on `m9-operational-truth`, **uncommitted**; the
concurrent M9 weather/routing/frontend files were read-only for this unit and left
untouched (the M9 session committed its own work as `bb9b61b` during the phase).

### Delivered

| Deliverable | Path |
|---|---|
| `dashboard_snapshots` table (payload, computed_at, schema_version, source_freshness), `computed_at` index, RLS enabled with no policies, write/read contract comment | `infra/supabase/migrations/024_dashboard_snapshots.sql` |
| Snapshot builder (15 public sections, parallel, 5 s each, isolated), store/read, staleness helper, never-raising tick entry point | `backend/app/services/dashboard_snapshot_service.py` |
| `GET /api/v1/dashboard/bootstrap` + hidden `/dashboard/bootstrap` alias | `backend/app/routers/dashboard_bootstrap.py` |
| Router registration (2-line delta) | `backend/app/main.py` |
| Post-tick snapshot refresh, `snapshot_built`/`snapshot_failed`, 30 s outer bound, runs even when no job is due | `backend/app/routers/internal_tick.py` |
| Service tests (11) + endpoint tests (13) | `backend/tests/test_dashboard_snapshot.py`, `backend/tests/test_dashboard_bootstrap.py` |
| Tick-hook tests (3) added to the phase-162 suite | `backend/tests/test_internal_tick.py` |

### Endpoint contract

| Case | Response |
|---|---|
| No `Authorization` header | `200`, `role=GUEST`, `company_id=null`, public sections only |
| Invalid/expired token | `401` + `WWW-Authenticate: Bearer` (phase 161 fail-closed), `Cache-Control: private, no-store` |
| Fresh stored row (≤ 600 s) | `200`, `stale=false`, sections from `dashboard_snapshots.payload` |
| Missing/stale/unparseable row | bounded live build (8 s cap), `200`, `stale=true`, `reason` |
| Live build fails/times out | `200` with the stored payload if any (else `sections={}`), `stale=true`, `reason=live_build_failed|live_build_timeout` |
| `DISPATCHER` / `REGULATOR` | adds live `fleet` (geometry excluded, claim-scoped) + `erp` (same role policy as `/api/v1/erp/summary`); failures are `degraded`, still `200` |
| `modality` | `truck` (default) \| `vessel` \| `air`; unknown → `400 INVALID_MODALITY` |
| Headers | `private, no-store` on 200, 400 and 401 |
| Side effects | none — the tick is the only writer; a read never ingests or writes |

### Cached vs live

- **Cached (Supabase, survives restart):** all 15 public sections, written by
  `POST /internal/tick` every 5 minutes after the batch jobs.
- **Live:** `fleet` (vehicles router 8 s per-tenant cache → telemetry) and `erp`
  (ledger 120 s Redis/mem cache) for operators; the bounded fallback build for
  guests when the row is missing/stale (returned to that caller, **not** written).
- **Degraded public section:** in-process last-good value (`cached: true`) if the
  process has one, else `null`. Tenant sections never reuse the last-good cache
  (name-only key would cross tenants).

### Evidence

| Gate | Result | Source |
|---|---|---|
| `pytest tests/test_dashboard_snapshot.py tests/test_dashboard_bootstrap.py -q` | **24 passed**, 3 warnings, 2.68 s, exit 0 | run in this session |
| `pytest tests/test_internal_tick.py tests/test_m8_auth_contract.py -q` | **41 passed** (20 tick incl. 3 new + 21 auth), 3 warnings, 3.17 s, exit 0 | run in this session |
| `python -c "import app.main"` | `import ok in 2.67s`; `/api/v1/dashboard/bootstrap` + `/dashboard/bootstrap` registered | run in this session |
| Migration 024 SQL | reviewed manually; no SQL parser installed (`pglast`/`sqlparse`/`sqlglot` absent); idempotent style matched to 022/023 | run in this session |

### Open items handed on

1. **Migration 024 must be applied** before the tick can persist a snapshot. Until
   then every mount takes the bounded live path with `stale=true` (correct, slower).
2. **163b (frontend) is deferred** until the concurrent M9 dashboard edits settle:
   mount the single endpoint, lazy sections, 30 s timeout/abort, stale badge, types.
3. **`fleet`/`incidents`/`erp` still block on sync PostgREST** (audit F4); the 5 s
   section budget cannot preempt that. Phase 164 owns the async-I/O sweep.
4. **`evaluation_test_matrix` is a large section** (137 cases); if the 163b trace
   shows it dominating the payload, move it to a lazy-mounted section.
5. **No production measurement yet** — the "< 5 s first data / request count down"
   gate needs the 163b client and a Playwright trace (phase 165).

---

## Remaining phases — TODO

| Phase | Name | Gate that must pass |
|---|---|---|
| 163b | Bootstrap client integration (frontend) | First data < 5s; request count down |
| 164 | Backend hot-path + proxy hardening | Warm login < 3s; two-user cache isolation |
| 165 | Production verification + SLO gate | All SLOs except soak green |
| 166 | Soak start + review | 0 probe failures over 7 days (follow-up session) |

---

## Durability record

| What | Where |
|---|---|
| Phase 160 code + tests + probe fix | `51b3903` on `m8-operational-truth` |
| Phase 160 audit/keep-alive docs + this file | see commit following `51b3903` on the same branch |
| Phase 161 code + tests (auth durability) | `b76baa1` on `m9-operational-truth` (M8 branch cherry-pick pending) |
| Phase 161 plan + this evidence | `.planning/phases/161-auth-session-durability/PLAN.md`, this file |
| Phase 162 code + tests (thin web + tick) | `557a467` on `m9-operational-truth` |
| Phase 162 plan + this evidence | `.planning/phases/162-thin-web-external-tick/PLAN.md`, this file |
| Phase 162 migration (must be applied before prod tick works) | `infra/supabase/migrations/023_scheduler_jobs.sql` |
| Phase 163a code + tests (bootstrap snapshot, backend) | working tree on `m9-operational-truth`, **uncommitted** |
| Phase 163a plan + this evidence | `.planning/phases/163-bootstrap-snapshot-read-path/PLAN.md`, this file |
| Phase 163a migration (must be applied before the tick can persist a snapshot) | `infra/supabase/migrations/024_dashboard_snapshots.sql` |
| Untracked by design (repo convention: run artifacts are not committed) | `.planning/phases/160-baseline-audit-state-repair/artifacts/`, `.planning/baseline-pytest.txt` |
