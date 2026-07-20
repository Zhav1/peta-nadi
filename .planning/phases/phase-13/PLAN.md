# PLAN — Phase 13: Mapbox/Deck.gl Spatiotemporal Layers & Drawing Tool

**Phase:** 13  
**Milestone:** M1 — Hackathon MVP (North Sumatra Corridor)  
**Status:** READY TO EXECUTE ⏳  
**Estimated effort:** 1-2 days (solo, AI-assisted)  

---

## 1. Goal

Fix Mapbox/Deck.gl 3D globe node anchor floating/drifting during rotation, repair the "SIMULATE DISRUPTION" drawing mode event listener & cursor, and refine logistics route polylines to follow clean, realistic corridor paths.

---

## 2. Root Cause & Problem Analysis

1. **3D Globe Node Anchor Floating Bug**:
   - Deck.gl `ScatterplotLayer` in `layers.ts` rendered 2D nodes without `billboard: true` or elevation anchoring. When Mapbox 3D globe projection is rotated, pitched, or zoomed, the layer calculation in 3D camera space caused nodes to float above terrain or drift off coordinates.

2. **SIMULATE DISRUPTION Drawing Mode Event Listener Failure**:
   - `MapboxOverlay` (Deck.gl) canvas sits on top of Mapbox GL canvas with active pointer events (`pointer-events: auto`), intercepting `mousedown`/`mousemove`/`mouseup` events.
   - As a result, MapboxDraw (`draw_polygon`) never received mouse drag events, and the cursor failed to change to the drawing tool (`crosshair`).

3. **Jagged / Hallucinated Route Polylines**:
   - `mock_crisis_state.json` and fallback state in `useDemoState.ts` / `demo_router.py` contained only 4 sparse, zig-zag waypoints that jumped across large geographic distances, creating visual line hallucinations across the map.

---

## 3. Implementation Tasks

### Task 1: Fix 3D Globe Node Anchor & Elevation (`CrisisMap.tsx` & `layers.ts`)
- In `layers.ts` (`buildCrisisPinsLayer`):
  - Add `billboard: true` to `ScatterplotLayer` so pins remain flatly facing the camera.
  - Set `positionFormat: 'XYZ'` with 0 elevation so pins stay locked to map coordinates regardless of pitch, bearing, or 3D globe rotation.
- In `CrisisMap.tsx`:
  - Set Mapbox projection explicitly to `projection: { name: 'globe' }`.

### Task 2: Fix SIMULATE DISRUPTION Event Listener & Pen Cursor (`CrisisMap.tsx` & `DashboardClient.tsx`)
- In `CrisisMap.tsx`:
  - When `drawModeActive` is `true`:
    - Set Mapbox canvas cursor style to `'crosshair'`.
    - Set `pointer-events: none` on Deck.gl overlay element container so mouse events pass directly to MapboxDraw canvas.
    - Force MapboxDraw mode to `'draw_polygon'`.
  - When `drawModeActive` is `false`:
    - Restore cursor to `'default'` and re-enable pointer events on Deck.gl overlay container.
  - Ensure `map.on('draw.create')` captures GeoJSON polygon coordinates, passes them to `onPolygonDrawn`, deletes temporary draw feature, and resets mode cleanly.

### Task 3: Refine Route Polylines to Realistic Corridors (`layers.ts`, `mock_crisis_state.json`, `demo_router.py`, `useDemoState.ts`)
- Update waypoints in `mock_crisis_state.json`, `demo_router.py`, and `useDemoState.ts`:
  - **Route 1 (Medan-Tebing Tinggi Toll Bypass)**: High-resolution waypoints following the Trans-Sumatra / Medan-Tebing Tinggi toll road path (Belawan -> Tanjung Mulia -> Amplas -> Lubuk Pakam -> Perbaungan -> Tebing Tinggi -> Pematangsiantar).
  - **Route 2 (Pesisir Timur Coastal Detour)**: High-resolution waypoints following the eastern coastal highway corridor.
- Enhance `buildRoutePathsLayer` styling in `layers.ts` with clean rounded joins (`jointRounded: true`, `capRounded: true`) and distinct active vs alternative route styling.

---

## 4. Verification Plan

### Manual Verification
1. **3D Globe Rotation**:
   - Rotate, pitch, and zoom the 3D map. Verify disruption nodes/pins remain 100% locked to lat/lon coordinates without drifting or floating.
2. **Drawing Tool**:
   - Click "SIMULATE DISRUPTION": verify cursor changes to crosshair and mouse click-and-drag draws a smooth polygon.
   - Finish polygon: verify simulation is triggered, toast notification displays, and drawing tool resets.
3. **Route Visual Refinement**:
   - View active detour routes on map: verify lines follow realistic road geometry cleanly without jagged zig-zag jumps.
