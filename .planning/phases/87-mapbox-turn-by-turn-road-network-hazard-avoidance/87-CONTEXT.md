<!-- generated-by: gsd-plan-phase -->
# Phase 87: Mapbox Directions API Turn-by-Turn Road Network & Tangential Hazard Avoidance — Context

**Milestone:** M5 - High-Fidelity Intelligence & Isolated Operations Engine  
**Phase:** 85  
**Status:** PLANNING 📋  
**Domain:** Geospatial Routing, Mapbox Directions API, Road Network Snapping, Tangential Hazard Avoidance, Playwright E2E

---

## 1. Problem Statement

In the current frontend routing and map rendering pipeline (`frontend/lib/aiDynamicRouter.ts`, `frontend/lib/mapboxRoutingService.ts`, and `frontend/components/map/CrisisMap.tsx`):
1. **Linear Chord Interpolation on Road Routes (`CrisisMap.tsx`):**
   When routes have sparse waypoints ($\le 5$), `CrisisMap.tsx` passes them into `densifyPath()`, which interpolates great-circle spherical chords. On land routes, this produces straight lines cutting across urban buildings, residential areas, rivers, and mountains instead of respecting true road networks.
2. **Missing Mapbox Directions Parameters & Maneuvers:**
   Calls to Mapbox Directions API in `aiDynamicRouter.ts` and `mapboxRoutingService.ts` omit `steps=true` and do not consistently query `annotations=distance,duration,congestion`, losing turn-by-turn maneuver instructions and traffic telemetry included in the Mapbox Free Tier (100,000 requests/month).
3. **Suboptimal Hazard Avoidance Clearance:**
   The fallback avoidance mechanism in `aiDynamicRouter.ts` used an arbitrary clearance of $R + 6.0\text{ km}$. For urban hazards (e.g. radius $1.5\text{ km}$ to $3.0\text{ km}$), this sends avoidance waypoints $7.5\text{ km}$ to $9.0\text{ km}$ away into irrelevant corridors or dead-ends. A deterministic tangential normal vector engine with calibrated $R + 2.0\text{ km}$ clearance is required to skirt hazard perimeters tightly while snapping to real streets.
4. **Lack of Automated E2E Street-Snapping Benchmark:**
   There is no regression test verifying that real-world urban pairs (e.g., Manhattan Times Square Medan to Universitas Sumatera Utara campus) generate dense road geometry ($>50$ coordinates) snapping along Jl. Gatot Subroto, Jl. Sunggal, Jl. Setia Budi, and Jl. Dr. Mansyur, and that injecting an intermediate hazard diverts traffic tangentially with zero hazard zone penetration.

---

## 2. Target Architectural Invariants

1. **Zero Straight Chords on Land Routes:**
   - In `CrisisMap.tsx`, `densifyPath` is strictly forbidden for land routes (`legMode === 'land'`, `corridorClass === 'land'`, or `modality === 'truck'`).
   - Land routes must render true GeoJSON LineString coordinates directly from Mapbox Directions without linear chord distortion.
   - Great-circle densification is reserved exclusively for maritime nautical corridors and high-altitude air cargo arcs.
2. **Strict Mapbox Directions Free Tier Contract:**
   - Full parameter specification: `profile='driving'` (or `'driving-traffic'`), `geometries='geojson'`, `overview='full'`, `steps=true`, `annotations='distance,duration,congestion'`.
   - Client-side memoization cache keyed by `origin:dest:waypoints:excludeToll` to safeguard the 100k requests/month free tier quota.
3. **Deterministic Tangential Avoidance Waypoint Engine:**
   - Vector math: For hazard center $H(x_h, y_h)$ and corridor vector $OD = D - O$, compute unit normal orthogonal vectors $N_1 = (-dY, dX) / \|OD\|$ and $N_2 = (dY, -dX) / \|OD\|$.
   - Clearance distance: $d_{\text{clearance}} = R_{\text{hazard}} + 2.0\text{ km}$.
   - Bilateral candidate evaluation: Probe both $+90^\circ$ and $-90^\circ$ (and secondary $\pm 45^\circ$) tangential candidate waypoints.
   - Verification gate: Assert `calculateHazardExposureMetrics(route.coordinates, hazardCenter, radiusKm).exposureKm === 0`. Choose the candidate with minimal travel duration and distance.
4. **Empirical Benchmark Corridor (Manhattan Medan -> USU):**
   - Origin: Manhattan Times Square Medan `[98.6253, 3.5855]`
   - Destination: Universitas Sumatera Utara (USU) `[98.6570, 3.5650]`
   - Verified road path snaps along Jl. Gatot Subroto $\rightarrow$ Jl. Sunggal $\rightarrow$ Jl. Setia Budi $\rightarrow$ Jl. Dr. Mansyur into USU campus.
   - Minimum coordinate density: $>50$ coordinates along real streets.
   - Tangential detour under simulated hazard (Simpang Sunggal, radius $1.5\text{ km}$) yields 0 intersection.

---

## 3. Scope Lock

### Files Permitted to Modify
* `frontend/lib/aiDynamicRouter.ts` (Mapbox parameters, tangential avoidance math, client quota caching)
* `frontend/lib/mapboxRoutingService.ts` (standardize directions request parameters, expose turn-by-turn steps)
* `frontend/components/map/CrisisMap.tsx` (eliminate `densifyPath` on land routes, enforce pure GeoJSON coordinates)
* `frontend/e2e/mapbox-turn-by-turn.spec.ts` (Playwright E2E benchmark test suite)
* `frontend/scripts/test_turn_by_turn.ts` (fast headless Node runner for router math & API validation)

### Files Strictly Locked (DO NOT TOUCH)
* `backend/app/adapters/cpu_routing_adapter.py` (deterministic CPU routing invariant)
* `backend/app/services/weather_fusion_service.py` (BMKG fusion invariant)
* `agents/tools/consensus_gate.py` (consensus gate hardened in Phase 84)
* `frontend/components/dashboard/EvaluationSection.tsx` (empirical N=60 benchmark integrity)
