# Phase 98: Mapbox Mercator Projection Synchronization & Floating Deck.gl Layer Anchoring — Walkthrough

**Milestone:** M6 — Turn-by-Turn Road Snapping, Offline Fleet Precomputation & Dual-Layer Hazard Avoidance  
**Phase:** 98  
**Status:** COMPLETED ✅  
**Date:** 2026-10-23  

---

## 1. Problem Diagnosis & Mathematical Root Cause

### Anomaly Summary
In previous builds, when viewing the map canvas:
- Zooming out caused fleet vehicle dots, pulsing rings, and route polylines to float hundreds of kilometers off the ground in high-altitude outer space above Cambodia/Vietnam.
- Pitching the view (`pitch: 35`) or rotating compass bearing caused the Deck.gl overlay to remain rigidly frozen while the underlying Mapbox 3D globe rotated independently.
- Zooming in to the Trans-Sumatra corridor (zoom 6–12) caused parallax drift where fleet dots slipped away from road centerlines during panning.
- The `TargetLockReticle` HUD targeted the ground coordinates while the vehicle icon hovered detached hundreds of pixels away.

### Mathematical Root Cause
1. `CrisisMap.tsx` initialized Mapbox GL JS v3 with `projection: { name: 'globe' }`.
2. `@deck.gl/mapbox` automatically detected the globe projection and instantiated Deck.gl's `GlobeView` with `GlobeViewport`.
3. Deck.gl's `GlobeViewport` mathematically ignores camera `pitch` and `bearing` (evaluating strictly as top-down flat sphere projection with `pitch = 0°`). The 35° camera pitch difference projected equatorial Sumatra features (~0.5° N) onto Indochina (~12°–15° N) in screen space.
4. At zoom $\ge 6.0$, Mapbox GL JS v3 transitions internally to planar Web Mercator (`mercatorFromTransition`), but `map.getProjection()` still reports `{ name: 'globe' }`. Deck.gl was misled into maintaining spherical formulas up to zoom 12.0, causing parallax slipping.

---

## 2. Key Code Changes

### A. Projection Cutover to Web Mercator (`frontend/components/map/CrisisMap.tsx`)
- Changed `projection: { name: 'globe' }` to `projection: { name: 'mercator' }` on map instantiation (line 634).
- Exposed both `(window as any)._mapboxMap` and `(window as any).mapboxMap` aliases during initial creation and on the `map.on('load')` event for clean observability in developer tools and automated E2E test suites.
- By configuring Web Mercator (EPSG:3857), `@deck.gl/mapbox` instantiates `MapView` (`WebMercatorViewport`), which calculates camera projection matrices identical $1:1$ with Mapbox GL JS v3's internal `Transform.calcMatrices()`.

### B. Defensive Guard on Secondary Map (`frontend/components/dashboard/AnalyticsSection.tsx`)
- Added defensive `projection: { name: 'mercator' }` to the Mapbox map instance in `AnalyticsSection.tsx` (line 88) to prevent any mixed-projection desynchronization if analytics overlays are viewed simultaneously.

### C. Automated Projection & Layer Anchoring E2E Test (`frontend/e2e/mapbox-turn-by-turn.spec.ts`)
- Added 2 automated E2E tests verifying Deck.gl & Mapbox matrix synchronization:
  1. `Phase 98: Mapbox Mercator projection synchronization and layer anchoring`:
     - Verifies `map.getProjection().name === 'mercator'`.
     - Awaits `map.loaded()` and React lifecycle to mount `FleetVehicleLayer`'s `MapboxOverlay`.
     - Pitch tilt simulation (`map.setPitch(45)`): confirms vertical perspective compression without coordinate divergence (>5px real shift).
     - Bearing rotation simulation (`map.setBearing(60)`): validates compass rotation matrix synchronization (>5px real shift).
     - Regional zoom simulation (`map.setZoom(3.0)`): validates finite, stable coordinates across Banda Aceh, Medan, Pekanbaru, Padang, Palembang, and Lampung.
     - Direct Deck.gl viewport mathematical comparison: asserts `maxDeltaAcrossCorridor < 0.001` pixels (exact 0-pixel drift).
  2. `Phase 98: Steep 3D perspective (pitch 60 deg) and rotation maintain 0 pixel drift`:
     - Sets steep perspective (`pitch: 60`), reverse bearing (`bearing: 180`), and corridor zoom (`zoom: 7.5`).
     - Asserts `maxDiff < 0.001` pixels across Sumatra logistics hubs.

---

## 3. Verification & Proof of Work

### A. TypeScript Type Safety
- Executed `node frontend/node_modules/typescript/bin/tsc --noEmit -p frontend/tsconfig.json`:
  ```text
  Exit Code: 0
  TypeScript: No errors found.
  ```

### B. Automated E2E Suite (`frontend/e2e/mapbox-turn-by-turn.spec.ts`)
- Executed: `rtk npx playwright test e2e/mapbox-turn-by-turn.spec.ts`:
  ```text
  PASS (7) FAIL (0)
  Time: 30700ms

  ✓ Manhattan Medan -> USU returns >200 road-snapped coordinates
  ✓ Tangential avoidance waypoint creates safe clearance around hazard
  ✓ Point obstacle with exclude parameter generates valid avoid route
  ✓ Turn-by-turn maneuvers extract valid directional steps
  ✓ Map dashboard renders without console errors
  ✓ Phase 98: Mapbox Mercator projection synchronization and layer anchoring (0px drift)
  ✓ Phase 98: Steep 3D perspective (pitch 60 deg) and rotation maintain 0 pixel drift
  ```

### C. Regression Suite (`e2e/toll-bypass-routing.spec.ts`, `e2e/multi-client-routing-isolation.spec.ts`)
- Executed: `rtk npx playwright test e2e/toll-bypass-routing.spec.ts e2e/multi-client-routing-isolation.spec.ts`:
  ```text
  PASS (8) FAIL (0)
  Time: 10300ms
  ```

---

## 4. Deliverables Matrix

| Work Package | Status | Details |
|---|---|---|
| **WP1: Projection Cutover to Mercator** | COMPLETED ✅ | `CrisisMap.tsx` and `AnalyticsSection.tsx` set to `projection: { name: 'mercator' }`. |
| **WP2: Automated Anchoring E2E Spec** | COMPLETED ✅ | Added full matrix stability and projection assertion to `mapbox-turn-by-turn.spec.ts`. |
| **WP3: Full Pipeline Validation** | COMPLETED ✅ | 0 TypeScript errors, 14/14 E2E tests passing across primary and regression suites. |
