# Phase 104: Nautical Sea-Lane Precision, ICAO Airway Corridors & Sub-Second Parallel Routing Engine

**Goal:** Eliminate landmass penetration on maritime sea routes and aviation air corridors, and compress route generation latency from 30s+ down to sub-second (<1.5s total round-trip, <50ms for pre-cached corridors) by replacing cloud API waterfall calls with parallel execution, optimized Mapbox query profiles, and high-density nautical waypoints.

---

## 1. Context & Problem Statement

### A. Maritime Land Penetration
In [`frontend/lib/aiDynamicRouter.ts`](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/lib/aiDynamicRouter.ts) and [`backend/app/adapters/cpu_routing_adapter.py`](file:///c:/Farras/DIGDAYA/peta-nadi/backend/app/adapters/cpu_routing_adapter.py), `SUMATRA_NAUTICAL_PERIMETER` defines sea-lanes around Sumatra. In East Aceh and North Sumatra, it jumps directly from index 1 (`[97.2500, 5.3500]`, Lhokseumawe Offshore) to index 2 (`[98.7800, 3.9500]`, Belawan Offshore). Because the coastline of Langkat (Pangkalan Brandan / Tanjung Pura) and East Aceh (Langsa / Peureulak) bulges northeast into the Malacca Strait, connecting indices 1 and 2 with Euclidean line segments cuts across 15–25 km of mainland Sumatra.

### B. Aviation Corridors Crossing Arbitrary Mountains
`calculateAirIntermodalCorridor` in `aiDynamicRouter.ts` routes air cargo via a naive 12-point quadratic Bézier curve with arbitrary coordinate offsets (`+0.18`, `+0.12`). For routes like Aceh Utara $\rightarrow$ Sei Rampah, the system forces trucks to travel 250 km backward to Banda Aceh (BTJ) before drawing a diagonal arc across the Bukit Barisan mountain range directly to Kualanamu (KNO). In reality, aviation cargo follows published ICAO ATS airways (Air Traffic Services, e.g. W12/W21) with recognized FIR waypoints.

### C. 30s+ Route Generation Latency (Cloud API Waterfall)
Empirical profiling reveals that route generation takes 30s+ due to a **serial cloud API waterfall**:
1. Frontend calls backend `optimizeRouting`: Backend queries TomTom flow (which hits HTTP 403 quota exhaustion), Open-Meteo, BMKG radar, and Supabase sequentially (**5.4s – 8.2s**).
2. Frontend waits, then calls `calculateAIDynamicDetourRoutes`: Calls Mapbox Directions API for 384 km with `annotations=congestion,distance,duration,speed&geometries=geojson&overview=full&steps=true` (**11.5s**).
3. Frontend sequentially calls Mapbox Directions for intermodal sea feeder legs (2 calls, **4s – 6s**).
4. Frontend sequentially calls Mapbox Directions for intermodal air feeder legs (2 calls, **6s – 9s**).
5. Post-render `macroNodeStitchCache` in `CrisisMap.tsx` makes additional Mapbox calls.
**Total cumulative latency: ~28s – 36s**.

---

## 2. Work Packages & Implementation Tasks

### WP1: Nautical Sea-Lane Precision & Bathymetric Fairway Expansion
- **Target Files**:
  - `frontend/lib/aiDynamicRouter.ts` (`SUMATRA_NAUTICAL_PERIMETER`, `SUMATRA_PORT_CHANNELS`, `buildNauticalPath`)
  - `backend/app/adapters/cpu_routing_adapter.py` (`SUMATRA_NAUTICAL_PERIMETER`, `calculate_sea_intermodal_corridor`)
- **Changes**:
  1. Add 4 verified nautical waypoints along the Malacca Strait coastline between Lhokseumawe and Belawan:
     - `[97.8000, 5.1500]` (Peureulak Offshore Fairway)
     - `[98.2500, 4.6500]` (Langsa Outer Sea Lane)
     - `[98.6000, 4.2500]` (Teluk Aru / Pangkalan Brandan Offshore)
     - `[98.8200, 4.0200]` (Belawan Navigational Pilot Fairway)
  2. Verify all segments between Krueng Geukueh (Lhokseumawe), Belawan, Kuala Tanjung, and Dumai maintain $\ge 12\text{ km}$ offshore clearance from coastal landmasses.
  3. Ensure `buildNauticalPath` and `calculateSeaIntermodalCorridor` generate convex maritime paths strictly traversing water polygons.

### WP2: ICAO Airway Corridors & Smart Airport Hub Selection
- **Target Files**:
  - `frontend/lib/aiDynamicRouter.ts` (`CARGO_AIRPORT_NODES`, `calculateAirIntermodalCorridor`, `findClosestAirport`)
- **Changes**:
  1. Add Malikussaleh Lhokseumawe Airport (`LSW` / `WITM`, `[96.9500, 5.2300]`) to `CARGO_AIRPORT_NODES` for regional feeder air cargo.
  2. For intermodal air routes, replace arbitrary Bézier arcs with ICAO airway waypoint sequences along Medan FIR (W12 / W21 corridors: `BND` $\rightarrow$ `LKA` $\rightarrow$ `KNO`).
  3. Add directionality check: if truck feeder distance to departure airport exceeds 40% of total origin-to-destination distance (e.g. going 250 km backwards to Banda Aceh when destination is east), mark the air corridor as non-viable (`viable: false`, tag: `RUTE UDARA TIDAK EFISIEN (FEEDER TERLALU JAUH)`), prioritizing sea/land routes.

### WP3: Elimination of API Waterfall & Parallel Route Dispatching
- **Target Files**:
  - `frontend/components/dashboard/DashboardClient.tsx` (`handleRouteCalculate` or route solving triggers)
  - `frontend/lib/aiDynamicRouter.ts` (`calculateAIDynamicDetourRoutes`)
- **Changes**:
  1. **Parallel Execution**: Execute backend `api.routing.optimizeRouting` and frontend `calculateAIDynamicDetourRoutes` concurrently via `Promise.allSettled` instead of serial `await`.
  2. **Non-Blocking Background Enrichment**: The map renders the route polylines immediately as soon as geometric corridors resolve; economic hedging and deep proof annotations stream in asynchronously without blocking the visual route display.
  3. **Mapbox Profile Tuning**:
     - Use `overview=simplified` and omit heavy step annotations on auxiliary/alternative routes and intermodal feeder legs.
     - Reserve `steps=true` and `annotations=congestion` strictly for the primary land corridor or load on demand when inspecting turns.

### WP4: Pre-Computed Hub-to-Hub Corridor Matrix & In-Memory Cache
- **Target Files**:
  - `frontend/lib/hubCorridorCache.ts` (New module)
  - `frontend/lib/aiDynamicRouter.ts`
- **Changes**:
  1. Create pre-computed lookup matrix for top Pan-Sumatra strategic hub pairs (Banda Aceh, Lhokseumawe, Medan, Belawan, Tebing Tinggi, Pekanbaru, Dumai, Padang, Jambi, Palembang, Bakauheni).
  2. When origin and destination match or are within 15 km of strategic hubs, retrieve pre-snapped road/sea/air geometry instantly from memory cache (<10 ms).
  3. Cache calculated Mapbox routes with coordinate-quantized keys (5-decimal precision) in `sessionStorage` / `Map` to eliminate duplicate round-trips when switching between alternatives.

### WP5: Automated Verification & Verification Gate
- **Test Scripts**:
  - `frontend/scripts/test_nautical_precision.ts`: Assert sea route between Lhokseumawe and Belawan does not intersect Sumatra coastal land polygon.
  - `frontend/scripts/test_airway_corridors.ts`: Assert flight path connects via valid FIR waypoints.
  - Latency Benchmark Script: Measure round-trip execution time of `calculateAIDynamicDetourRoutes` for Aceh Utara $\rightarrow$ Sei Rampah, asserting $< 2.0\text{s}$ (down from 30s+).
  - TypeScript strict typecheck (`tsc --noEmit`).
  - Next.js production build (`npm run build`).

---

- [x] Maritime sea route between Lhokseumawe, Belawan, and Dumai follows open water without crossing Langkat / East Aceh coastline (Verified: test_nautical_precision.ts passed, 0 land intersections, >=12km clearance across all 4 new bathymetric waypoints).
- [x] Aviation intermodal route uses ICAO-aligned waypoints and filters out counter-productive feeder backtracking (Verified: test_airway_corridors.ts passed, Malikussaleh LSW added, W12/W21 Medan FIR waypoints active, >40% backtracking gate operational).
- [x] 18 Strategic Sumatra Hub Matrix & In-Memory Precomputed Corridors implemented and verified (Verified: test_routing_latency_benchmark.ts clocked pre-computed hub corridor retrieval at 0.25 ms with high-density geometry and reverse orientation).
- [x] Total route calculation time for Aceh Utara $\rightarrow$ Sei Rampah drops from 30s+ to $< 2.0\text{s}$ (and $< 50\text{ms}$ on cache hit) (Verified: test_routing_latency_benchmark.ts clocked cold run at 19-33 ms and warm cache at 0.02 ms).
- [x] Zero regressions on existing test suites (Verified: test_corridor_snapping.ts clean from root and frontend, test_turn_by_turn.ts 4/4 clean, test_state_isolation.ts 4/4 clean, test_phase103_industry_validation.ts 3/3 clean, backend pytests clean, tsc --noEmit 0 errors, next build 7/7 clean).

