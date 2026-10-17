---
phase: 62-live-telemetry-spatial-hash-village-routing
date: 2026-10-18
type: context
tags: [telemetry, live-ais, ads-b, hybrid-gps, dead-reckoning, spatial-hash, village-routing, news-links]
---

# Phase 62 Context: Production Telemetry, Anti-Clutter Spatial Hash & Universal Village Routing

## 1. Production Environment Context

The PreHub Logistics Resilience Intelligence Platform operates across a distributed cloud topology:
- **Frontend**: Next.js 14 App Router deployed on Vercel Edge (`https://pre-hub.vercel.app`).
- **Backend**: FastAPI service deployed on Render (`https://peta-nadi.onrender.com`).
- **Spatial / Real-Time Data Plane**:
  - Live Maritime AIS via `aisstream.io` WebSocket stream.
  - Live Aviation transponders via `adsb.lol` REST API with OpenSky Network fallback.
  - Live Hydro-Meteorological alerts from BMKG Radar and Open-Meteo NWP spatial fusion.
  - Live Trans-Sumatra Highway traffic congestion from TomTom Traffic Flow API.
  - Verified Regional News feeds from LKBN ANTARA, BMKG, and Google News RSS.
  - Supabase PostGIS spatial database for persistent road networks, LTM episodic memories, and gazetteer entries.

Phase 62 directly addresses the operational gaps observed by Sumatra logistics dispatchers (Pelindo Regional 1 Belawan, Perum BULOG Kanwil Sumut, PT Pos Logistik Indonesia) during live testing of the platform.

---

## 2. Business & Pilot Operator Constraints

### 2.1 The Failure of "Mode Simulasi" Opt-In Blanking
In Phase 56 and 59, an opt-in toggle named `Mode Simulasi` was introduced to prevent confusion between live vehicles and synthetic demo data. However, the initial client-side filtering implementation in `frontend/hooks/useFleetVehicles.ts` was overly aggressive: when `isSimulationMode === false`, it filtered out **all** vehicles except locally added custom vehicles (`customVehicles = []`), while `FleetVehicleLayer.tsx` simultaneously purged all active Mapbox WebGL sources via `clearFleetSources()`.

**Pilot UX Impact**: First-time dispatchers and evaluators loading `pre-hub.vercel.app` were greeted with an empty, desolate map with 0 ships, 0 planes, and 0 trucks until they manually discovered and enabled the simulation toggle. This violated the core value proposition of PreHub as a real-time operational dashboard.
**Resolution**: Eliminate the artificial blanking gate. Telemetry is now strictly categorized into live authenticated external feeds (`AIS_LIVE`, `ADSB_LIVE`, `GPS_LIVE`) and verified pilot partner manifests (`PARTNER_BULOG`, `PARTNER_PELINDO`, `PARTNER_POS`), ensuring an active, vibrant operational picture without misleading claims.

### 2.2 The Reality of Indonesian 3PL Logistics: Hybrid `LIVE_GPS` vs `ROUTE_ESTIMATED`
In the Indonesian logistics sector (especially outside Java on Trans-Sumatra corridors):
- **Tier-1 Logistics Operators** (e.g., Pelindo, Pertamina Patra Niaga, large enterprise carriers) equip their prime movers with calibrated IoT GPS hardware that push telematics every 10–60 seconds via TMS REST webhooks (`POST /api/v1/fleet/telemetry/ping`).
- **Tier-2 / Tier-3 Subcontracted Fleets** (representing >65% of breakbulk, agricultural, and seasonal staple food transport across Sumatra) operate older commercial trucks without active GPS telematics hardware. Dispatchers manage these vehicles via WhatsApp dispatch sheets containing:
  1. Origin depot (e.g., Gudang Bulog Medan)
  2. Destination depot (e.g., Kantor Cabang Pos Padang Sidempuan)
  3. Departure timestamp ($t_{\text{dep}}$)
  4. Assigned driver & vehicle plate (e.g., BK 8920 XT)
  5. Manifest cargo profile (e.g., 14.5 Ton Beras Medium SPHP)

**Constraint**: Requiring every registered truck to possess an active GPS webhook excluded 65% of pilot operations.
**Resolution**: PreHub introduced **Hybrid Dispatcher Onboarding**:
- `LIVE_GPS`: Real-time coordinate updates via API/webhook, badged with `GPS LIVE`.
- `ROUTE_ESTIMATED`: For non-GPS vehicles, the backend dynamically calculates the real road corridor geometry via Mapbox/OSM, computes elapsed travel time $(t_{\text{now}} - t_{\text{dep}})$, and dead-reckons the vehicle along the road path. Crucially, this progress calculation is **hazard-aware**: if the assigned corridor traverses an active BMKG flood or landslide hazard polygon, or a TomTom congested segment, effective vehicle velocity is dynamically penalized, providing dispatchers with an honest, physics-grounded ETA rather than an idealized straight-line assumption.

### 2.3 Shared Cloud IP Rate Limits on Aviation APIs (OpenSky vs. `adsb.lol`)
PreHub's backend runs on Render's shared cloud infrastructure (`peta-nadi.onrender.com`). The OpenSky Network REST API (`https://opensky-network.org/api/states/all`) imposes strict anonymous rate limits (100 requests per day per IP). Because multiple Render tenant containers share egress IP addresses, PreHub frequently encountered `HTTP 429 Too Many Requests`.

**Resolution**: Migrate the primary aviation telemetry pipeline to `adsb.lol` (`https://api.adsb.lol/v2/point/{lat}/{lon}/{radius}`), which is unauthenticated, community-supported, and does not enforce shared-IP IP bans. The spatial query was segmented into three 250nm circular subpoints covering the entirety of Sumatra:
- Central Sumatra: `0.0 / 101.5 / 250nm`
- North Sumatra & Aceh: `3.5 / 98.5 / 250nm`
- South Sumatra & Sunda Strait: `-3.5 / 104.5 / 250nm`
Responses are cached in an in-memory 30-second TTL dictionary with OpenSky retained strictly as an authenticated fallback.

### 2.4 AISStream WebSocket Scope & Regional Sea-Lane Fallback
Previously, `aisstream_adapter.py` subscribed only to small bounding boxes tightly circumscribing 8 major commercial ports (Belawan, Bakauheni, Dumai, Teluk Bayur, Panjang, Sibolga, Kuala Tanjung, Batam). Consequently, the open sea lanes of the Malacca Strait, Karimata Strait, and Indian Ocean coastal waters showed zero vessels, giving a false impression that maritime traffic was dormant.

**Resolution**:
1. Subscribe to a macro-regional bounding box spanning Pan-Sumatra and the Malacca Strait (`[[-6.2, 94.8], [6.2, 109.0]]`).
2. Maintain a thread-safe ring buffer (`MAX_LIVE_VESSELS = 600`) keyed by `mmsi` with an automatic heartbeat watchdog that triggers WebSocket reconnection if no messages arrive for >45 seconds.
3. Provide an empirical 88-vessel fallback representing verified commercial shipping corridors (ALKI I, Belawan container feeder lane, Dumai-Singapore tanker corridor, Bakauheni-Merak ro-ro ferry line) to ensure zero UI blackout during upstream AISStream server restarts.

---

## 3. Reference Repository Analysis: `Vector897/Globot` vs `bilawalsidhu/gods-eye-view`

During the architectural investigation, two state-of-the-art multi-modal spatial dashboards were evaluated:

### 3.1 `Vector897/Globot`
- **What it does**: Visualizes global maritime, aviation, and railway routes across the world using pre-rendered Mapbox vector tiles and static JSON route files.
- **Architectural Decision**: **REJECT dumping Globot's global static data**.
- **Rationale**: Globot relies on static synthetic global flight routes and global AIS shipping lines that have no empirical connection to live Indonesian logistics. Dumping megabytes of static world-wide JSON into PreHub would regress our Phase 56 mock purge, violate our ground-truth integrity invariants, and inflate client bundle size without aiding Sumatra dispatchers.

### 3.2 `bilawalsidhu/gods-eye-view`
- **What it does**: A lightweight WebGL spatial operating system with real-time AIS, ADS-B, and road telematics, featuring custom screen-space label arbiters and kinematic dead-reckoning.
- **Architectural Decision**: **PORT 2 core algorithmic patterns**:
  1. **60 FPS Client-Side Dead-Reckoning (`motionModel`)**:
     Rather than jumping vehicles abruptly every 15–30 seconds when an API poll completes, extrapolate each vehicle's `[lon, lat]` continuously along its velocity vector (`speed_kmh` and `bearing`/`track`) at 60 FPS using `requestAnimationFrame`. For trucks, clamp the movement to the underlying road polyline; for vessels and aircraft, advance along their course-over-ground.
  2. **Screen-Space 32px Bit-Packed Smi `SpatialHash` Label Arbiter (`labelArbiter`)**:
     When streaming hundreds of ships, aircraft, trucks, strategic ports, and village nodes, standard Mapbox symbol collision resolution either hides critical assets unpredictably or produces unreadable text collisions. By porting a 32-pixel cell spatial hash with 31-bit small integer (Smi) bit-packing `(cx << 14) | cy` and a 2500ms hysteresis timer, PreHub guarantees:
     - Strict hierarchy-based label visibility (Selected Pin > Port/Airport Hub > Regency/District > Fleet Callsign > Remote Village).
     - Fair-share quota capping per cell (preventing a fleet clump from occluding regional hub markers).
     - Zero flicker during map panning and zooming.

---

## 4. Village-Level Routing & Search Requirements

Prior to Phase 62, routing was restricted to 25 predefined `HUB_NODES` (major ports, airports, and provincial capital logistics centers). If a dispatcher needed to reroute a 10-ton food convoy to a flood-affected rural distribution center (e.g., *Desa Pantai Cermin Kanan*, *Kecamatan Pangkalan Susu*, or *Nagari Koto Gadang*), the system had no way to snap to the destination or evaluate last-mile road conditions.

Phase 62 establishes a **Universal Village Routing Pipeline**:
1. **Gazetteer + OSM Nominatim Geocoding**: Backend `/api/v1/geocode/search` queries the local 116-node Sumatra gazetteer, falls back to Redis cache, and queries OpenStreetMap Nominatim strictly bounded to the Sumatra bounding box (`viewbox=95.0,6.0,109.0,-6.2`).
2. **Haversine Graph Snapping**: In `cpu_routing_adapter.py`, arbitrary village coordinates are projected via Haversine distance onto the nearest node in the deterministic road backbone graph.
3. **Hybrid Geometry Stitching**: The high-capacity backbone corridor is computed using Dijkstra/2-Opt on the hazard-weighted graph, and Mapbox Directions API connects the first/last-mile segments directly from the village pin to the highway junction.
