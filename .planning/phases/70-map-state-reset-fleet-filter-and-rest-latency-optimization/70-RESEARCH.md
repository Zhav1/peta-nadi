# Phase 70 Research: Map State Reset Purge, Fleet Telemetry Filter & Backend REST Latency Optimization

## Executive Summary & Problem Scope

During live operational testing on `https://pre-hub.vercel.app/dashboard?guest=1` and comprehensive DevTools inspection, three distinct operational anomalies were diagnosed:

1. **Stale Route & Markers Persisting on Map Canvas After Reset**:
   Clicking "Reset Titik Node" resets button text and form states, but the Mapbox WebGL canvas retains the previously calculated route polyline, origin marker (`[ASAL]`), and destination marker (`[TUJUAN]`).
2. **Unresponsive Telemetry Filter (`#fleet-sim-toggle-btn`)**:
   Toggling between "Hanya GPS & Transponder Live" (21) and "Live AIS/ADS-B + Rute Estimasi" (25) produces zero visible change on the active map canvas around North Sumatra / Medan, and estimated routes lack trajectory visualization.
3. **Extreme REST Endpoint Latency (5.4 Seconds) on `/corridor/context`**:
   The "Diagnostik API & Observabilitas" tab reports up to 5,456 ms latency for `/corridor/context` due to sequential blocking calls to BMKG, TomTom, and Supabase without cache lookups, plus cold start delays.

---

## 1. Deep Root Cause Analysis

### Issue 1: Stale Route & Markers Retention After Reset
- **Files**:
  - `frontend/components/dashboard/DashboardClient.tsx:506` (`handleResetNodes`)
  - `frontend/components/map/CrisisSimulatorBar.tsx:253-265` (Node reset button)
  - `frontend/components/map/CrisisMap.tsx:174-180` (`customPinnedPoints`), `CrisisMap.tsx:1255-1270` (`custom-pinned-source`)
- **Root Cause**:
  1. `CrisisMap.tsx` maintains custom pinned points in an isolated local state:
     ```tsx
     const [customPinnedPoints, setCustomPinnedPoints] = useState<Array<{ id: string; coords: [number, number]; name: string; role: 'origin' | 'dest' | 'poi' }>>([]);
     ```
  2. The Mapbox layer `custom-pinned-point`, `custom-pinned-pulse`, and `custom-pinned-label` render directly from `customPinnedPoints` via `custom-pinned-source`.
  3. When `handleResetNodes` runs in `DashboardClient.tsx`, it clears `selectedOriginNode`, `selectedDestNode`, and `currentMapRoutes`. However, `CrisisMap` has no `useEffect` listening to `!selectedOriginNode && !selectedDestNode` to clear `customPinnedPoints`. Thus, `customPinnedPoints` permanently retains the old points until page refresh.
  4. In `DashboardClient.tsx`, `handleResetNodes` does not increment `routeCalculationReqIdRef.current++` or clear `customNodesRef.current` and `demoDetourRoutesRef.current`. If an asynchronous route calculation was in-flight, it resolves and writes back to `currentMapRoutes`, resurrecting the route line on the canvas.

### Issue 2: Unresponsive Telemetry Filter
- **Files**:
  - `frontend/components/dashboard/DashboardClient.tsx:1680-1707` (`#fleet-sim-toggle-btn`)
  - `frontend/hooks/useFleetVehicles.ts:318-354` (`isTransponderActive`)
  - `frontend/components/map/FleetVehicleLayer.tsx:390-405` (Visible vehicle filtering)
- **Root Cause**:
  1. In `useFleetVehicles.ts`, `isTransponderActive` evaluates `v.modality === 'maritime' || v.modality === 'air' || Boolean(v.vin || v.mmsi || v.icao24)` as `true`. This causes 21 out of 25 vehicles to be classified as "Transponder Live".
  2. The only 4 vehicles filtered out (`TRK-005`, `TRK-007`, `TRK-009`, `TRK-011`) are located in Aceh, West Sumatra (Padang), Lampung, and Rantauprapat — far outside the active map viewport centered on Medan / Deli Serdang.
  3. In `FleetVehicleLayer.tsx`, `ROUTE_ESTIMATED` units are rendered identically to live units (dot + label) without any planned corridor polyline or distinctive tactical halo.
  4. Consequently, toggling the button produces zero visual difference in the operator's active field of view.

### Issue 3: Extreme REST Endpoint Latency
- **Files**:
  - `backend/app/services/corridor_service.py:29-225` (`get_corridor_context`)
  - `backend/app/routers/news_router.py:68-115` (`get_live_news`)
  - `backend/app/routers/health.py:24-75` (`source_health_check`)
  - `frontend/app/api/proxy/[...path]/route.ts` (Next.js proxy route)
- **Root Cause**:
  1. `corridor_service.py:get_corridor_context` executes 4 network operations sequentially:
     `await bmkg.fetch()` $\to$ `await tomtom.fetch()` $\to$ Supabase select $\to$ Supabase upsert.
     It writes to Redis at the end, but **never checks Redis at the start**. Every call incurs a fresh 5.4-second roundtrip.
  2. `news_router.py:get_live_news` has `_NEWS_CACHE`, but line 90 executes `await fetch_news_from_supabase(...)` *before* checking the cache, bypassing in-memory caching.
  3. `health.py:source_health_check` executes a synchronous database query to Supabase on every call without caching (~885 ms).
  4. The Next.js proxy route does not send `s-maxage` or `stale-while-revalidate` HTTP cache headers for read-only GET telemetry.

---

## 2. Technical Solution Architecture

### Workstream 1: Map State Reset Purge
1. In `CrisisMap.tsx`, add an explicit synchronization effect:
   ```tsx
   useEffect(() => {
     if (!selectedOriginNode && !selectedDestNode) {
       setCustomPinnedPoints([]);
       const map = mapRef.current;
       if (map && isMapLoadedRef.current) {
         const customSrc = map.getSource('custom-pinned-source') as mapboxgl.GeoJSONSource;
         if (customSrc) customSrc.setData({ type: 'FeatureCollection', features: [] });
         const routeSrc = map.getSource('route-paths-source') as mapboxgl.GeoJSONSource;
         if (routeSrc) routeSrc.setData({ type: 'FeatureCollection', features: [] });
         const badgesSrc = map.getSource('route-eta-badges-source') as mapboxgl.GeoJSONSource;
         if (badgesSrc) badgesSrc.setData({ type: 'FeatureCollection', features: [] });
       }
     }
   }, [selectedOriginNode, selectedDestNode]);
   ```
2. In `DashboardClient.tsx:handleResetNodes`:
   ```tsx
   routeCalculationReqIdRef.current++;
   customNodesRef.current = {};
   demoDetourRoutesRef.current = null;
   setSelectedOriginNode(null);
   setSelectedDestNode(null);
   setCurrentMapRoutes([]);
   setSelectedCrisis(null);
   setSelectedCrisisId(null);
   ```

### Workstream 2: Precision Telemetry Filtering & Trajectory Lines
1. In `useFleetVehicles.ts`:
   - Enforce honest transponder evaluation: `tracking_mode === 'LIVE_GPS'` or hardware transponder stream (`AIS_LIVE`, `ADSB_LIVE`, `PELINDO_SUMATRA_RADAR`).
   - Add at least one scheduled route-estimated delivery vehicle operating in the North Sumatra / Medan corridor (e.g. `TRK-013-MEDAN-DELISERDANG` or marking `TRK-003` mode) so the filter has visible impact in the default viewport.
2. In `FleetVehicleLayer.tsx`:
   - When `isSimulationMode` is active, render projected corridor polylines for `ROUTE_ESTIMATED` vehicles using an amber dashed path layer (`deck-fleet-estimated-routes`).
   - Give `ROUTE_ESTIMATED` vehicles distinct visual styling (amber ring/halo) so dispatchers clearly perceive the difference between hardware transponders and dead-reckoned scheduled routes.

### Workstream 3: REST Fast-Path & Parallel Execution
1. In `corridor_service.py`:
   - Check Redis cache or in-memory LRU cache at the top of `get_corridor_context`. If fresh (< 180s), return immediately (< 50ms).
   - If cache miss, execute `bmkg.fetch()`, `tomtom.fetch()`, and Supabase commodity query concurrently using `asyncio.gather(..., return_exceptions=True)`.
   - Dispatch `data_sources` upsert as a non-blocking background task.
2. In `news_router.py`:
   - Read from `_NEWS_CACHE` first before triggering database queries.
3. In `health.py`:
   - Add a 30-second in-memory cache for `source_health_check`.
4. In `frontend/app/api/proxy/[...path]/route.ts`:
   - Attach `Cache-Control: s-maxage=60, stale-while-revalidate=120` to GET telemetry responses.
