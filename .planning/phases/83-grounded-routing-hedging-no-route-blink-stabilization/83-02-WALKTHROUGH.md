<!-- generated-by: gsd-doc-writer -->
# Phase 83: Grounded Routing Hedging, no_route Honesty, HITL SIMULASI Gate, Blink Dedupe — Walkthrough

**Purpose:** implementation record for this window's four commits (`c5d2e9d`, `c53261e`, `f5e032d`, `b4dee0e`). Every statement below was verified against the working tree (`git show`, file reads with line numbers, or an executed command). Window-reported live-parity observations that were not re-run here are labeled **window-observed** with a re-prove recipe in §7.

---

## 1. Commits (all on `main`, nothing else touched by this session)

| SHA | Message | Files |
|---|---|---|
| `c5d2e9d` | fix(m5-p0p1): render reasoning-effort low, surface no_route, HITL human labels | `render.yaml`, `DashboardClient.tsx`, `api.ts` |
| `c53261e` | feat(m5-p2p4): grounded routing hedging, blink stabilizers, ERP refresh | `routing_router.py`, `test_routing_hedging.py` (new), `DashboardClient.tsx`, `ReportsSection.tsx` |
| `f5e032d` | fix(routing): resolve road cache in Docker /app/data (live graph was empty) | `cpu_routing_adapter.py`, `DashboardClient.tsx`, `api.ts` |
| `b4dee0e` | feat(m5): HITL SIMULASI gate, hedging types, fleet blink dedupe | `CrisisMap.tsx`, `FleetVehicleLayer.tsx`, `MitigationTab.tsx`, `types.ts` |

`git show --stat` for each confirms no foreign files in these commits — the FIRMS/news work stayed out (split record in §8).

---

## 2. Backend changes

### 2.1 `_enrich_routes_with_hedging` (`backend/app/routers/routing_router.py:301-343`)

Optional payload fields (`:242-251`): `commodity, cargo_tonnage, vehicle_golongan, fuel_type, toll_segments, p_disruption, disruption_delay_hours`. Called from `/routing/optimize` (`:287`) and `/routing/solve-path` (`:378`). Behavior: no `commodity` ⇒ no-op (honest null); baseline route[0] never enriched; detour deltas computed from distance/ETA vs baseline; all exceptions caught and logged, never raised.

### 2.2 `_resolve_road_cache_path` (`backend/app/adapters/cpu_routing_adapter.py:17-45`)

First-existing-wins candidates: local checkout `../../../data/…`, `/app/data/road_network_sumatra.json` (Render), `cwd/data/…`, adapter-relative `../../data/…`. Assigned to `ROAD_NETWORK_CACHE_PATH` (`:45`), consumed by the router singleton (`:499`). This was the live empty-graph root cause: the old single relative path resolved to `/data` in Docker, so the adapter booted an empty graph and every hub-ID lookup returned `no_route`.

### 2.3 `test_routing_hedging.py` (new, 36 lines, 2 tests)

- `test_solve_path_without_commodity_stays_honest_null`: no-commodity request ⇒ `status ∈ (success, no_route)`, every route's `hedging` is null/empty/dict.
- `test_solve_path_with_commodity_attaches_bpjt_pertamina_hedging`: `belawan_port → tebing_tinggi` + beras/10t/GOL_II/biosolar ⇒ ≥1 route, detours carry hedging with `optimal_policy ∈ (CONTINUE, REROUTE, HOLD)` and `reroute_policy.breakdown`.

---

## 3. Frontend changes

| File | Lines | Change |
|---|---|---|
| `DashboardClient.tsx` | `:919-933` | `no_route` guard: message + clear routes/selection/routing info + error toast, `return false` |
| `DashboardClient.tsx` | `:744` | elapsed timer 250 ms → 1000 ms |
| `DashboardClient.tsx` | `:2670`, `:2687` | `routingInfo` passthrough while loading (was nulled → HUD flicker) |
| `DashboardClient.tsx` | `:842`, `:895`, `:936`, `:977-984` | `hedgingOpts` param, `backendHedgingByIndex` collection + index merge onto Mapbox routes |
| `DashboardClient.tsx` | `:1056`, `:1881-1883` | `formatNodeId` human labels for approval origin/dest |
| `api.ts` | request + response types | optional hedging params; `point_to_point_path.routes[].hedging` typed |
| `types.ts` | `RouteRecommendation['hedging']` | all fields optional incl. `continue/reroute/hold_policy.breakdown` |
| `ReportsSection.tsx` | `:77`, `:433` | `erpRefreshKey` bumped on ERP tab select → `<ERPSavingsPanel refreshKey>` |
| `MitigationTab.tsx` | `:64-90`, `:155-161`, `:814-821` | SIMULASI gate (`isSimulatedRoute`, `hasRouteProof`/`hasCrisisEvidence`, `hitlBlocked`/`approveLocked`), handler-level no-POST guard |
| `MitigationTab.tsx` | badges + copy | `SIMULASI/OFFLINE` vs `LIVE` badges; `TERCATAT • HITL PENDING` replaces `DISETUJUI & DIKIRIM` |
| `FleetVehicleLayer.tsx` | `:283-286`, `:475-516`, `:758`, `:1084-1086` | fleet-hash/selection/pulse/zoom dedupe; quantized 4-step pulse |
| `CrisisMap.tsx` | `:387`, `:1258-1296`, `:1669-1670`, `:1740-1742` | `routeWriteHash` gate on route/congestion/ETA sources; `activeFleet` out of effect deps |
| `render.yaml` | env vars | `OPENCODE_REASONING_EFFORT: "low"` added |

---

## 4. Automated verification (executed this window, fresh outputs)

| Check | Command | Result |
|---|---|---|
| TypeScript | `npx tsc --noEmit -p tsconfig.json` in `frontend/` | **exit 0** |
| Hedging tests | `python -m pytest backend/tests/test_routing_hedging.py -q` | **2 passed**, 4 warnings, 20.03 s |
| Regression bundle | `python -m pytest backend/tests/test_routing_hedging.py backend/tests/test_travels_erp.py backend/tests/test_geocode_search.py backend/tests/test_fleet_ingest.py -q` | **35 passed**, 7 warnings, 22.83 s |

---

## 5. Live verification (executed this window against `https://peta-nadi.onrender.com`)

| Probe | Result |
|---|---|
| `GET /health` | **200**, `{"status":"ok","version":"0.1.0","environment":"development","service":"prehub-api"}` |
| `POST /api/v1/routing/solve-path` `{belawan_port → tebing_tinggi, k=3}` | `status: success`, **3 routes**, `snapped_origin_node: belawan_port` (98.6776, 3.7922), `snapped_dest_node: tebing_tinggi_toll` (99.1625, 3.3285). Pre-rebuild this returned `no_route` on an empty graph — the Docker cache fix is confirmed live. |
| Same + `{commodity: beras, cargo_tonnage: 10, GOL_II, biosolar}` | hedging by index: **idx0 False, idx1 True (REROUTE), idx2 True (REROUTE)** — baseline clean, detours grounded |
| `GET /api/v1/geocode/search?q=padang` | **7 results**, exact `Padang` first (−0.9471, 100.4172), then Padang Lawas, Padang Panjang — ranking order correct |

---

## 6. Window-observed live parity (reported this window, re-prove in §7)

- **Vercel 982 chunk carries banner + SIMULASI strings (not stale).** The landing HTML (`https://pre-hub.vercel.app`, 25 KB, reachable) lists only shell chunks (`webpack-*`, `117-*`, `369-*`, `44530001-*`); the numbered dashboard chunk is route-lazy and not in landing HTML — fetch it via the dashboard route's chunk manifest, not the landing page.
- **`pk.eyJ…` Mapbox public token is bundled** in the Vercel JS (expected: public token, build-time inlining).
- **Cold starts 30–77 s vs 20 s client timeout:** first-hit Render responses can exceed the client's 20 s geocode/search timeout; warm instances respond normally. Mitigation is retry-after-warm, not a code change made here.
- **Proof fan-out ≈ 8 s × 3** on route proof requests (observed latency shape, no threshold asserted).
- **Playwright gaps (frontend-only harness):** `playwright.config.ts` boots only the frontend (`webServer` → `node .next/standalone/server.js`); no backend process, `baseURL` points at `:3000` only, no JWT seed, `expect`/timeout defaults unadjusted for cold starts, no `actual_toll` coverage, SQLite is ephemeral per run. Any wizard/hedging spec must start the backend with `/health` readiness or mock at the route layer.

---

## 7. Re-prove steps for the next window

1. **Warm:** `GET https://peta-nadi.onrender.com/health` → 200 before any other probe (cold instance → wait/retry; do not read a cold timeout as a regression).
2. **Geocode order:** `GET /api/v1/geocode/search?q=padang` → exact `Padang` first, then Lawas/Panjang.
3. **no_route + hedging:** `POST /api/v1/routing/solve-path` with hub IDs (`belawan_port → tebing_tinggi`, no coords) → `success` + 3 routes; repeat with commodity block → hedging `[False, True, True]`; repeat with gibberish IDs → `no_route` + message (client must toast, not blank-map).
4. **Vercel chunk strings:** load the dashboard route, extract `_next/static/chunks/*.js` URLs, `curl` each and grep for `SIMULASI` / banner copy / `pk.eyJ` to confirm the deployed bundle matches `main`.
5. **Types + tests:** `npx tsc --noEmit -p tsconfig.json` (exit 0); `python -m pytest backend/tests/test_routing_hedging.py backend/tests/test_travels_erp.py backend/tests/test_geocode_search.py backend/tests/test_fleet_ingest.py -q` (35 passed baseline).
6. **Gate spot-check:** open a SIMULASI route card as DISPATCHER → Approve/Reroute disabled + unverified copy, HOLD enabled; as GUEST → enabled (sandbox).

---

## 8. Split / stash / foreign-work record (no-commit rule honored)

- **Committed splits are clean:** `git show --stat` on all four SHAs lists only the files in §1 — no FIRMS/news/foreign hunks leaked into our commits.
- **Reverted, not committed:** foreign FIRMS hunks previously present in the working tree under `frontend/lib/types.ts`, `frontend/components/map/CrisisMap.tsx`, `frontend/components/dashboard/DashboardClient.tsx`, `frontend/lib/api.ts` were reverted; `git status --porcelain` confirms none of those four files is dirty.
- **`stash@{0}` retained untouched:** `WIP on main: c53261e` — 5 files (`DashboardClient.tsx`, `CrisisMap.tsx`, `FleetVehicleLayer.tsx`, `MitigationTab.tsx`, `api.ts`), zero FIRMS refs (`git stash show -p | grep FIRMS` empty); contents mirror already-committed hunks. Not dropped, not applied — belongs to the parallel session.
- **Foreign dirty files left untouched (17, out-of-scope concurrent session):** `.env.example`, `agents/tools/consensus_gate.py`, `backend/app/adapters/nasa_firms_adapter.py`, `backend/app/main.py`, `backend/app/nlp/gazetteer_data.py`, `backend/app/nlp/geocoding_service.py`, `backend/app/nlp/news_extractor.py`, `backend/app/routers/health.py`, `backend/app/routers/news_router.py`, `backend/app/routers/routing_router.py` (FIRMS `/fire/hotspots` endpoint addition on top of our committed hedging code), `backend/app/schemas/evaluation.py`, `backend/app/services/news_aggregator.py`, `backend/app/services/unified_news_ingestor.py`, `backend/app/services/weather_fusion_service.py`, `backend/app/workers/ingestion_worker.py`, `frontend/components/dashboard/TopNavTelemetry.tsx`, `frontend/hooks/useNewsVerification.ts`. No commit or push was performed by this session.

---

## 9. Not covered by this phase

- Supabase write-through / `sync_status` drain (still `pending` forever; Phase 82 follow-up).
- Actual toll segments in the wizard; actual-toll-defaults-to-zero overstatement still open.
- Per-tenant RLS predicates (`USING (true)` still open); single-record reads still unscoped.
- `[0,0]` coordinate defaults in migration 014.
- Playwright wizard/hedging coverage; backend `webServer` entry still missing from `playwright.config.ts`.
- `CORRIDOR_EFFICIENCY_DATA` static reference rows still served (ERP ledger is the authoritative money view).
