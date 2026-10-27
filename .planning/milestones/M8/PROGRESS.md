# M8 — Fast & Durable · PROGRESS

**Milestone goal:** Make the authenticated PreHub dashboard fast on first load and durable across sessions on the zero-cost Render/Vercel stack (session refresh, thin web + external tick, DB-backed bootstrap snapshot, proxy cache hardening, Playwright proof + 7-day soak) — no visual redesign, $0 budget.
**Spec:** `.planning/M8-SPEC.md` · **Roadmap:** `.planning/ROADMAP.md` (M8, phases 160–166)
**Branch:** `m8-operational-truth` · **Registered:** 2026-10-27

---

## Phase status

| Phase | Name | Status | Evidence |
|---|---|---|---|
| 160 | Baseline, audit, state repair | **DONE** | See §160 evidence below |
| 161 | Auth session durability | TODO | — |
| 162 | Thin web + tick | TODO | — |
| 163 | Bootstrap snapshot + read path | TODO | — |
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

## Remaining phases — TODO

| Phase | Name | Gate that must pass |
|---|---|---|
| 161 | Auth session durability | Session survives refresh + simulated expiry; no silent guest downgrade |
| 162 | Thin web + tick | Cold boot < 20s; `/health` survives a tick |
| 163 | Bootstrap snapshot + read path | First data < 5s; request count down |
| 164 | Backend hot-path + proxy hardening | Warm login < 3s; two-user cache isolation |
| 165 | Production verification + SLO gate | All SLOs except soak green |
| 166 | Soak start + review | 0 probe failures over 7 days (follow-up session) |

---

## Durability record

| What | Where |
|---|---|
| Phase 160 code + tests + probe fix | `51b3903` on `m8-operational-truth` |
| Phase 160 audit/keep-alive docs + this file | see commit following `51b3903` on the same branch |
| Untracked by design (repo convention: run artifacts are not committed) | `.planning/phases/160-baseline-audit-state-repair/artifacts/`, `.planning/baseline-pytest.txt` |
