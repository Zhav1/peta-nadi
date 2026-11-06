# SUMMARY — Phase 178: Mainland Sumatra Shadow Pilot (Execution Summary)

**Window:** 2026-11-05 to 2026-11-06  
**Status:** COMPLETE ✅  
**Canonical Phase Directory:** `.planning/phases/178-mainland-sumatra-shadow-pilot/`  
**Artifacts Generated:** `178-SPEC.md`, `178-01-PLAN.md`, `178-01-SUMMARY.md`  

---

## 1. Executive Summary

Phase 178 establishes the **Mainland Sumatra Shadow Pilot** architecture, transitioning PreHub from a single-process prototype to a distributed, enterprise-grade logistics resilience system. The implementation solves the critical challenges of distributed multi-worker concurrency, external API budget exhaustion, spatial hazard veracity, sub-2000ms multi-user hydration, and research pilot safety for mainland Sumatra freight corridors (Aceh through Lampung).

### Key Accomplishments:
1. **Alternative Route Painting Restoration:**
   - Extended `frontend/lib/routeProvenance.ts` `geometryKey` with fallback to `route.coordinates`, preserving distinct alternate geometry keys and preventing false route deduplication.
   - Restored dashed cyan (`#38bdf8`) / amber (`#f59e0b`) detour corridor visibility in `frontend/components/map/CrisisMap.tsx` (`route-paths-alternative` layer with `line-dasharray: [2, 2]`, `line-width: 4`, `line-opacity: 0.85`), with interactive clickability and route switching.
   - Refined `frontend/lib/aiDynamicRouter.ts` so detour routes that circumvent confirmed disaster blockages remain viable for map painting even under partial/precautionary hazard evidence.
2. **Sub-2000ms Multi-User Hydration via Stale-While-Revalidate (SWR):**
   - Vercel Edge (`frontend/app/api/public/dashboard/route.ts`): Built Next.js Route Handler querying Supabase PostgREST singleton read (`/rest/v1/public_dashboard_snapshots?snapshot_key=eq.sumatra_mainland`) with HTTP `Cache-Control: public, s-maxage=30, stale-while-revalidate=60`, in-flight promise deduplication (`inflightPromise`), 1.8s timeout, and `lastKnownGoodResult` fallback.
   - FastAPI `_INFLIGHT_REFRESH` (`backend/app/routers/dashboard_bootstrap.py`, `backend/app/routers/routing_router.py`): Coalesces concurrent revalidation calls into a single shared asynchronous task, preventing duplicate upstream fetches.
   - Supabase read model: Independent source TTLs (BMKG 300s, Open-Meteo 6h, FIRMS 3h, TomTom 10m, Observed Disasters 30m) cached in `public.public_operational_source_cache` and served from `public.public_dashboard_snapshots`.
3. **Plane Telemetry Corridor Persistence:**
   - Backend `backend/app/services/telemetry_service.py`: Enriched air cargo with `telemetry_source = "SUMATRA_AIR_CORRIDOR"`, `signal_status = "LIVE_STREAM"`, `tracking_mode = "LIVE_GPS"` matching Kapal maritime semantics, with durable Redis and PostgREST snapshot caching (`lrip:state:aircraft_telemetry:v1`, 900s TTL).
   - Frontend `useFleetVehicles.ts` & `FleetVehicleLayer.tsx`: Allowed aircraft transponders to pass `isTransponderActive`, guaranteed 5 scheduled Sumatra flight corridors (`AIR-001`..`AIR-005`), and interpolated positions at 450 km/h along flight corridors.
4. **Multi-Source Sumatra Disaster Detection & Empirical Severity Radii:**
   - `backend/app/services/observed_disaster_service.py`: Ingestion across `BMKG CAP` (polygon warnings), `GDACS` (global disaster alert & coordination), `Open-Meteo GloFAS` (hydrological river discharge & flood zones), `PetaBencana` (crowdsourced reports with ISO 3166-2 mainland bounds), and `BNPB`.
   - Severity-scaled physical radii (15–35 km) computed deterministically via `calculate_disaster_radius_km` and converted to 32-point geographic circle polygons via `generate_circle_polygon`.
   - Google Maps-style crisis UI in `CrisisMap.tsx`: Glowing halo outline (`disaster-zones-halo`), translucent salmon-red fill (`#f87171`), stroke outline (`disaster-zones-outline`), pulsing badge marker, and floating bottom crisis detail card with direct "Hitung / Lihat Rute Pengalihan" CTA.
5. **Hybrid Road Congestion (TomTom 12 Corridors + Mapbox Vector Traffic):**
   - `backend/app/adapters/tomtom_adapter.py`: Ingests 12 Trans-Sumatra corridors and bounding-box incidents with 10-minute cache guard (`FETCH_CACHE_TTL_SECONDS = 600.0`, <= 150 calls/day free tier quota guard), falling back to empirical Sumatra baseline speeds when offline.
   - `frontend/components/map/CrisisMap.tsx`: Native Mapbox Vector Traffic layer (`mapbox://mapbox.mapbox-traffic-v1`).
   - `backend/app/adapters/cpu_routing_adapter.py`: Ingests active TomTom segments and applies 1.5x–2.5x edge penalties to congested corridor segments within 15 km, computing combined hazard and traffic costs.

---

## 2. Changes Delivered by Architecture Layer

### A. Database Layer (`infra/supabase/migrations/20261105060029_public_snapshot_coordination.sql`)
- Created `public.public_dashboard_snapshots` table with row-level security allowing `anon` and `authenticated` roles to read the curated `sumatra_mainland` singleton.
- Created `public.public_operational_source_cache` table for retaining raw upstream provider responses with service-role-only access.
- Created `private.refresh_leases`, `private.public_snapshot_sections`, `private.provider_budget_counters`, and `private.provider_budget_reservations` tables in a secure non-public schema.
- Added 6 atomic PL/pgSQL stored procedures:
  - `acquire_refresh_lease(p_lease_name, p_owner_id, p_ttl_seconds)`: Monotonic fence increment (`fence + 1`) and TTL renewal.
  - `release_refresh_lease(p_lease_name, p_owner_id, p_fence)`: Validated release of active worker locks.
  - `read_public_snapshot_sections()`: Stable internal reader for independently fresh snapshot sections.
  - `publish_public_dashboard_snapshot(p_lease_name, p_owner_id, p_fence, p_snapshot)`: Atomic check-and-publish validating owner, fence, and lease expiration.
  - `complete_scheduled_job(p_job_name, p_owner_id, p_fence, p_status, p_error, p_retry_after_seconds)`: Fenced execution status tracker for `public.scheduler_jobs`.
  - `reserve_provider_budget(p_source, p_units, p_request_id, p_daily_limit)`: Atomic, idempotent daily provider unit consumption tracking.

### B. Coordination & Operational Cache (`backend/app/services/`)
- `refresh_coordinator.py`: Implemented `acquire_refresh_lease`, `release_refresh_lease`, `publish_public_snapshot`, and `read_public_snapshot_sections` with fail-closed semantics raising `CoordinationUnavailable` on DB errors.
- `public_snapshot_service.py`: Orchestrated the 12-section mainland Sumatra snapshot assembly across 8 provinces; enforced `PUBLIC_FIELDS` projection allowlist to strictly eliminate tenant or PII leakage.
- `provider_budget.py`: Provided `reserve_provider_budget` with idempotent UUID request tracking and fail-closed denial on unconfigured or depleted sources.
- `public_operational_cache.py`: Maintained raw source caching with distinct TTLs (BMKG 300s, Open-Meteo 6h, FIRMS 3h, TomTom 10m, Observed Disasters 30m) and stale-while-revalidate serving.

### C. Grounded Ingestion & Routing Adapters (`backend/app/adapters/`)
- `bmkg_cap_adapter.py`: Implemented `BMKGCAPAdapter` for BMKG's Common Alerting Protocol (CAP) nowcast warnings, strictly parsing native polygon geometries without synthesizing arbitrary circles.
- `petabencana_adapter.py`: Implemented `PetaBencanaAdapter` for crowdsourced flood/disaster reports, restricted to verified mainland Sumatra ISO 3166-2 admin codes (`ID-AC`, `ID-SU`, `ID-SB`, `ID-RI`, `ID-JA`, `ID-SS`, `ID-BE`, `ID-LA`) under CC BY-NC 4.0 license.
- `tomtom_adapter.py`: Ingests 12 Trans-Sumatra corridors (`sumatra_belawan_medan`, `sumatra_riau_pekanbaru`, `sumatra_sumbar_padang`, `sumatra_sumsel_palembang`, etc.) and bounding-box incidents with 10-minute cache guard (`FETCH_CACHE_TTL_SECONDS = 600.0`), falling back to empirical Sumatra baseline speeds when offline.
- `cpu_routing_adapter.py`: Integrated `hazard-evidence-v1` into the deterministic NetworkX + OR-Tools / 2-Opt CPU routing solver, incorporating TomTom traffic congestion (1.5x–2.5x penalties) and outputting explicit detour alternative routes with populated waypoints.
- `hazard_evidence.py`: Normalized multi-source evidence into 4 explicit states (`CONFIRMED_BLOCKAGE`, `PRECAUTIONARY_RISK`, `UNKNOWN`, `CLEAR`) with 0.1 km point matching tolerance.

### D. Pilot Safety & Router Isolation (`backend/app/services/pilot_safety.py`, `backend/app/routers/`)
- `pilot_safety.py`: Server-side enforcement of `pilot_shadow_mode`. Intercepts approval routes to return shadow preview payloads without writing to `route_approvals` or `travels`.
- `approvals.py`: Gated approval execution requiring Dispatcher role with `fleet:write` permissions and tenant ownership validation (`assert_tenant_owns_record`).
- `travels_router.py`: Secured trip queries to authenticated tenant scopes.
- `news_router.py`: Prevented draft/unverified leakages into public news endpoints.
- `dashboard_bootstrap.py`: Unified bootstrap serving public-first snapshot data while lazily hydrating tenant fleets, with `_INFLIGHT` task deduplication.
- `routing_router.py`: Added `coalesce_background_refresh` with `_INFLIGHT_REFRESH` task deduplication.
- `internal_tick.py`: Integrated fenced leases into the scheduled background refresh runner.

### E. Frontend Edge Route & Hydration (`frontend/`)
- `frontend/app/api/public/dashboard/route.ts`: Built high-performance Next.js Route Handler querying Supabase PostgREST singleton read (`/rest/v1/public_dashboard_snapshots?snapshot_key=eq.sumatra_mainland`) with 30s cache revalidation, SWR (`s-maxage=30, stale-while-revalidate=60`), and promise-level single-flight coalescing (`inflightPromise`).
- `frontend/lib/publicSnapshot.ts`: Defined TypeScript interfaces for `PUBLIC_DASHBOARD_SNAPSHOT_KEY` (`sumatra_mainland`), 8 mainland provinces, and `createUnknownPublicSnapshot` fallback.
- `frontend/lib/routeProvenance.ts`: Extended `geometryKey` to fall back to `route.coordinates` and incorporate detour markers.
- `frontend/lib/aiDynamicRouter.ts`: Allowed detour routes that bypass disaster blockages to remain viable.
- `frontend/hooks/useDashboardBootstrap.ts`: Hook orchestrating public-first immediate paint before authenticating tenant fleet state.
- `frontend/hooks/useFleetVehicles.ts`: Allowed aircraft transponders to pass active checks and preserved scheduled Sumatra air cargo corridors.
- `frontend/components/map/CrisisMap.tsx`: Master view integrating public snapshot data, Google Maps-style crisis cards/badges, Mapbox vector traffic, and dashed detour route corridors.
- `frontend/components/map/FleetVehicleLayer.tsx`: Interpolated plane flight speeds (450 km/h) along surveyed air corridors.
- `frontend/components/dashboard/DashboardClient.tsx`: Master view integrating public snapshot data, shadow pilot banners, and traffic segment passing.

---

## 3. Empirical Verification Evidence

### A. Dedicated Phase 178 Plan Implementation Suite (6/6 Passed)
Ran `rtk pytest backend/tests/test_backend_plan_implementation.py`:
```text
backend/tests/test_backend_plan_implementation.py ...... [100%]
============================== 6 passed in 1.45s ==============================
```
Verified:
1. `test_multi_source_disaster_radii_and_northern_sumatra_floods`: Earthquake $2^{M-4} \times 10$ scaling, flood severity-based radii (25–40 km), 32-point closed circle polygon geometry generation within 1 km haversine tolerance, and Northern Sumatra flood crisis zones.
2. `test_tomtom_cached_sumatra_traffic`: 12 Trans-Sumatra corridors, congestion levels, speeds, and incidents.
3. `test_single_flight_coalescing`: Concurrent revalidation calls share 1 upstream fetch execution.
4. `test_plane_telemetry_corridor_persistence`: Scheduled air cargo receives `SUMATRA_AIR_CORRIDOR` / `LIVE_GPS` / `LIVE_STREAM` with populated waypoints.
5. `test_cpu_routing_adapter_waypoints_and_detour`: Detour alternative routes carry populated waypoints, `corridor_type = "detour"`, and `safety_status = "SAFE_REROUTE"`.
6. `test_seed_hitl_demo_preserves_all_routes`: Preserves full alternative route arrays during HITL scenario execution.

### B. Phase 178 Targeted Test Suite (55/55 Passed)
Ran `rtk pytest` across all 7 dedicated Phase 178 test files:
```text
backend/tests/test_hazard_routing_evidence.py .......... [18%]
backend/tests/test_news_hitl_shadow.py ............      [40%]
backend/tests/test_observed_disaster_service.py ......  [50%]
backend/tests/test_pilot_shadow_safety.py .........      [67%]
backend/tests/test_public_operational_cache.py ........ [81%]
backend/tests/test_public_snapshot_coordination.py .... [89%]
backend/tests/test_shared_news_reads.py ......          [100%]
============================== 55 passed in 3.42s ==============================
```

### C. Affected Backend Regression Suites (68/68 Passed)
Ran `rtk pytest` across all modified backend router and service test suites:
```text
backend/tests/test_dashboard_bootstrap.py ............  [17%]
backend/tests/test_dashboard_snapshot.py .............  [36%]
backend/tests/test_internal_tick.py ..................  [63%]
backend/tests/test_news_read_path.py .................  [88%]
backend/tests/test_trip_linked_approvals.py ........    [100%]
============================== 68 passed in 5.11s ==============================
```

### D. Frontend Verification (0 Errors)
Ran `rtk npx tsc -p tsconfig.json --noEmit`:
```text
TypeScript: No errors found
```

### E. Total Verification Status
**129 backend tests passed** with 100% success rate and zero regressions; 0 TypeScript errors.

---

## 4. Architectural Invariants Preserved

In strict compliance with `.agents/AGENTS.md` and Phase 178 requirements:
1. **Source of Truth Integrity:** Canonical documentation maintained exclusively in `.planning/`. Undotted `planning/` and outdated hackathon materials in `docs/` ignored.
2. **Deterministic CPU Routing Invariant:** All routing operations remain on deterministic CPU solvers (`NetworkX + OR-Tools / 2-Opt`) in `cpu_routing_adapter.py`. No GPU solvers reintroduced.
3. **Realistic Grounding & Honest Metrics:** Verified that shadow preview modes explicitly acknowledge research bounds and do not display fabricated "100% solved" claims.
4. **Scope Lock Compliance:** All code changes were executed in backend, frontend, and infra layers prior to documentation synthesis.
