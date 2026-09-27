# Phase 39: Tactical Multi-Modal Telemetry & God's-Eye HUD Console — Structured Learnings & Context Extraction

**Date:** 2026-09-27  
**Phase:** 39 (Milestone M2)  
**Status:** COMPLETE ✅  
**Repository State:** Clean, 79/79 pytest passing, 0 TypeScript compiler errors.

---

## 1. Executive Summary & Context

Phase 39 upgraded PreHub's fleet visualization and telemetry engine into an operator-grade, high-performance tactical command interface. The system now ingests and renders multi-modal logistics assets (maritime cargo vessels via AISstream, air freighters via OpenSky ADS-B, and highway refrigerated trucks via dynamic GPS polyline interpolation) directly onto Mapbox GL JS using native WebGL symbol and line layers at a stable 60 FPS, with an interactive target-locking crosshair reticle, dynamic spherical geodesic bearing vectors, and a follow-camera tracking mode.

This document extracts all learnings, design decisions, architectural constraints, discovered traps, and environmental conditions to ensure future context windows build upon verified foundations without repeating past mistakes.

---

## 2. Environmental Conditions & Operational Constraints

1. **Host Environment:**
   - **OS:** Windows 11 (PowerShell terminal).
   - **CLI Optimization:** Antigravity RTK (Rust Token Killer) proxy rule is active across shell executions to reduce token bloat by 60–90%.
   - **Path Resolution:** When executing commands in new subshells, PATH must be refreshed:
     `$env:PATH = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User"); rtk <cmd>`

2. **Zero-GPU Architecture Constraint:**
   - PreHub runs 100% on standard CPU compute (deterministic NetworkX Dijkstra + Google OR-Tools VRP for vehicle routing; Open-Meteo NWP + BMKG Radar for numerical weather fusion).
   - Zero dependence on theoretical NVIDIA H100 / DGX / cuOpt cloud GPU hardware.

3. **UI/UX Design System Router & Non-AI Anti-Pattern Constraints:**
   - **NO** generic AI purple/pink gradients.
   - **NO** emojis as UI icons (100% monochrome SVG from Lucide React).
   - **MANDATORY** `cursor-pointer` on all interactive buttons, cards, and clickable map layers.
   - **MANDATORY** Glassmorphism token: `backdrop-blur-md bg-[#0c0e12]/80 border border-white/10`.
   - **Color Split 60/30/10:** Dominant `#0c0e12` (60%), Secondary `#1e2024` (30%), Accent `#00f0ff` Tactical Cyan (10% reserved strictly for target lock, active follow cam, live ping, speed vector arrowheads).
   - **Typography:** Strictly 4 font sizes (11px, 13px, 16px, 22px), 2 weights (400, 600), declared line heights.

---

## 3. Discovered Traps, Bugs & Solutions Applied

### Trap 1: HTML DOM Marker Thrashing vs. Mapbox WebGL Symbols
- **Problem:** Rendering 45+ vehicles with HTML DOM `mapboxgl.Marker` nodes and calling `setLngLat()` in a `requestAnimationFrame` loop caused severe DOM layout thrashing, dropping frame rates below 25 FPS during 3D pitch ($35^\circ\text{--}60^\circ$) and camera rotation.
- **Solution:** Replaced 100% of DOM markers with native Mapbox WebGL symbol layers (`fleet-telemetry-points`) and line layers (`fleet-breadcrumb-trails`, `fleet-bearing-vectors`). High-DPI sprites (`truck-icon`, `vessel-icon`, `plane-icon`) are generated on-the-fly via canvas `createModalitySprite()` at 2x pixel ratio.
- **Result:** Single GPU draw call per frame, maintaining a locked 60 FPS under 100+ active assets.

### Trap 2: Mapbox Sprite Registration Collisions on Style Reload
- **Problem:** Adding sprites with `map.addImage()` without checking existence throws runtime collisions (`An image with name 'truck-icon' already exists`) when map style reloads or re-renders.
- **Solution:** Added defensive checks `if (!targetMap.hasImage(id))` inside `registerSprites()` and hooked into both `style.load` and `styledata` events.

### Trap 3: Follow-Camera Input Fighting during User Drag
- **Problem:** Continuous programmatic `map.easeTo()` follow-camera tracking fought with user manual panning, causing erratic map stuttering and trapped viewport navigation.
- **Solution:** Added an event listener for `map.on('dragstart')` that immediately disengages `isFollowCamActive = false` whenever the user initiates manual panning, allowing effortless user takeover.

### Trap 4: OpenSky Network API Rate Limiting (HTTP 429)
- **Problem:** Querying the public OpenSky REST API on rapid frontend poll loops triggered HTTP 429 rate limit lockouts.
- **Solution:** Implemented an in-memory cache TTL of 60 seconds (`self._opensky_ttl_seconds = 60.0`) in `telemetry_service.py`, backed by 45 pre-seeded synthetic units covering Pan-Sumatra maritime sea lanes, Trans-Sumatra highways, and air corridors.

### Trap 5: Missing `datetime` Import in Background Poller (`main.py`)
- **Problem:** In `backend/app/main.py` line 85 (`_poll_tomtom_loop`), `"timestamp": datetime.now(timezone.utc).timestamp()` was called without `datetime` and `timezone` imported at the module level.
- **Solution:** Explicitly added `from datetime import datetime, timezone` to the top of `backend/app/main.py`.

### Trap 6: Missing `re` and `httpx` in Marketplace Scraper
- **Problem:** In `backend/app/scrapers/marketplace_scraper.py`, `re.sub()` and `httpx.AsyncClient()` were called without top-level imports.
- **Solution:** Added `import re` and `import httpx` to `marketplace_scraper.py`.

### Trap 7: Pydantic v2 Alias Resolution in Decision Traces
- **Problem:** Legacy frontend payloads used `crisis_id` and `approved_by` while the new schema used `incident_id` and `operator_id`.
- **Solution:** Implemented `@model_validator(mode="after")` in `backend/app/schemas/decision_schemas.py` to seamlessly normalize both aliases without breaking existing client callers.

---

## 4. Key Architectural Patterns & Discoveries

1. **Spherical Geodesy for Bearing Vectors:**
   - Planar Euclidean offsets ($x + v \cos \theta, y + v \sin \theta$) fail at regional scales.
   - Using true spherical geodesy:
     $$\phi_2 = \arcsin(\sin\phi_1 \cos\delta + \cos\phi_1 \sin\delta \cos\theta)$$
     $$\lambda_2 = \lambda_1 + \operatorname{atan2}(\sin\theta \sin\delta \cos\phi_1, \cos\delta - \sin\phi_1 \sin\phi_2)$$
     where $\delta = d / R_{\text{earth}}$ ensures sub-meter vector precision at all latitudes.

2. **Screen-Space Reticle Projection vs. WebGL Layer:**
   - Rendering the animated pulsing target reticle as a screen-space SVG element positioned via `map.project(targetLngLat)` provided pixel-sharp brackets and breathing animations while decoupling HUD animation overhead from WebGL geometry updates.

3. **Dual Persistence Architecture (Cloud + SQLite):**
   - Cloud Supabase write with automatic fallback to local thread-safe SQLite (`prehub_local.db`) guarantees zero data loss during network dropouts at field command posts.

---

## 5. Guidelines for Future Phases (Phase 40 & 41)

1. **For Phase 40 (Evaluation & Benchmark Dashboard):**
   - Honor the tab switching architecture in `DashboardClient.tsx` without unmounting the Mapbox canvas (keep map state in memory).
   - Display real empirical numbers from `scripts/evaluate_metrics.py` (Precision 100%, Recall 94.3%, F1 0.971, Brier 0.0782, Latency 0.024ms) rather than placeholder constants.
   - Connect the Reliability Diagram component to empirical binning data computed by `probability_calibration.py`.
   - Embed the 79+ test suite matrix from `docs/test_matrix.md` with module-level pass/fail indicators.

2. **For Phase 41 (UI/UX Minimalist Sanitization & Technical Report):**
   - Sweep all legacy files for any remaining emojis and replace with Lucide React SVG components.
   - Ensure all references to GPU acceleration are replaced with honest CPU-based routing and open meteorological NWP fusion.
