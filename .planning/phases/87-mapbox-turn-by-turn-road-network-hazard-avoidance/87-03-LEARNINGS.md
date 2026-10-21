# Phase 87: Learnings & Operational Insights

**Milestone:** M5 - High-Fidelity Intelligence & Isolated Operations Engine  
**Phase:** 85  
**Topic:** Street Snapping, Direction Maneuvers, Quota Protection & Tangential Avoidance  

---

## 1. Geometric Disconnect Between Great-Circle Arcs and Urban Road Networks

* **The Problem:** `densifyPath` was originally introduced to smooth long nautical corridors (e.g. Belawan $\rightarrow$ Batam) and air routes by interpolating great-circle chords every 15–25 km. When applied to land routes with sparse waypoints ($\le 5$ vertices), it drew straight chords directly across city blocks, building footprints, and rivers.
* **The Solution:** Land routes must always preserve pure GeoJSON LineStrings supplied by Mapbox Directions. `densifyPath` must be strictly restricted to `legMode !== 'land'` and `routeCorridorClass !== 'land'`.

---

## 2. Tangential Clearance Sizing ($R + 2.0\text{ km}$ vs. Legacy $+6.0\text{ km}$)

* **The Problem:** In earlier iterations, the radial avoidance logic added a massive $+6.0\text{ km}$ buffer to the hazard radius. For urban flash floods (radius $1.0 - 2.0\text{ km}$), a $7 - 8\text{ km}$ radial displacement forced Mapbox to route through distant outer ring roads or return `NoRoute`.
* **The Solution:** A tight $R + 2.0\text{ km}$ normal vector clearance places the avoidance waypoint just outside the hazard perimeter on parallel arterial streets, resulting in clean urban detours with $0\text{ km}$ exposure while keeping route length increases reasonable ($\approx 10-18\%$).

---

## 3. Quota Management for Free Tier Mapbox

* **The Problem:** Mapbox Free Tier caps directions requests at 100,000 per month. On dynamic Next.js dashboards, React state transitions and tab toggling between "Overview", "Mitigasi", and "Analitik" can repeatedly trigger route recalculations for the same origin/destination pairs.
* **The Solution:** An in-memory LRU/Map memoization cache (`directionsCache`) with a 15-minute TTL keyed by `${profile}:${coordString}:${params}:${excludeToll}` prevents duplicate network roundtrips completely during active dispatcher sessions.

---

## 4. Manhattan Medan $\rightarrow$ USU Benchmark Metric

* **Ground-Truth Snapping:**
  - Origin: Manhattan Times Square Medan `[98.6253, 3.5855]`
  - Destination: Universitas Sumatera Utara `[98.6570, 3.5650]`
  - Distance: $8.4\text{ km}$, 19 mins
  - Coordinate density: 227 coordinate vertices following Jl. Jenderal Gatot Subroto and Jl. Iskandar Muda, complete with maneuver step instructions.
