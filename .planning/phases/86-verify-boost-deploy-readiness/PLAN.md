<!-- generated-by: gsd-docs-update (M5 window, Deepseek worker) -->
# Phase 86 / Plan 01 — Verify + Boost + Deploy-Readiness

**Goal:** close the M5 window honestly: record what is verified vs merely committed, what deploy
actions remain operator-side, and the exact re-prove sequence — so the next window never mistakes
"committed locally" for "live in prod".

**Status:** docs + readiness checklist; code changes in this phase: none (all M5 code already in
`c5d2e9d/c53261e/f5e032d/b4dee0e/b443352`). Implemented-locally-pending-deploy.

## 1. Objective

- **Verify:** consolidate the verification state of the whole M5 window (83 grounded-routing +
  84 Gate-2 + 85 overlays) into one gate table with honest NOT-run markers.
- **Boost:** the capped-budget performance posture is already in-tree (Gate-2 5-conc/60 s/MD5-500,
  `routingInfo` passthrough, hash-gated map writes, 1000 ms elapsed timer, Redis caps) — no new tuning
  this phase; record the knobs and their locations.
- **Deploy-readiness:** enumerate the operator-side actions that code cannot do (Render redeploy,
  MAP_KEY provisioning, migration 014, Vercel chunk check) with file:line refs for each prerequisite.

## 2. Scope

### In scope (this phase writes docs only)

- This PLAN.md + NEXT-CONTEXT.md.
- Minimal STATE.md table rows for 83–86 (status `implemented-locally-pending-deploy`); ROADMAP.md left
  untouched (phases 80+ have no ROADMAP sections by convention).

### Out of scope (explicitly NOT done here)

- No code edits, no test runs, no live probes, no redeploy, no MAP_KEY provisioning, no migration 014
  apply, no Playwright runs, no git commit/push (separate worker owns that).
- No Q4/Q5 invention (zero in-tree markers — see Phase 84 PLAN §3).

## 3. Decisions Q1–Q7 + prod-only correction (window rollup)

| Decision | Verdict in-tree | Ref |
|---|---|---|
| Q1 precision (bbox + Java veto + ceremony DROP) | Implemented `b443352`, pending verify | Phase 84 PLAN |
| Q2+Q7 selective Gate-2 (capped async) | Implemented `b443352`, pending verify | Phase 84 PLAN |
| Q3 corroborator-only toggles + click contracts | Implemented `b443352`, pending verify + MAP_KEY | Phase 85 PLAN |
| Q6 FIRMS poller + honest-degraded | Implemented `b443352`, blocked on key provisioning | Phase 85 PLAN |
| Q4/Q5 | No in-tree markers; deferred to orchestrator spec | Phase 84 PLAN §3 |
| FPR ≤ 0.15 | Pinned in `evaluation.py:49-51` | Phase 84 PLAN |
| Prod-only correction | Playwright stays frontend-only; API-backed + overlay + Gate-2 assertions run against prod pair only, warm-first | `.planning/LEARNINGS.md:232`; Phase 83 walkthrough §6 |

## 4. Walkthrough — window verification ledger

### 4.1 Verified BEFORE `b443352` (Phase 83 walkthrough §4–§5, still valid for 83 files)

- `npx tsc --noEmit` exit 0; `test_routing_hedging.py` 2 passed; 35-test bundle green (22.83 s).
- Live prod: `/health` 200; hub-ID `solve-path` success + 3 routes; hedging `[False,True,True]`;
  geocode `padang` exact-first of 7.

### 4.2 Committed in `b443352` but NOT re-verified (must re-prove — recipes in 84/85 learnings §4)

- tsc after extractor/geocoder/consensus/health/TopNavTelemetry changes.
- 35-test bundle + `test_consensus_calibration.py` + `test_phase76_news_spatial_consensus.py`
  (extra `fire_corroboration` key risk).
- `/api/v1/news/live` v6 rows; Sumbing-DROP; Mitigasi-DROP; Gate-2 refinement cycle.
- `/api/v1/fire/hotspots` degraded (pre-key) → ok (post-key); weather palette + provenance fields.

### 4.3 Boost knobs already in-tree (no new tuning)

- Gate-2: `GATE2_MAX_CONCURRENCY = 5`, `GATE2_TIMEOUT_SECONDS = 60.0`, cache ≤ 500
  (`news_extractor.py:83-86`); single web-search/item (`:1118`); DB-first reuse = 0-LLM steady state.
- Render loop: elapsed timer 1000 ms (`DashboardClient.tsx:744`); `routingInfo` passthrough while loading
  (`:2670/:2687`); route-source hash gate (`CrisisMap.tsx:1258-1296`); fleet hash dedupe
  (`FleetVehicleLayer.tsx:475-516`); quantized 4-step pulse (`:758`).
- Redis: FIRMS list cap 1000 + 3 h cache (`main.py` poller); geocode `search:v2` 24 h positives-only
  (Phase 80, unchanged).

### 4.4 Deploy-readiness checklist (operator actions)

| # | Action | Prerequisite ref | Notes |
|---|---|---|---|
| 1 | Render redeploy (`peta-nadi`, Singapore) | `render.yaml:29-46` env pins (reasoning-effort low, driver deepseek, MAP_KEY `sync:false`) | Picks up road-cache fix (83), hedging (83), Gate-2 + overlays (84/85) |
| 2 | Set `NASA_FIRMS_MAP_KEY` on Render dashboard | `.env.example:53-61` | Until then FIRMS stays honest-degraded by design |
| 3 | Warm-then-probe: `/health` 200 before any other probe | Cold 30–77 s > 20 s client timeout (`.planning/LEARNINGS.md:221`) | Retry-after-warm is procedure, not code |
| 4 | Vercel dashboard-chunk check (SIMULASI/banner strings via chunk manifest, not landing HTML) | Phase 83 walkthrough §7.4 | Confirms deployed bundle == `main` |
| 5 | Apply migration 014 + RLS predicates + `sync_status` drain decision | Phase 82 follow-ups, still open | Out of M5 scope; do not bundle silently |
| 6 | Add Gate-2 selector unit test + FIRMS degraded test before claiming gates green | Phase 84 LEARNINGS §2.1 | Missing pins from this window |

## 5. Verification gates (this phase)

| Gate | Result |
|---|---|
| Phase folders 84/85/86 created with PLAN + LEARNINGS/NEXT-CONTEXT, no temp files | Done (this task) |
| Numbering continues past taken 83 (84/85/86, never reused) | Done |
| STATE.md rows appended, frontmatter untouched | Done (see edit) |
| ROADMAP.md | Left untouched (80+ convention) |
| No assumptions written; every claim cites a diff/file/test | Done — Q4/Q5 and unverified gates explicitly marked |
| No commit/push | Honored — files only |
