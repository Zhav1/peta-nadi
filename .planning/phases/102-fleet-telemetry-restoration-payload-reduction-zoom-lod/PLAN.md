---
phase: 102
phase_name: Fleet Telemetry Restoration, Payload Optimization & Zoom-Out LOD Cartography
milestone: M6
milestone_name: 3D Globe Native Mapbox Fleet, Street-Snapping & Impeccable Cartography
created_at: "2026-10-24T01:55:00.000Z"
status: planned
framework: GSD
---

# Phase 102: Fleet Telemetry Restoration, Payload Optimization & Zoom-Out LOD Cartography

## Context & Objectives
During the live inspection of `https://pre-hub.vercel.app/dashboard?guest=1` following Phase 101, an adversarial investigation revealed three critical issues:
1. **Disappearing Trucks (Green Dots)**: A logic flaw in `frontend/components/map/FleetVehicleLayer.tsx:461-468` applied `hideEstimatedRoutes` to the vehicle collection filter (`visibleVehicles`), completely dropping all 24 trucks from `fleet-vehicles-source` once the live backend telemetry arrived.
2. **5.5 MB Telemetry Payload & Polling Lag**: `GET /api/v1/fleet/vehicles` currently serializes massive arrays of road-snapped polylines (>227,000 coordinate points) on every 10-second polling cycle, taking 9–15 seconds to download on Render and causing request backlog. Furthermore, while `frontend/public/data/fleet_corridors_snapped.json` (6.15 MB) exists on disk, no frontend component currently loads or uses it.
3. **Cartographic Clutter at Extreme Zoom-Out**: On global overview zooms ($z \le 3.5$), 424 fleet dots clump into an opaque mass, while 22px hub pulse rings and 64px reticles dwarf the entire island of Sumatra on the 3D globe.

**Objectives for Phase 102:**
1. **Restore All 24 Truck Dots (Emerald `#10b981`)**: Eliminate the erroneous `ROUTE_ESTIMATED` vehicle drop filter in `FleetVehicleLayer.tsx` while keeping ambient orange route lines hidden by default.
2. **Optimize Telemetry Payload (>99% Reduction)**:
   - Update backend to support lightweight telemetry polling (`?geometry=false` or default lean schema) delivering only essential kinematics (`current_coords`, `speed_kmh`, `heading_deg`, `progress`, `status`, `vehicle_id`), shrinking payload from 5.5 MB to < 30 KB and latency from 9-15s to < 100ms.
   - Implement a frontend static corridor cache loader (`corridorSnappingService.ts`) that reads `public/data/fleet_corridors_snapped.json` once on startup, enabling 60 FPS road kinematic interpolation without network strain.
3. **Zero-Latency State Hydration & Guest Security Guard**:
   - Initialize `useNewsVerification.ts` with `FALLBACK_SUMATRA_NEWS` and `useCorridorContext.ts` with `DEFAULT_FALLBACK_CORRIDOR` to eliminate jarring initial "Memuat" / "Tidak ada berita" flickers.
   - Add guest role guard on `checkHitl` polling in `DashboardClient.tsx` to stop 401 Unauthorized console errors.
4. **Implement Zoom-Out Level-of-Detail (LOD) & Smooth WebGL Dissolve**:
   - Terapkan WebGL data-driven `circle-opacity` interpolation on `fleet-vehicle-dots` (fade out smoothly between $z=4.0$ and $z=3.2$).
   - Apply `minzoom: 4.0` on route lines and halos, `minzoom: 4.5` on hub pulse rings, and hide `TargetLockReticle` at $z < 3.8$.
   - Enforce `minZoom: 2.8` on Mapbox camera options to prevent globe over-shrinkage.

---

## Work Packages

### WP1: Restorasi Titik Hijau Armada Truk (Green Dots Restoration)
- **Target File**: `frontend/components/map/FleetVehicleLayer.tsx`
- Remove the filter block at lines 461-468:
  ```typescript
  // DELETE THIS BLOCK:
  if (
    hideEstimatedRoutes &&
    v.tracking_mode === 'ROUTE_ESTIMATED' &&
    selectedVehicleIdRef.current !== v.vehicle_id
  ) {
    return false;
  }
  ```
- Retain `activeSelectedCoords` isolation in lines 685-709 so route polylines are strictly rendered for selected/inspected units.
- Ensure all 24 trucks render as crisp tactical dots (`#10b981`) with 1.5px `#0c0e12` border.
- **Proof of Work**: `map.getSource('fleet-vehicles-source')` contains all 24 truck features; verified in DOM and WebGL canvas.

### WP2: Optimasi Payload Telemetri Backend & Frontend Corridor Snapping
- **Backend Files**: `backend/app/services/telemetry_service.py`, `backend/app/routers/fleet_router.py`
  - Add `include_geometry: bool = False` query parameter to `GET /api/v1/fleet/vehicles`.
  - When `include_geometry=False`, omit bulky `path` and `route_geometry` fields from the output dictionary, leaving only:
    `vehicle_id`, `company_id`, `modality`, `status`, `tracking_mode`, `speed_kmh`, `heading_deg`, `progress`, `current_coords`, `origin`, `destination`, `eta_minutes`, `cargo`.
  - Provide route geometry on-demand: `GET /api/v1/fleet/vehicles/{vehicle_id}/geometry` or `GET /api/v1/fleet/vehicles?include_geometry=true`.
  - Verify payload size is < 50 KB (compared to previous 5.46 MB).
- **Frontend Files**: `frontend/hooks/useFleetVehicles.ts`, `frontend/lib/corridorSnappingService.ts`
  - Update `useFleetVehicles.ts` to fetch `/api/v1/fleet/vehicles?include_geometry=false`.
  - Create singleton `corridorSnappingService.ts` to asynchronously fetch `/data/fleet_corridors_snapped.json` once on application load and cache high-density waypoints by `vehicle_id`.
  - In `FleetVehicleLayer.tsx:500-508`, if `v.route_geometry` is not attached to the vehicle object, query `corridorSnappingService.getCorridorCoordinates(v.vehicle_id)` for 60 FPS trajectory interpolation.
- **Proof of Work**: Polling network request transfers < 50 KB in < 150ms; 60 FPS vehicle animations continue smoothly along snapped roads.

### WP3: Zero-Latency State Hydration & Guest Security Guard
- **Target Files**:
  - `frontend/hooks/useNewsVerification.ts`
  - `frontend/hooks/useCorridorContext.ts`
  - `frontend/components/dashboard/DashboardClient.tsx`
- **Actions**:
  - In `useNewsVerification.ts:621`, initialize `useState<NewsItem[]>(FALLBACK_SUMATRA_NEWS)` so news items appear instantaneously without empty state flash.
  - In `useCorridorContext.ts:65`, initialize `useState<CorridorContext | null>(DEFAULT_FALLBACK_CORRIDOR)` so pipeline indicators (BMKG/TomTom/PIHPS) immediately show operational status instead of "MEMUAT".
  - In `DashboardClient.tsx:874`, add role check `if (role === 'GUEST' || !user) return;` inside `checkHitl` interval to prevent 401 Unauthorized network calls.
- **Proof of Work**: Dashboard loads with zero empty flashes; zero 401 errors in browser console during guest session.

### WP4: Kartografi Zoom-Out LOD & Smooth WebGL Dissolve
- **Target Files**:
  - `frontend/components/map/FleetVehicleLayer.tsx`
  - `frontend/components/map/CrisisMap.tsx`
  - `frontend/components/map/TargetLockReticle.tsx`
- **Actions**:
  - In `FleetVehicleLayer.tsx`:
    - Add WebGL paint expression on `fleet-vehicle-dots`:
      ```typescript
      'circle-opacity': [
        'interpolate', ['linear'], ['zoom'],
        3.2, 0.0,
        4.0, 1.0,
      ],
      'circle-stroke-opacity': [
        'interpolate', ['linear'], ['zoom'],
        3.2, 0.0,
        4.0, 1.0,
      ]
      ```
    - Set `minzoom: 4.0` on layer `fleet-selected-route-line`.
    - Set `minzoom: 4.0` on layer `fleet-vehicle-selected-halo`.
  - In `CrisisMap.tsx`:
    - Set `minzoom: 4.5` on `hub-nodes-pulse-outer` and `hub-nodes-pulse-inner`.
    - Set `minzoom: 4.0` on `baseline-corridors-line` and `baseline-corridors-symbol`.
    - Set `minZoom: 2.8` on `new mapboxgl.Map({ ... minZoom: 2.8 })`.
  - In `TargetLockReticle.tsx`:
    - Check `map.getZoom() < 3.8` inside render/tracking loop and set `style.opacity = '0'` when zoomed out.
- **Proof of Work**: Clean globe view at $z \le 3.5$ with zero dot clutter, no giant pulses, and smooth transition when zooming into Sumatra.

### WP5: Automated Verification & Verification Gate
- Run TypeScript static typecheck: `rtk npx tsc -p frontend/tsconfig.json --noEmit` (0 errors).
- Run backend pytest: `backend/.venv/Scripts/pytest backend/tests/test_precision_fleet_telemetry.py backend/tests/test_adapters.py`.
- Run frontend E2E / unit test suite:
  - Assert all 24 trucks exist in `fleet-vehicles-source`.
  - Assert `circle-opacity` expression behaves correctly across zooms.
  - Assert backend telemetry payload size with `include_geometry=false` is < 50 KB.
  - Assert zero 401 console errors.
- **Proof of Work**: 100% green verification indicators.

---

## Scope Lock
- **Files to Modify:**
  - `backend/app/routers/fleet_router.py`
  - `backend/app/services/telemetry_service.py`
  - `frontend/components/map/FleetVehicleLayer.tsx`
  - `frontend/components/map/CrisisMap.tsx`
  - `frontend/components/map/TargetLockReticle.tsx`
  - `frontend/hooks/useFleetVehicles.ts`
  - `frontend/hooks/useNewsVerification.ts`
  - `frontend/hooks/useCorridorContext.ts`
  - `frontend/components/dashboard/DashboardClient.tsx`
  - `frontend/lib/corridorSnappingService.ts` (new)
  - `frontend/e2e/mapbox-turn-by-turn.spec.ts`
  - `.planning/STATE.md`
  - `.planning/ROADMAP.md`
- **Files Locked (DO NOT TOUCH):**
  - `backend/app/adapters/cpu_routing_adapter.py` (Core deterministic CPU routing invariant)
  - `frontend/components/map/SpatialHashArbiter.ts`
  - `backend/app/services/weather_fusion_service.py`
