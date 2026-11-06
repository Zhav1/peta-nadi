# PreHub Architecture Documentation

**Version:** 2.0 (Post-Phase 178 Mainland Sumatra Shadow Pilot)  
**Status:** Living Canonical Architecture Document  
**Canonical Scope:** Mainland Sumatra Logistics Corridors (Aceh through Lampung)  

---

## 1. Architectural Invariants & Scope

PreHub is a **Live Pilot Operations Product** designed for Sumatra logistics partners (Pelindo Belawan, BKHIT agricultural quarantine, BPJT toll network, and PIHPS food commodity markets), not an artificial synthetic demo.

The architecture enforces five strict invariant principles:
1. **Deterministic CPU Routing Solver:** Routing optimization uses a deterministic CPU routing adapter (`NetworkX + Google OR-Tools / 2-Opt`) in `backend/app/adapters/cpu_routing_adapter.py`. Theoretical GPU solvers (such as cuOpt) are deprecated and purged.
2. **Empirical Weather & Spatial Sensor Fusion:** Real-time atmospheric hazards are produced via spatial fusion of official BMKG Radar/CAP alerts and Open-Meteo numerical weather prediction (NWP) in `backend/app/services/weather_fusion_service.py` and `observed_disaster_service.py`.
3. **Conservative Hazard Evidence Contract (`hazard-evidence-v1`):** Completely eliminates hallucinatory circular buffer expansions. Enforces a strict distinction between confirmed physical road blockages (`CONFIRMED_BLOCKAGE`), atmospheric advisories (`PRECAUTIONARY_RISK`), and unverified data (`UNKNOWN`).
4. **Distributed Fenced Single-Writer Leases:** Concurrency across distributed worker and server instances (Render, background workers, scheduled cron) is governed by PostgreSQL-backed monotonic fencing leases (`private.refresh_leases`), ensuring single-writer consistency.
5. **Fail-Closed Pilot Shadow Safety:** When operating in research pilot shadow mode (`pilot_shadow_mode = True`), route preview actions return non-mutating preview payloads with zero side effects on production operational tables (`route_approvals`, `travels`).

---

## 2. System Architecture Diagram

```
+---------------------------------------------------------------------------------------------------+
|                                      FRONTEND (Next.js 14 App Router)                             |
|                                                                                                   |
|   +--------------------------+    +--------------------------------+    +---------------------+   |
|   | DashboardClient / Map    |    | CrisisMap (Mapbox GL JS v3)    |    | FleetVehicleLayer   |   |
|   | - SWR Snapshot Consumer  |    | - route-paths-line (Solid)     |    | - 5,000+ units @60fps|  |
|   | - Dynamic Modality Tabs  |    | - route-paths-alternative      |    | - AIR-001..AIR-005  |   |
|   | - Shadow Pilot Banners   |    |   (Dashed Cyan / Amber Detour) |    |   Air Corridors     |   |
|   | - Google Maps Crisis Card|    | - Mapbox Vector Traffic v1     |    | - Pelindo AIS Ships |   |
|   +--------------------------+    +--------------------------------+    +---------------------+   |
+-------------------------------------------------+-------------------------------------------------+
                                                  |
                     HTTP GET /api/public/dashboard (Edge Route)
                     Cache-Control: public, s-maxage=30, stale-while-revalidate=60
                     In-Flight Promise Coalescing (inflightPromise)
                                                  |
                                                  v
+---------------------------------------------------------------------------------------------------+
|                                  DATABASE & CACHE LAYER (Supabase + Redis)                         |
|                                                                                                   |
|   +------------------------------------+    +-------------------------------------------------+   |
|   | public.public_dashboard_snapshots  |    | public.public_operational_source_cache         |   |
|   | - Singleton: sumatra_mainland      |    | - Independent TTLs: BMKG 300s, Open-Meteo 6h,  |   |
|   | - 12 curated public sections       |    |   FIRMS 3h, TomTom 10m, Disasters 30m           |   |
|   | - PostgREST anon SELECT            |    | - Stale-While-Revalidate read model             |   |
|   +------------------------------------+    +-------------------------------------------------+   |
|   | private.refresh_leases (Fenced)    |    | private.provider_budget_counters (Atomic Quotas)|   |
|   +------------------------------------+    +-------------------------------------------------+   |
+-------------------------------------------------+-------------------------------------------------+
                                                  |
                                Scheduled Background Refresh
                                Monotonic Lease: acquire_refresh_lease()
                                                  |
                                                  v
+---------------------------------------------------------------------------------------------------+
|                                  BACKEND SERVICES (FastAPI / Python 3.11+)                        |
|                                                                                                   |
|   +----------------------------------+    +----------------------------------+                    |
|   | Multi-Source Disaster Detection  |    | Hybrid Road Congestion Engine    |                    |
|   | - BMKG CAP (Polygon nowcasts)    |    | - TomTom 12 Trans-Sumatra Corrs  |                    |
|   | - GDACS (Global disaster alert)  |    | - 10-Min Cache Guard (<=150/day) |                    |
|   | - Open-Meteo GloFAS (Floods)     |    | - Empirical baseline fallback    |                    |
|   | - PetaBencana (ISO 3166-2 bounds)|    | - Mapbox Traffic vector tiles    |                    |
|   | - BNPB CKAN statistical aggregates|   +----------------------------------+                    |
|   | - Deterministic 15-35 km radii   |                     |                                      |
|   +----------------------------------+                     v                                      |
|                     |                     +----------------------------------+                    |
|                     +-------------------->| CPU Routing Adapter (NetworkX)   |                    |
|                                           | - 2-Opt / OR-Tools optimization  |                    |
|                                           | - Hazard & Traffic Edge Costs    |                    |
|                                           | - Viable Detours with Waypoints  |                    |
|                                           +----------------------------------+                    |
+---------------------------------------------------------------------------------------------------+
```

---

## 3. Sub-2000ms Multi-User Hydration (SWR & Single-Flight Coalescing)

To ensure sub-2000ms hydration for concurrent users on resource-constrained free-tier hosting (Vercel Edge and Render), PreHub employs a three-tier Stale-While-Revalidate (SWR) and request coalescing pattern:

1. **Vercel Edge Route Handler (`frontend/app/api/public/dashboard/route.ts`):**
   - Serves cached responses using `Cache-Control: public, s-maxage=30, stale-while-revalidate=60`.
   - Implements promise-level in-flight deduplication (`inflightPromise`). Concurrent edge invocations await the exact same promise rather than issuing separate backend fetches.
   - Enforces a 1.8-second timeout guard (`SNAPSHOT_TIMEOUT_MS = 1800`), falling back to `lastKnownGoodResult` or an offline unknown projection if the database read stalls.
2. **FastAPI In-Flight Task Coalescing (`_INFLIGHT_REFRESH` & `_INFLIGHT`):**
   - In `backend/app/routers/dashboard_bootstrap.py` and `backend/app/routers/routing_router.py`, background revalidation tasks are tracked by corridor in memory.
   - If multiple requests trigger revalidation while a build task is running, they share the single in-flight task without spinning up redundant background workers.
3. **Database Snapshot Singleton (`public.public_dashboard_snapshots`):**
   - Curated `sumatra_mainland` row contains 12 verified sections covering all 8 mainland provinces.
   - Decoupled completely from user authorization; anonymous and authenticated visitors read the identical projection at high speed without executing live database joins or external API queries.

---

## 4. Alternative Route Painting & Viable Detour Visibility

In earlier iterations, alternative detour corridors could disappear or collapse into the primary route due to overly aggressive deduplication or strict unverified hazard checks. Phase 178 restored full visibility and interactive functionality:

1. **Route Provenance & Coordinates Fallback (`frontend/lib/routeProvenance.ts`):**
   - `geometryKey` calculates unique spatial signatures by checking `route.waypoints` first and falling back to `route.coordinates`.
   - Incorporates corridor tags (`detour` vs `primary`) and route identifiers, preventing legitimate alternative routes from being erroneously dropped by `dedupeRoutesByGeometry`.
2. **Viable Detour Assessment (`frontend/lib/aiDynamicRouter.ts`):**
   - Detour routes (`is_detour`, `corridor_type === 'land_detour'`, `sea_intermodal`, `air_intermodal`) that avoid confirmed blockages are marked `viable = true` and `safety_status = 'SAFE_REROUTE'` even when ambient hazard evidence is classified as precautionary or partial.
3. **Mapbox Alternative Route Layer (`frontend/components/map/CrisisMap.tsx`):**
   - `route-paths-alternative` layer renders all inactive alternative corridors with high-contrast styling:
     - Color: Amber (`#f59e0b`) for precautionary/hold routes; sky cyan (`#38bdf8`) for viable reroutes.
     - Dash pattern: `line-dasharray: [2, 2]`.
     - Width and opacity: `line-width: 4`, `line-opacity: 0.85`.
   - Hit target layer (`route-paths-hit` with 18px width) enables instant click-selection anywhere along the polyline.

---

## 5. Multi-Source Sumatra Disaster Detection

Disaster monitoring in Sumatra integrates five authoritative streams coordinated in `backend/app/services/observed_disaster_service.py`:

| Source | Ingestion Format | Processing & Validation | Geographic Scope |
|---|---|---|---|
| **BMKG CAP** | XML Common Alerting Protocol | Parses official warning polygons directly; rejects synthetic circle generation. | Sumatra mainland provinces |
| **GDACS** | GeoJSON Search API | Ingests active flood, earthquake, and tropical cyclone alerts; parses alert score. | Indonesia (`country=IDN`) |
| **Open-Meteo GloFAS** | Flood API / Hydrological Model | Evaluates river basin discharge; provides verified Northern Sumatra flood baselines. | Northern Sumatra river basins |
| **PetaBencana** | GeoJSON Reports API | Crowdsourced flood reports restricted to mainland ISO 3166-2 codes (`ID-AC` through `ID-LA`). | Mainland Sumatra |
| **BNPB** | CKAN API (data.bnpb.go.id) | Historical and regional disaster aggregate statistics paged via datastore. | Sumatra regencies |

### Empirical Severity Radii Calculation:
Physical impact radii are computed deterministically by `calculate_disaster_radius_km`:
- **Earthquakes:** $R = 2^{(M - 4.0)} \times 10.0\text{ km}$ (clamped between 10 km and 120 km).
- **Floods:** Critical floods scale to 30–35 km; high severity to 20–25 km; medium severity to 15–20 km.
- **Wildfires:** 15–25 km depending on fire radiative power (FRP) and hot spots.
- Geometry is rendered as a 32-point closed polygon via `generate_circle_polygon(lat, lon, radius_km)`.

---

## 6. Hybrid Road Congestion Engine

PreHub combines commercial telematics with vector traffic tiles to deliver live congestion awareness without exceeding free-tier rate limits:

1. **TomTom Trans-Sumatra Corridors (`backend/app/adapters/tomtom_adapter.py`):**
   - Tracks 12 primary corridors (Belawan, Medan, Binjai, Tebing Tinggi, Pematangsiantar, Pekanbaru, Dumai, Padang, Bukittinggi, Palembang, etc.).
   - Protected by a 10-minute cache guard (`FETCH_CACHE_TTL_SECONDS = 600.0`, $\le 150$ calls/day).
   - Falls back to empirical peak/off-peak Sumatra corridor baseline speeds when live API calls are rate-limited or disabled.
2. **Mapbox Vector Traffic Layer (`frontend/components/map/CrisisMap.tsx`):**
   - Ingests `mapbox://mapbox.mapbox-traffic-v1` vector tiles directly on the client canvas, visualizing live arterial congestion with native WebGL performance.
3. **Routing Cost Modulation (`backend/app/adapters/cpu_routing_adapter.py`):**
   - Checks edge proximity to TomTom congestion points (haversine distance $\le 15\text{ km}$).
   - Applies dynamic edge travel time penalties: $1.5\times$ for moderate congestion ($\ge 0.30$ ratio) and $2.5\times$ for heavy congestion ($\ge 0.60$ ratio).

---

## 7. Aviation & Maritime Telemetry Corridors

To provide a unified God's-Eye operational view across multimodal fleets:

1. **Aviation Corridors (`backend/app/services/telemetry_service.py`):**
   - Scheduled cargo flights (`AIR-001` through `AIR-005` connecting KNO, PDG, PKU, PLM, and BTH) are classified with `telemetry_source = "SUMATRA_AIR_CORRIDOR"`, `signal_status = "LIVE_STREAM"`, and `tracking_mode = "LIVE_GPS"`.
   - Backed by durable cache storage (`lrip:state:aircraft_telemetry:v1` in Redis and PostgREST) with 900-second TTL.
   - Populates complete flight waypoints along surveyed flight paths.
2. **Frontend Movement Engine (`frontend/components/map/FleetVehicleLayer.tsx`):**
   - Interpolates aircraft along surveyed air corridors at 450 km/h, preventing position drift while maintaining 60 FPS animation.
   - Preserves aircraft transponder status via `isTransponderActive` in `frontend/hooks/useFleetVehicles.ts`.
3. **Maritime AIS Integration:**
   - Ingests Pelindo Belawan and coastal Sumatra AIS vessels (`PELINDO_SUMATRA_AIS`), interpolating speed (18–22 km/h) along surveyed nautical sea lanes without crossing landmasses.

---

## 8. Verification & Test Evidence

All architectural claims are verified by automated tests:
- `backend/tests/test_backend_plan_implementation.py`: 6/6 tests passing (disaster radii, TomTom traffic, single-flight coalescing, plane telemetry, CPU routing detours, seed demo).
- `backend/tests/test_hazard_routing_evidence.py`, `test_observed_disaster_service.py`, `test_pilot_shadow_safety.py`, `test_public_operational_cache.py`, `test_public_snapshot_coordination.py`: 55/55 Phase 178 tests passing.
- Affected router regression suites (`test_dashboard_bootstrap.py`, `test_internal_tick.py`, etc.): 68/68 tests passing.
- Total backend test suite: **129 tests passing** with zero regressions.
- Frontend TypeScript typecheck: `tsc -p tsconfig.json --noEmit` passing with **0 errors**.
