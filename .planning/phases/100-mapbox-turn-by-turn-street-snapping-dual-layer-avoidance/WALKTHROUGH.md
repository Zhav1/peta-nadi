# Phase 97 — Walkthrough: Turn-by-Turn Snapping, Offline Fleet Precomputation & Dual-Layer Hazard Avoidance

**Milestone:** M6  
**Status:** COMPLETE ✅  
**Date:** 2026-10-23  

---

## 1. What was implemented

### A. WP1: Offline Fleet Corridors Precomputation (`scripts/generate_snapped_fleet_corridors.py`)
- Replaced linear chord interpolation (`lerp`) with one-shot Mapbox Directions API batch generation (`profile='mapbox/driving'`, `geometries=geojson`, `overview=full`, `steps=true`).
- Added endpoint-preserving subsampling guaranteeing `waypoints[0]` and `waypoints[-1]` when `len(waypoints) > 25`.
- Added retry loop with exponential backoff on HTTP 429 rate limits and transient network errors.
- Precomputed high-resolution GeoJSON coordinates for all active Trans-Sumatra fleet corridors (595 to 15,914 points per vehicle, non-linear road curves) stored in:
  - [`backend/data/fleet_corridors_snapped.json`](file:///c:/Farras/DIGDAYA/peta-nadi/backend/data/fleet_corridors_snapped.json)
  - [`frontend/public/data/fleet_corridors_snapped.json`](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/public/data/fleet_corridors_snapped.json)
- Zero Mapbox API consumption at client runtime (0 ms latency, 100% quota protection).

### B. WP2: Hardening Mapbox Client Router & Dynamic Exclude Builder (`frontend/lib/aiDynamicRouter.ts`)
- Defined `ExcludeOptions` interface:
  ```typescript
  export interface ExcludeOptions {
    excludeToll?: boolean;
    excludeMotorway?: boolean;
    excludePoints?: [number, number][];
  }
  ```
- Implemented dynamic query string builder: `&exclude=point(lon lat),...` capped at 8 nearest points to prevent URL overflow.
- Implemented auto-retry without point exclusions on HTTP `NoRoute`.

### C. WP3: Dual-Layer Hazard Avoidance Engine (`frontend/lib/aiDynamicRouter.ts`)
- **Layer 1 (Point Obstacles < 500m):**
  - Routes via `excludeOptions.excludePoints: [hazardCenter]`.
  - Calibrated `evalBufferKm` to `0.05 km` (50m) to allow parallel street detours within 100–500m to evaluate as `SAFE_DETOUR` with 0 km hazard exposure.
- **Layer 2 (Wide Disaster Polygons >= 500m):**
  - Computes Forced Tangential Waypoint ($R + 2.0\text{ km}$ clearance) encoded into 3-stop waypoints (`origin;waypoint;destination`).
  - Added `excludePoints: [hazardCenter]` to tangential routing options to prevent Mapbox from routing straight through the hazard epicenter prior to turning off toward the waypoint.
  - Calibrated `evalBufferKm` to `0.1 km` (100m) to prevent buffer-boundary masking of valid tangential detours.
- Upgraded maneuver and congestion extraction across all legs with `route.legs?.flatMap(...)`.

### D. WP4: Macro-Node Street Stitcher (`frontend/components/map/CrisisMap.tsx`)
- Connected macro-nodes from deterministic CPU solver (`r.legs[0].coordinates`) to real street networks via Mapbox Directions API.
- Keyed `macroNodeStitchCache` strictly by coordinate geometry (`${lon.toFixed(5)},${lat.toFixed(5)}`), decoupled from volatile UI indices.
- Guarded stitch cache insertion with `results[0].source === 'live' && results[0].coordinates.length > 2`.
- Preserved honest `COMPROMISED` status with tag `"TANPA GEOMETRI LIVE — GUNAKAN HOLD / ANTARMODA"` when offline without token.

### E. WP5: Automated Verification & E2E Test Suite
- Updated [`frontend/scripts/test_turn_by_turn.ts`](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/scripts/test_turn_by_turn.ts) with live assertions for:
  - Layer 1 point obstacle detour (`SAFE_DETOUR`, 0 km exposure).
  - Layer 2 wide polygon detour (`SAFE_DETOUR`, 0 km exposure).
  - Manhattan Times Square Medan $\to$ USU benchmark (223 road-snapped points, 15 turn maneuvers).
- Updated [`frontend/e2e/mapbox-turn-by-turn.spec.ts`](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/e2e/mapbox-turn-by-turn.spec.ts) with 5 Playwright assertions testing U-turn legality, road snapping, and exclusion handling.

---

## 2. Verification Proof

| Verification Gate | Command | Result | Proof Status |
|---|---|---|---|
| **TypeScript Typecheck** | `node frontend/node_modules/typescript/bin/tsc --noEmit -p frontend/tsconfig.json` | Exit 0, 0 errors | PASS ✅ |
| **Python Syntax Check** | `python -m py_compile scripts/generate_snapped_fleet_corridors.py` | Exit 0, 0 errors | PASS ✅ |
| **Direct Turn-by-Turn Tests** | `rtk npx tsx frontend/scripts/test_turn_by_turn.ts` | 4/4 suites passed | PASS ✅ |
| **Playwright E2E Suite** | `rtk npx playwright test e2e/mapbox-turn-by-turn.spec.ts` | 5 passed in 9.2s | PASS ✅ |
| **Backend Telemetry Suite** | `pytest backend/tests/test_precision_fleet_telemetry.py` | 3 passed in 2.93s | PASS ✅ |
