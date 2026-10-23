---
phase: 101
phase_name: 3D Globe Native Mapbox Fleet, Anti-Flicker & Impeccable Minimalist Visual Cleanup
milestone: M6
milestone_name: 3D Globe Native Mapbox Fleet, Street-Snapping & Impeccable Cartography
created_at: "2026-10-23T23:45:00.000Z"
status: planned
framework: GSD
---

# Phase 101: 3D Globe Native Mapbox Fleet, Anti-Flicker & Impeccable Minimalist Visual Cleanup

## Context & Objectives
In previous sessions:
1. **Phase 100** implemented Mapbox Directions API street-snapping with offline precomputed corridors for all 24 trucks and dual-layer hazard avoidance.
2. An interim test in Phase 98 flattened the map to Web Mercator to anchor Deck.gl. However, this destroyed the flagship **3D Globe Projection ("4D")** of PreHub.
3. Furthermore, the telemetry layer exhibited visual blinking/flickering (*kedap-kedip*) caused by Deck.gl layer recreation and GPU buffer rebuilding during polling cycles.
4. The tactical map was cluttered by ambient orange lines across Sumatra, persistent pulsing concentric rings, and heavy overlapping text badges ("AI slop").

**Objectives for Phase 101:**
1. **Restore 3D Globe Projection ("4D")**: Re-enable Mapbox GL JS v3 `projection: { name: 'globe' }` with space atmosphere.
2. **Eliminate Floating Layers via Native Mapbox Migration**: Replace Deck.gl `MapboxOverlay` in `FleetVehicleLayer.tsx` with Native Mapbox GL JS v3 WebGL GeoJSON layers (`map.addSource` + `map.addLayer`). Native Mapbox layers wrap onto the 3D globe mesh directly in GPU shaders, guaranteeing 100% surface adherence at all zooms, pitches (0°–85°), and bearings (0°–360°).
3. **Eliminate Flickering (Kedap-Kedip)**: Use `source.setData()` for in-place GPU vertex buffer updates in the animation loop without tearing down WebGL layers.
4. **Impeccable Minimalist Visual Distillation (Operate Mode)**:
   - Hide ambient orange routes across Sumatra by default (`hideEstimatedRoutes = true`). Routes only appear on vehicle selection or active reroute.
   - Remove constant pulsing concentric rings on normal units (reserve emergency auras strictly for impacted/rerouting vehicles).
   - Remove bulky permanent floating text boxes in favor of subtle hover micro-tooltips and the on-click Target Lock inspector.
   - Render crisp, high-contrast tactical dots: Emerald (`#10b981`) for trucks, Royal Blue (`#06b6d4`) for vessels, Violet (`#a855f7`) for air cargo.

---

## Work Packages

### WP1: 3D Globe Projection Restoration
- In `frontend/components/map/CrisisMap.tsx:634`, restore `projection: { name: 'globe' }`.
- In `frontend/components/dashboard/AnalyticsSection.tsx:83`, ensure `projection: { name: 'globe' }`.
- Verify Mapbox fog/atmosphere settings:
  ```typescript
  map.setFog({
    color: 'rgb(8, 10, 15)',
    'high-color': 'rgb(12, 16, 24)',
    'space-color': 'rgb(4, 6, 8)',
    'horizon-blend': 0.05,
  });
  ```
- **Proof of Work**: `map.getProjection().name === 'globe'`.

### WP2: Native Mapbox WebGL Fleet Migration
- Refactor `frontend/components/map/FleetVehicleLayer.tsx`:
  - Decommission `@deck.gl/mapbox` `MapboxOverlay` and Deck.gl layers (`PathLayer`, `ScatterplotLayer`, `IconLayer`, `TextLayer`).
  - Register native Mapbox GeoJSON source `fleet-vehicles-source` with initial FeatureCollection.
  - Add native WebGL layers:
    - `fleet-vehicle-dots`: Native `circle` layer with data-driven color:
      - Trucks: `#10b981` (Emerald)
      - Maritime: `#06b6d4` (Cyan)
      - Air: `#a855f7` (Violet)
      - Selected: `#00f0ff` (Cyan Neon)
      - Radius: Zoom-interpolated 4px to 8px with `#0c0e12` 1.5px stroke.
    - `fleet-vehicle-selected-halo`: Subtle glowing pulse ring visible ONLY for selected vehicle or emergency-impacted units.
    - `fleet-vehicle-selected-route`: High-contrast route line displayed ONLY for the selected vehicle.
  - Bind native Mapbox mouse interaction handlers:
    - `map.on('mouseenter', 'fleet-vehicle-dots')`: Cursor pointer + show lightweight micro-tooltip.
    - `map.on('mouseleave', 'fleet-vehicle-dots')`: Cursor reset + hide tooltip.
    - `map.on('click', 'fleet-vehicle-dots')`: Trigger `onSelectVehicle` and snap `TargetLockReticle`.
- **Proof of Work**: Fleet renders cleanly with zero Deck.gl dependencies; zero floating or parallax shift on the 3D globe.

### WP3: Zero-Flicker In-Place Buffer Updates
- Retain the 60 FPS kinematic interpolation loop (advancing vehicles along their precomputed high-density road waypoints from `fleet_corridors_snapped.json`).
- Update positions by converting the interpolated state into a GeoJSON FeatureCollection and calling `(map.getSource('fleet-vehicles-source') as mapboxgl.GeoJSONSource).setData(geojson)`.
- Eliminate layer reconstruction, React re-render triggering on position change, and buffer tear-downs.
- **Proof of Work**: Continuous, tear-free 60 FPS movement without frame blinking or disappearing dots.

### WP4: Impeccable Minimalist Visual Distillation
- Default `hideEstimatedRoutes = true` in `CrisisMap.tsx` and `DashboardClient.tsx`.
- Ambient orange corridor lines are eradicated from the default view.
- Remove redundant pulsing rings on all standard units; reserve amber aura strictly for `status === 'rerouting'` or `impacted === true`.
- Remove permanent text callouts (`[GPS LIVE]`, `[AIS PROYEKSI]`); show clean details in an on-demand glassmorphic micro-tooltip on hover.
- Align with `design-system/MASTER.md` and `/impeccable` operate mode principles.
- **Proof of Work**: Clean tactical map aesthetic free of visual slop.

### WP5: Automated Verification & E2E Validation
- Update `frontend/e2e/mapbox-turn-by-turn.spec.ts`:
  - Assert `map.getProjection().name === 'globe'`.
  - Assert `map.getLayer('fleet-vehicle-dots')` is loaded.
  - Assert fleet vehicle coordinates are grounded on the globe surface across tilt (`pitch: 45`) and rotation (`bearing: 45`).
- Execute TypeScript check: `rtk npx tsc -p frontend/tsconfig.json --noEmit` (0 errors).
- Execute Playwright test suite.
- **Proof of Work**: 100% test pass with 0 errors.

---

## Scope Lock
- **Files to Modify:**
  - `frontend/components/map/CrisisMap.tsx`
  - `frontend/components/map/FleetVehicleLayer.tsx`
  - `frontend/components/dashboard/DashboardClient.tsx`
  - `frontend/components/dashboard/AnalyticsSection.tsx`
  - `frontend/e2e/mapbox-turn-by-turn.spec.ts`
  - `.planning/ROADMAP.md`
  - `.planning/STATE.md`
- **Protected Files (Do Not Touch):**
  - `backend/app/adapters/cpu_routing_adapter.py` (Deterministic CPU solver invariant)
  - `agents/*` (Teammate's committed agent logic)
  - `backend/app/services/*` (Teammate's ingestion resilience)
