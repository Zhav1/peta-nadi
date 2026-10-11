# Phase 55: Comprehensive Engines Audit — Technical Walkthrough & Evidence Ledger

**Purpose:** the complete, evidence-grade breakdown of every finding summarized in `SYSTEM_ENGINES_AUDIT_REPORT.md`, with exact file:line anchors, live metrics, and failure mechanics. This is the reference document for implementing `55-PLAN.md`.

**Evidence sources:**
- Direct file reads of all audited modules (the workspace content-search tool was non-functional during audits; every claim below was verified by reading the files end-to-end).
- Live probe report `test-results/live_api_audit_report.json` (Render deployment `https://peta-nadi.onrender.com`, 2026-09-28; avg round-trip 298.4 ms).
- Commit/diff archaeology on `main` (phases 52–54).
- Runtime observations recorded during the four audit passes (row counts, stream lengths, feed counts).

---

## 1. Telemetry Domain

### 1.1 BMKG — Working, Live Per-Request; Health Signal Is Static

| Item | Evidence |
|---|---|
| Adapter | `backend/app/adapters/bmkg_adapter.py` — class L12, `source_name="bmkg"` L13, `poll_interval_seconds=60` L15 |
| Endpoints | Earthquakes: `autogempa.json` L23, fetched every call L45; weather: `prakiraan-cuaca?adm4=12.71.01.1001` (Medan only) L25, in-memory throttle 1800 s L52-58 |
| `health_check()` | L29-37 — `HEAD` on `autogempa.json`, returns `status_code == 200` |
| Consumer loop | `backend/app/main.py:36-58` — `fetch()` L44 → `parse()` L45 → `lpush "lrip:live_events"` L47-50 with `LTRIM 0 49`; 60 s cadence L54 |
| Other callers | `corridor_service.py:74-76`, `weather_fusion_service.py:29-31`; `BaseAdapter.run()` path only in `workers/ingestion_worker.py:36,51` (never launched) |

**Defect (degradation visibility):** `health_check()` is never called by the deployed loop and `update_source_health()` is never invoked → `data_sources` keeps its seeded `('bmkg','ok')` row (`infra/supabase/migrations/000_init.sql:27`), and `/api/v1/health/sources` (`backend/app/routers/health.py:24-79`, bmkg mapping L50/L57) reports optimistic health forever. Fetch failures are reduced to a log line (`main.py:52-53`).

### 1.2 TomTom — Two Deterministic Failures, Both Silent

| Failure | Mechanics | Evidence |
|---|---|---|
| **HTTP 400 on incidents (bbox too large)** | `BBOX = "95.0,-6.0,106.5,6.0"` spans 11.5° lon × 12° lat ≈ **~1.7 million km²** — roughly **170× the 10,000 km² limit** of the Incident Details v5 endpoint. The bbox is passed un-split. | `backend/app/adapters/tomtom_adapter.py:41`; request L90-101 |
| **HTTP 403 InsufficientFunds on flow** | `flowSegmentData` requests return 403 when credits are exhausted; the code only handles `if res.status_code == 200` with **no `else`/logging** → discarded. | fetch L72-87 (append at L80-85), incidents L90-101 (`if` at L98) |
| **Silent path when key missing** | Returns `{"flow": [], "incidents": []}` without raising — indistinguishable from "no traffic". | L67-68 |
| `health_check()` exists but dead | L43-61 returns False on 403 (L58), but no caller invokes it. | all import sites read during audit |

**Hardcoded speed substitution (three layers):**

| Layer | Values | Evidence |
|---|---|---|
| CPU matrix seed | `{"Belawan Toll Gate": 22.0, "Tanjung Mulia Interchange": 30.0, "Binjai Km 18": 45.0, "Pematangsiantar Km 128": 50.0}`; exception-only log on fetch failure; floor `max(15.0, avg)` | `backend/app/services/cuopt_tomtom_service.py:39-44`, `:45-54`, `:71-72` |
| Output mislabeled as live | `"tomtom_live_speed_kmh": round(sum(...)/len(...), 1)` — the *seed* average when TomTom is down | `cuopt_tomtom_service.py:134` |
| Corridor defaults | `congestion_level_pct 74.2`, `delay_minutes 35`, `flow_speed_kmh 22.5`, 3 fabricated checkpoints (`18.0/25.0/45.0` km/h); only overwritten `if flow_items:` | `backend/app/services/corridor_service.py:46-57`, L94/L125-133 |
| Prediction agent | `base_delays = {"6h":30.0,"12h":60.0,"24h":45.0,"48h":15.0}` used when Redis segment cache is empty | `agents/nodes/prediction.py` |
| Loop cache | Caches `lrip:tomtom:segment:*` TTL 600 s only when `flow_items` non-empty (L70-71, L88) — no fallback write | `main.py:61-96` |

**Integrity labels hardcoded:** `corridor_service.py:175-181` sets `bmkg_status/tomtom_status/pihps_status = "ONLINE"` and `consensus_confidence: 0.92` regardless of reality. The frontend mirrors the same hardcoded corridor values in `frontend/hooks/useCorridorContext.ts:6-49` (Phase 54 added `is_fallback: true` client-side; the backend still lacks the equivalent flag).

### 1.3 Earth2 — Working, Mislabeled, Unmonitored

- `backend/app/adapters/earth2_adapter.py`: class L14, `source_name="earth2"` L15, `stream_key="lrip:events:earth2"` L16 (undeclared in `redis_client.py` constants), poll 21600 s L17.
- `health_check()` L19-32 pings `api.open-meteo.com`; `fetch()` L34-59 calls Open-Meteo live L48-53 with simulated fallback L54-56 (`_generate_sim_forecast` L117-129 fabricates an 87.5% flood risk).
- Registered in `main.py:99-119` (task L180), caches `lrip:cache:earth2` TTL 6h L111.
- **Finding:** despite NVIDIA branding, this is an Open-Meteo HTTP client (documented as "Zero GPU Architecture Transition" in `planning/STATE.md`); it never reports health (`earth2` is neither seeded in `data_sources` nor in the health endpoint name map `health.py:49-54`).

### 1.4 AISStream — WebSocket Works; `mmsi` Bridge Missing

| Element | Evidence |
|---|---|
| Adapter | `backend/app/adapters/aisstream_adapter.py` — class L15, `ws_url` L70, `run()` override L90-141 (subscribe L115-120, reconnect L138-141), `health_check()` L86-88 (in-memory `_ws_connected`) |
| Only live-health adapter | `update_source_health()` calls at L104/L111/L136 |
| Port queue compute | `_process_queue_loop()` L165-169; `_process_queue()` L171-238 — bbox grouping L188-198, anchored `sog < 0.5` L203, thresholds L210-211, dedup key `aisstream:queue_depth:{pid}:{hour}` L212-215, event `port_queue` L219, published L234-235 |
| **Missing `mmsi`** | Ingest extracts `mmsi = metadata.get("MMSI")` L147 (kept in memory L157-163); the published event dict L217-233 has **no top-level `mmsi`** (only `vessel_details {name, sog}` L229). `redis_client.publish_event()` stringifies exactly the event's own keys (`redis_client.py:60,63`) |
| Consumer gate | `backend/app/services/telemetry_service.py` reads `mmsi = event_data.get("mmsi")` L985-989; activation check `if mmsi and live_ais and mmsi in live_ais:` L813-816; otherwise hard fallback `SIMULATION_CACHE` + `"PELINDO_SUMATRA_RADAR"` L822-824 |

**Impact:** all 14 maritime baseline units display `SIMULATION_CACHE` with a fabricated radar source; `LIVE_STREAM`/`AISSTREAM_WS` badges are unreachable. No `port_queue` persistence table exists (checked against all Supabase migrations 000/005–009 and SQLite tables in `local_storage.py`); state is in-memory + Redis keys + `lrip:events:aisstream`. Tests assert the event but never the mmsi bridge (`backend/tests/test_adapters.py::test_aisstream_port_queue`).

### 1.5 OpenMeteo — Abstract-Method `TypeError` at Instantiation

- `backend/app/adapters/openmeteo_adapter.py`: class L19; `__init__` L22-25 calls `super().__init__(source_name="openmeteo")` L23 — but `BaseAdapter.__init__` accepts no arguments (`base.py:18-20`).
- Blocking defect comes first: the class **does not override `health_check`**, declared `@abstractmethod` in `BaseAdapter(ABC)` (`base.py:32-35`, class L13) → instantiation raises `TypeError: Can't instantiate abstract class OpenMeteoAdapter with abstract method 'health_check'` before `__init__` even runs.
- Trigger: `backend/app/services/weather_fusion_service.py:36` inside `try/except` L35-40 → logged as warning L40; the `/weather/spatial-polygons` endpoint therefore runs BMKG-only while its metadata claims Open-Meteo fusion (`routing_router.py:74`).
- Test gap: `backend/tests/test_cpu_routing_weather.py:14` imports the class but never instantiates it → CI cannot catch the defect.

### 1.6 NASA FIRMS — Never Started, No Key

- Adapter: `backend/app/adapters/nasa_firms_adapter.py` — class L17, `source_name="nasa_firms"` L18; `health_check()` L59-79 requires `settings.nasa_firms_map_key` L61; `fetch()` embeds the key in the URL L86.
- Env var: **`NASA_FIRMS_MAP_KEY`** (`backend/app/config.py:28`) — absent from root `.env`, `backend/.env`, and `render.yaml` (`.env.example` even claims no key is required).
- Registration: **not in `main.py`** — lifespan tasks (`main.py:177-183`) cover BMKG/TomTom/Earth2/AISStream/News/PIHPS only. The only registration is `workers/ingestion_worker.py:20,39,51`, and nothing launches that module (docker-compose backend command is plain `uvicorn app.main:app`).
- Observability false positive: seeded `('nasa_firms','ok')` (`000_init.sql:30`) and the health endpoint's default fallback map reports it healthy (`health.py:53,71-77`).

### 1.7 Loop Registry (current `main.py`)

| # | Engine | Loop | Task |
|---|---|---|---|
| 1 | BMKGAdapter | `main.py:36-58` | `:178` |
| 2 | TomTomAdapter | `main.py:61-96` | `:179` |
| 3 | Earth2Adapter | `main.py:99-119` | `:180` |
| 4 | AISstreamAdapter | `main.py:122-132` | `:181` |
| 5 | Google News RSS | `main.py:135-149` | `:182` |
| 6 | PIHPS scraper | `main.py:152-162` | `:183` |
| — | NASAFIRMS / OpenMeteo | absent | — |

Caveat: `docker-compose.yml:26` runs `--workers 2` → every loop is duplicated per worker process.

---

## 2. Routing & Optimization Domain

### 2.1 Dijkstra — Real Measurement, Surrounded by Fake Ones

| Item | Evidence |
|---|---|
| Solver call | `backend/app/adapters/cpu_routing_adapter.py:170` — `nx.shortest_simple_paths(G, origin_id, dest_id, weight="weight")` |
| Timing | `t0 = perf_counter()` L129 → `elapsed_ms` L209 → emitted as `compute_time_ms` L218 |
| Self-label | `"solver": "NetworkX Dijkstra / A* CPU Solver"` L213; docstring claims `< 30 ms` L127 |
| VRP timing | L232/L282 → L291 |
| Untimed second call site | `agents/nodes/route_optimization.py:232` (no instrumentation; ETA is a formula `distance_km / 50.0 × 60` L254) |

**Where "1.1 ms" comes from (three distinct sources):**
1. Genuine runtime: `cpu_routing_adapter.py:218` on a 54-node graph (~1–2 ms band).
2. Hardcoded test-matrix literal: `evaluation_router.py:151` — `expected_invariant: "Returns valid path in < 10 ms CPU latency (actual: 1.4 ms)"`, `execution_time_ms: 1.4`; siblings at `:141` (1.1), `:142` (1.5), `:152`, `:157` (1.9), `:156` (3.5).
3. Hardcoded corridor UI latencies: `evaluation_router.py:240-311` (`solver_latency_ms` = 1.4 / 1.8 / 1.2 / 1.5 / 1.9 at L253/267/281/295/309), mirrored in `frontend/components/dashboard/RouteEfficiencyCard.tsx:35,49,63,77,91` and rendered as "Solver: X.X ms".

Latency assertions that do bound the real solver: `backend/tests/test_pilot_e2e.py:92` (`< 25.0 ms`), NFR-5 tests in `test_cpu_routing_weather.py` (< 50 ms Dijkstra / < 150 ms VRP).

### 2.2 cuOpt — CPU Greedy Fallback, Fabricated Savings

- Router path: `routing_router.py:12` imports only `app.services.cuopt_tomtom_service`; `cuopt_tomtom_service.py:108-114` calls `get_cpu_router().solve_fleet_vrp(...)`. The real NVIDIA HTTP client (`adapters/cuopt_adapter.py`) is **not called**.
- "Solver" reality: round-robin distribution — `stops_to_visit` enumerated, `v_idx = idx % len(vehicles)` (`cpu_routing_adapter.py:250-257`) — while labels claim "Heuristic 2-Opt" (`:286`) and "NetworkX + Google OR-Tools" (`cuopt_tomtom_service.py:121`); `ortools` is never imported.
- Cost matrix is synthetic even on success: `dist_km` haversine → `actual_road_dist = dist_km × 1.35`; single global `speed_kmh = max(15.0, avg_corridor_speed)` (`cuopt_tomtom_service.py:68-72`).
- **Hardcoded savings constants:** `travel_time_savings_pct: 18.5`, `fuel_cost_reduction_pct: 14.2` (`cuopt_tomtom_service.py:131-132`) — pure literals; `hazard_segments_avoided` and `tomtom_live_speed_kmh` (L133-134) are the only computed fields.
- Tests only assert `compute_time_ms < 150` and `"Deterministic CPU" in solver` (`test_cpu_routing_weather.py::test_cuopt_service_backwards_compatibility`) — the savings percentages are never validated.

### 2.3 Corridor Context — Hardcoded Speeds as "Live"

- Backend: `corridor_service.py` — entry L29, router `corridor_router.py:18-30` → `GET /api/v1/corridor/context`. Defaults L46-57; sticky fallback ("only overwritten `if flow_items`" L94/L125-133); per-segment defaults `freeFlowSpeed 60 / currentSpeed 30` L102-103; hardcoded integrity labels L175-181.
- Frontend: `useCorridorContext.ts:6-49` mirrors byte-identical values (`74.2` @20, `22.5` @23, checkpoints @26-28), flagged `is_fallback: true` @10; fetch `:135-148`; fallback applied only when no prior context `:149-153`; 30 s poll `:166-170`; derived speed math `:80-100` (`clamp(1 − congestionDelta/100, 0.15, 1)`, floor 5 km/h).
- Perf: sequential BMKG + TomTom + Supabase calls before responding (`corridor_service.py:72-156`) with no request-path caching → the **979.57 ms** live latency.

### 2.4 Route Geometry — Dijkstra Nodes vs Pre-Snapped Polylines

| Path | Producer | Evidence |
|---|---|---|
| Dijkstra geometry (raw node hops, not densified) | `cpu_routing_adapter.py:177,183-187,199` → `"coordinates": path_coords`; Agent 4 variant `route_optimization.py:244-250`, fallback synthetic drift L249 | rendered as straight lines between graph nodes |
| Pre-snapped polylines (runtime override) | Offline pre-bake `scripts/generate_snapped_fleet_corridors.py` — densify helpers L32-43/L46-56, hand-authored waypoint maps L69-138, per-modality spacing L152-154 (**1.0 km trucks / 3.0 km maritime / 10.0 km air**), distance recompute L157-159, dual output L171-181 (`backend/data/` + `frontend/public/data/`) | consumer `telemetry_service.py:_load_snapped_corridors()` L631-642; overrides per modality L793-797 (maritime), L841-845 (air), L882-886 (truck); precedence `reroute > snapped > MASTER_FLEET_DEFINITIONS`; reroute injection `:644-677` |
| Display-time densification (frontend) | `frontend/lib/pathDensifier.ts:44-63` (default 45 km max segment, L4), `:66-75`; imported by `CrisisMap.tsx:8` | adds vertices, **no decimation exists anywhere**; snapped 1 km truck polylines ship verbatim |
| Frontend consumption | `frontend/components/map/FleetVehicleLayer.tsx:372` (`route_geometry?.coordinates || path`), special-case swap L379-391 (`TRK-003-BELAWAN-TEBING` uses `selRoute.waypoints`) | |

Validation gap: snapped overrides are accepted unconditionally (no empty/length checks).

---

## 3. Intelligence / NLP Domain

### 3.1 News Aggregator — Working (432 articles observed)

- `backend/app/services/news_aggregator.py` — feeds L20-105 (10 LKBN ANTARA bureaus + CNN/CNBC Indonesia), targeted queries L108-114, fetch/parse L167-199 with silent skip L197-198, aggregation/dedupe L240-272 (dedupe by lowercased title L262-269; count log L271), upsert to `public.news_articles` in chunks of 50 L331-341 (`on_conflict="link"`), read L352.
- Orchestrator `unified_news_ingestor.py:32-70` — only top-30 articles structured L50; payload counts L63-70; Redis push L72-101; incident synthesis L127-265; link-back L192-195.
- Router `news_router.py:42-81` — `GET /api/v1/news/live`, 300 s throttle L55, `limit=60` L63, empty-table re-ingest L66-68.
- DDL: `infra/supabase/migrations/008_news_articles_and_realtime.sql:4-31` (PostGIS `GEOGRAPHY(Point,4326)` L12; RLS L40; policies L48-51/L61-65; Realtime publication L69-87).

### 3.2 NLP Extraction — Invalid Model ID + Silent Heuristic Fallback

| Location | Value | Evidence |
|---|---|---|
| NER pipeline | `GenerativeModel("gemini-3.5-flash-lite")` | `backend/app/nlp/ner_pipeline.py:34` |
| News extractor | `LLMGateway.generate_content(..., model_name="gemini-3.5-flash-lite")` | `backend/app/nlp/news_extractor.py:178` |
| Gateway default | `model_name: str = "gemini-3.5-flash-lite"` | `agents/llm_gateway.py:30` |
| Valid ID used elsewhere | `"gemini-1.5-flash"` | `decision_support.py:137`, `economic_intelligence.py:116` |

**Degradation paths:**
- `ner_pipeline.extract_locations_llm` L25-67: whole call in `except Exception` → returns `[]` L65-67. Caller `extract_locations` L69-85 tries gazetteer first (L78), LLM only on miss (L81-83) → non-gazetteer locations silently dropped.
- `news_extractor._fast_heuristic_extraction` L32-135 is computed **before** the LLM call (L151); the entire Gemini block L155-206 fails into `logger.debug` L205-206; the heuristic dict is cached and returned L209-213 — output indistinguishable from a successful LLM run.
- Hygiene defect: `import asyncio` at bottom of `ner_pipeline.py:88` (used at L45).

### 3.3 Geocoding & Gazetteer — Working 3-Tier Resolver

- `backend/app/nlp/geocoding_service.py`: `KNOWN_POIS` L14 (derived dict; the alias whose absence broke pytest collection — fixed in `0ff2ac0`); `is_within_sumatra` L17-22; `geocode()` L25-94 — Tier 1 exact L37-39, partial/alias L41-44, Tier 2 Redis `lrip:geocode:{slug}` TTL 7 days L46-55 (TTL const L12), Tier 3 Nominatim with Sumatra viewbox `bounded=1` L57-92 (0.5 s rate-limit sleep L75); returns `None` L94.
- `resolve_sumatra_location_and_corridor` L97-144 — longest-key-first matching L105-118, province centroids L121-132, `is_geocoded: False` L143.
- Data: `gazetteer_data.py` — bounding box L20-25 (95.0–109.0 E, −6.2–6.0 N), `PAN_SUMATRA_GAZETTEER` L27+; no DB gazetteer table (by design).
- Test contract: `backend/tests/test_scrapers.py:10-11` imports `extract_locations, geocode, KNOWN_POIS`.

### 3.4 HITL Approvals — Working (105 approvals observed)

- Router `backend/app/routers/approvals.py`: `POST /approvals` L28-157 — RBAC gate `approvals:write` L38-47 (Phase 54), closed-loop reroute L64-78, Supabase insert into `route_approvals` L81-125, local mirror + ground-truth registration L96-113, SQLite fallback with `sync_status="pending"` L124-157.
- `GET /approvals` L160-227 (Supabase read L167-200, SQLite fallback L202-226).
- Pipeline: ingestion writes pending rows (operator `system_news_agent`, `PENDING_REVIEW`) `unified_news_ingestor.py:236-260`; pending queue `news_router.py:201-275` (`sync_status=pending_operator_review` L210); action endpoint L278-316.
- Schema note: `000_init.sql:80-89` + `005:3-13` + `006:5-13`; either migration set must be applied or inserts silently fall back to SQLite.

### 3.5 NVIDIA NIM Gateway — 404 Collapsed into Canned Output

| Step | Evidence |
|---|---|
| Pinned model | `PRIMARY_NIM_MODEL = "deepseek-ai/deepseek-r1"` (`agents/llm_gateway.py:9`) — the only model string ever sent |
| Request | `https://integrate.api.nvidia.com/v1/chat/completions` L80; payload `"model": PRIMARY_NIM_MODEL` L93 |
| Account catalog mismatch | The NVIDIA account catalog serves **`deepseek-ai/deepseek-v4.1-flash`**; the pinned `deepseek-r1` returns **404**. (Codebase note: no code path requests v4.1-flash; key names `NVIDIA_DEEPSEEK_V4_PRO/FLASH` exist at `config.py:31-34`, `.env.example:10-18`.) |
| Collapse | `response.raise_for_status()` L102 → any ≥400 lands in `except Exception` L107 → logs error L108 → **returns a hardcoded Indonesian briefing string as the model's output** L110-115 |
| Downstream leak | `economic_intelligence.py:113-119` accepts responses on `len(resp_text) > 20` only → the canned string can become Agent 5's inflation narrative; `decision_support.py:139` correctly rejects `"FALLBACK"` content |
| Additional silent layers | demo-offline mock string L38-40; no-key mock string L76-77 |

**Net effect:** the entire "LLM reasoning" surface currently returns deterministic fallback text while UI/logs present it as model output.

---

## 4. Data Layer & Infra Domain

### 4.1 Supabase Migrations & RLS Matrix

Directory `infra/supabase/migrations/` — **001–004 do not exist**:

| Migration | Contents |
|---|---|
| `000_init.sql` (177 lines) | `data_sources` L16-23 (seeds L26-34, `'ok'` L27-30), `incidents` L40-56 (`id` L41, `location` L49), `route_approvals` L80-89, `commodity_prices` L95-103 (+hypertable L106), `ltm_episodes` L116-123, `kg_entities` L134-141, `kg_relationships` L150-158, KG seed L168-177 |
| `005_route_approvals.sql` | re-creates `route_approvals` L3-10 — FK `incidents(incident_id)` L5 (**column does not exist in 000**) |
| `006_decision_traces_and_outcomes.sql` | extends route_approvals L5-13; `ground_truth_outcomes` L16-31 |
| `007_shipment_profiles_and_impacts.sql` | `custom_fleet_vehicles` L5-36 (RLS L43, policies L46-64), `incident_impact_assessments` L67-80 (RLS L86, policies L88-98) |
| `008_news_articles_and_realtime.sql` | `news_articles` L4-31 (RLS L40, anon read L48-51, service_role L61-65), Realtime publication L69-87 (FK `incidents(incident_id)` L27) |
| `009_commodity_prices_public_read.sql` | single SELECT policy: `for select to anon, authenticated using (true)` (L1) — **policy-only; no `enable row level security`** |

**RLS status matrix:**

| Table | Defined | RLS explicitly enabled in migrations | Policies |
|---|---|---|---|
| `data_sources` | `000:16-23` | No | none |
| `incidents` | `000:40-56` | No (live project: enabled out-of-band) | none |
| `route_approvals` | `000:80-89`, `005:3-10` | No | none |
| `commodity_prices` | `000:95-106` | No (live: enabled out-of-band) | SELECT only (`009`) |
| `ltm_episodes` | `000:116-123` | No | none |
| `kg_entities` | `000:134-141` | No | none |
| `kg_relationships` | `000:150-158` | No | none |
| `ground_truth_outcomes` | `006:16-28` | No | none |
| `custom_fleet_vehicles` | `007` | Yes (`007:43`) | SELECT/INSERT/UPDATE |
| `incident_impact_assessments` | `007` | Yes (`007:86`) | SELECT/INSERT |
| `news_articles` | `008` | Yes (`008:40`) | anon read + service_role |

`commodity_prices` row-count math: 7 commodities (`pihps_scraper.py:31-39`) × ~5 weekly periods (30-day fetch window L80-82; every period point persisted L173-179, L263-329) ≈ **35 rows** per cycle — matching the observed table state.

### 4.2 Redis

- **Producer (unbounded):** `unified_news_ingestor.py:99` — `r.xadd("lrip:stream:osint", payload)` **without `maxlen`**; first 10 articles per cycle pushed L76; cycle cadence 5 min (`main.py:135-149`). Observed: **43,640 items**.
- **Contrast:** adapter streams are capped — key constants `redis_client.py:18-23`, `publish_event` `xadd(..., maxlen=10_000, approximate=True)` L63, list fallback LTRIM 0–9999 L70.
- **Consumers:** `agents/nodes/osint_hazard.py:43-60` reads a 3h `XRANGE` window (plus list fallback L50-60); no consumer trims.
- **Infra:** `docker-compose.yml:2-15` — plain `redis:7-alpine` volume, no `maxmemory`/eviction config; `infra/redis/README.md:68-82` documents only the `lrip:events:*` pattern (doc drift).

### 4.3 `/api/v1/incidents` — Why 108 Rows Return as `[]`

Router: `backend/app/routers/incidents.py:31` (mounted `main.py:215`), query L69-96:

```text
:71  sb = get_client()                      # anon key (supabase_client.py:17-32)
:72  query = sb.table("incidents").select(
:73      "incident_id, title, type, severity, status, confidence, created_at, lat, lon"
:74  ).order("created_at", desc=True).limit(limit)   # limit default 50 (:35)
:95  except Exception as e:
:96      logger.warning(f"Supabase unavailable: {e}")   # swallowed -> []
```

**Compounding root causes (likelihood order):**
1. **RLS with no policy** → PostgREST HTTP 200 `[]`, no exception. Probe confirms a 22-byte response (exactly `{"items":[],"total":0}`) at `test-results/live_api_audit_report.json:28-36`; `/api/v1/approvals` and `/api/v1/outcomes` show the same 22-byte empties (`:172-189`).
2. **Schema mismatch:** select requires `incident_id`, `lat`, `lon`; the writer path inserts `incident_id` + WKT `location` and never `lat`/`lon` (`unified_news_ingestor.py:153-164,184`). Any missing column → PostgREST 400 → swallowed at `:95-96` → `[]`.
3. **Filter/limit masking:** synthesized rows carry `status: "validating"` (`unified_news_ingestor.py:162`); explicit `status`/`severity` filters (`incidents.py:33-34`) can legitimately exclude them; `limit=50` caps 108 rows.

Not a wrong-table issue — the table name is correct.

### 4.4 Slow Endpoints — Latency Ledger (live Render probe)

| Endpoint | Latency | Source |
|---|---|---|
| `/api/v1/corridor/context` | **979.57 ms** | `live_api_audit_report.json:124` |
| `/api/v1/commodities/prices?commodity=beras&limit=5` | **681.38 ms** | `:88` |
| `/api/v1/fleet/vehicles` | **634.86 ms** | `:151` |
| `/api/v1/traffic/flow-segments` | 513.33 ms | `:142` |
| `/api/v1/news/market-regime` | 400.54 ms | `:106` |
| Average round-trip | 298.4 ms | `:4-8` |
| Cold start | 484.4 ms measured / 30–50 s fully cold | `:43` + `43.5-LEARNINGS.md:12-13` |

No server-side timing middleware exists (`main.py:203-211` adds CORS only); timing lives in tooling (`scripts/audit_backend_apis.py:101,121,132,209-212`; `frontend/components/dashboard/SystemObservabilitySection.tsx:115,137,223-225`). Root cause for the worst offender: sequential live fetches in `corridor_service.py:72-156`.

### 4.5 Frontend Dead Path

`frontend/lib/api.ts:63-78` defines `api.crisis.process` → `POST '/api/crisis/process'` at **`:75`**. No backend router produces that path (inventory: `agent_router` `/api/v1/agents/status`, `/simulation/chat`, `/api/v1/simulate/stream`; `demo_router` `/start|/status|/advance|/replay`; all others under `/api/v1`). The Supabase-era replacement is the SSE stream `POST /api/v1/simulate/stream`, already used directly by `frontend/hooks/useCrisisSimulationStream.ts:51`. Orphaned export — no live caller found.

---

## 5. Consolidated Metrics Ledger

| Metric | Value | Verification anchor |
|---|---|---|
| News articles ingested | 432 | Pass 3 runtime observation; pipeline in `news_aggregator.py` |
| HITL approvals logged | 105 | Pass 3 runtime observation; `route_approvals` |
| `commodity_prices` rows | 35 | 7×~5 arithmetic; `pihps_scraper.py:31-39,80-82,173-179` |
| `lrip:stream:osint` items | 43,640 | Pass 4 Redis `XLEN`; `unified_news_ingestor.py:99` |
| `incidents` DB rows | 108 | Pass 4 DB count; endpoint returns 22-byte `[]` |
| TomTom bbox area | ~1.7M km² (~170× limit) | `tomtom_adapter.py:41` vs 10,000 km² cap |
| Hardcoded savings | 18.5% / 14.2% | `cuopt_tomtom_service.py:131-132` |
| Hardcoded solver latencies | 1.2–1.9 ms | `evaluation_router.py:253-309`; `RouteEfficiencyCard.tsx:35-91` |
| Dijkstra real latency | ~1–2 ms (1.4 ms literal in matrix) | `cpu_routing_adapter.py:218`; `evaluation_router.py:151` |
| Corridor hardcoded telemetry | 74.2% / 22.5 km/h / 35 min | `corridor_service.py:46-57`; `useCorridorContext.ts:6-49` |
| Tables without RLS policies | 7 core + 1 | `000_init.sql`, `006:16-28` |
| Slowest audited endpoint | 979.57 ms | `live_api_audit_report.json:124` |

---

## 6. Remediation Map (Finding → Workstream)

| Finding | Workstream (`55-PLAN.md`) |
|---|---|
| OpenMeteo `TypeError` (abstract `health_check`, `__init__` signature) | **S1** |
| NIM model ID 404 + canned-string fallback + Agent 5 leak | **S2** |
| `gemini-3.5-flash-lite` invalid ID + debug-level heuristic fallback | **S3** |
| `/api/v1/incidents` `[]` (RLS + schema + swallow) | **S4** (+ **S7** for the policy) |
| TomTom bbox 400 + 403 InsufficientFunds + hardcoded speed layers | **S5** |
| Unbounded `lrip:stream:osint` | **S6** |
| RLS missing across core tables; migration 009 policy-only | **S7** |
| AIS mmsi bridge; FIRMS registration; health-loop wiring; savings/latency literals; `api.ts` dead path | Deferred watchlist (`55-PLAN.md` §6) |
