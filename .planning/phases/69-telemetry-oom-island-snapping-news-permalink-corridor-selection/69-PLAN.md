# Phase 69: Telemetry OOM & Island Snapping Fix, Deep Article Permalink Resolution, and On-Map Contextual Corridor Selection

## Context & Objectives
In Phase 68, we restored the E2E Playwright test suite for guest 403 handling on `MitigationTab`. Phase 69 addresses critical operational stability and UX refinements across the live logistics platform:
1. **Eliminate Browser OOM**: Decouple Deck.gl layer recreation from the 60fps RAF loop in `FleetVehicleLayer.tsx`.
2. **Fix Island Snapping & Telemetry Coordinates**: Ensure maritime and air units stay on surveyed waterways and FIRs without teleporting across Sumatra; align `current_coords` deserialization in frontend.
3. **Deep Article Permalink Resolution**: Replace Google News search wrapper landing pages with authentic deep article permalinks from Antara and verified publishers.
4. **On-Map Contextual Route Popover & Corridor Reset**: Render a tactical glassmorphism popover on route line click, and add a "Reset Hidden Routes" action pill to `CrisisSimulatorBar.tsx`.

---

## Detailed Task Breakdown

### Task 1: Telemetry OOM Elimination (`FleetVehicleLayer.tsx`)
- Throttle `overlayRef.current.setProps` from 60 Hz to 25–30 Hz.
- Reuse pre-allocated arrays for `trailData`, `vectorData`, `pulseData`, `iconData`, and `textData` to eliminate GC thrashing.
- Verify `billboard: true` orientation on `IconLayer` so sprites stay upright and crisp during 3D camera tilts.
- Ensure all animation frames are canceled and cached references cleared on component unmount.

### Task 2: Island Snapping & Coordinate Alignment (`telemetry_service.py`, `FleetVehicleLayer.tsx`, `useFleetVehicles.ts`)
- `telemetry_service.py`: serialize both `current_coords: [lon, lat]` and `location: {"type": "Point", "coordinates": [lon, lat]}`.
- `FleetVehicleLayer.tsx`: update `serverFix` to check `current_coords` first; use polyline progress interpolation along surveyed corridors for maritime units with `coords.length >= 2`; purge the $\pm 14.5^\circ$ island snap teleportation.
- `useFleetVehicles.ts`: ensure `FALLBACK_FLEET` has explicit `current_coords` matching route origins.

### Task 3: Deep Article Permalink Resolution (`news_aggregator.py`, `unified_news_ingestor.py`, `useNewsVerification.ts`)
- `news_aggregator.py`: add headless redirect resolution in `resolve_canonical_article_url_async` that follows Google News wrappers to original publisher URLs; update `DEMO_STANDARDIZED_SCENARIOS` with authentic Antara URLs.
- `unified_news_ingestor.py`: invoke async redirect resolution during ingestion before saving to Supabase.
- `useNewsVerification.ts`: update `FALLBACK_SUMATRA_NEWS` with verified deep Antara article links; update `normalizeNewsPermalink`.

### Task 4: On-Map Contextual Route Popover & Corridor Reset (`CrisisMap.tsx`, `CrisisSimulatorBar.tsx`, `DashboardClient.tsx`)
- `CrisisMap.tsx`: listen for clicks on `route-paths-line`, extract `originalRouteIndex`, and open a tactical glassmorphism popover displaying route title, distance (km), duration, risk status, IDR logistics cost, and action buttons ("Pilih Rute Ini", "Sembunyikan Koridor Ini", "Tutup").
- `CrisisSimulatorBar.tsx`: display a contextual "Reset Rute (${3 - hiddenCount}/3 Aktif)" pill when corridors are hidden; clicking triggers `onResetCorridorVisibility`.
- `DashboardClient.tsx`: wire `handleResetCorridors` into `CrisisSimulatorBar`.

---

## Verification
- `npx tsc --noEmit` & `npm run build` in `frontend/`
- `pytest backend/tests/test_vehicles_telemetry.py backend/tests/test_unified_news_ingestor.py`
- Manual verification: memory profiling in DevTools, route clicks on map, link clicks in OSINT drawer, and corridor toggling in simulator bar.
