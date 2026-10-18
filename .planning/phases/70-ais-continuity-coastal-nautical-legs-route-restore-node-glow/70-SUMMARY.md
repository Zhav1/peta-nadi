# Phase 70 Summary: AIS Continuity, Coastal Nautical Fairways & Multi-Color Legs, Hidden Route Restore, and Node Glow Reset

**Executed & Verified:** 2026-10-18  
**Scope:** Telemetry continuity, intermodal maritime routing, on-map multi-color leg rendering, corridor reset synchronization, and WebGL node highlight lifecycle.

---

## 1. Executive Summary & Root Cause Analysis

Phase 70 addresses four critical operational and visual stability gaps across PreHub's multi-modal logistics dashboard:

1. **AIS Vessel Telemetry Discontinuity**:
   - *Root Cause*: Fluctuations or reconnections in the AISStream WebSocket caused maritime vessels to abruptly vanish or blink when transitioning between live payloads and the fallback cache. Vessel coordinate extraction had mismatched keys (`lat`/`lon` vs `current_coords: [lon, lat]`).
   - *Fix*: Hardened `backend/app/adapters/aisstream_adapter.py` by maintaining a persistent 96-vessel regional Sumatra baseline and overlaying live AISStream updates on top (`get_ais_vessels()`). Enforced uniform `current_coords: [round(lon, 4), round(lat, 4)]` across all maritime and aviation units in `backend/app/services/telemetry_service.py` and frontend hooks.

2. **Land Traversal by Maritime Corridors & Single-Color Intermodal Legs**:
   - *Root Cause*: Maritime and intermodal corridors lacked coastal fairway topology, causing direct Euclidean line segments to cross Sumatra's landmass between inland/coastal river ports (e.g., Palembang Boom Baru on the Musi River, Pekanbaru on the Siak River) and open sea lanes. Furthermore, intermodal route lines rendered in a single uniform color rather than distinguishing road vs. sea vs. air legs.
   - *Fix*: Created explicit river estuary navigation channels in `frontend/lib/aiDynamicRouter.ts` (`SUMATRA_PORT_CHANNELS`) and `backend/app/adapters/cpu_routing_adapter.py` (`SUMATRA_PORTS_GRAPH`, `buildNauticalPath`, `generate_nautical_coastal_route`). Maritime routes now route out of river estuaries before traversing the 16-point `SUMATRA_NAUTICAL_PERIMETER`. Updated `agents/nodes/route_optimization.py` and `frontend/components/map/CrisisMap.tsx` to emit and render multi-color legs (Road: Emerald `#10B981`, Maritime: Royal Blue `#3B82F6`, Aviation: Sky/Cyan `#00F0FF`).

3. **Hidden Route Inconsistency & State Overwrite on Corridor Reset**:
   - *Root Cause*: In Phase 69, hiding a route corridor in `CrisisMap.tsx` kept local component state, but resetting corridors in `CrisisSimulatorBar.tsx` did not cleanly sync back. Moreover, when new backend crisis state arrived, client-side intermodal routes (sea, air, hold) were discarded if the backend only computed road detours.
   - *Fix*: Lifted `hiddenRouteIndices` to `DashboardClient.tsx`, wired bidirectional handlers (`handleHideRoute`, `handleResetCorridors`), and preserved client multi-leg intermodal routes when merging backend recommendations. `CrisisSimulatorBar.tsx` dynamically displays effective hidden route counts and restores all modalities in 1 click.

4. **Lingering Node Glow & Custom Pin Highlights on Reset**:
   - *Root Cause*: Resetting routing nodes in `CrisisSimulatorBar.tsx` cleared origin/destination state in the parent, but `customPinnedPoints` and WebGL pulse circles on Mapbox layers (`custom-pinned-source`, `pinned-pulse-layer`) remained rendered.
   - *Fix*: Added an active `useEffect` in `CrisisMap.tsx` that detects nullification of `selectedOriginNode` and `selectedDestNode`, clearing `customPinnedPoints`, closing popovers/popups, and wiping the `custom-pinned-source` GeoJSON layer cleanly.

---

## 2. Deliverables & Technical Changes

### A. Backend & Telemetry Hardening
- **`backend/app/adapters/aisstream_adapter.py`**:
  - Implemented continuous vessel caching with 96-vessel regional baseline plus live AISStream overlay in `get_ais_vessels()`.
  - Added explicit `current_coords: [lon, lat]` to all baseline and live vessel dictionary objects.
- **`backend/app/services/telemetry_service.py`**:
  - Ensured all maritime and aviation units populate `current_coords`, `location: {"type": "Point", "coordinates": p_curr}`, and `current_location`.
- **`backend/app/adapters/cpu_routing_adapter.py`**:
  - Added `SUMATRA_PORTS_GRAPH` and coastal perimeter navigation waypoints with water-constrained Dijkstra routing (`generate_nautical_coastal_route`, `calculate_sea_intermodal_corridor`).
  - Maritime paths guaranteed 100% water transit, preventing straight land-crossing lines.
- **`agents/nodes/route_optimization.py`**:
  - Generated modality-specific `legs` for every route recommendation.
  - Injected `calculate_sea_intermodal_corridor` for maritime/multimodal requests.
  - Guarded against 2-point land-cutting maritime legs by expanding them with `generate_nautical_coastal_route`.
- **`backend/tests/test_vehicles_telemetry.py`**:
  - Added `test_ais_vessel_continuity_and_overlay` and `test_intermodal_legs_and_coastal_maritime_routing` to assert continuity, schema integrity, and water-bound nautical paths.

### B. Frontend Router & Map Visualization
- **`frontend/lib/aiDynamicRouter.ts`**:
  - Added `SUMATRA_PORT_CHANNELS` covering Boom Baru (Musi River), Pekanbaru (Siak River), Jambi Talang Duku (Batanghari River), Belawan, Kuala Tanjung, Dumai, Krueng Geukueh, Teluk Bayur, Panjang, Bakauheni, and Sabang.
  - Added `buildNauticalPath()` with estuary fairway traversal, clockwise/counter-clockwise perimeter path selection, and deduplication.
  - Enhanced `buildIntermodalCorridors()` to output modality-colored `legs`.
- **`frontend/scripts/test_nautical_corridor.ts`**:
  - Created standalone validation test verifying Boom Baru $\to$ Belawan, Siak $\to$ Dumai, and Panjang $\to$ Bakauheni water-path guarantees.
- **`frontend/components/map/CrisisMap.tsx`**:
  - Rendered `legs` in Mapbox GeoJSON `route-paths-line` layer with distinct color coding (`#10B981` road, `#3B82F6` maritime, `#00F0FF` air).
  - Wired `useEffect` to clear `customPinnedPoints` and wipe `custom-pinned-source` immediately when origin/destination nodes are cleared.
  - Synced `hiddenRouteIndices` with parent and auto-cleared hidden states when all corridors are enabled.
- **`frontend/components/map/CrisisSimulatorBar.tsx`**:
  - Enhanced "Tampilkan Semua Rute" reset button to show effective hidden count (`hiddenRouteCount`), restoring all corridors and routes on click.
- **`frontend/components/dashboard/DashboardClient.tsx`**:
  - Managed `hiddenRouteIndices` state.
  - Hardened route recommendation merging to preserve client multi-leg intermodal routes (sea, air, hold) alongside backend road routes.
  - Updated `handleResetNodes` to clear all node states and reset hidden routes.
- **`frontend/components/map/FleetVehicleLayer.tsx` & `frontend/hooks/useFleetVehicles.ts`**:
  - Stabilized vessel polling and interpolation buffers to ensure no vessel dropouts during polling cycles.

---

## 3. Verification & Test Evidence

1. **TypeScript Typecheck**:
   - Command: `rtk npx tsc --noEmit` in `frontend/`
   - Result: `TypeScript: No errors found` (0 errors).

2. **Next.js Production Build**:
   - Command: `rtk npm run build` in `frontend/`
   - Result: Successful compilation of 7/7 static routes (`/`, `/_not-found`, `/api/proxy/[...path]`, `/dashboard`, `/demo-remote`).

3. **Backend Pytest Suite**:
   - Command: `backend/.venv/Scripts/pytest.exe backend/tests/test_vehicles_telemetry.py backend/tests/test_cpu_routing_weather.py -v`
   - Result: `19 passed, 8 warnings in 52.40s` (100% pass rate).
     - `test_ais_vessel_continuity_and_overlay`: PASSED
     - `test_intermodal_legs_and_coastal_maritime_routing`: PASSED
     - `test_fleet_telemetry_schema`: PASSED
     - `test_fleet_modality_filters`: PASSED
     - `test_cold_chain_threshold_evaluation`: PASSED
     - `test_offline_telemetry_fallback`: PASSED
     - `test_fleet_tenancy_filter_by_query`: PASSED
     - `test_fleet_tenancy_filter_by_dispatcher_jwt`: PASSED
     - `test_fleet_regulator_sees_corridor_wide`: PASSED
     - All 10 CPU routing & weather tests: PASSED

4. **Nautical Corridor Validation Script**:
   - Command: `npx tsx frontend/scripts/test_nautical_corridor.ts`
   - Result: `✅ ALL NAUTICAL ROUTING TESTS PASSED (100% WATER PATH GUARANTEE)!`
     - Verified Boom Baru Musi River channel exit waypoints (6 waypoints).
     - Verified Siak River to Dumai waypoints (9 waypoints).
     - Verified Panjang to Bakauheni waypoints (7 waypoints).

---

## 4. Deployment Readiness

- Clean Next.js 14 production bundle ready for Vercel auto-deployment (`pre-hub.vercel.app`).
- Backend Python 3.13 service ready for Render auto-deployment (`peta-nadi.onrender.com`).
