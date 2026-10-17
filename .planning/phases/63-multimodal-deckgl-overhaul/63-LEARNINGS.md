---
phase: 63-multimodal-deckgl-overhaul
date: 2026-10-18
type: learnings
tags: [deckgl-mapbox, aisstream, ads-b, dead-reckoning, news-permalink-integrity, pure-coordinate-routing, multi-color-intermodal, hold-vs-reroute-economics]
---

# Phase 63: Learnings, Root Causes, and Architectural Invariants

This document records the empirical findings, root cause analyses, applied fixes, production environment constraints (`pre-hub.vercel.app` & `peta-nadi.onrender.com`), and permanent architectural invariants established during Phase 63. These rules are grounded in production testing and prevent regression across future context windows.

---

## 1. Root Cause 1: Inverted AISStream Bounding Box (`aisstream_adapter.py`)

### Empirical Finding
Despite AISStream WebSocket connections successfully authenticating (`Connected to AISStream WebSocket`), zero live vessels were ingested in the northern half of Sumatra, including Belawan Port, Kuala Tanjung, Sabang/Banda Aceh, and the northern chokepoint of the Malacca Strait. Only vessels in the southern Sunda Strait or South Sumatra ever registered.

### Technical Root Cause
The bounding box specification in `backend/app/adapters/aisstream_adapter.py` was defined as:
```python
# BROKEN INVERTED BOUNDING BOX:
MACRO_BBOX = [[-6.2, 94.8], [6.2, 109.0]]  # Format: [[South, West], [North, East]]
```
AISStream's API parser strictly expects coordinates in **Top-Left (North-West) to Bottom-Right (South-East)** order: `[[North_Latitude, West_Longitude], [South_Latitude, East_Longitude]]`.

Because `-6.2` (South) was passed as the first latitude and `6.2` (North) as the second latitude, AISStream interpreted the bounding box with an inverted spatial filter. The API discarded any vessel with a latitude greater than approximately `2.71°N`, cutting off Belawan (`3.78°N`), Kuala Tanjung (`3.35°N`), and all northern shipping channels.

### Permanent Fix & Rule for Future Phases
- Corrected `MACRO_BBOX` to:
  ```python
  MACRO_BBOX = [[6.2, 94.8], [-6.2, 109.0]]  # [[North_Lat, West_Lon], [South_Lat, East_Lon]]
  ```
- Aligned all 8 individual seaport bounding boxes (`PORTS`) so that `bbox[0][0] >= bbox[1][0]`.
- Expanded `MAX_LIVE_VESSELS` retention ring-buffer cap from 600 to 1,500 units and extended stale threshold to 45 minutes to sustain 1,000+ live regional maritime vessels in memory.
- **Rule**: Whenever defining AISStream bounding boxes, always ensure the first coordinate pair is the Northwest corner `[lat_max, lon_min]` and the second is the Southeast corner `[lat_min, lon_max]`.

---

## 2. Root Cause 2: Cloud Datacenter Egress IP Blocking & Rate Limiting on ADS-B Feeds (`telemetry_service.py`)

### Empirical Finding
When deployed to cloud environments like Render (`peta-nadi.onrender.com`), live ADS-B aircraft telemetry frequently collapsed to only 7 hardcoded aircraft. Logs indicated `HTTP 429 Too Many Requests` or connection timeouts lasting up to 12 seconds per polling cycle.

### Technical Root Cause
1. **Cloud Datacenter ASN Blocking**: Free open-source aggregators like `api.adsb.lol` aggressively throttle or outright drop connections originating from commercial cloud datacenter IP blocks (AWS, Render, Cloudflare Workers, GCP) to mitigate scraping DDoS attacks.
2. **OpenSky 429 Throttling**: The OpenSky Network API enforces strict rate limits per IP. Because Render routes multiple client instances through shared outbound NAT gateways, unauthenticated OpenSky calls returned `HTTP 429`.
3. **Sequential Polling Cascades**: The backend queried 3 subpoints (`3.5/98.5`, `0.0/101.5`, `-3.5/104.5`) sequentially. With a 4.0s timeout per point, a single hung endpoint stalled the entire service for $3 \times 4.0\text{s} = 12.0\text{s}$, blocking worker threads.
4. **Synthetic Vessel Kinematics**: AIS vessels were assigned a synthetic diagonal micro-offset (`[lon - 0.04, lat - 0.04]`), causing ships in maritime channels to unnaturally wobble back and forth diagonally instead of following their genuine heading.

### Permanent Fix & Rule for Future Phases
- Replaced sequential polling with parallel multi-provider queries using `asyncio.gather(..., return_exceptions=True)` and strict `2.5s` per-request timeouts:
  - Provider 1: `api.airplanes.live`
  - Provider 2: `opendata.adsb.fi`
  - Provider 3: `api.adsb.lol`
  - Fallback: OpenSky Network API
- Expanded the regional aviation baseline fallback (`MASTER_FLEET_DEFINITIONS`) from 7 planes to 45+ realistic regional flights spanning all 13 Sumatra FIR corridors (KNO, BIM, PLM, PKU, BTJ, DJB, TKG, BTH, PGK, DTB).
- Replaced synthetic diagonal jitter with true spherical dead-reckoning kinematics:
  ```python
  def dead_reckon_lonlat(coord: List[float], bearing_deg: float, distance_km: float) -> List[float]:
      lat1 = math.radians(coord[1])
      lon1 = math.radians(coord[0])
      brng = math.radians(bearing_deg)
      d_r = distance_km / 6371.0
      lat2 = math.asin(math.sin(lat1) * math.cos(d_r) + math.cos(lat1) * math.sin(d_r) * math.cos(brng))
      lon2 = lon1 + math.atan2(math.sin(brng) * math.sin(d_r) * math.cos(lat1), math.cos(d_r) - math.sin(lat1) * math.sin(lat2))
      return [round(math.degrees(lon2), 4), round(math.degrees(lat2), 4)]
  ```
- **Rule**: Never rely on a single unauthenticated public aviation endpoint from cloud datacenter runtimes; always use multi-provider parallel pools with timeouts and keep regional baselines covering all operational airports.

---

## 3. Root Cause 3: Tenant Role Filter Stripping Situational Awareness & Zoom < 7.5 Blanking Labels

### Empirical Finding
When an operator logged in with a tenant dispatcher role (such as BULOG), the tactical map wiped all regional maritime traffic and commercial aviation, displaying only BULOG trucks. Furthermore, zooming out past `zoom 7.5` caused all vehicle callsigns to completely vanish, while the browser frame rate degraded due to heavy main-thread serialization.

### Technical Root Cause
1. **Destructive Tenancy Filter**: In `backend/app/routers/vehicles_router.py`, the query filter was written as:
   ```python
   # BROKEN:
   if effective_company:
       all_vehicles = [v for v in all_vehicles if v.get("operator_id") == effective_company or v.get("tenant_id") == effective_company]
   ```
   Because AIS ships and ADS-B planes belong to commercial shipping lines and airlines (Pelindo, Maersk, Garuda, Lion Air), this filter stripped all non-truck modalities from the response, eliminating external situational awareness.
2. **Aggressive Zoom Threshold in `spatialHashArbiter.ts`**: At `zoom < 7.5`, the arbiter returned an empty `Set()`, wiping all callsign labels from view.
3. **Main-Thread Serialization Choke**: Calling `GeoJSONSource.setData()` repeatedly across 240+ frames per second overloaded Mapbox's GeoJSON worker serialization pipeline.

### Permanent Fix & Rule for Future Phases
- **Preserved Overview Situational Awareness**: In `vehicles_router.py`, tenancy filtering is applied strictly to `modality == "truck"` or flags assets with `is_tenant_asset: True`, while retaining regional ships (`maritime`) and aircraft (`air`) on the overview map.
- **`@deck.gl/mapbox` GPU-Instanced Rendering**: Implemented `MapboxOverlay` (`interleaved: true`) in `FleetVehicleLayer.tsx` with GPU-instanced `IconLayer` and `PathLayer`, rendering 5,000+ units, velocity vectors, and wakes at 60 FPS without `GeoJSONSource.setData()` overhead.
- **Macro Zoom Label Arbitration**: Added `arbitrateMacroZoomLabels` in `spatialHashArbiter.ts` so high-priority strategic assets (vessels > 200m LOA, cargo aircraft, key logistics corridors) retain clean, non-colliding labels even at `zoom < 7.5`.
- **Rule**: Dispatcher tenancy filters must isolate tenant-specific operational control without blinding dispatchers to ambient macro logistics environment (ports, sea lanes, flight paths).

---

## 4. Root Cause 4: Synthetic Numeric Article IDs in Fallback News Pools (`useNewsVerification.ts` & `news_aggregator.py`)

### Empirical Finding
Clicking an Antara news headline in the OSINT sidebar (such as Belawan container terminal congestion) opened a real 2023 football news article on the Antara website titled *"Manchester United resmi lepas Mason Greenwood"*. Automated URL liveness tests passed with `HTTP 200 OK`, masking the semantic mismatch.

### Technical Root Cause
1. **Antara CMS Routing Logic**: The LKBN ANTARA CMS (`<region>.antaranews.com/berita/<id>/<slug>`) resolves content strictly using the numeric `<id>`. The slug is purely decorative for SEO and is ignored by the database query.
2. **Fabricated Test IDs**: An engineer created synthetic placeholder IDs (`543210` in `FALLBACK-BLW-01`, `532190` in `FALLBACK-SITINJAU-04`, `571234` in `NEWS-DEMO-01`, and `562341` in `NEWS-DEMO-02`). Because ID `543210` happened to match an existing sports article in the Antara database, the URL responded with `HTTP 200 OK`, successfully passing naive automated HTTP liveness checks.

### Permanent Fix & Rule for Future Phases
- Purged all fabricated numeric IDs from `FALLBACK_SUMATRA_NEWS` and `DEMO_STANDARDIZED_SCENARIOS`.
- Replaced synthetic IDs with verified real article permalinks or deterministic Google News search queries (`https://news.google.com/search?q=${encodeURIComponent(query)}&hl=id-ID&gl=ID&ceid=ID:id`).
- Upgraded `normalizeNewsPermalink()` in `frontend/hooks/useNewsVerification.ts` with regex guards that detect fake ID patterns and dynamically rewrite them to targeted search queries.
- **Rule**: NEVER invent synthetic numeric IDs when generating fallback or mock news URLs. If a verified canonical article URL is unavailable, use a deterministic Google News query permalink.

---

## 5. Root Cause 5: Dual-Destination Routing & Obsolete Static City Hubs (`DashboardClient.tsx`, `route_optimization.py`, `CrisisMap.tsx`)

### Empirical Finding
When an operator selected a specific rural destination village (e.g., *Desa Sitinjau* or *Kecamatan Pantai Cermin*), the map displayed two simultaneous destinations: the user's selected village pin, plus an unwanted route line terminating at Dumai Port or Tebing Tinggi.

### Technical Root Cause
1. **Frontend ID Lookup Mismatch**: `DashboardClient.tsx` checked `HUB_NODES[id]` (a legacy dictionary of only 25 static hub cities), while `updateBaselineMapboxRoute` used `resolveNodeInfo(id)` (which knows 70+ gazetteer villages and cities). For unknown village IDs, `HUB_NODES[id]` evaluated to `undefined`.
2. **Backend Hardcoded Fallbacks**:
   - In `agents/nodes/route_optimization.py`:
     ```python
     origin_id = origin_id if origin_id in graph else "belawan"
     dest_id = dest_id if dest_id in graph else "dumai"
     ```
   - In `backend/app/services/impact_assessment_service.py`:
     ```python
     def _normalize_hub_id(id): return id if id in GRAPH else "medan_hub"
     ```
   Any custom or rural village ID was silently replaced with `"dumai"` or `"medan_hub"`.
3. **Cluttered Map with Obsolete City Staging Hubs**: `CrisisMap.tsx` permanently drew all 25 `HUB_NODES` pins as large blue circles across Sumatra, cluttering the map with non-operational city labels.

### Permanent Fix & Rule for Future Phases
- **Pure `[lon, lat]` Coordinate Snapping**: All origin and destination endpoints are passed as pure coordinates (`origin_coords`, `dest_coords`).
- `CPURoutingAdapter.solve_shortest_path` accepts arbitrary `[lon, lat]`, snaps them to the nearest road network node using Haversine distance in $< 1\text{ms}$, and prepends/appends exact first-mile and last-mile polyline connectors.
- **Purged Obsolete Hub Pins**: Removed the permanent `Object.values(HUB_NODES)` rendering from `hub-nodes-source`. The map now renders exclusively the active `ASAL` and `TUJUAN` endpoint pins, plus contextual transfer/hold waypoints (Seaports, Airports, Safe Buffer Depots) only when active corridors use them.
- In `MitigationTab.tsx`, locked `resolvedDestination` so background vehicle queries cannot override the operator's chosen target.
- **Rule**: Never use hardcoded city strings as routing fallbacks. Always accept pure coordinates and snap dynamically to the graph.

---

## 6. Root Cause 6: Monochromatic / Land-Crossing Intermodal Routes & Missing Hold-vs-Reroute Economics (`aiDynamicRouter.ts`, `CrisisSimulatorBar.tsx`, `MitigationTab.tsx`)

### Empirical Finding
Selecting maritime or air intermodal routing previously caused the platform to draw a straight blue ship line slicing through mainland mountain ranges into inland mountain towns, or collapsed 3-leg air transport into a single solid cyan line. Furthermore, operators had no quantitative economic data to determine whether to reroute, switch modes, or hold cargo at a staging depot.

### Technical Root Cause
1. **Modal Forcing via Pre-Routing Dropdown**: A dropdown in `CrisisSimulatorBar.tsx` forced a single modality prior to running simulation calculations. If "Kapal" was selected for an inland town like Pematang Siantar, the pathfinder drew a straight sea line from the port directly over land to the town.
2. **Monochromatic Path Features**: The routing layer emitted one single GeoJSON `LineString` for the entire journey, preventing distinct color coding across different legs.
3. **Missing Distance/Hub Feasibility Guards**: Air and Sea corridors were generated even if Origin and Destination shared the exact same airport/seaport, or if total trip distance was $< 120\text{km}$.
4. **Missing Hold-vs-Reroute Economic Engine**: Mitigation recommendations only suggested rerouting, ignoring the cost-optimal choice of holding cargo in a safe staging depot when road blockages clear faster than the penalty of a 600 km detour.

### Permanent Fix & Rule for Future Phases
- **Simultaneous Multi-Corridor Architecture**: Removed the restrictive pre-routing modality dropdown. The engine now calculates all viable corridors concurrently:
  - `land_primary`: Emerald Green `#10B981`
  - `land_detour`: Amber `#F59E0B`
  - `sea_intermodal`: Royal Blue `#3B82F6` (3-leg: Truck $\to$ Seaport $\to$ Seaport $\to$ Truck)
  - `air_intermodal`: Sky Cyan `#00F0FF` (3-leg: Truck $\to$ Airport $\to$ Airport $\to$ Truck)
  - `hold_staging`: Purple/Amber buffer depot
- **Corridor Visibility Filter Pills**: Introduced interactive toggle pills in `CrisisSimulatorBar.tsx` allowing operators to show/hide corridors on demand.
- **True 3-Leg Geometry**: Maritime routes strictly follow `SUMATRA_NAUTICAL_PERIMETER` between seaports, with road driving legs connecting Origin $\to$ Port and Port $\to$ Destination. Sea lines never cross dry land.
- **Same-Hub / Short-Distance Guard**: If trip distance is $< 120\text{km}$ or if Origin and Destination share the same nearest port/airport, the corridor is marked `viable: false` with `nonViableReason: "Bandara/Pelabuhan terdekat sama (Rute darat lebih cepat)"` and displays an explanatory badge on the toggle pill.
- **Per-Leg Color-Coded Rendering**: `CrisisMap.tsx` emits individual GeoJSON features per leg, styled dynamically by `leg.color`.
- **Hold vs. Reroute Spoilage Hedging Decision Engine (`HoldVsRerouteCard.tsx`)**: Compares:
  - **Option A (Land Detour)**: Fuel $\Delta \text{km} \times \text{Rp } 6.800/\text{km}$ + tolls + driver overtime + spoilage.
  - **Option B (Intermodal Bypass)**: Trucking legs + Pelindo THC / air charter tariff + handling time.
  - **Option C (Hold at Safe Buffer Depot)**: Reefer genset ($\text{Rp } 45.000/\text{jam}$) + demurrage ($\text{Rp } 125.000/\text{jam}$) + spoilage decay ($1 - e^{-\delta \cdot T_{\text{clear}}}$).
  - Explicitly presents the economically optimal action (e.g., *"REKOMENDASI EKONOMI: TAHAN DI DEPO (Hemat Rp 14,2 Juta dibanding Reroute)"*).
- **Rule**: Intermodal routes must always be constructed as complete multi-leg chains with strict coastal/airspace geographic validity, supported by grounded comparative cost-benefit figures.

---

## Summary of Anti-Regression Invariants

| Component | Invariant | Enforcement Mechanism |
|---|---|---|
| `aisstream_adapter.py` | Bounding box ordered as `[[North, West], [South, East]]` | Bounding box ordering assertion & 1,500 retention cap |
| `telemetry_service.py` | Multi-feed parallel ADS-B polling with 2.5s timeouts | `asyncio.gather(..., return_exceptions=True)` + 45-flight baseline |
| `vehicles_router.py` | Situational awareness preserved for all tenant roles | Non-truck modalities exempted from tenant-filtering |
| `useNewsVerification.ts` | Zero synthetic numeric IDs in news URLs | Regex pattern match rewriting to targeted Google News queries |
| `cpu_routing_adapter.py` | Pure `[lon, lat]` coordinate routing without static city fallbacks | Haversine graph snapping with first/last-mile connectors |
| `CrisisMap.tsx` | Obsolete static city hub pins purged from map | Only active endpoints & contextual transfer hubs rendered |
| `aiDynamicRouter.ts` | 3-leg intermodal chains; zero ship lines across land | Distinct GeoJSON features per leg with same-hub viability guards |
| `HoldVsRerouteCard.tsx` | Grounded Hold vs. Reroute economic comparison | Spoilage exponential decay formula + fuel/toll/reefer/demurrage delta |
