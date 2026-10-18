# Phase 69 Plan: WebGL Telemetry Stabilization & Main-Thread Performance Optimization

## 1. Executive Summary & Goals

Following our empirical diagnosis via Chrome DevTools MCP on production (`https://pre-hub.vercel.app/dashboard?guest=1`) and source code investigation, Phase 69 eliminates runtime crashes, resolves visual artifacts on map layers, and removes severe main-thread CPU bottlenecks.

### Core Objectives:
1. **Zero-Crash SpatialHash Engine**: Protect `frontend/lib/spatialHashArbiter.ts` against `Infinity` / `-Infinity` coordinates and unbounded array loops, guaranteeing that `RangeError: Invalid array length` can never occur under any camera angle, zoom level, or invalid coordinate input.
2. **Visual Sanity on Velocity Vectors**: Correct forward velocity vectors (`deck-fleet-vectors`) so aircraft and trucks display authentic flight paths/bearings (derived from route progression) instead of pointing due North as mysterious vertical needles, and only show velocity vectors for active/selected units or during flight maneuvers.
3. **Main-Thread Unchoking & Telemetry Throttling**: Optimize `FleetVehicleLayer.tsx` animation loop:
   - Decouple telemetry dead-reckoning update tick (25 FPS / 40ms interval) from monitor refresh rate, slashing CPU load by >60%.
   - Restrict `SpatialHash` label arbitration to camera movements and significant asset position shifts instead of executing 60 times/sec on static screens.
   - Maintain 60 FPS native GPU smoothness for Mapbox canvas interactions while keeping main thread CPU idle (<15%).
4. **Network Backoff & Fallback Resilience**: Prevent uncoordinated CORS/404 retry storms when backend services are dormant or cold-starting.

---

## 2. Deliverables & Blast Radius

### Workstream 1: SpatialHash Arbiter Hardening (`frontend/lib/spatialHashArbiter.ts`)
- Add strict finite check: `Number.isFinite(item.screenX) && Number.isFinite(item.screenY) && Number.isFinite(w) && Number.isFinite(h)`.
- Discard candidate items positioned far outside viewport boundaries (`screenX < -250 || screenX > 3500 || screenY < -250 || screenY > 3500`).
- Clamp maximum grid cell footprint to a strict threshold: if `(maxCx - minCx + 1) * (maxCy - minCy + 1) > 24`, clamp bounds or discard candidate to prevent array allocation explosion.
- Add comprehensive Vitest/Jest unit test in `frontend/tests/spatialHashArbiter.test.ts` verifying that extreme coordinates (`[NaN, NaN]`, `[-Infinity, Infinity]`, `[-1e15, 1e15]`) exit safely without throwing `RangeError`.

### Workstream 2: Heading & Velocity Vector Realism (`FleetVehicleLayer.tsx` & `useFleetVehicles.ts`)
- In `frontend/hooks/useFleetVehicles.ts`:
  - Populate authentic initial headings for aviation assets:
    - `AIR-001` (KNO -> CGK): `heading_deg: 145` (Southeast towards Jakarta).
    - `AIR-002` (PKU -> BIM): `heading_deg: 228` (Southwest towards Padang).
    - `AIR-003` (PLM -> TKG): `heading_deg: 168` (South-Southeast towards Lampung).
    - `AIR-004` (BTJ -> KNO): `heading_deg: 122` (East-Southeast towards Medan).
    - `AIR-005` (DJB -> PLM): `heading_deg: 142` (Southeast towards Palembang).
  - Populate authentic initial headings for Trans-Sumatra road freight:
    - `TRK-010` (Pekanbaru -> Duri): `heading_deg: 342` (North-Northwest).
    - `TRK-002` (Bukittinggi -> Pekanbaru): `heading_deg: 58` (Northeast).
- In `frontend/components/map/FleetVehicleLayer.tsx`:
  - If a vehicle lacks explicit `heading_deg`, derive forward azimuth bearing dynamically from its current route polyline (`calculateRouteProgressPosition`) rather than defaulting to `0` (North).
  - Scale forward velocity vectors appropriately: clamp maximum visual length to 15-25 pixels on screen (or 1.5 minutes forward projection) rather than 41.6 km across the hemisphere.
  - Render forward vector prominently when vehicle is selected (`isSelected`) or in active reroute, keeping unselected background units clean and uncluttered.

### Workstream 3: Main-Thread Render Loop Optimization (`FleetVehicleLayer.tsx`)
- Implement frame-rate throttling in `animate(now)`:
  - Maintain a target telemetry update rate of 25 FPS (interval ~40ms).
  - Skip dead-reckoning and layer reconstruction if elapsed time since last update is `< 38ms`.
- Optimize `SpatialHash` arbitration frequency:
  - Cache winning label IDs. Only re-run `arbitrateVisibleLabels` when the map camera moves (`map.on('moveend')` or debounced camera pan) or when asset positions delta exceeds 20px.
- Reuse Deck.gl Layer property configurations and avoid unnecessary recreation when vehicle positions have not significantly shifted.

### Workstream 4: Backend Telemetry Polling Resilience
- In `frontend/hooks/useFleetVehicles.ts` and related data hooks:
  - Ensure fallback fleet data is cleanly retained if backend `/api/v1/fleet/vehicles` returns 404/500/CORS without triggering endless error re-renders.

---

## 3. Verification & Acceptance Criteria

### Automated Type & Build Verification:
- [ ] `npx tsc --noEmit` in `frontend/`: 0 errors.
- [ ] `npm run build` in `frontend/`: 100% clean production bundle.
- [ ] Vitest / Node test verifies `arbitrate()` executes cleanly with invalid/infinite inputs without `RangeError`.

### Live Production Parity & DevTools Verification:
- [ ] No `RangeError: Invalid array length` in browser console under rapid zoom-in and zoom-out cycles.
- [ ] Aircraft and trucks display authentic direction vectors aligned with their travel corridors (no vertical north needles).
- [ ] UI main-thread responsive during continuous map interaction; idle CPU overhead reduced significantly.
