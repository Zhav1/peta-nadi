# PreHub Architecture Documentation

**Version:** 2.1 (Post-Phase 181 — VPS deployment & per-section snapshot freshness guard)  
**Status:** Living Canonical Architecture Document  
**Canonical Scope:** Mainland Sumatra Logistics Corridors (Aceh through Lampung)  

---

## 1. Architectural Invariants & Scope

PreHub is a **Live Pilot Operations Product** designed for Sumatra logistics partners (Pelindo Belawan, BKHIT agricultural quarantine, BPJT toll network, and PIHPS food commodity markets), not an artificial synthetic demo.

The architecture enforces five strict invariant principles:
1. **Deterministic CPU Routing Solver:** Routing optimization uses a deterministic CPU routing adapter (`NetworkX + Google OR-Tools / 2-Opt`) in `backend/app/adapters/cpu_routing_adapter.py`. Theoretical GPU solvers (such as cuOpt) are deprecated and purged.
2. **Empirical Weather & Spatial Sensor Fusion:** Real-time atmospheric hazards are produced via spatial fusion of official BMKG Radar/CAP alerts and Open-Meteo numerical weather prediction (NWP) in `backend/app/services/weather_fusion_service.py` and `observed_disaster_service.py`.
3. **Conservative Hazard Evidence Contract (`hazard-evidence-v1`):** Completely eliminates hallucinatory circular buffer expansions. Enforces a strict distinction between confirmed physical road blockages (`CONFIRMED_BLOCKAGE`), atmospheric advisories (`PRECAUTIONARY_RISK`), and unverified data (`UNKNOWN`).
4. **Distributed Fenced Single-Writer Leases:** Concurrency across distributed publisher instances (the VPS backend process and the Render `peta-nadi` read-only standby) is governed by PostgreSQL-backed monotonic fencing leases (`private.refresh_leases`), ensuring single-writer consistency. Only the VPS owns the tick; the Render standby must not drive ingestion.
5. **Fail-Closed Pilot Shadow Safety:** When operating in research pilot shadow mode (`pilot_shadow_mode = True`), route preview actions return non-mutating preview payloads with zero side effects on production operational tables (`route_approvals`, `travels`).

---

## 2. System Architecture Diagram

Production topology: the **backend runs on a Hostinger VPS** (`177.202.246.251`, Ubuntu 24.04, 2 vCPU, deploy dir `/opt/prehub`); the **frontend stays on Vercel**; **Supabase** (AWS `ap-southeast-1`, Singapore) holds the Postgres state. The backend is no longer hosted on Render — the Render `peta-nadi` service remains only as a read-only standby and must not own the tick.

```
+---------------------------------------------------------------------------------------------------+
|                        FRONTEND — Vercel (https://pre-hub.vercel.app)                              |
|                        Next.js 14 App Router                                                      |
|                                                                                                   |
|   +--------------------------+    +--------------------------------+    +---------------------+   |
|   | DashboardClient / Map    |    | CrisisMap (Mapbox GL JS v3)    |    | FleetVehicleLayer   |   |
|   | - SWR Snapshot Consumer  |    | - route-paths-line (Solid)     |    | - 5,000+ units @60fps|  |
|   | - Dynamic Modality Tabs  |    | - route-paths-alternative      |    | - AIR-001..AIR-005  |   |
|   | - Shadow Pilot Banners   |    |   (Dashed Cyan / Amber Detour) |    |   Air Corridors     |   |
|   | - Google Maps Crisis Card|    | - Mapbox Vector Traffic v1     |    | - Pelindo AIS Ships |   |
|   +--------------------------+    +--------------------------------+    +---------------------+   |
+-------------------------------------------------+-------------------------------------------------+
                                                  |
        HTTPS GET /api/public/dashboard (Next.js route handler on Vercel)
        Cache-Control: public, s-maxage=15, stale-while-revalidate=45 when fresh;
        honest stale/degraded answers get their own shorter TTLs
        In-Flight Promise Coalescing (inflightPromise)
                                                  |
                                                  v
+---------------------------------------------------------------------------------------------------+
|        BACKEND — Hostinger VPS 177.202.246.251 (Ubuntu 24.04, deploy dir /opt/prehub)              |
|                                                                                                   |
|   Caddy (:80/:443) terminates TLS for api.177-202-246-251.nip.io (Let's Encrypt via                |
|   {$API_DOMAIN}; nip.io resolves the hostname to the VPS IP until a real domain is set).           |
|   reverse_proxy -> backend:8000, published on 127.0.0.1 only                                       |
|                                                                                                   |
|   +------------------------------------+    +------------------------------------+                |
|   | backend (exactly ONE uvicorn worker)|   | scheduler (curl sidecar)            |                |
|   | image: ghcr.io/zhav1/peta-nadi/     |   | POST /internal/tick every 300 s     |                |
|   | backend:<git sha>                   |   | (X-Internal-Token; 202 -> sleep)    |                |
|   | - AIS WebSocket + validated-alert   |   | - tick_max_jobs = 6                 |                |
|   |   fan-out consumer start per        |   | - tick_budget_seconds = 200         |                |
|   |   process (NOT gated on             |   |   (below the 240 s lease TTL)       |                |
|   |   POLLERS_ENABLED;                  |   +------------------------------------+                |
|   |   INPROCESS_BATCH_POLLERS = false)  |                                                         |
|   +------------------------------------+                                                         |
|                                                                                                   |
|   Multi-Source Disaster Detection / Hybrid Road Congestion / CPU Routing Adapter                  |
|   (unchanged — described in sections 5–6)                                                          |
|                                                                                                   |
|   redis: redis:7-alpine, reachable only on the compose network, --appendonly yes                    |
+-------------------------------------------------+-------------------------------------------------+
                                                  |
            Supabase (AWS ap-southeast-1, Singapore): Postgres + PostGIS
            - public.public_dashboard_snapshots (singleton sumatra_mainland)
            - private.public_snapshot_sections (per-section durable store)
            - private.refresh_leases (fenced) / private.provider_budget_counters (atomic quotas)
                                                  |
            publish_public_dashboard_snapshot() — fenced, per-section evidence-freshness guard
+---------------------------------------------------------------------------------------------------+
```

### Deployment pipeline (CI/CD)

`.github/workflows/deploy.yml` on push to `main`:

1. **Hermetic test gate** (backend tests that need no Redis, Supabase or live provider network) plus the frontend build.
2. **Build & push** the backend image to GHCR (`ghcr.io/zhav1/peta-nadi/backend`, public).
3. **SSH to the VPS**: `git pull --ff-only` (never force/reset), `docker compose pull backend scheduler`, `up -d --no-deps backend scheduler`.
4. **Health gate**: poll the health URL up to 90 s; on failure the workflow re-ups the previous SHA recorded in `.deployed_sha` (automatic rollback).
5. A **non-blocking `integration` job** runs the full backend suite; its known failures are tracked in `docs/TEST_DEBT.md`.

Migrations are applied **manually** — the pipeline never runs `supabase db push` or any migration. Recently applied: `20261107210000_phase179_versioned_snapshot_realtime.sql` (versioned snapshots + `ingest_runs` audit table), `20261110120000_phase180_section_freshness_guard.sql` (per-section evidence freshness guard), `20261110130000_phase181_section_guard_degraded.sql` (the guard also persists `degraded` sections).

cron-job.org and `.github/workflows/keep-alive.yml` are legacy; ingestion is driven solely by the compose `scheduler` sidecar.

---

## 3. Sub-2000ms Multi-User Hydration (SWR & Single-Flight Coalescing)

To ensure sub-2000ms hydration for concurrent users, PreHub employs a three-tier Stale-While-Revalidate (SWR) and request coalescing pattern. The frontend runs on Vercel while the backend is a single uvicorn worker on the VPS, so hot anonymous traffic is absorbed by the edge handler plus the database snapshot singleton instead of per-user backend work:

1. **Next.js Route Handler (`frontend/app/api/public/dashboard/route.ts`) on Vercel:**
   - Serves cached responses with per-state `Cache-Control`: `public, s-maxage=15, stale-while-revalidate=45` when fresh, `public, s-maxage=30, stale-while-revalidate=120` when honestly `stale`, and shorter TTLs for `degraded` and unknown answers.
   - Implements promise-level in-flight deduplication (`inflightPromise`). Concurrent invocations await the exact same promise rather than issuing separate backend or database fetches.
   - Enforces a 6-second timeout guard (`SNAPSHOT_TIMEOUT_MS = 6000`) on the Supabase snapshot read and a 2.5-second guard (`BACKEND_FALLBACK_TIMEOUT_MS = 2500`) on the backend bootstrap fallback, falling back to `lastKnownGoodResult` (re-marked stale) or an honest degraded envelope if both stall.
2. **FastAPI In-Flight Task Coalescing (`_INFLIGHT_REFRESH` & `_INFLIGHT`):**
   - In `backend/app/routers/dashboard_bootstrap.py` and `backend/app/routers/routing_router.py`, background revalidation tasks are tracked by corridor in memory.
   - If multiple requests trigger revalidation while a build task is running, they share the single in-flight task without spinning up redundant background workers.
3. **Database Snapshot Singleton (`public.public_dashboard_snapshots`):**
   - Curated `sumatra_mainland` row contains 12 verified sections covering all 8 mainland provinces.
   - Decoupled completely from user authorization; anonymous and authenticated visitors read the identical projection at high speed without executing live database joins or external API queries.

### Per-Section Evidence-Freshness Contract (Phase 180/181)

Snapshot publishing (`publish_public_dashboard_snapshot()`, migrations `20261110120000_phase180` and `20261110130000_phase181`) enforces a per-section freshness guard on top of the lease fence:

- **Evidence stamp:** a section's stamp is `observed_at`, else `valid_until`. `computed_at` is deliberately NOT part of the comparison — it says when the payload was assembled, not how old the evidence inside it is.
- **Fresher evidence only:** an incoming section replaces the stored row only when its evidence stamp is `>=` the stored row's (ties are accepted so a status transition such as `ok -> stale` can still publish). A section may therefore only ever be replaced by fresher or equally-fresh evidence — an older observation can never overwrite a newer one, even across publishers with different `computed_at` (the Phase 180 defect: a worker holding 43-minute-old traffic evidence overwrote a 2-minute-old row).
- **Stamp-less sections:** a section with no evidence stamp may only replace a stored row that also has none, or one whose `valid_until` has already lapsed — so it neither silently wins over live evidence nor is frozen out forever.
- **Honest degradation:** `degraded` and `stale` are published as-is, never rewritten to `ok`. Phase 181 extends the guard to persist degraded-but-fresh observations under the same rule (e.g. a TomTom tick with 19/20 checkpoint coverage stores `degraded` with its error, instead of being dropped and leaving the section `stale` forever).
- **Lease fence unchanged:** `p_lease_name` / `p_owner_id` / `p_fence` / expiry behave exactly as before; the guard only constrains the per-section upsert.

---

## 4. Alternative Route Painting & Viable Detour Visibility

In earlier iterations, alternative detour corridors could disappear or collapse into the primary route due to overly aggressive deduplication or strict unverified hazard checks. Phase 178 restored full visibility and interactive functionality:

1. **Route Provenance & Coordinates Fallback (`frontend/lib/routeProvenance.ts`):**
   - `geometryKey` calculates unique spatial signatures by checking `route.waypoints` first and falling back to `route.coordinates`.
   - Incorporates corridor tags (`detour` vs `primary`) and route identifiers, preventing legitimate alternative routes from being erroneously dropped by `dedupeRoutesByGeometry`.
2. **Viable Detour Assessment (`frontend/lib/aiDynamicRouter.ts`):**
   - Detour routes (`is_detour`, `corridor_type === 'land_detour'`, `sea_intermodal`, `air_intermodal`) that avoid confirmed blockages are marked `viable = true` and `safety_status = 'SAFE_REROUTE'` even when ambient hazard evidence is classified as precautionary or partial.
3. **Mapbox Alternative Route Layer (`frontend/components/map/CrisisMap.tsx`):**
   - `route-paths-alternative` layer renders all inactive alternative corridors with high-contrast styling:
     - Color: Amber (`#f59e0b`) for precautionary/hold routes; sky cyan (`#38bdf8`) for viable reroutes.
     - Dash pattern: `line-dasharray: [2, 2]`.
     - Width and opacity: `line-width: 4`, `line-opacity: 0.85`.
   - Hit target layer (`route-paths-hit` with 18px width) enables instant click-selection anywhere along the polyline.

---

## 5. Multi-Source Sumatra Disaster Detection

Disaster monitoring in Sumatra integrates five authoritative streams coordinated in `backend/app/services/observed_disaster_service.py`:

| Source | Ingestion Format | Processing & Validation | Geographic Scope |
|---|---|---|---|
| **BMKG CAP** | XML Common Alerting Protocol | Parses official warning polygons directly; rejects synthetic circle generation. | Sumatra mainland provinces |
| **GDACS** | GeoJSON Search API | Ingests active flood, earthquake, and tropical cyclone alerts; parses alert score. | Indonesia (`country=IDN`) |
| **Open-Meteo GloFAS** | Flood API / Hydrological Model | Evaluates river basin discharge; provides verified Northern Sumatra flood baselines. | Northern Sumatra river basins |
| **PetaBencana** | GeoJSON Reports API | Crowdsourced flood reports restricted to mainland ISO 3166-2 codes (`ID-AC` through `ID-LA`). | Mainland Sumatra |
| **BNPB** | CKAN API (data.bnpb.go.id) | Historical and regional disaster aggregate statistics paged via datastore. | Sumatra regencies |

### Empirical Severity Radii Calculation:
Physical impact radii are computed deterministically by `calculate_disaster_radius_km`:
- **Earthquakes:** $R = 2^{(M - 4.0)} \times 10.0\text{ km}$ (clamped between 10 km and 120 km).
- **Floods:** Critical floods scale to 30–35 km; high severity to 20–25 km; medium severity to 15–20 km.
- **Wildfires:** 15–25 km depending on fire radiative power (FRP) and hot spots.
- Geometry is rendered as a 32-point closed polygon via `generate_circle_polygon(lat, lon, radius_km)`.

---

## 6. Hybrid Road Congestion Engine

PreHub combines commercial telematics with vector traffic tiles to deliver live congestion awareness without exceeding free-tier rate limits:

1. **TomTom Trans-Sumatra Corridors (`backend/app/adapters/tomtom_adapter.py`):**
   - Tracks 12 primary corridors (Belawan, Medan, Binjai, Tebing Tinggi, Pematangsiantar, Pekanbaru, Dumai, Padang, Bukittinggi, Palembang, etc.).
   - Protected by a 10-minute cache guard (`FETCH_CACHE_TTL_SECONDS = 600.0`, $\le 150$ calls/day).
   - Falls back to empirical peak/off-peak Sumatra corridor baseline speeds when live API calls are rate-limited or disabled.
2. **Mapbox Vector Traffic Layer (`frontend/components/map/CrisisMap.tsx`):**
   - Ingests `mapbox://mapbox.mapbox-traffic-v1` vector tiles directly on the client canvas, visualizing live arterial congestion with native WebGL performance.
3. **Routing Cost Modulation (`backend/app/adapters/cpu_routing_adapter.py`):**
   - Checks edge proximity to TomTom congestion points (haversine distance $\le 15\text{ km}$).
   - Applies dynamic edge travel time penalties: $1.5\times$ for moderate congestion ($\ge 0.30$ ratio) and $2.5\times$ for heavy congestion ($\ge 0.60$ ratio).

---

## 7. Aviation & Maritime Telemetry Corridors

To provide a unified God's-Eye operational view across multimodal fleets:

1. **Aviation Corridors (`backend/app/services/telemetry_service.py`):**
   - Scheduled cargo flights (`AIR-001` through `AIR-005` connecting KNO, PDG, PKU, PLM, and BTH) are classified with `telemetry_source = "SUMATRA_AIR_CORRIDOR"`, `signal_status = "LIVE_STREAM"`, and `tracking_mode = "LIVE_GPS"`.
   - Backed by durable cache storage (`lrip:state:aircraft_telemetry:v1` in Redis and PostgREST) with 900-second TTL.
   - Populates complete flight waypoints along surveyed flight paths.
2. **Frontend Movement Engine (`frontend/components/map/FleetVehicleLayer.tsx`):**
   - Interpolates aircraft along surveyed air corridors at 450 km/h, preventing position drift while maintaining 60 FPS animation.
   - Preserves aircraft transponder status via `isTransponderActive` in `frontend/hooks/useFleetVehicles.ts`.
3. **Maritime AIS Integration:**
   - Ingests Pelindo Belawan and coastal Sumatra AIS vessels (`PELINDO_SUMATRA_AIS`), interpolating speed (18–22 km/h) along surveyed nautical sea lanes without crossing landmasses.

---

## 8. Verification & Test Evidence

## 8. Verification & Test Evidence

Verification is enforced by CI (`.github/workflows/deploy.yml`) on every push to `main`:

- **Hermetic backend gate:** the subset of `backend/tests` that needs no Redis, Supabase or live provider network (49 of 67 test files) must pass in a no-`.env` environment before an image is built.
- **Frontend build:** `npm run build` (TypeScript compile included) must succeed.
- **Non-blocking `integration` job:** runs the full backend suite with Redis; its known failures are tracked in `docs/TEST_DEBT.md` rather than blocking deploys.

Snapshot-coordination and tick behavior are covered by `backend/tests/test_public_snapshot_coordination.py` (last-good section merge by evidence stamp, mirroring the SQL guard) and `backend/tests/test_internal_tick.py`, both in the hermetic gate.
