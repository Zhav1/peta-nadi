# Walkthrough — Phase 14: Pure Agentic Hazard Avoidance Router & Clean-Slate Node Selection

**Phase:** 14  
**Status:** COMPLETE ✅  
**Shipped:** 2026-07-22  
**Ingested Skills:** `logistics-routing-vrp`, `mapbox-geospatial-operations`, `mapbox-google-maps-migration`, `nextjs-mapbox-deckgl`  
**Benchmark Reference:** [BENCHMARK_ANALYSIS.md](file:///c:/Farras/DIGDAYA/peta-nadi/.planning/research/BENCHMARK_ANALYSIS.md)  
**Proposal Spec:** [Submission Tahap 2 (3) - compiled.md](file:///c:/Farras/DIGDAYA/peta-nadi/docs/Submission%20Tahap%202%20%283%29%20-%20compiled.md)

---

## Summary of What Was Built

Phase 14 implemented the **Pure Agentic Hazard Avoidance Router** — a multi-iteration system to dynamically compute safe detour routes around crisis zones for any origin/destination pair on the North Sumatra logistics corridor.

---

## Implementation History & Iterations

### Iteration 1: Initial Tangential Vector Engine (Phase 14 baseline)
- Removed 100% of hardcoded lat/lon detour coordinates (Saribudolok mountain phantom routes).
- Implemented perpendicular vector math to project `W_left` and `W_right` bypass waypoints just 2 km outside the hazard radius.
- Queried Mapbox Directions API for both candidates and selected the cleanest route.
- **Limitation discovered (Phase 15 investigation):** Mapbox treated waypoints as optional "hints" — it could ignore them and return the direct compromised route anyway.

### Iteration 2: Forced Waypoint Engine (Phase 15 continuation)
- Root cause identified: `fetchMapboxAlternativeDrivingRoutes(origin, dest, [waypoint])` passes waypoints as hints, not mandatory stops.
- **Fix:** Added `fetchMapboxRouteWithForcedWaypoint(origin, dest, forcedWaypoint, token)` which encodes 3 explicit coordinate stops in the Mapbox URL: `origin;mandatory_waypoint;destination`. Mapbox **must** route through all three — the waypoint is a required intermediate stop, not a hint.
- **Limitation discovered:** Mathematical perpendicular offsets produced coordinates in fields/water, not on real roads. Mapbox snapped to nearest road but the result was an excessively wide arc.

### Iteration 3: Real Road Database + Detour Cost Scoring (Final)
- **Root cause:** `clearanceKm = radius + 3.0 km` produced 18 km offsets for a 15 km radius hazard — wider than the city of Medan itself.
- **Fix A — Real road node database:** Replaced all mathematical offsets with 18 verified real arterial road intersection nodes sourced from OSM/Google Maps road centerlines:
  - Jl. Adam Malik (N & central), Jl. Gagak Hitam / Helvetia Ring Road, Jl. TB Simatupang, Jl. Gatot Subroto, Gerbang Tol Amplas, Jl. AR. Hakim, Jl. Letda Sujono, Jl. Williem Iskandar, and Trans-Sumatra corridor nodes.
- **Fix B — Detour cost minimization:** Nodes scored by `dist(origin→node) + dist(node→destination)`. Cheapest detour selected first — no unnecessarily wide arcs.
- **Fix C — Safety buffer reduction:** From `radius + 3.0 km` → `radius + 1.5 km`. Enough clearance without overcorrection.

### Iteration 4: Segment-Aware Hazard Detection (Critical fix)
- **Root cause identified by user:** Hazard radius displayed in UI (e.g. 5 km) did not match what the engine actually detected. Routes passing 5.5 km from a 5 km hazard center were marked clean — so the bypass engine never triggered even though the route visually passed through the orange zone.
- **Two-layer fix implemented in `isPolylineIntersectingHazardCircle`:**
  1. **Danger buffer:** `effectiveRadius = radiusKm + 2.0 km` — routes grazing the visual edge are also flagged.
  2. **Segment closest-point projection:** For each consecutive pair of polyline vertices, compute the point on the segment closest to the hazard center (vector projection). If that closest point is within `effectiveRadius`, the route is compromised. This handles sparse Mapbox polylines that "skip over" a hazard zone between vertices without any vertex landing inside the circle.

---

## Files Modified

| File | Change |
|------|--------|
| [`frontend/lib/aiDynamicRouter.ts`](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/lib/aiDynamicRouter.ts) | Complete rewrite: forced waypoint engine, real road database, detour cost scoring, segment-aware intersection detection with danger buffer |
| [`frontend/components/dashboard/DashboardClient.tsx`](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/components/dashboard/DashboardClient.tsx) | Clean slate node selection, reactive route refresh on hazard/radius change |
| [`frontend/components/map/CrisisSimulatorBar.tsx`](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/components/map/CrisisSimulatorBar.tsx) | Google Maps-style modality bar, radius selector, reset button |
| [`frontend/lib/types.ts`](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/lib/types.ts) | Added `rail` mode to `RouteLeg`, `'best'` to `TransportModality` |

---

## Verification Results

```
✓ Next.js 14.2.35 Compiled successfully
✓ Linting and type checking: PASS (warnings only, no errors)
✓ Generating static pages (6/6)
✓ Finalizing page optimization
```

### Functional Verification
- **Forced waypoint bypass:** Engine sends mandatory 3-stop route to Mapbox → actual road network detour created, not phantom math offset.
- **Real road snapping:** Bypass waypoints are real OSM intersection nodes — Mapbox snaps within meters, not kilometers.
- **Segment-aware detection:** Routes with sparse vertices that "skip over" hazard circles are correctly flagged COMPROMISED.
- **Radius parity:** Visual circle radius + 2 km buffer = engine detection threshold. What user sees matches what engine detects.
- **Clean slate:** Page loads with zero routes; user picks origin → destination → hazard interactively.
- **Reset button:** `🔄 RESET` clears both nodes and returns to clean unset state.
