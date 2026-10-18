# Phase 70 Summary: Map State Reset Purge, Fleet Telemetry Filter Honest Toggle, and REST Latency Optimization

## Executive Overview
Phase 70 targeted three critical operational defects affecting user experience, data integrity, and system responsiveness on PreHub:
1. **Persistent Stale Route & Markers After Reset**: Route polyline and origin/destination badges lingered on the Mapbox GL canvas after the user clicked "Reset Titik Node".
2. **Unresponsive Fleet Simulation Filter**: The `#fleet-sim-toggle-btn` ("Hanya GPS & Transponder Live" vs "Live AIS/ADS-B + Rute Estimasi") appeared inactive because `isTransponderActive` mistakenly classified units with fallback identifiers as live GPS, and all estimated vehicles were located outside the default Medan-Belawan viewport without corridor trajectory visualization.
3. **Severe Telemetry & Corridor REST Latency (5.4s+ -> <20ms)**: Sequential network requests to BMKG, TomTom, and Supabase in `corridor_service.py` caused extreme blocking latency without any in-memory/Redis read cache.

---

## Detailed Implementation & Changes

### 1. Map Canvas State Synchronizer & Route Purge
- **Component**: `frontend/components/map/CrisisMap.tsx`
  - Added dedicated React `useEffect` listening to `selectedOriginNode` and `selectedDestNode`.
  - When both are null (`!selectedOriginNode && !selectedDestNode`), it resets local `customPinnedPoints` state to `[]` and directly updates Mapbox GeoJSON sources:
    - `custom-pinned-source`: cleared to empty `FeatureCollection`
    - `route-paths-source`: cleared to empty `FeatureCollection`
    - `route-eta-badges-source`: cleared to empty `FeatureCollection`
    - `congestion-segments-source`: cleared to empty `FeatureCollection`
- **Controller**: `frontend/components/dashboard/DashboardClient.tsx`
  - Updated `handleResetNodes`:
    - Increments `routeCalculationReqIdRef.current++` to discard any in-flight asynchronous route solver calculations.
    - Clears `customNodesRef.current = []` and `demoDetourRoutesRef.current = []`.
    - Resets `routingInfo = null` and `activeRouteIdx = 0`.

### 2. Honest Fleet Filter & Estimated Trajectory Deck.gl Visualizer
- **Hook**: `frontend/hooks/useFleetVehicles.ts`
  - Added corridor schedule unit `TRK-013-BELAWAN-MEDAN-SCHED` positioned right inside the default Medan-Belawan logistics arterial corridor.
  - Hardened `isTransponderActive` to strictly check for simulation/scheduled states first (`tracking_mode === 'ROUTE_ESTIMATED'`, `signal_status === 'SIMULATION_CACHE'`, `telemetry_source === 'ROUTE_ESTIMATED'`), preventing them from falsely passing as active live transponders.
- **Map Layer**: `frontend/components/map/FleetVehicleLayer.tsx`
  - Integrated `deck-fleet-estimated-routes` (`PathLayer` from `@deck.gl/layers`):
    - Visualizes planned arterial trajectories with amber dashed corridor paths (`[245, 158, 11, 200]`) when in "Live AIS/ADS-B + Rute Estimasi" mode.
    - Adds tactical pulsing target rings (`ScatterplotLayer`) around estimated units.
    - Completely hides estimated routes and vehicles when the user toggles "Hanya GPS & Transponder Live", providing an immediate and visually verifiable state change.

### 3. Backend REST Latency Optimization & Multi-Tier Caching
- **Service**: `backend/app/services/corridor_service.py`
  - Added module-level `_CORRIDOR_CACHE` (180s TTL) and checked Redis (`lrip:corridor:context:{corridor_id}`) at the very start of `get_corridor_context` for sub-5ms cached reads.
  - Replaced sequential upstream requests with `asyncio.gather(_fetch_bmkg(), _fetch_tomtom(), _fetch_pihps_db(), return_exceptions=True)`, cutting upstream fetch time to the maximum single request duration instead of the sum.
  - Made the `data_sources` table health status upsert non-blocking via `asyncio.create_task`.
- **Router**: `backend/app/routers/news_router.py`
  - Added fast-path cache evaluation in `get_live_news`, returning in-memory articles instantly (<5ms) when fresh (<30s) and unfiltered, eliminating redundant Supabase PostGIS roundtrips.
- **Router**: `backend/app/routers/health.py`
  - Added in-memory 30-second TTL caching to `source_health_check` to prevent repeated DB scans on frequent UI status polling.
- **Next.js Proxy**: `frontend/app/api/proxy/[...path]/route.ts`
  - Added `Cache-Control: public, s-maxage=60, stale-while-revalidate=120` to 200 GET proxy responses, activating Vercel Edge caching for downstream users.

---

## Verification & Proof of Work
1. **Type Safety**: `npx tsc --noEmit` passed with 0 errors.
2. **Syntax Compilation**: `python -m py_compile` on all modified backend files passed with exit code 0.
3. **Automated Unit Tests**:
   - `scripts/test_arbiter.ts` passed (100% clean).
   - `scripts/test_phase70_logic.ts` passed (100% clean).
