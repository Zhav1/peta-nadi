# Phase 97 — Learnings: Turn-by-Turn Snapping, Offline Fleet Precomputation & Dual-Layer Hazard Avoidance

**Milestone:** M6  
**Status:** COMPLETE ✅  
**Date:** 2026-10-23  

---

## 1. Key Insights & Critical Discoveries

1. **The Danger Buffer Paradox in Spatial Detour Evaluation:**
   - In earlier iterations, `calculateHazardExposureMetrics` applied a hardcoded `dangerBufferKm = 2.0` (2,000 meters) to all hazard types.
   - For a point obstacle of 200m radius, the effective danger circle inflated to $2.2\text{ km}$. Consequently, even when Mapbox routed down a parallel boulevard 1.0 km away from the rockfall, the evaluation logic flagged it as intersecting ($1.0 \le 2.2$) and rejected a perfectly safe detour as `COMPROMISED`.
   - **Rule:** Hazard evaluation buffers must be scaled to the obstacle geometry. For point obstacles ($< 500\text{ m}$), an evaluation buffer of $0.05\text{ km}$ (50m) prevents false intersection alarms. For wide polygons ($\ge 500\text{ m}$), $0.1\text{ km}$ provides sufficient margin without overlapping the tangential waypoint itself.

2. **Epicenter Exclusion in Tangential Waypoint Routing:**
   - Placing a tangential waypoint at $R + 2.0\text{ km}$ instructs Mapbox to pass through that coordinate between origin and destination. However, if the road from origin to the waypoint happens to pass through the hazard epicenter, Mapbox might take it unless specifically forbidden.
   - **Rule:** When calculating tangential detours around disaster polygons, always pass `excludePoints: [hazardCenter]` alongside the forced waypoint. This mathematically prevents the initial trajectory from cutting through the disaster area before reaching the tangential egress node.

3. **Multi-Leg Maneuver Extraction in Directions API:**
   - Mapbox Directions API splits steps and annotations across `route.legs`. A route with 1 forced waypoint contains 2 legs.
   - Accessing only `route.legs[0].steps` truncates all turn maneuvers for the second half of the trip (from the waypoint to destination).
   - **Rule:** Always aggregate steps and annotations across all legs with `route.legs?.flatMap((l) => l.steps || [])`.

4. **Zero-Quota Fleet Strategy in Production Dashboards:**
   - Calling Directions API live from client React components for 24–480 fleet vehicles exhausts a 100,000 request Free Tier quota in 200–4,000 page views.
   - Precomputing the static corridor geometries offline into JSON files completely eliminates runtime API consumption, achieves 0 ms rendering latency, and guarantees exact road-snapped trajectories.
