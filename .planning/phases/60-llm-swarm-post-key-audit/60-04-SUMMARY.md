---
phase: 60-llm-swarm-post-key-audit
plan: "04"
subsystem: refactoring
tags: [cpu-routing, open-meteo, rename-refactor, nvidia-purge, networkx, or-tools]

# Dependency graph
requires:
  - phase: 60-llm-swarm-post-key-audit
    provides: Phase 59-02 env-contract sync (NVIDIA key placeholders that this plan removes)
provides:
  - Zero NVIDIA/Earth2 naming in the live pipeline (backend, frontend, env contracts, docs)
  - Canonical CPU routing identity: cpu_routing_service + POST /api/v1/routing/optimize + OpenMeteoAdapter
affects: [routing-consumers, evaluation-dashboard, future-llm-phases]

# Actuals (#2632) — same estimateTokens scale (chars/4 over the realized diff)
actuals:
  tokens: 11582
  tasks: 9
  commits: 3
plan_head_before: 9f250c87639a5794b03e57004838c366b1e5bd2f
plan_head_after: 663c9427c3886523566f381f3373f798270c6cd3

# Tech tracking
tech-stack:
  added: []
  patterns: ["rename-only refactor with zero behavior change", "aliased re-export to avoid class-name collision"]

key-files:
  created: []
  modified:
    - backend/app/adapters/open_meteo_adapter.py
    - backend/app/services/cpu_routing_service.py
    - backend/app/routers/routing_router.py
    - frontend/lib/api.ts

key-decisions:
  - "Full rename with no backwards-compat aliases (endpoint, function, props, keys)"
  - "Fabricated savings percentages removed rather than computed (no honest baseline exists)"
  - "Detector/guardrail patterns and live secrets intentionally left untouched"

patterns-established:
  - "Purge rule: banned-vendor strings must reach zero hits in live pipeline dirs, verified by case-insensitive grep"

requirements-completed: []

coverage:
  - id: D1
    description: "Backend purge compiles (AST parse on all 15 touched files) and scoped grep returns zero hits"
    verification:
      - kind: other
        ref: "python AST parse over 15 touched backend files"
        status: pass
      - kind: other
        ref: "case-insensitive grep cuopt|fourcastnet|earth2 over backend/agents/frontend/env/docs scope"
        status: pass
    human_judgment: false
  - id: D2
    description: "Frontend typecheck passes after endpoint/prop renames"
    verification:
      - kind: other
        ref: "npx tsc --noEmit in frontend/ (tsc 5.9.3)"
        status: pass
    human_judgment: false
  - id: D3
    description: "pytest suites for gateway and CPU routing/weather (unrun — pytest not installed in env)"
    verification: []
    human_judgment: true
    rationale: "pytest module is absent from the environment and installing packages is forbidden; AST + tsc are the available automated proofs. A human must run the suites where pytest exists."

# Metrics
duration: 16min
completed: 2026-10-17
status: complete
---

# Phase 60 Plan 04: NVIDIA Naming Purge Summary

**Deleted cuopt_adapter.py, renamed Earth2/cuOpt identifiers to Open-Meteo/CPU naming across backend, frontend, env contracts and docs — CPU routing (NetworkX + OR-Tools) and Open-Meteo weather run exactly as before, with zero banned-vendor strings left in the live pipeline.**

## Performance

- **Duration:** ~16 min
- **Started:** 2026-10-17T01:13:00+07:00
- **Completed:** 2026-10-17T01:29:00+07:00
- **Tasks:** 9 of 9 DO-steps complete
- **Files modified:** 25 (2 deleted-via-rename accounted as renames, 1 file deleted)

## Accomplishments

- Backend purge: `cuopt_adapter.py` deleted; `earth2_adapter.py` renamed to `open_meteo_adapter.py` (`OpenMeteoAdapter`, `open_meteo` source/stream keys); `cuopt_tomtom_service.py` renamed to `cpu_routing_service.py` (`optimize_fleet_routes_cpu`, `routing_solution` key); endpoint is now `POST /api/v1/routing/optimize`.
- Cache/stream keys rotated: `lrip:cache:earth2` to `lrip:cache:open_meteo`, `lrip:events:earth2` to `lrip:events:open_meteo` (main poll loop, ingestion worker, prediction agent, tests).
- Config/gateway narrowed: `nvidia_cuopt` + `nvidia_fourcastnet` fields deleted from `Settings`; `get_nvidia_key` keeps only the two DeepSeek NIM keys; test key tuple updated.
- Fabricated metrics removed: hardcoded `travel_time_savings_pct: 18.5` / `fuel_cost_reduction_pct: 14.2` dropped from the service response; frontend `|| 18.5` fallback dropped (`?? null`, nullable type); stale 18.5% claim removed from `llm_reasoning_service.py` prose.
- Env/docs: `NVIDIA_CUOPT` / `NVIDIA_FOURCASTNET` removed from `.env.example`, `backend/.env.example`, `render.yaml` (DeepSeek NIM keys kept); `docs/README.md` backwards-compat note rewritten (no aliases remain).

## Task Commits

Each step was committed atomically:

1. **Backend purge** - `b7ce494` (refactor: adapters, service, routers, config, gateway, prediction, tests)
2. **Frontend rename** - `81c189a` (refactor: api.ts, DashboardClient, TopNavTelemetry, CrisisMap; tsc clean)
3. **Env/docs contracts** - `663c942` (refactor: env examples, render.yaml, README, AGENTS.md invariant)

**Commits measured:** `git rev-list --count 9f250c8..HEAD` = 3 (matches frontmatter `commits: 3`, `plan_head_before/after` above).

## Files Created/Modified

- `backend/app/adapters/cuopt_adapter.py` — DELETED (134 lines, inert deprecated stub)
- `backend/app/adapters/earth2_adapter.py` → `backend/app/adapters/open_meteo_adapter.py` — class/source/stream/crisis-id/log rename
- `backend/app/adapters/__init__.py` — cuOpt/Earth2 exports removed; renamed adapter re-exported as `OpenMeteoForecastAdapter` (alias avoids shadowing pre-existing `openmeteo_adapter.OpenMeteoAdapter`)
- `backend/app/services/cuopt_tomtom_service.py` → `backend/app/services/cpu_routing_service.py` — function rename, `routing_solution` key, hardcoded savings removed
- `backend/app/routers/routing_router.py` — endpoint `/routing/optimize`, `RoutingRequestPayload`, `optimize_routing`
- `backend/app/routers/agent_router.py` — docstring/comment vendor mentions reworded (chat logic untouched)
- `backend/app/routers/evaluation_router.py` — TEST-FR11-16 module/scenario strings match new names
- `backend/app/services/llm_reasoning_service.py` — vendor string + fabricated 18.5% claim reworded (dead code, no callers)
- `backend/app/config.py` — two NVIDIA fields deleted
- `backend/app/main.py` — `_poll_open_meteo_loop`, new import/cache key/logs
- `backend/app/workers/ingestion_worker.py` — new import/instantiation
- `agents/llm_gateway.py` — key list DeepSeek-only (opencode/Gemini-embeddings logic untouched)
- `agents/nodes/prediction.py` — `open_meteo_*` locals, cache key, logs, summary, finding data keys
- `backend/tests/test_cpu_routing_weather.py` — 3 tests renamed to `test_cpu_routing_service_*`, import/calls/`routing_solution` updated, fusion-engine negative asserts replaced with exact-match assert
- `backend/tests/test_llm_gateway.py` — key tuple DeepSeek-only
- `backend/tests/test_agents.py` — cache key + comment
- `frontend/lib/api.ts` — `optimizeRouting` → `/api/v1/routing/optimize`, savings pcts optional
- `frontend/components/dashboard/DashboardClient.tsx` — `routingInfo` state, no 18.5 fallback
- `frontend/components/dashboard/TopNavTelemetry.tsx` — `cuOptInfo` alias removed, `routingInfo` only
- `frontend/components/map/CrisisMap.tsx` — `routingInfo` prop (still unused/voided, as before)
- `.env.example`, `backend/.env.example`, `render.yaml` — two NVIDIA keys removed
- `docs/README.md` — purge-complete note, no banned literals remain
- `.agents/AGENTS.md` — invariant line genericized (prohibition kept)

## Decisions Made

- Full rename with **no backwards-compat aliases** left (endpoint, function, props, response keys, Redis keys) — per task preference; verified no other callers depend on old names (repo-wide identifier scan before editing).
- Fabricated savings percentages **removed, not computed** — no honest pre-optimization baseline exists in the service, so any "computed" value would be equally fabricated.
- `adapters/__init__.py` uses an **aliased re-export** (`OpenMeteoForecastAdapter`) because the prescribed new class name `OpenMeteoAdapter` collides with the pre-existing `openmeteo_adapter.OpenMeteoAdapter`; direct importers use the module path and are unaffected.
- Fusion-engine regression guard **strengthened to an exact-match assert** instead of two negative asserts, which also removes the last banned literals from the test file.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Correctness] Live-pipeline stragglers outside the READ FIRST list also purged**
- **Found during:** Recon identifier scan (steps 1–9)
- **Issue:** `agent_router.py` docstring/comment, `llm_reasoning_service.py` vendor string + 18.5% claim, and `.agents/AGENTS.md` invariant line contained banned literals and would have failed the zero-hit verify
- **Fix:** Reworded all three (logic untouched; `llm_reasoning_service` has no callers; AGENTS.md prohibition intent preserved)
- **Files modified:** `backend/app/routers/agent_router.py`, `backend/app/services/llm_reasoning_service.py`, `.agents/AGENTS.md`
- **Verification:** Scoped grep returns zero hits
- **Committed in:** `b7ce494` / `663c942`

**2. [Rule 2 - Correctness] Aliased re-export avoids class-name shadowing**
- **Found during:** Adapter rename (step 2)
- **Issue:** Prescribed `OpenMeteoAdapter` name collides with pre-existing `openmeteo_adapter.OpenMeteoAdapter` in `adapters/__init__.py`
- **Fix:** `from app.adapters.open_meteo_adapter import OpenMeteoAdapter as OpenMeteoForecastAdapter`
- **Files modified:** `backend/app/adapters/__init__.py`
- **Verification:** AST parse passes; no importer uses the package-level name
- **Committed in:** `b7ce494`

---

**Total deviations:** 2 auto-fixed (correctness, no scope creep)
**Impact on plan:** Both required to satisfy the plan's own zero-hit verify. No behavior change.

## Issues Encountered

- **pytest unavailable:** `python -c "import pytest"` → `ModuleNotFoundError: No module named 'pytest'` (Python 3.13.7). Per task instructions, did NOT install packages; ran AST syntax check on all 15 touched backend files (all pass) and `npx tsc --noEmit` in `frontend/` (clean, tsc 5.9.3). The two suites must be re-run where pytest exists — see coverage D3 (human judgment required).
- **Pre-existing BOMs:** 6 untouched `__init__`/test files fail naive `ast.parse` (U+FEFF BOM, handled fine by CPython import). Pre-existing, out of scope, left alone.
- **Stale pytest cache:** deleted ignored `backend/.pytest_cache/` (contained old `test_cuopt_*` node IDs); regenerates on next run.

## Verification Evidence

- Scoped grep (case-insensitive `cuopt|fourcastnet|earth2` over `backend/ agents/ frontend/lib frontend/components frontend/hooks frontend/app/ .env.example backend/.env.example render.yaml docs/README.md .agents/AGENTS.md`, excluding `__pycache__/node_modules/.next`): **0 hits**. (Raw scan briefly surfaced live-secret values from gitignored `.env` files — key names only are recorded here, values never printed.)
- `npx tsc --noEmit` in `frontend/`: **clean, zero errors**.
- AST parse of all 15 touched backend Python files: **pass**.
- Endpoint/prop contract check: only producer of `optimization_summary` is `cpu_routing_service.py`; only consumers are `api.ts` types + `DashboardClient` (updated); `routing_solution` asserted in renamed test; no test hits the HTTP endpoint directly.

## Known Non-Hits (intentional exceptions, documented)

- `.env` / `backend/.env` (gitignored live secrets): still contain the two key NAMES — explicitly DO NOT touch per task. Secret-safe: values never printed anywhere in this summary.
- `scripts/verify_codebase_consistency.py:30`: buzzword detector patterns (`FourCastNet`, `cuOpt GPU`) must contain the strings to detect them — this script *enforces* the purge on `frontend/components` + `frontend/app` (both now clean). Kept functional.
- Excluded history dirs (untouched per task): `.planning/**`, `docs/legacy_hackathon_archive/**`, `test-results/**`.

## Known Stubs

None introduced — rename/delete-only refactor; no new data flows, no placeholder values.

## Threat Flags

None — no new network endpoints, auth paths, file access, or schema changes. The routing endpoint path changed (`/routing/optimize-cuopt` → `/routing/optimize`) with an identical response contract minus the two removed fabricated percentage keys.

## User Setup Required

None - no external service configuration required. (Operators with live `.env` files may optionally delete the now-unused `NVIDIA_CUOPT` / `NVIDIA_FOURCASTNET` entries; the app no longer reads them.)

## Next Phase Readiness

- Live pipeline is vendor-naming-clean; CPU routing + Open-Meteo behavior unchanged.
- Follow-up for a pytest-capable environment: run `python -m pytest backend/tests/test_llm_gateway.py backend/tests/test_cpu_routing_weather.py -v` (coverage D3).
- Optional hygiene: remove `NVIDIA_CUOPT` / `NVIDIA_FOURCASTNET` from Render dashboard env vars and local live `.env` files.

---
*Phase: 59-llm-swarm-post-key-audit*
*Completed: 2026-10-17*

## Self-Check: PASSED

- All 25 changed files exist at their post-rename paths (renames verified via `git show --stat HEAD` lineage).
- Commits `b7ce494`, `81c189a`, `663c942` are ancestors of HEAD (`git rev-list --count 9f250c8..HEAD` = 3).
- SUMMARY file written to `.planning/phases/59-llm-swarm-post-key-audit/60-04-SUMMARY.md`.
