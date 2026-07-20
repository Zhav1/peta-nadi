# Walkthrough — Phase 13: Mapbox/Deck.gl Spatiotemporal Layers & Drawing Tool

**Phase:** 13  
**Status:** COMPLETE ✅  

---

## Changes Made

### 1. 3D Globe Node Anchoring Fix (`frontend/lib/layers.ts` & `frontend/components/map/CrisisMap.tsx`)
- Configured Mapbox projection to `projection: { name: 'globe' }`.
- Added `billboard: true`, `antialiasing: true`, and explicit `getPosition: (d) => [d.lon!, d.lat!, 0]` to Deck.gl `ScatterplotLayer` in `buildCrisisPinsLayer`.
- Ensures disruption hotspot nodes stay flatly facing the camera and locked strictly to geographic lat/lon coordinates without floating off surface during 3D rotation, pitch, or zoom.

### 2. SIMULATE DISRUPTION Event Listener & Pen Cursor Fix (`frontend/components/map/CrisisMap.tsx`)
- Added active pointer-events handling for Deck.gl overlay element container: toggles `pointer-events: none` on Deck.gl overlay when `drawModeActive` is true so mouse events pass directly to MapboxDraw.
- Sets map canvas cursor to `'crosshair'` when drawing mode is activated.
- Enhanced `draw.create` handler to capture polygon geometry, invoke simulation callback, delete temporary drawing shapes, and reset cursor cleanly.

### 3. High-Resolution Corridor Route Polylines (`layers.ts`, `mock_crisis_state.json`, `demo_router.py`, `useDemoState.ts`)
- Replaced 4-point zig-zag route waypoints with smooth, high-resolution waypoints along the Trans-Sumatra / Medan-Tebing Tinggi toll road corridor (Belawan -> Tanjung Mulia -> Amplas -> Lubuk Pakam -> Perbaungan -> Tebing Tinggi -> Pematangsiantar).
- Updated `buildRoutePathsLayer` in `layers.ts` with rounded joins (`jointRounded: true`, `capRounded: true`), distinct cyan selected route vs orange alternative route styling, and `billboard: true`.

---

## Verification Results

- **Python Syntax Check**: `py_compile` succeeded on `demo_router.py`.
- **3D Globe Anchor**: Pins remain anchored to coordinates during globe pitch and rotation.
- **Drawing Tool**: "SIMULATE DISRUPTION" transforms cursor to pen crosshair and allows drawing polygon disaster zones.
- **Route Visualization**: Route lines follow realistic highway paths cleanly.
