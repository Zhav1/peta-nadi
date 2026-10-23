# Phase 98: Learnings & Operational Insights

**Milestone:** M6 — Turn-by-Turn Road Snapping, Offline Fleet Precomputation & Dual-Layer Hazard Avoidance  
**Phase:** 98  
**Topic:** Mapbox GL JS v3 & Deck.gl v9 Camera Matrix Synchronization in Web Mercator  

---

## 1. Mathematical Root Cause of Floating Deck.gl Layers on Mapbox v3 Globes

* **The Problem:** In Mapbox GL JS v3, initializing a map with `projection: { name: 'globe' }` signals `@deck.gl/mapbox` to instantiate Deck.gl's `GlobeView` with `GlobeViewport`. However, `GlobeViewport` in Deck.gl v9 is designed strictly for flat, top-down orthogonal globe views: it does not accept or apply camera `pitch` or `bearing`.
* **The Mathematical Discrepancy:** When `pitch: 35` was applied to the camera, Mapbox rotated the 3D globe around the viewport X-axis, while Deck.gl computed screen positions with `pitch = 0°`. For geographic coordinates near the equator (Sumatra at ~0.5° N), this 35° pitch mismatch caused screen coordinates to diverge by ~350 pixels vertically, rendering vehicle icons and pulse rings in outer space over Vietnam and Cambodia.
* **The Transition Trap:** Furthermore, Mapbox GL JS v3 implements an internal transition from globe to Web Mercator around zoom 6.0 (`mercatorFromTransition`). Despite this transition, `map.getProjection()` continued reporting `{ name: 'globe' }`. Deck.gl was misled into maintaining its spherical formulas up to zoom 12.0, causing parallax slipping whenever the map was panned.

---

## 2. Web Mercator Standardization for Regional Logistics Dashboards

* **Domain Alignment:** PreHub is a dedicated regional Decision Support System focused on the Pan-Sumatra multimodal logistics corridor (spanning latitudes $6^\circ\text{ S}$ to $6^\circ\text{ N}$).
* **Conformal Projection Advantage:** At near-equatorial latitudes, Web Mercator (EPSG:3857) scale distortion is negligible ($< 0.5\%$). Standardizing on `projection: { name: 'mercator' }` forces `@deck.gl/mapbox` to instantiate `MapView` with `WebMercatorViewport`.
* **1:1 Matrix Parity:** `WebMercatorViewport` consumes `center`, `zoom`, `pitch`, and `bearing` using projection equations that match Mapbox GL JS's internal `Transform.calcMatrices()` $1:1$. Fleet vehicles, orange route lines, pulse indicators, and `TargetLockReticle` HUD elements lock tightly to ground coordinates across all zoom ranges, pitch tilts up to 85°, and continuous compass rotations.

---

## 3. Window Handle Aliasing for Robust E2E Test Observability

* **The Pattern:** In single-page Next.js applications with complex SSR/dynamic imports, E2E test suites often struggle to cleanly inspect WebGL map state via canvas DOM elements alone.
* **The Solution:** Exposing the map instance to `window` with both `window._mapboxMap` (legacy internal hook) and `window.mapboxMap` (public API inspection alias) enables Playwright tests to execute direct matrix evaluations (`map.getProjection()`, `map.project()`, `map.getPitch()`) without requiring brittle polling of DOM canvas ref attributes.
