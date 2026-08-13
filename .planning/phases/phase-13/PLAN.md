# PLAN — Phase 13 Refine: Polyline Driving Hazard Guard, Reactive O/D Sync & Live Visual Demo Stepper

**Phase:** 13  
**Milestone:** M1 — Hackathon MVP (North Sumatra Corridor)  
**Status:** READY TO EXECUTE ⏳  
**Skills Ingested:** `mapbox-geospatial-operations`, `logistics-routing-vrp`, `nextjs-mapbox-deckgl`  
**Proposal Spec:** [Submission Tahap 2 (3) - compiled.md](file:///c:/Farras/DIGDAYA/peta-nadi/docs/Submission%20Tahap%202%20%283%29%20-%20compiled.md)  

---

## 1. Goal

Eliminate all routing glitches by testing actual Mapbox driving polyline points against hazard circles (guaranteeing zero cyan lines passing through disaster zones), syncing O-D node selection reactively across all sidebar states, providing dynamic map Start/End node selection, connecting interactive visual camera flyTo animations for `Run Demo`, and dynamically scaling hazard radius rings (5km, 15km, 30km).

---

## 2. The 5 Core Refactoring Pillars

### Pillar 1: Mapbox Driving Polyline Collision Guard (`aiDynamicRouter.ts`)
- Replace straight-line checking with **Mapbox Driving Polyline Inspection**:
  - Test all points of the Mapbox driving polyline against the hazard circle `(hazardCenter, radiusKm)`.
  - If any point falls inside `radiusKm`, flag the route as DISRUPTED.
  - Project ray-casting clearance waypoints outside the hazard radius ($R + 15\text{km}$).
  - Query Mapbox Directions API for candidate detours and verify candidate polylines have **ZERO points inside the hazard circle**.

### Pillar 2: Reactive O-D Node Selection & Polyline Sync (`DashboardClient.tsx`)
- In `handleNodeSelected(nodeId)`:
  - When user clicks a new destination (e.g. Tebing Tinggi), update `selectedOriginNode` / `selectedDestNode`.
  - Re-calculate routes for the new O-D pair and update BOTH `currentMapRoutes` AND `selectedCrisis.route_recommendations`.
  - Ensures the cyan polyline on the map instantly updates to connect the active Start -> End nodes!

### Pillar 3: Dynamic Map Start/End Selection UI (`CrisisSimulatorBar.tsx`)
- Implement a clear 2-step selection state:
  - Click 1 = Set Start (Origin 🟢).
  - Click 2 = Set End (Destination 🟡).
  - Display clear status indicator: `[🟢 START: Belawan] ➔ [🟡 END: Tebing Tinggi]`.

### Pillar 4: Live Map Camera & Visual Action for `Run Demo` (`GuidedDemoPanel.tsx` & `DashboardClient.tsx`)
- When `▶ Run Demo` is clicked:
  - Map flies (`flyTo`) to Belawan Port (`[98.67, 3.79]`).
  - Activates simulated flood disaster.
  - Computes & draws Mapbox dynamic detour polyline.
  - Auto-advances 5-stage AI Stepper with live agent swarm progress & WhatsApp alert toast.

### Pillar 5: Dynamic Hazard Radius Ring Scaling (5km, 15km, 30km) (`CrisisMap.tsx`)
- Connect `selectedRadius` state (5km, 15km, 30km) directly to `CrisisMap.tsx`.
- The GeoJSON circle ring on Mapbox scales dynamically (5km small, 15km medium, 30km large).
- Re-compute `calculateAIDynamicDetourRoutes` with the active radius so AI clearance buffers expand proportionally.

---

## 3. Verification Plan

### Automated Build Check
- Run Next.js production build check:
  ```powershell
  $env:PATH = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User"); npm run build --prefix frontend
  ```

### Manual Verification Checklist
1. **Polyline Hazard Guard**: Place hazard on Lubuk Pakam; verify cyan route NEVER cuts through the circle and curves 100% outside the hazard.
2. **Reactive O-D Sync**: Click Tebing Tinggi marker; verify cyan polyline immediately updates to end at Tebing Tinggi.
3. **Dynamic Node Selection**: Click Node A then Node B on the map; verify Start/End badges update.
4. **Live Run Demo**: Click `Run Demo`; verify map flies to Belawan, activates hazard, draws detour, and steps through 5 AI stages.
5. **Radius Scaling**: Toggle 5km / 15km / 30km; verify circle size on map and detour buffer change scale.
