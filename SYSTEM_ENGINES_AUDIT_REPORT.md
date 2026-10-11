# SYSTEM ENGINES AUDIT REPORT

**Four-Pass Audit of Backend Engines, Data Sources & Runtime Integrations**

| | |
|---|---|
| **Date** | 2026-10-11 |
| **Scope** | `backend/app` (adapters, services, routers, scrapers, NLP, auth), `agents/` (LLM gateway + swarm nodes), `infra/supabase/migrations`, and frontend integration points (`frontend/lib/api.ts`, hooks) |
| **Method** | Four read-only audit passes with full code-path tracing, commit/diff archaeology, and live API probe reports (`test-results/live_api_audit_report.json`). All findings were verified by direct file reads (workspace content search was unavailable during the audit passes) |
| **Status Legend** | ✅ WORKING · 🟡 DEGRADED (works but masked by fallback) · ❌ BROKEN (silent failure) |

> **Compiled from 4 audit passes:** (1) Telemetry Domain, (2) Routing & Optimization Domain, (3) Intelligence / NLP Domain, (4) Data Layer & Infra Domain. Remediation for every finding below is scoped in [`.planning/phases/55-comprehensive-engines-audit-and-stabilization/55-PLAN.md`](.planning/phases/55-comprehensive-engines-audit-and-stabilization/55-PLAN.md).

---

## 0. Executive Summary

| Domain | Engines Inspected | Working | Degraded | Broken |
|---|---|---|---|---|
| Telemetry | 6 | BMKG, Earth2 | TomTom (credits/bbox), AISStream (mmsi bridge) | OpenMeteo, NASA FIRMS, TomTom incidents layer |
| Routing & Optimization | 4 | Dijkstra (NetworkX) | cuOpt fallback, Corridor context, Route geometry | - |
| Intelligence / NLP | 5 | News aggregator, Geocoding & Gazetteer, HITL Approvals | NLP extraction (model ID), NVIDIA NIM gateway (404) | - |
| Data Layer & Infra | 4 areas | - | Supabase (RLS gaps), Redis (unbounded stream), API latency, `api.ts` dead path | `/api/v1/incidents` returns `[]` despite 108 rows |

**Root theme:** the system is functionally alive but several engines present **hardcoded or fabricated fallbacks as live telemetry**, and most integration failures are swallowed silently (`except` → empty list / mock string / hardcoded speeds). Health reporting is largely theatrical: only the AISStream adapter ever writes `data_sources` health, so `data_sources` rows remain at their seed value (`'ok'`) forever.

### Audit Metrics Ledger (observed at audit time)

| Metric | Value | Where it comes from |
|---|---|---|
| News articles ingested | **432 articles** | Live news pipeline count recorded during Pass 3 |
| HITL approvals logged | **105 approvals** | `route_approvals` count recorded during Pass 3 |
| `commodity_prices` rows | **35 rows** | 7 commodities × ~5 weekly PIHPS period points (`pihps_scraper.py:31-39`, `:80-82`, `:173-179`) |
| `lrip:stream:osint` items | **43,640 items** | Redis `XLEN` observed during Pass 4 (unbounded, no `maxlen`) |
| `incidents` rows in DB | **108 rows** | DB count observed during Pass 4 — yet `/api/v1/incidents` returns `[]` |
| Dijkstra shortest-path latency | **~1.1 ms** (measured ~1.0–2.2 ms band) | `backend/app/adapters/cpu_routing_adapter.py:129` → `:218` `compute_time_ms` |
| Corridor context latency | **979.57 ms** | `test-results/live_api_audit_report.json:124` |
| Avg live API latency | 298.4 ms | `test-results/live_api_audit_report.json:4-8` |

---

## 1. Pass 1 — Telemetry Domain

### 1.1 Engine Status Matrix

| Engine | Status | Evidence | Impact |
|---|---|---|---|
| **BMKG** (weather + earthquakes) | ✅ Working, live per-request | `backend/app/adapters/bmkg_adapter.py:12-15,23,25,29-37,45`; polled by `main.py:36-58`, cached to `lrip:live_events` | Live data flows; health signal is static/optimistic (never written by the main loop) |
| **TomTom** (traffic flow + incidents) | ❌ Broken / masked | 403 `InsufficientFunds` silently discarded (`tomtom_adapter.py:72-87`); oversized bbox `95.0,-6.0,106.5,6.0` (~1.3M+ km²) guaranteed HTTP 400 on `incidentDetails` (`tomtom_adapter.py:41`, request `:90-101`) | Incidents layer permanently empty; congestion alerts run on hardcoded speeds |
| **Earth2** (atmospheric forecast) | ✅ Working (mislabeled) | `earth2_adapter.py:14-17,34-59,85-115`; reality: an **Open-Meteo HTTP client**, not NVIDIA Earth-2 | Forecasts flow, but no health reporting and branding is inaccurate |
| **AISStream** (maritime WebSocket) | 🟡 Degraded | WS stream + `port_queue` compute work (`aisstream_adapter.py:90-141`, `:171-238`); published event lacks top-level `mmsi` (`:217-233`), while consumer reads `event_data.get("mmsi")` (`telemetry_service.py:985-989`, gate `:813-816`) | All 14 maritime units permanently show `SIMULATION_CACHE` + fake "PELINDO_SUMATRA_RADAR" source; no `port_queue` persistence table exists |
| **OpenMeteo** | ❌ Broken (TypeError) | `OpenMeteoAdapter` does not implement the abstract `health_check` (`base.py:32-35`) → instantiation raises `TypeError` at `weather_fusion_service.py:36`, caught + logged at `:40` | Advertised "BMKG + Open-Meteo NWP fusion" is half dead |
| **NASA FIRMS** (fire hotspots) | ❌ Not running | Key `NASA_FIRMS_MAP_KEY` missing from all env files (`config.py:28`); adapter never registered in `main.py` lifespan (only in the never-launched `workers/ingestion_worker.py:20,39,51`) | Wildfire hazard detection entirely absent, yet dashboard reports it "healthy" |

### 1.2 Background Loop Registration (`backend/app/main.py` lifespan)

| # | Engine | Loop | Task |
|---|---|---|---|
| 1 | BMKGAdapter | `main.py:36-58` | `main.py:178` |
| 2 | TomTomAdapter | `main.py:61-96` | `main.py:179` |
| 3 | Earth2Adapter (Open-Meteo) | `main.py:99-119` | `main.py:180` |
| 4 | AISstreamAdapter (WS) | `main.py:122-132` | `main.py:181` |
| 5 | Google News RSS | `main.py:135-149` | `main.py:182` |
| 6 | PIHPS scraper | `main.py:152-162` | `main.py:183` |
| — | **NASAFIRMSAdapter** | absent | — |
| — | **OpenMeteoAdapter** | absent (broken class) | — |

### 1.3 Key Findings

1. **TomTom two-mode failure:** `flowSegmentData` returns **HTTP 403 InsufficientFunds** (credit exhaustion) while `incidentDetails` returns **HTTP 400** because the request bbox is ~130–180× the 10,000 km² limit of the Incident Details v5 endpoint. Both are silently dropped (`if res.status_code == 200` with no `else` branch), and the corridor service substitutes **hardcoded speeds** (`corridor_service.py:46-57`: 74.2% congestion / 22.5 km/h / 35 min delay) that are returned as if live; `data_integrity` labels hardcode `"ONLINE"` (`corridor_service.py:175-181`).
2. **AIS live-enrichment bridge is structurally dead:** the `mmsi` extracted at ingestion (`aisstream_adapter.py:147`) is never included in the published `port_queue` event payload; the consumer requires it to activate `LIVE_STREAM`/`AISSTREAM_WS` badges. Tests assert the event but never the mmsi bridge (`backend/tests/test_adapters.py::test_aisstream_port_queue`), so CI cannot catch it.
3. **Health telemetry is fiction:** only AISStream calls `update_source_health()`. BMKG/TomTom/Earth2 loops never do, so `/api/v1/health/sources` reports BMKG/TomTom/AISStream/NASA FIRMS as `"healthy"` from seeded rows (`000_init.sql:27-30`) regardless of reality.
4. **Multi-worker duplication:** `docker-compose.yml:26` runs `uvicorn --workers 2`, duplicating every lifespan poller per worker process.

---

## 2. Pass 2 — Routing & Optimization Domain

### 2.1 Engine Status Matrix

| Engine | Status | Evidence | Impact |
|---|---|---|---|
| **Dijkstra (NetworkX)** | ✅ Working, ~1.1 ms | `cpu_routing_adapter.py:170` (`nx.shortest_simple_paths`), timing `:129` → `:209` → `:218` `compute_time_ms` | Genuine runtime measurement; UI separately shows **hardcoded** `solver_latency_ms` literals 1.2–1.9 ms (`evaluation_router.py:253-309`, `RouteEfficiencyCard.tsx:35-91`) |
| **cuOpt integration** | 🟡 CPU greedy fallback only | Real HTTP client exists but is unused by the router (`routing_router.py:12` → `cuopt_tomtom_service.py:108-114` → `get_cpu_router().solve_fleet_vrp`); VRP = round-robin distribution (`cpu_routing_adapter.py:250-257`) mislabeled "2-Opt" (`:286`) | "NVIDIA cuOpt" claims are cosmetic; savings are literals |
| **Savings constants** | 🟡 Hardcoded | `travel_time_savings_pct: 18.5` and `fuel_cost_reduction_pct: 14.2` (`cuopt_tomtom_service.py:131-132`) — pure literals, never computed or asserted | Dashboard "savings" metrics are fabricated |
| **Corridor context** | 🟡 Masked fallback | Backend defaults `corridor_service.py:46-57`; frontend mirrors identical values in `useCorridorContext.ts:6-49` (`DEFAULT_FALLBACK_CORRIDOR`) | When TomTom is down, hardcoded 22.5 km/h / 74.2% congestion is served as live corridor telemetry |
| **Route geometry** | 🟡 Two competing sources | Dijkstra emits raw node-to-node coordinates (`cpu_routing_adapter.py:183-187`, `agents/nodes/route_optimization.py:244-250`); fleet rendering prefers **pre-snapped maritime polylines** (`telemetry_service.py:793-797,841-845,882-886` from `scripts/generate_snapped_fleet_corridors.py:152-154`) | Trucks render straight node hops (frontend densifies at display only, `pathDensifier.ts:44-63`); no decimation anywhere |

### 2.2 Key Findings

1. **The CPU fallback is honest about being CPU, but dishonest about its algorithm:** `cpu_routing_adapter.py:250-257` performs round-robin stop distribution (`v_idx = idx % len(vehicles)`) while the returned label claims "Nearest neighbor" / "Heuristic 2-Opt" (`:286`) and `cuopt_tomtom_service.py:121` claims "NetworkX + Google OR-Tools" — `ortools` is never imported.
2. **Speed matrix is synthetic even when TomTom works:** `cuopt_tomtom_service.py:68-72` uses `dist_km * 1.35` road factor and a single global `speed_kmh = max(15.0, avg_corridor_speed)`; on fetch failure the hardcoded checkpoint seed speeds (`:39-44`: 22.0 / 30.0 / 45.0 / 50.0 km/h) are silently retained.
3. **Corridor request path is slow:** sequential live BMKG + TomTom + Supabase fetches per request in `corridor_service.py:72-156` with no caching — root cause of the 979.57 ms live latency.
4. **Route geometry precedence** is `active reroute > snapped polyline > static definition` (`telemetry_service.py:786-792,834-840,875-881`); snapped overrides are accepted unconditionally (no empty/length validation).

---

## 3. Pass 3 — Intelligence / NLP Domain

### 3.1 Engine Status Matrix

| Engine | Status | Evidence | Impact |
|---|---|---|---|
| **News aggregator** | ✅ Working — **432 articles** | `news_aggregator.py:20-105` (10 ANTARA bureaus + CNN/CNBC), dedupe `:262-269`, upsert to `public.news_articles` `:331-341`; count log `:271` | Live Pan-Sumatra coverage works |
| **NLP extraction** | 🟡 Invalid model ID → silent heuristic fallback | Model `gemini-3.5-flash-lite` (invalid) at `ner_pipeline.py:34`, `news_extractor.py:178`, `agents/llm_gateway.py:30`; LLM block wrapped in `try/except` logging at **debug** (`news_extractor.py:205-206`); heuristic `_fast_heuristic_extraction` (`:32-135`) is indistinguishable from success | Structured extraction silently degrades to heuristics for every article |
| **Geocoding & Gazetteer** | ✅ Working | `geocoding_service.py:14` (`KNOWN_POIS`), 3-tier `geocode()` `:25-94`, `resolve_sumatra_location_and_corridor` `:97-144`; data `gazetteer_data.py:20-27` | Deterministic Sumatra geocoding works (no DB gazetteer table — by design) |
| **HITL approvals** | ✅ Working — **105 approvals** | `approvals.py:28-157` (create, RBAC `:38-47`, Supabase insert `:81-125`, local mirror + outcomes); pending queue `news_router.py:201-275`, action `:278-316` | Operator review loop functional |
| **NVIDIA NIM LLM Gateway** | 🟡 404 → hardcoded fallback string | Pins `PRIMARY_NIM_MODEL = "deepseek-ai/deepseek-r1"` (`agents/llm_gateway.py:9`); account catalog only serves **`deepseek-ai/deepseek-v4.1-flash`** → 404 collapsed into `except Exception` `:107-115` that **returns a canned Indonesian briefing as if it were model output** | Every NIM-backed summary is actually a static fallback string; `economic_intelligence.py:118` accepts it by length only |

### 3.2 Key Findings

1. **Two stacked model-ID defects:** both the Gemini ID (`gemini-3.5-flash-lite`, invalid) and the NIM ID (`deepseek-ai/deepseek-r1`, 404 on the account catalog) fail silently, so the entire "LLM reasoning" layer currently runs on deterministic fallbacks (heuristics + canned text). Valid Gemini IDs elsewhere: `gemini-1.5-flash` (`decision_support.py:137`, `economic_intelligence.py:116`).
2. **Fallback text leaks into Agent 5 output:** `economic_intelligence.py:113-119` filters only by length (`len(resp_text) > 20`), unlike `decision_support.py:139` which rejects `"FALLBACK"` strings.
3. **Latent defects in the same modules:** `import asyncio` declared at the bottom of `ner_pipeline.py:88` (used at `:45`); `social_scraper.py:56` reads `settings.twitter_bearer_token`, a config field that does not exist in `config.py:25-38`.

---

## 4. Pass 4 — Data Layer & Infra Domain

### 4.1 Supabase / Postgres

| Finding | Evidence | Impact |
|---|---|---|
| `commodity_prices` populated with **35 rows** | 7 commodities × ~5 weekly period points persisted by `pihps_scraper.py:173-179,263-329`; `main.py:152-162` PIHPS loop | Live price series now flows (post-Phase-54 fix) |
| **7 core tables without RLS policies** | `data_sources`, `incidents`, `route_approvals`, `commodity_prices`, `ltm_episodes`, `kg_entities`, `kg_relationships` — all defined in `000_init.sql` with zero policies; only 007/008 tables are protected | Anon reads on RLS-enabled tables return **HTTP 200 `[]`** silently; writes fail with `42501` unless service-role |
| Migration 009 exists | `infra/supabase/migrations/009_commodity_prices_public_read.sql:1` — SELECT policy for `anon, authenticated` on `commodity_prices` | Unblocks public read; **writes still require `service_role`** (no INSERT policy) |
| Schema drift | Migrations **001–004 do not exist**; `005:5` / `008:27` FK-reference `incidents(incident_id)` which does not exist in `000_init.sql:41` (`incidents.id`) | Live DB and committed DDL have drifted; column-level selects can 400 and be swallowed |

### 4.2 Redis

| Finding | Evidence | Impact |
|---|---|---|
| `lrip:stream:osint` **43,640 unbounded items** | `unified_news_ingestor.py:99` `r.xadd("lrip:stream:osint", payload)` — **no `maxlen`** | Stream grows forever (~10 articles per 5-min cycle); memory risk |
| All other streams are capped | `redis_client.py:63` `maxlen=10_000, approximate=True`; list fallback LTRIM `:70` | The one hand-rolled XADD is the outlier |

### 4.3 API Surface

| Finding | Evidence | Impact |
|---|---|---|
| **`/api/v1/incidents` returns `[]` despite 108 rows in DB** | `incidents.py:69-96` — anon client `:71`, select `incident_id, …, lat, lon` `:72-74`, exception swallowed `:95-96`; live probe `live_api_audit_report.json:28-36` shows exactly 22 bytes (`{"items":[],"total":0}`) | Incident map/counts read empty; compounding causes: RLS with no SELECT policy (silent 200 `[]`), schema mismatch (`incident_id`/`lat`/`lon` vs live schema), default `limit=50` capping 108 rows |
| Slow endpoints | `corridor/context` **979.57 ms** (`:124`), `commodities/prices` **681.38 ms** (`:88`), `fleet/vehicles` **634.86 ms** (`:151`), `traffic/flow-segments` **513.33 ms** (`:142`), `news/market-regime` **400.54 ms** (`:106`); avg 298.4 ms (`:4-8`); cold start 30–50 s | No server-side timing middleware exists (`main.py:203-211` adds CORS only) |
| Frontend dead path `/api/crisis/process` | `frontend/lib/api.ts:75` POSTs to a route that does not exist on the backend (verified against all router mounts, `main.py:213-230`); replacement is `POST /api/v1/simulate/stream` (`useCrisisSimulationStream.ts:51`) | Orphaned export; a future caller would 404 |

---

## 5. Cross-Cutting Themes

1. **Silent fallbacks everywhere:** TomTom 403/400 discard, OpenMeteo TypeError swallow, NLP heuristic fallback (debug-level log), NIM canned string, `incidents.py` exception swallow, corridor hardcoded defaults. Failures are systematically invisible.
2. **Hardcoded values presented as measurements:** 18.5% / 14.2% savings, 1.2–1.9 ms solver latencies, `"ONLINE"` integrity labels, 87.5% simulated flood risk.
3. **Health theater:** `health_check()` implementations exist but are never invoked by the deployed loops; `data_sources` remains at seed values.
4. **Contract drift:** tests validate event shapes but not cross-module contracts (mmsi bridge); committed SQL drifts from live schema (missing migrations 001–004, `incident_id` FK references).
5. **Quota blind spots:** TomTom credit exhaustion and NASA key absence are not surfaced anywhere in the UI.

## 6. Remediation

All findings above are scheduled in **Phase 55 — Comprehensive Engines Audit & Stabilization**:

- [`55-PLAN.md`](.planning/phases/55-comprehensive-engines-audit-and-stabilization/55-PLAN.md) — prioritized workstreams (P0/P1/P2)
- [`55-WALKTHROUGH.md`](.planning/phases/55-comprehensive-engines-audit-and-stabilization/55-WALKTHROUGH.md) — full technical breakdown with file:line evidence
- [`55-ENVIRONMENT-FIXES-AND-PITFALLS.md`](.planning/phases/55-comprehensive-engines-audit-and-stabilization/55-ENVIRONMENT-FIXES-AND-PITFALLS.md) — NIM catalog, TomTom bbox, Redis, RLS constraints
- [`55-LEARNINGS.md`](.planning/phases/55-comprehensive-engines-audit-and-stabilization/55-LEARNINGS.md) — resilience design principles
