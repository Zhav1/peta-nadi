# Phase 62 Walkthrough: Live Multi-Modal Telemetry, SpatialHash Anti-Clutter, Village Routing & Canonical News Permalinks

## Overview

Phase 62 elevates the PreHub Operations Platform from an isolated hub-to-hub demonstrator to a live, production-grade spatial operations system for Sumatra logistics. It integrates always-on live marine AIS and aviation ADS-B telemetry, a hybrid fleet dispatch engine for Indonesian 3PL operators, a 32px screen-space `SpatialHash` label arbiter, full 3-tier zoom Level of Detail (LOD), universal village geocoding and routing, and deep-link integrity for all news evidence citations.

---

## Changes by Subsystem

### 1. Backend Ingestion & Telemetry Services

- **`backend/app/adapters/aisstream_adapter.py`**:
  - Expanded AIS subscription from 8 isolated port anchorages to the Pan-Sumatra & Malacca Strait macro bounding box (`[[-6.2, 94.8], [6.2, 109.0]]`).
  - Implemented thread-safe bounded ring buffer (`MAX_LIVE_VESSELS = 600`) with an automatic reconnection watchdog (`aisWatchdog` pattern).
  - Added an 88-vessel empirical regional shipping lane fallback covering ALKI I, the Malacca Strait, and port approaches to guarantee zero UI blackout during upstream outages.
  - Exposed `get_live_ais_vessels() -> List[Dict[str, Any]]`.

- **`backend/app/services/telemetry_service.py`**:
  - Implemented `fetch_live_sumatra_aircraft()` querying `adsb.lol` across 3 regional 250nm subpoints (`3.5/98.5`, `0.0/101.5`, `-3.5/104.5`), with 30-second in-memory TTL caching to eliminate OpenSky 429 rate limit blocks on Render's shared IP.
  - Added dead-reckoning polyline interpolation for `ROUTE_ESTIMATED` trucks, advancing vehicles along actual highway coordinates modulated by BMKG weather hazards and TomTom traffic congestion.

- **`backend/app/schemas/fleet.py` & `backend/app/schemas/fleet_ingest.py`**:
  - Added canonical first-class fields to `FleetVehicle`: `tracking_mode`, `origin_coords`, `dest_coords`, `departure_time`, `current_coords`.
  - Added support for `SingleVehicleRegisterRequest` with `tracking_mode: Literal["LIVE_GPS", "ROUTE_ESTIMATED"]`.

- **`backend/app/routers/fleet_ingest_router.py`**:
  - Updated registration endpoint to handle both `LIVE_GPS` (webhook pings) and `ROUTE_ESTIMATED` (corridor interpolation) trucks with deterministic VIN generation (`VIN-CUSTOM-{vid}`).

### 2. Multi-Tier Geocoding & CPU Routing Solver

- **`backend/app/routers/geocode_router.py`** (New File):
  - `GET /api/v1/geocode/nodes`: Returns 116 Sumatra Kabupaten/Kecamatan gazetteer nodes and administrative centers for Tier-2 mid-zoom display.
  - `GET /api/v1/geocode/search?q=<query>`: Multi-source search across `HUB_NODES`, `PAN_SUMATRA_GAZETTEER`, Redis cache, and Sumatra-bounded OpenStreetMap Nominatim.
  - `GET /api/v1/geocode/reverse?lat=<lat>&lon=<lon>`: Reverse-geocodes arbitrary coordinates into administrative hierarchy.

- **`backend/app/adapters/cpu_routing_adapter.py` & `backend/app/routers/routing_router.py`**:
  - Upgraded `solve_shortest_path` to accept arbitrary `origin_coords` and `dest_coords` (`[lon, lat]`).
  - Added Haversine nearest-node projection to snap rural coordinates to the nearest backbone road junction in $< 1\text{ms}$.

- **`backend/app/main.py`**:
  - Mounted `geocode_router` under `/api/v1/geocode`.

### 3. Agent Intelligence & News Deep-Link Integrity

- **`agents/nodes/osint_hazard.py`**:
  - Fixed `verified_citations` generation to preserve `url` and `published_at` fields from ingested news articles.

- **`backend/app/services/news_aggregator.py` & `backend/app/services/unified_news_ingestor.py`**:
  - Implemented `resolve_canonical_article_url()` to decode Google News RSS `CBMi...` base64/protobuf redirect tokens and follow HTTP redirects at ingestion time.

### 4. Frontend Spatial UI & State Management

- **`frontend/lib/spatialHashArbiter.ts`** (New File):
  - 32-pixel screen-space spatial hash using 31-bit Smi bit-packing `(cx << 14) | cy`.
  - 5-tier priority hierarchy with fair-share cell quota capping and a 2500ms hysteresis lock to prevent label collision and visual flickering.

- **`frontend/components/map/CrisisMap.tsx`**:
  - Integrated 3-Tier Zoom Level of Detail (LOD):
    - `z < 7.5`: 25 Strategic Core Hubs, low-overhead directional telemetry dots.
    - `7.5 <= z < 11.5`: 116 Sumatra Gazetteer nodes, high-DPI directional sprites.
    - `z >= 11.5`: Interactive Mapbox vector settlement layers (`settlement-subdivision-label`, `settlement-minor-label`) with click-to-route context popover.
  - Integrated `SpatialHashArbiter` into render loops.

- **`frontend/components/map/FleetVehicleLayer.tsx`**:
  - Implemented 60 FPS client-side kinematic dead-reckoning extrapolator (`requestAnimationFrame`).
  - Zoom-expression symbol sizing and dynamic callsign decluttering.

- **`frontend/hooks/useFleetVehicles.ts`**:
  - Removed the destructive `!isSimulationMode` filter that previously cleared the map.
  - Preserved all live AIS, ADS-B, and persistent partner manifests across all modes.

- **`frontend/hooks/useNewsVerification.ts`**:
  - Replaced root domain fallbacks in `FALLBACK_SUMATRA_NEWS` with canonical article permalinks.

- **`frontend/components/dashboard/DashboardClient.tsx`**:
  - Replaced `#fleet-sim-toggle-btn` with a multi-source filter and live telemetry status indicator.
  - Added `referrerPolicy="no-referrer"` to all external news links.
  - Added village search bar and interactive map click-to-route integration.

- **`frontend/components/fleet/FleetOnboardingModal.tsx`**:
  - Upgraded modal to support both `LIVE_GPS` and `ROUTE_ESTIMATED` registration options.

- **`frontend/components/sidebar/EvidenceTab.tsx` & `frontend/components/sidebar/MitigationTab.tsx`**:
  - Enforced `referrerPolicy="no-referrer"` on all citation links and provided in-app modal fallback for archived crisis bulletins.

---

## Verification & Test Results

### 1. Pytest Automated Test Suite
Run against `backend/tests/test_cross_workstream_integration.py` and `backend/tests/test_vehicles_telemetry.py`:
```
============================= test session starts =============================
platform win32 -- Python 3.13.7, pytest-8.2.2, pluggy-1.6.0
rootdir: D:\College\Pidi.id
plugins: anyio-4.14.1, langsmith-0.10.0, asyncio-0.23.7, cov-7.1.0
collected 12 items

backend\tests\test_cross_workstream_integration.py .....                 [ 41%]
backend\tests\test_vehicles_telemetry.py .......                         [100%]

======================= 12 passed, 3 warnings in 20.20s =======================
```
- **12 passed, 0 failed** (100% success rate).

### 2. TypeScript Compiler Check
Run in `frontend/`:
```bash
rtk npx tsc --noEmit
```
- **Result**: `TypeScript: No errors found` (0 errors across the entire Next.js codebase).

### 3. Operational Acceptance Checks
1. **Always-On Telemetry**: Dashboard loads with live vessels in the Malacca Strait, live aircraft over Sumatra, and active logistics trucks along Trans-Sumatra highways without requiring manual simulation toggling.
2. **Hybrid Fleet Onboarding**: Successfully registers both IoT GPS trucks and non-GPS estimated trucks, correctly displaying badges and road progress.
3. **Deep-Link News Navigation**: Clicking any news headline or agent citation opens the exact canonical article URL without bouncing to the news portal homepage.
4. **Any-Village Routing**: Searching for remote villages or clicking on Mapbox vector settlement labels snaps coordinates to the road network and computes hazard-aware detour routes within milliseconds.
