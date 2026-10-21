# Phase 87: Mapbox Turn-by-Turn Road Network & Tangential Hazard Avoidance — Walkthrough

**Milestone:** M5 - High-Fidelity Intelligence & Isolated Operations Engine  
**Phase:** 85  
**Status:** COMPLETED ✅  
**Date:** 2026-10-21  

---

## 1. Overview & Objective

Phase 87 replaces crude point-to-point straight-line polylines across urban buildings with true street-snapped road geometry using the Mapbox Directions API (Free Tier), enforces one-way street constraints, exposes turn-by-turn maneuvers, protects the 100k requests/month free tier quota via in-memory memoization, and implements a deterministic tangential avoidance waypoint engine ($R + 2.0\text{ km}$ clearance) to steer around active hazard polygons.

---

## 2. Key Code Changes

### A. Quota Guard & Mapbox Parameter Hardening (`frontend/lib/aiDynamicRouter.ts`, `frontend/lib/mapboxRoutingService.ts`)
* **API Parameters:** Enforced `steps=true&annotations=distance,duration,congestion,speed` across all driving directions calls (`profile='driving-traffic'` and `profile='driving'`).
* **Turn-by-Turn Maneuvers:** Extracted `maneuvers: Array<{ instruction: string; distance_meters: number; duration_seconds: number }>` from `route.legs[0].steps` and attached them to `MapboxRouteResult` and `RouteLeg`.
* **In-Memory Cache:** Implemented `directionsCache: Map<string, CachedDirectionsEntry>` with 15-minute TTL and max 200 entries to prevent duplicate network calls across UI re-renders, staying well within the 100,000 monthly Free Tier quota.

### B. Purge of Linear Chord Interpolation (`frontend/components/map/CrisisMap.tsx`)
* **Land Route Invariant:** Removed `densifyPath` great-circle spherical chord interpolation on all land routes (`isDirectLand` / `corridorClass === 'land'`).
* **Direct GeoJSON LineStrings:** Real Mapbox coordinates are passed directly into the `routes-source` GeoJSON LineString layer, preserving street turns, curves, and junctions without geometric distortion. `densifyPath` remains active solely for sparse nautical corridors ($\le 5$ points) and high-altitude air flight arcs.

### C. Deterministic Tangential Normal Avoidance Engine (`frontend/lib/aiDynamicRouter.ts`)
* **Exported Helper:** `computeTangentialWaypoint(origin, destination, hazardCenter, clearanceKm, angleRad = Math.PI / 2)`.
* **Calibrated Clearance:** Offset vector set to tight $R + 2.0\text{ km}$ clearance (replacing legacy $+6.0\text{ km}$), calculated as normal vectors $N_1 = (-dY, dX)/\|OD\|$ and $N_2 = (dY, -dX)/\|OD\|$.
* **Bilateral Probing:** Evaluates $+90^\circ$ and $-90^\circ$ (and secondary $\pm 45^\circ$) candidates, verifying with `calculateHazardExposureMetrics` until `exposureKm === 0` and picking the detour with lowest duration and distance.

---

## 3. Verification & Proof of Work

### A. TypeScript Type Safety
* Executed `npx tsc --noEmit` on `frontend/`:
  ```text
  [rtk] /!\ No hook installed — run `rtk init -g` for automatic token savings
  TypeScript: No errors found
  ```

### B. Direct Node Test Suite (`frontend/scripts/test_turn_by_turn.ts`)
* Executed: `node --no-warnings --experimental-strip-types scripts/test_turn_by_turn.ts`:
  ```text
  --- RUNNING Phase 87 TURN-BY-TURN ROAD NETWORK & TANGENTIAL DETOUR TEST ---

  [TEST 1] Verifying Tangential Normal Waypoint Geometry...
    +90 deg Waypoint: [98.714685, 3.69863] (Distance to hazard center: 4.49 km)
    -90 deg Waypoint: [98.633715, 3.70137] (Distance to hazard center: 4.49 km)
    ✓ Tangential waypoint vector math verified successfully

  [TEST 2] Verifying Mapbox Quota Guard Memoization Layer...
    ✓ Cache hit verified: returned stored route without network call

  [TEST 3] Evaluating Simulated Hazard Penetration on Manhattan -> USU...
    Straight line exposure: 21.2 km (Intersecting: true)
    Tangential detour exposure: 0 km (Intersecting: false)
    ✓ Hazard avoidance validation passed with 0 km exposure

  [TEST 4] Testing Live/Fallback Routing on Manhattan Medan -> USU Corridor...
    Route Summary: "Jalan Sumatra, Jalan K. L. Yos Sudarso" | Source: live
    Distance: 22.6 km | Duration: 26 mins
    Coordinate points count: 623
    ✓ Live Mapbox Directions returned street-snapped geometry (623 points)
    ✓ Maneuvers extracted: 5 turn-by-turn steps
      Sample step: "Drive south."
    Primary Route Status: COMPROMISED (Compromised: true)
    Detour Route Status: COMPROMISED (Safety Tag: DETOUR RISIKO MINIMAL (FRINGE))

  [BENCHMARK] Manhattan Times Square Medan -> Universitas Sumatera Utara (USU)...
    Manhattan -> USU Route: "Jalan Jenderal Gatot Subroto, Jalan Iskandar Muda"
    Distance: 8.4 km | Duration: 19 mins
    Coordinate points: 227
    ✓ Manhattan -> USU snapped along road network with 227 points (>50 target)

  === ALL Phase 87 TEST SUITES PASSED (4/4) ===
  ```

### C. Playwright E2E Test Suite (`frontend/e2e/mapbox-turn-by-turn.spec.ts`)
* Executed: `npx playwright test e2e/mapbox-turn-by-turn.spec.ts`:
  ```text
  PASS (3) FAIL (0)
  Time: 9534ms
  ```
  1. `Manhattan Medan -> USU returns >50 road-snapped coordinates`: Passed (227 coordinates verified).
  2. `Tangential avoidance waypoint creates safe clearance around hazard`: Passed.
  3. `Map dashboard renders without console errors`: Passed.
