# Phase 70 Plan: Map State Reset Purge, Fleet Telemetry Filter & Backend REST Latency Optimization

## 1. Executive Summary & Goals

Phase 70 resolves three high-priority operational defects diagnosed on `https://pre-hub.vercel.app/dashboard?guest=1`:
1. **Map State Reset Purge**: Ensure clicking "Reset Titik Node" immediately clears all origin/destination markers (`[ASAL]`, `[TUJUAN]`), labels, and route polylines from the Mapbox canvas.
2. **Fleet Telemetry Filter Responsiveness**: Wire `#fleet-sim-toggle-btn` to precision hardware filtering and render projected trajectory lines for `ROUTE_ESTIMATED` units in the North Sumatra operational corridor.
3. **Backend REST Latency Optimization**: Introduce cache fast-paths and `asyncio.gather` parallelization for `/api/v1/corridor/context`, `/api/v1/news/live`, and `/api/v1/health/sources`, slashing latency from 5,400ms to < 200ms.

---

## 2. Deliverables & Blast Radius

### Workstream 1: Map State Reset Purge
- **Files**:
  - `frontend/components/map/CrisisMap.tsx`
  - `frontend/components/dashboard/DashboardClient.tsx`
- **Tasks**:
  1. In `CrisisMap.tsx`, add an effect synchronizing `customPinnedPoints` with `selectedOriginNode` and `selectedDestNode`:
     - When both `!selectedOriginNode && !selectedDestNode`, set `customPinnedPoints` to `[]`.
     - Imperatively call `setData({ type: 'FeatureCollection', features: [] })` on `custom-pinned-source`, `route-paths-source`, and `route-eta-badges-source`.
  2. In `DashboardClient.tsx:handleResetNodes`:
     - Increment `routeCalculationReqIdRef.current++` to discard any pending in-flight routing calculations.
     - Clear `customNodesRef.current = {}`.
     - Clear `demoDetourRoutesRef.current = null`.
     - Clear `routingInfo` state.

### Workstream 2: Precision Telemetry Filtering & Trajectory Lines
- **Files**:
  - `frontend/hooks/useFleetVehicles.ts`
  - `frontend/components/map/FleetVehicleLayer.tsx`
  - `frontend/components/dashboard/DashboardClient.tsx`
- **Tasks**:
  1. In `useFleetVehicles.ts`:
     - Refine `isTransponderActive`: strictly require `tracking_mode === 'LIVE_GPS'` or hardware streaming sources (`AIS_LIVE`, `ADSB_LIVE`, `PELINDO_SUMATRA_RADAR`, `TMS_GPS_WEBHOOK`).
     - Ensure fallback fleet includes scheduled distribution units in the active Medan / Deli Serdang corridor (`TRK-003` mode toggle or `TRK-013-MEDAN-DELISERDANG`) so filter changes are immediately obvious in the default view.
  2. In `FleetVehicleLayer.tsx`:
     - Add `PathLayer` for `ROUTE_ESTIMATED` vehicles (`deck-fleet-estimated-routes`) when `isSimulationMode` is enabled, rendering their planned corridor progression in an amber dashed/subtle polyline.
     - Distinguish `ROUTE_ESTIMATED` units visually with an amber halo / badge, while keeping live GPS units in emerald/cyan.
     - When "Hanya GPS & Transponder Live" is active, completely hide estimated routes and units.

### Workstream 3: Backend REST Latency Optimization & Edge Caching
- **Files**:
  - `backend/app/services/corridor_service.py`
  - `backend/app/routers/news_router.py`
  - `backend/app/routers/health.py`
  - `frontend/app/api/proxy/[...path]/route.ts`
- **Tasks**:
  1. In `backend/app/services/corridor_service.py`:
     - Check Redis / in-memory cache at the beginning of `get_corridor_context`: return cached payload immediately if fresh (< 180s).
     - Parallelize `bmkg.fetch()`, `tomtom.fetch()`, and Supabase commodity query via `asyncio.gather(..., return_exceptions=True)`.
     - Make `data_sources` upsert asynchronous via `asyncio.create_task` or background worker.
  2. In `backend/app/routers/news_router.py`:
     - Read from `_NEWS_CACHE` first before triggering database queries.
  3. In `backend/app/routers/health.py`:
     - Add a 30-second in-memory cache for `source_health_check`.
  4. In `frontend/app/api/proxy/[...path]/route.ts`:
     - Add `Cache-Control: s-maxage=60, stale-while-revalidate=120` on successful GET responses.

---

## 3. Verification & Acceptance Criteria

### Automated Verification:
- [ ] `npx tsc --noEmit` in `frontend/`: 0 errors.
- [ ] `npm test` in `frontend/`: 100% clean test suite pass.
- [ ] Python syntax validation on `corridor_service.py`, `news_router.py`, `health.py`.

### Live / UI Interaction Verification:
- [ ] Clicking "Reset Titik Node" removes all route polylines and `[ASAL]`/`[TUJUAN]` markers from the map canvas immediately.
- [ ] Toggling `#fleet-sim-toggle-btn` visibly shows/hides estimated route units and their trajectory paths in the active corridor.
- [ ] `/corridor/context` benchmark response time is reduced from >5,000ms to <200ms on cache hit and <1,000ms on refresh.
