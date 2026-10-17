---
phase: 62-live-telemetry-spatial-hash-village-routing
date: 2026-10-18
type: learnings
tags: [telemetry, live-ais, ads-b, hybrid-fleet, spatial-hash, news-deep-links, village-routing, pydantic-schema]
---

# Phase 62: Learnings, Root Causes, and Architectural Invariants

This document contains a rigorous, factual extraction of learnings, empirical root causes, performance bottlenecks, and architectural invariants discovered and resolved during Phase 62. All statements are verified against the codebase and test suites.

---

## 1. Issue 1: Empty Map Blackout when "Mode Simulasi" Was Toggled Off

### Empirical Finding
When users opened the platform without explicitly toggling on `Mode Simulasi`, or when toggling it off, the crisis map rendered completely bare: zero ships, zero aircraft, and zero logistics trucks were visible. Only regional hazard polygons remained on screen.

### Technical Root Cause
1. **Flawed Filter Predicate in `useFleetVehicles.ts`**:
   In `frontend/hooks/useFleetVehicles.ts`:
   ```typescript
   if (!isSimulationMode) {
     return customVehicles; // where customVehicles was initialized as an empty array []
   }
   ```
   This code assumed that all vehicles returned from `GET /api/v1/fleet/vehicles` were synthetic simulation data unless entered via the local onboarding modal. It discarded all real-time AIS marine transponders, ADS-B aircraft, and authenticated enterprise manifests.
2. **Aggressive WebGL Purge in `FleetVehicleLayer.tsx`**:
   When `vehicles.length === 0`, `FleetVehicleLayer.tsx` executed:
   ```typescript
   clearFleetSources();
   ```
   This removed the underlying Mapbox GeoJSON sources and unhooked event listeners, forcing expensive re-initializations of WebGL layers whenever vehicles were reintroduced.

### Permanent Fix & Architectural Invariant
- **Always-On Telemetry Pipeline**: Removed the binary `isSimulationMode` filter that wiped all vehicles.
- **Strict Provenance Categorization**: Vehicles are partitioned into:
  - `telemetry_source: "AIS_LIVE"` (real ships via `aisstream.io` WebSocket)
  - `telemetry_source: "ADSB_LIVE"` (real aircraft via `adsb.lol` / OpenSky)
  - `telemetry_source: "GPS_LIVE"` (dispatcher trucks streaming real-time IoT GPS pings)
  - `telemetry_source: "ROUTE_ESTIMATED"` (non-GPS partner trucks and subcontracted fleet dead-reckoned along road corridors)
- Even with simulation toggled off, all live AIS, ADS-B, and persistent Sumatra pilot partner manifests (Bulog, Pelindo, Pos Logistik) remain visible.
- Replaced the `#fleet-sim-toggle-btn` in `DashboardClient.tsx` with a multi-source filter and telemetry status indicator.

---

## 2. Issue 2: News Links Bouncing to Portal Homepages (Deep-Link Integrity)

### Empirical Finding
Clicking citation badges or headline links in the Berita sidebar, `EvidenceTab`, and `MitigationTab` frequently redirected users to the root homepage of news publishers (e.g., `https://sumut.antaranews.com/` or `https://www.kompas.com/`) instead of opening the specific investigative reporting article cited by the agents.

### Four Distinct Root Causes Identified & Resolved

#### Root Cause (a): Hardcoded Root Domains in Client Fallbacks
In `frontend/hooks/useNewsVerification.ts`, the static fallback list `FALLBACK_SUMATRA_NEWS` contained entries with truncated root URLs:
```typescript
url: "https://sumut.antaranews.com" // Missing /berita/2026/03/... permalink
url: "https://hargapangan.id"        // Root landing page
```
**Fix**: Updated all baseline entries in `FALLBACK_SUMATRA_NEWS` to point to canonical, verified article permalinks (`/berita/artikel-spesifik.htm`), and added an in-app **Article Excerpt Modal** for archive bulletins.

#### Root Cause (b): URL Field Dropped in `OSINTHazardAgent`
In `agents/nodes/osint_hazard.py`, when the agent synthesized news evidence into the structured `verified_citations` array, it extracted titles and confidence scores but omitted the URL and timestamp:
```python
# BROKEN:
verified_citations.append({
    "source": article.get("source"),
    "title": article.get("title"),
    "relevance": score,
})
```
Downstream UI components received `{ source: "ANTARA", title: "...", url: undefined }`, causing fallback link handlers to synthesize a generic homepage link.
**Fix**: Preserved explicit permalinks:
```python
verified_citations.append({
    "source": article.get("source"),
    "title": article.get("title"),
    "url": article.get("url") or article.get("link") or "",
    "published_at": article.get("published_at"),
    "relevance": score,
})
```

#### Root Cause (c): Google News RSS Opaque Tokens (`CBMi...`)
Google News RSS feeds return redirect URLs formatted as:
`https://news.google.com/rss/articles/CBMiWWh0dHBzOi8vd3d3LmFudGFyYW5ld3MuY29t...`
When a user clicks this link, Google runs a server-side JavaScript challenge and redirect. If the referrer is untrusted or if opened in certain embedded webviews, Google bounces the user to `news.google.com` or the publisher's root domain.
**Fix**: Implemented `resolve_canonical_article_url()` in `backend/app/services/news_aggregator.py`. At ingestion time, the backend base64-decodes the `CBMi` token (unpacking the embedded protobuf format) or sends a fast `HEAD`/`GET` probe with a standard browser `User-Agent` to extract the true canonical destination URL (`https://medan.tribunnews.com/...`) before storing it in Supabase/Redis.

#### Root Cause (d): Indonesian Publisher Referrer Blocking (Referer Headers)
Indonesian major media publishers (notably Kompas Cyber Media and Detikcom) deploy strict CDN security rules (Cloudflare / Imperva). When an external application links directly to an article with a foreign `Referer` header (such as `Referer: https://pre-hub.vercel.app`), the CDN detects cross-origin hotlinking and rewrites the location header to their home page.
**Fix**: Added `rel="noopener noreferrer"` AND `referrerPolicy="no-referrer"` to all external anchor tags (`<a target="_blank">`) across `DashboardClient.tsx`, `EvidenceTab.tsx`, and `MitigationTab.tsx`. Stripping the `Referer` header bypasses the CDN hotlink protection and allows seamless deep-linking directly to the article text.

---

## 3. Issue 3: Dynamic Village Pinpoints, Remote Routing & Map Clutter

### Empirical Finding
1. **Geographic Inflexibility**: The platform routing engine only accepted 25 predefined `HUB_NODES` as origins and destinations. Selecting any remote village (*desa*), sub-district (*kecamatan*), or rural estate (*perkebunan*) was impossible.
2. **Visual Clutter vs. Emptiness Dilemma**: Displaying hundreds of live vessels, aircraft, partner trucks, and settlement names simultaneously resulted in text overlapping and WebGL performance drops. Conversely, hiding them made the map feel static.

### Architectural Solution & Empirical Design

#### 3-Tier Zoom Level of Detail (LOD)
To balance context and clutter, we introduced a 3-tier hierarchy:
- **Tier 1 (Zoom $z < 7.5$) — Strategic Macro Corridor**:
  - Displays only the 25 primary strategic hubs (Belawan, Teluk Bayur, Bakauheni, Kualanamu, etc.).
  - Ships and planes render as lightweight directional dots (`circle-radius: 3.5px`). Callsigns hidden until hovered.
- **Tier 2 (Zoom $7.5 \le z < 11.5$) — Regency / District Tactical View**:
  - Displays 116 Sumatra Gazetteer nodes (`PAN_SUMATRA_GAZETTEER`), showing key Kabupaten capitals, Trans-Sumatra choke points (Sitinjau Lauik, Kelok 9, Tarutung), and major interchanges.
  - Vehicles render with high-DPI sprites and directional velocity vectors.
- **Tier 3 (Zoom $z \ge 11.5$) — Local Village & Micro-Settlement Detail**:
  - Activates interactive Mapbox vector settlement layers (`settlement-subdivision-label`, `settlement-minor-label`).
  - Users can click directly on any remote village to inspect demographics or set as routing Origin/Destination.

#### Screen-Space `SpatialHashArbiter` (32px Grid + 2500ms Hysteresis)
Ported from `bilawalsidhu/gods-eye-view`:
- Screen space is divided into a 32-pixel grid.
- Each cell is identified by a 31-bit Smi key: `(cx << 14) | cy`.
- Priority arbitration resolves collisions in $O(N)$ time:
  1. Priority 100: User-selected Origin / Destination pins & active crisis alerts (Never dropped).
  2. Priority 80: Primary Strategic Ports & Cargo Airports.
  3. Priority 60: Regency / District Gazetteer Nodes.
  4. Priority 40: Active Fleet Callsigns (Quota-capped per cell to prevent vehicle cluster overlap).
  5. Priority 20: Minor Village settlement labels.
- **Hysteresis**: An item granted visibility retains a 2500ms lock, preventing rapid on/off flickering during camera pans.

#### Arbitrary Coordinate Snapping in `cpu_routing_adapter.py`
To route to remote villages without adding thousands of rural dirt paths to the core mathematical solver:
1. When `/api/v1/routing/optimize` receives arbitrary `origin_coords` or `dest_coords` (`[lon, lat]`):
2. `cpu_routing_adapter.py` uses Haversine distance to find the nearest backbone junction node $N_{\text{snap}}$ in the deterministic road graph ($< 1\text{ms}$).
3. The core Dijkstra/2-Opt algorithm calculates the optimal detour path between backbone nodes, factoring in BMKG flood buffers and TomTom congestion multipliers.
4. The frontend connects the exact village coordinate to $N_{\text{snap}}$ via Mapbox Directions API, providing seamless first/last-mile navigation to any point in Sumatra.

---

## 4. Issue 4: Cross-Workstream Schema Alignment (Pydantic Rigor)

### Empirical Finding
During integration of the hybrid fleet router (`fleet_ingest_router.py`) and telemetry service (`telemetry_service.py`), dynamically added attributes on the `FleetVehicle` Pydantic model (`tracking_mode`, `origin_coords`, `dest_coords`, `departure_time`) caused subtle runtime serialization mismatches:
- FastAPI's `response_model=List[FleetVehicle]` stripped dynamically injected dictionary keys if they were not declared on the model class.
- When registering custom vehicles, lack of an explicit `vin` generated null reference warnings in the client WebGL symbol layer.

### Permanent Fix & Invariant
1. **Canonical Schema Declarations in `backend/app/schemas/fleet.py`**:
   Explicitly added first-class fields to `FleetVehicle`:
   ```python
   tracking_mode: Optional[str] = "ROUTE_ESTIMATED"
   origin_coords: Optional[List[float]] = None
   dest_coords: Optional[List[float]] = None
   departure_time: Optional[str] = None
   current_coords: Optional[List[float]] = None
   ```
2. **Deterministic VIN Generation**:
   In `fleet_ingest_router.py`, all custom vehicle registrations automatically generate a deterministic fallback VIN: `vin = payload.vin or f"VIN-CUSTOM-{vehicle_id}"`.
3. **Comprehensive Pytest Suite**:
   Created `backend/tests/test_cross_workstream_integration.py` to continuously verify:
   - Live AISStream buffer ingestion and macro bounding box filters.
   - `adsb.lol` 250nm aviation polling and schema mapping.
   - Hybrid `LIVE_GPS` vs `ROUTE_ESTIMATED` vehicle serialization.
   - Haversine coordinate snapping in `cpu_routing_adapter.py`.
   - Gazetteer and geocoding reverse lookup endpoints.
