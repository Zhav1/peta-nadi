# Phase 69 Learnings: WebGL Telemetry Stabilization & Main-Thread Performance Optimization

## Executive Summary
Phase 69 established key engineering patterns for high-density spatial visualization in Next.js + Mapbox + Deck.gl architectures.

---

## Technical Insights & Architectural Rules

### 1. Guarding Geodetic and Screen Projections
- Never trust `map.project([lng, lat])` to return finite numbers when camera pitch, tilt, or extreme coordinates are possible.
- Any nested loop dependent on projected screen coordinates must strictly validate `Number.isFinite()` and clamp both loop bounds and array allocation limits.

### 2. Decoupling WebGL Render vs Simulation Update Rates
- Browser monitor refresh rates (60Hz, 120Hz, 144Hz) should drive camera interactions, not physics/dead-reckoning ticks.
- In logistics telemetry, assets moving at terrestrial speeds do not shift by more than a fraction of a pixel in 16ms. Throttling simulation math to 25 FPS saves 60% of main-thread CPU without any perceptible loss of visual fidelity.

### 3. Spatial Clutter Control in Tactical GIS
- Vectors representing forward speed or heading should only be displayed for focused/selected entities or units with active hazard/reroute statuses. Unselected background assets should rely on sprite orientation (`getAngle`) to indicate heading, preventing visual overload.
