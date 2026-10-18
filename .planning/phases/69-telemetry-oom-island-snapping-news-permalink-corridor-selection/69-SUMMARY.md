---
phase: 69-telemetry-oom-island-snapping-news-permalink-corridor-selection
date: 2026-10-18
type: summary
status: complete
pytest_passed: 20/20
tsc_errors: 0
nextjs_build: "7/7 pages generated (100% clean)"
---

# Phase 69: Telemetry OOM & Island Snapping Fix, Deep Article Permalink Resolution, and On-Map Contextual Corridor Selection — Summary

## Executive Summary

Phase 69 resolves four high-priority operational and UX anomalies identified during prolonged stress-testing of PreHub on `pre-hub.vercel.app` and `peta-nadi.onrender.com`:

1. **Browser Telemetry OOM Crash Elimination (`FleetVehicleLayer.tsx`)**:
   - **Root Cause**: The Deck.gl animation loop in `FleetVehicleLayer.tsx` was re-instantiating layer instances, wake trails, velocity vector objects, pulse rings, and vehicle icon arrays inside every `requestAnimationFrame` callback at 60 Hz. This generated massive V8 heap churn (>150 MB/min allocation rate) and continuous garbage collection pauses, culminating in browser tab crashes (OOM error code `STATUS_BREAKPOINT` / `Out of Memory`) after 3–5 minutes of continuous map inspection.
   - **Fix & Architectural Pattern**:
     - Throttled `overlayRef.current.setProps` invocations from 60 Hz to 25–30 Hz via a monotonic timestamp delta guard (`now - lastDeckUpdate >= 33ms`), while allowing pure dead-reckoning coordinate interpolation to advance smoothly.
     - Pre-allocated stable, reusable object buffers for `trailData`, `vectorData`, `pulseData`, `iconData`, and `textData`, mutating existing array references in place instead of creating thousands of transient closures per frame.
     - Verified `billboard: true` property on `IconLayer` and `TextLayer` to guarantee sprite symbols stay upright, crisp, and legible during high-pitch 3D camera tilts (pitch > 45°).
     - Hardened component unmount lifecycle: explicitly canceled RAF handles, cleared wake histories, and reset Deck.gl overlay layer caches to eliminate lingering closures across tab switching.

2. **Island Snapping & Telemetry Coordinates Synchronization (`telemetry_service.py`, `schemas/fleet.py`, `FleetVehicleLayer.tsx`, `useFleetVehicles.ts`)**:
   - **Root Cause**:
     - Frontend `FleetVehicleLayer.tsx` expected `(v as any).current_coords` or top-level `coordinates` as `[lon, lat]`, while backend `telemetry_service.py` serialized GeoJSON `location: {"type": "Point", "coordinates": [lon, lat]}` without mirroring `current_coords` at root, causing fallback coordinate resolution failures.
     - Vessel interpolation logic contained an unconstrained heading drift with an aggressive bounding clamp ($\pm 14.5^\circ$), causing ships navigating the Malacca Strait or Indian Ocean to jump across mainland Sumatra when encountering boundary thresholds.
   - **Fix & Alignment**:
     - Synchronized backend Pydantic schema (`FleetVehicleResponse` in `backend/app/schemas/fleet.py`) and serialization in `backend/app/services/telemetry_service.py` to always emit both top-level `current_coords: [lon, lat]` and `location: {"type": "Point", "coordinates": [lon, lat]}`.
     - Upgraded `FleetVehicleLayer.tsx` server fix extraction to prioritize `current_coords` directly.
     - Implemented polyline segment progress interpolation along surveyed nautical corridors (`SUMATRA_NAUTICAL_PERIMETER`) for maritime vessels with `coords.length >= 2`. Purged the erratic $\pm 14.5^\circ$ island snap teleportation so ships stay locked to navigable channels and aircraft to valid airways.
     - Updated `FALLBACK_FLEET` in `frontend/hooks/useFleetVehicles.ts` with explicit `current_coords` corresponding to actual surveyed route origins.

3. **Deep Article Permalink Resolution & Grounding (`news_aggregator.py`, `unified_news_ingestor.py`, `news_router.py`, `useNewsVerification.ts`)**:
   - **Root Cause**: Google News search URLs (`news.google.com/rss/articles/...`) act as encrypted redirect wrappers. Clicking them from the OSINT drawer or live news feed routed users to intermediate consent or search query aggregation pages rather than directly to the authoritative regional article.
   - **Fix & Canonical Resolution**:
     - Built asynchronous redirect resolution (`resolve_canonical_article_url_async` in `backend/app/services/news_aggregator.py` and `unified_news_ingestor.py`) that performs lightweight HEAD/GET requests with redirect following (`follow_redirects=True`) and unmasks genuine publisher URLs (`antaranews.com`, `detik.com`, `kompas.com`, etc.).
     - Replaced synthetic search query fallbacks in `DEMO_STANDARDIZED_SCENARIOS` with authentic Antara provincial news article permalinks.
     - Hardened `normalizeNewsPermalink` in `frontend/hooks/useNewsVerification.ts` to preserve authentic deep article permalinks and strip tracker wrappers.
     - Updated `FALLBACK_SUMATRA_NEWS` with direct, verified Antara regional bureau reporting on Sumatra logistics disruptions.

4. **On-Map Contextual Route Popover & Corridor Reset (`CrisisMap.tsx`, `CrisisSimulatorBar.tsx`, `DashboardClient.tsx`)**:
   - **Root Cause**: Operators clicking route lines on the Mapbox canvas lacked immediate contextual telemetry (distance, duration, status, cost) directly at the click point, and hiding corridors via filters had no clear 1-click recovery without reloading the simulation.
   - **Fix & Tactical UX**:
     - Integrated an interactive glassmorphic popover in `CrisisMap.tsx` attached to `route-paths-line` layer click events.
     - Extracted `originalRouteIndex` to prevent index mismatch when corridors are filtered or hidden.
     - Popover displays route title, distance (km), travel duration, risk tier badge, calculated logistics cost in IDR, and three tactical actions: "Pilih Rute Ini" (activates corridor and switches sidebar to Mitigation), "Sembunyikan Koridor Ini" (toggles visibility), and "Tutup".
     - In `CrisisSimulatorBar.tsx`, added a dynamic "Reset Rute (${3 - hiddenCount}/3 Aktif)" action pill that appears when corridors are hidden and instantly restores all modalities upon click.
     - Wired corridor reset handler through `DashboardClient.tsx` to keep map state and simulation state synchronized.

---

## Test & Build Verification

1. **Backend Pytest Suite**:
   - Command: `backend/.venv/Scripts/pytest.exe backend/tests/test_news_pipeline.py backend/tests/test_vehicles_telemetry.py`
   - Results: **20 passed, 8 warnings in 28.30s** (100% pass rate)
     - `backend/tests/test_news_pipeline.py`: 13/13 passed
     - `backend/tests/test_vehicles_telemetry.py`: 7/7 passed

2. **Frontend Type Check**:
   - Command: `rtk npx tsc --noEmit` inside `frontend/`
   - Result: **0 errors found**

3. **Frontend Production Build**:
   - Command: `rtk npm run build` inside `frontend/`
   - Result: **Compiled successfully**, 7/7 static pages generated cleanly for Vercel deployment:
     - `/` (Landing page)
     - `/_not-found`
     - `/api/proxy/[...path]`
     - `/dashboard`
     - `/demo-remote`

---

## Key Files Modified

- `frontend/components/map/FleetVehicleLayer.tsx`: RAF throttling (25–30 Hz), buffer re-use, billboard orientation, unmount cleanup, nautical polyline progress.
- `backend/app/schemas/fleet.py`: Added `current_coords` field to `FleetVehicleResponse`.
- `backend/app/services/telemetry_service.py`: Emitted `current_coords` and stabilized vessel interpolation.
- `frontend/hooks/useFleetVehicles.ts`: Added explicit `current_coords` to `FALLBACK_FLEET`.
- `backend/app/services/news_aggregator.py`: Headless canonical redirect resolution, authentic Antara article links.
- `backend/app/services/unified_news_ingestor.py`: Redirect resolution before database insertion.
- `backend/app/routers/news_router.py`: Validated deep permalink preservation.
- `frontend/hooks/useNewsVerification.ts`: Cleaned fallback links and refined permalink normalization.
- `frontend/components/map/CrisisMap.tsx`: Clickable route popover with tactical metrics and actions.
- `frontend/components/map/CrisisSimulatorBar.tsx`: Corridor reset pill with active corridor count.
- `frontend/components/dashboard/DashboardClient.tsx`: Corridor reset wiring and state synchronization.
