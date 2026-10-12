# Phase 55: Comprehensive Engines Audit & Stabilization (Master Blueprint)

**Status:** ALIGNED & READY FOR IMPLEMENTATION (Wave 1: P0, Wave 2: P1)
**Scope:** Phase 55 Engine Stabilization
**Inputs:** `SYSTEM_ENGINES_AUDIT_REPORT.md` (4 audit passes) · Mimo v2.6 Pro Live Diagnostic Probe · User `/grill-me` Architectural Decisions · `55-WALKTHROUGH.md` · `55-ENVIRONMENT-FIXES-AND-PITFALLS.md`
**Constraint reminder:** backend engines must keep running with zero regressions; every fallback must become *visible* rather than silent; no canned prose masquerading as live AI.

---

## 1. Objective & Empirical Baseline

Stabilize the seven audited failure clusters across Telemetry, Intelligence/NLP, and Data Layer.
Empirical diagnostics established by subagent probe prior to implementation:
- **NVIDIA NIM:** Key confirmed valid (`200 OK` on `/v1/models`). Verified catalog model is `deepseek-ai/deepseek-v4.1-flash` (`deepseek-ai/deepseek-r1` returns 404). Backend `.env` was out of sync with root `.env`.
- **Supabase Incidents:** `public.incidents` has 112 rows, PK is `incident_id`, geometry stored in `location` (WKT). Columns `lat` and `lon` do NOT exist, causing `/api/v1/incidents` to throw 400 and swallow into `[]`.
- **Supabase RLS:** `data_sources` has RLS enabled with 0 anon policies (blocking anon reads); `incidents` and `route_approvals` had RLS disabled (open to anon mutations).
- **Redis OSINT:** `lrip:stream:osint` held 43,890 unbounded entries.

The unifying acceptance criteria:
1. Weather fusion actually runs both providers (`OpenMeteoAdapter` properly inherits and instantiates with working `health_check`).
2. The LLM layer either produces real model output or explicitly reports degradation (`deepseek-ai/deepseek-v4.1-flash` + centralized `gemini-1.5-flash`).
3. TomTom obeys the 10,000 km² bbox limit via corridor-anchored tiling (≤4,600 km²) and reports credit exhaustion honestly (`is_fallback: true`).
4. Incident data actually reaches the API (dual-layer fix: parse WKT `location` into `lat`/`lon` in router + Migration 010 schema enhancement).
5. The OSINT event stream is capped at `maxlen=10_000` with historical backlog trimmed.
6. Core Supabase tables have deliberate Public-Read + Privileged-Write RLS policies.

---

## 2. Workstreams

### Priority Legend
- **P0** — correctness/availability blockers (silent breakage in production paths)
- **P1** — resilience & data hygiene (prevents recurrences)
- **P2** — verification & close-out

---

### S1 (P0) — OpenMeteo `health_check` & Instantiation Fix

| | |
|---|---|
| **Finding** | `OpenMeteoAdapter` fails instantiation with `TypeError: Can't instantiate abstract class … with abstract method 'health_check'`; a second latent `TypeError` (`unexpected keyword argument 'source_name'`) hides underneath. |
| **Evidence** | `backend/app/adapters/openmeteo_adapter.py:19,22-25`; abstract method declared `backend/app/adapters/base.py:32-35` (`BaseAdapter.__init__` takes no args, `base.py:18-20`); failure caught + swallowed at `backend/app/services/weather_fusion_service.py:36-40`. |
| **Remedy** | (1) Implement `async def health_check(self) -> bool` (lightweight `HEAD`/`GET` against `api.open-meteo.com`, mirroring `Earth2Adapter.health_check` `earth2_adapter.py:19-32`). (2) Fix `__init__` to the base signature (no `super().__init__(source_name=…)`; assign attributes per `BaseAdapter` pattern). (3) Optional consolidation: `Earth2Adapter` already speaks the same Open-Meteo upstream — decide whether to unify (defer if it risks `main.py` loop churn). |
| **Acceptance** | `OpenMeteoAdapter()` instantiates; `/weather/spatial-polygons` metadata truthfully reports both providers; no `TypeError` in fusion logs; new unit test instantiates the class (the historical gap: `test_cpu_routing_weather.py:14` imports but never instantiates). |

### S2 (P0) — NVIDIA NIM Gateway Catalog Model ID & Fail-Loud Fallback

| | |
|---|---|
| **Finding** | Requests pin `PRIMARY_NIM_MODEL = "deepseek-ai/deepseek-r1"`, which 404s — the account catalog only serves **`deepseek-ai/deepseek-v4.1-flash`**. The 404 is collapsed into an `except Exception` that **returns a canned Indonesian briefing string as if it were model output**; Agent 5 accepts it (length-only filter). |
| **Evidence** | `agents/llm_gateway.py:9` (model), `:80,93` (endpoint + payload), `:100-115` (raise_for_status → fallback string); consumer leak: `agents/nodes/economic_intelligence.py:113-119` vs the safer filter in `agents/nodes/decision_support.py:139`. |
| **Remedy** | (1) Set the model to the catalog ID (`deepseek-ai/deepseek-v4.1-flash`) — verify against `GET https://integrate.api.nvidia.com/v1/models` with the configured key before coding. (2) Startup preflight: validate the configured model exists in the catalog; log the available IDs on mismatch. (3) Replace the canned-string return with an explicit degraded contract: raise a typed `LLMGatewayUnavailable` error (or return a structured envelope with `degraded: true`) so callers must consciously handle it. (4) Make all callers reject fallback/degraded content (port the `decision_support.py:139` `"FALLBACK"`-filter to Agent 5). |
| **Acceptance** | A live `generate_content` call returns real NIM completion; when the gateway is down, callers log an error and surface degradation — no canned text reaches agent output; regression test asserts fallback content can never satisfy callers. |

### S3 (P0) — News Extractor / NER Model ID Correction

| | |
|---|---|
| **Finding** | Invalid Gemini ID `gemini-3.5-flash-lite` used in three places; both the NER and extraction paths silently degrade to heuristics (extraction failures logged at **debug** level only). |
| **Evidence** | `backend/app/nlp/ner_pipeline.py:34`; `backend/app/nlp/news_extractor.py:178`; `agents/llm_gateway.py:30` (default param). Valid ID used elsewhere: `gemini-1.5-flash` (`decision_support.py:137`, `economic_intelligence.py:116`). Silent paths: `ner_pipeline.py:25-67` (returns `[]` on failure), `news_extractor.py:155-206` (heuristic kept, `logger.debug` at `:205-206`). |
| **Remedy** | (1) Centralize the Gemini model in `Settings` (e.g. `gemini_model: str = "gemini-1.5-flash"`) and reference it from all three sites. (2) Upgrade the heuristic-fallback log to `warning` with the failure reason. (3) Hygiene: move the bottom-of-file `import asyncio` (`ner_pipeline.py:88`) to the top. |
| **Acceptance** | Structured extraction visibly uses the LLM path (log/metric when falling back); model ID appears in exactly one config location; unit test asserts the configured model is not the known-invalid placeholder. |

### S4 (P0) — `/api/v1/incidents` Returns `[]` Despite 112 Rows (Dual-Layer Resolution)

| | |
|---|---|
| **Finding** | The endpoint returns a 22-byte `{"items":[],"total":0}` while the DB holds 112 rows. Root causes: (a) the query selects non-existent columns `lat, lon` (schema has `location` WKT only) → Supabase returns HTTP 400; (b) exceptions are swallowed into `[]`; (c) `incidents` currently lacks explicit RLS policies. |
| **Evidence** | `backend/app/routers/incidents.py:33-35,69-96` (selects `lat, lon` `:73`, swallow `:95-96`); DB probe confirms columns are `incident_id, title, description, type, severity, status, confidence, location, affected_area, evidence, recommendations, created_at, updated_at, resolved_at`. |
| **Remedy** | (1) **Dual-Layer Layer 1 (Python)**: In `backend/app/routers/incidents.py`, update SELECT to omit `lat, lon` and query valid columns including `location`. Parse WKT `POINT(lon lat)` in Python with robust regex/WKT parser into float `lat` and `lon` for `IncidentResponse` (with POI fallback if null). Replace bare exception swallow with structured logging and error reporting. (2) **Dual-Layer Layer 2 (DB Migration 010)**: Add generated or backfilled numeric `lat` and `lon` columns to `public.incidents` for database indexability. (3) Parameterize/increase default limit so full dataset is queryable. |
| **Acceptance** | Live `/api/v1/incidents` returns populated incident objects with valid `lat` and `lon` floats; errors fail loud with warnings in logs; regression tests verify WKT parsing with diverse geometries. |

### S5 (P1) — TomTom Bbox Compliance, Credit Fallback & Honest Degradation

| | |
|---|---|
| **Finding** | The incidents request ships a ~1.7M km² bbox (~170× the 10,000 km² limit) → guaranteed HTTP 400; flow requests hit HTTP 403 `InsufficientFunds` on credit exhaustion. Both are silently discarded, and three layers of hardcoded speeds pass as live data. |
| **Evidence** | `backend/app/adapters/tomtom_adapter.py:41` (bbox), `:72-87` / `:90-101` (silent discard), `:67-68` (empty when key missing); hardcoded layers: `cuopt_tomtom_service.py:39-44,71-72,134` (misleading `tomtom_live_speed_kmh` label), `corridor_service.py:46-57` (+ `"ONLINE"` labels `:175-181`), `agents/nodes/prediction.py` `base_delays`; loop `main.py:61-96`. |
| **Remedy** | (1) **Tile the requests**: split coverage into corridor-anchored cells ≤ 10,000 km² each (0.5° lat × 0.75° lon ≈ ≤ 4,600 km² at Sumatra latitudes around arterial checkpoints and key hubs), dedupe incidents across tiles by ID. (2) **Credit handling**: on 403, set a `credit_exhausted` state latch, log once at `warning`, and back off. (3) **Honest fallback**: corridor payloads carry `is_fallback: true` + `status: "DEGRADED"` with the reason; remove/replace the `tomtom_live_speed_kmh` label when values are seed constants. (4) Wire `TomTomAdapter.health_check()` (`:43-61`) into the loop and write `update_source_health()`. |
| **Acceptance** | No request exceeds 10,000 km²; incidents return for corridor tiles when credits exist; with credits exhausted, `/api/v1/corridor/context` exposes the degraded flag and the UI renders `FALLBACK`; health endpoint shows TomTom as degraded, not `healthy`. |

### S6 (P1) — Redis `lrip:stream:osint` Maxlen Trimming

| | |
|---|---|
| **Finding** | The stream held **43,890 unbounded items**: the only hand-rolled `XADD` in the codebase omits `maxlen`, while every adapter stream is capped at 10,000. |
| **Evidence** | `backend/app/services/unified_news_ingestor.py:99` vs `backend/app/services/redis_client.py:63` (`maxlen=10_000, approximate=True`) and list fallback `:70`; consumers `agents/nodes/osint_hazard.py:43-60`. |
| **Remedy** | (1) `r.xadd("lrip:stream:osint", payload, maxlen=10_000, approximate=True)`. (2) Trim the existing backlog (`XTRIM lrip:stream:osint MAXLEN ~ 10000`). (3) Add `maxmemory`/`maxmemory-policy` to the compose Redis service as defense-in-depth. (4) Log `XLEN` after publish (debug) and add an operational threshold warning. |
| **Acceptance** | `XLEN` stabilizes ≤ 10,000 after trimming; consumer (`osint_hazard`) still reads its 3h window correctly; no regression in news ingestion. |

### S7 (P1) — Data Layer RLS Hardening Across Core Tables

| | |
|---|---|
| **Finding** | Seven core tables lack comprehensive RLS configuration. Specifically: `data_sources` has RLS enabled with zero anon policies (blocking anon reads); `incidents`, `route_approvals`, and `news_articles` have RLS disabled (permitting open anon writes). |
| **Evidence** | Mimo subagent empirical audit: `data_sources` returns 42501 on anon; `route_approvals` allows anon insert; `000_init.sql:16-23,40-56,80-89`; `009_commodity_prices_public_read.sql:1`. |
| **Remedy** | (1) **Migration 010 (Public-Read + Privileged-Write)**: Explicitly `enable row level security` on `incidents`, `data_sources`, `route_approvals`, `news_articles`, `commodity_prices`, `kg_entities`, and `kg_relationships`. (2) Grant `SELECT` to `anon, authenticated` on public domain tables (`incidents`, `data_sources`, `news_articles`, `commodity_prices`, `kg_*`). (3) Restrict write operations (`INSERT`, `UPDATE`, `DELETE`) exclusively to `service_role` (backend ingestors/workers) and authenticated operators for approvals. (4) Document policies and verify via anon smoke reads. |
| **Acceptance** | Every core table has an explicit RLS state and documented policies; anon reads return public data (not silent `[]`); anon writes are rejected with 42501; backend service-role paths retain full write access. |

---

## 3. Execution Order (Two-Wave Phased Execution)

### Wave 1: P0 Correctness & Production Blockers
1. **S1 (OpenMeteo Adapter)**: Implement `health_check()` and align `__init__` signature in `backend/app/adapters/openmeteo_adapter.py`.
2. **S2 (NVIDIA NIM Gateway)**: Sync `backend/.env` with root `.env`, switch model to catalog-verified `deepseek-ai/deepseek-v4.1-flash`, replace canned fallback prose with structured degradation in `agents/llm_gateway.py`, and enforce rejection of degraded text in `economic_intelligence.py`.
3. **S3 (NLP / NER Extraction)**: Centralize Gemini model to `gemini-1.5-flash` in `Settings`, clean up `ner_pipeline.py` and `news_extractor.py`, and upgrade failure logs to warning.
4. **S4 (Incidents API - Dual-Layer Layer 1)**: Update `backend/app/routers/incidents.py` to query valid columns (omit missing `lat, lon`, fetch `location`), parse WKT `POINT(lon lat)` in Python into float coordinates for `IncidentResponse`, and log Supabase query errors visibly.

### Wave 2: P1 Resilience & Data Hygiene
5. **S5 (TomTom Bbox Compliance & Degradation)**: Refactor `backend/app/adapters/tomtom_adapter.py` to use corridor-anchored tiling (≤4,600 km² cells around key checkpoints), deduplicate incidents across tiles by ID, add a 403 credit-exhausted latch, flag `is_fallback: true` in corridor payloads, and wire health reporting.
6. **S6 (Redis OSINT Maxlen Trimming)**: Add `maxlen=10_000, approximate=True` to `unified_news_ingestor.py` XADD, and execute backlog trim on `lrip:stream:osint`.
7. **S7 & S4-Layer 2 (Supabase RLS & Schema Migration 010)**: Author Migration 010 to add concrete `lat`/`lon` columns to `incidents` (backfilled from `location`) and establish Public-Read + Privileged-Write RLS policies across `incidents`, `data_sources`, `route_approvals`, `news_articles`, and `commodity_prices`.

### Close-out (P2)
8. **End-to-end verification**: `pytest backend/tests`, `npx tsc --noEmit`, live API probe script, and write Phase 55 summary.

---

## 4. Verification Plan

| Check | Command / Artifact | Target |
|---|---|---|
| Backend suite | `pytest backend/tests` | 100% pass; new tests: openmeteo instantiation, gateway fallback rejection, incidents populated query, tomtom tiling area ≤ 10k km², xadd maxlen |
| Frontend types | `npx tsc --noEmit` | 0 errors |
| Live API audit | `python scripts/audit_backend_apis.py` | `/api/v1/incidents` non-empty; corridor latency no worse than 979 ms baseline; degraded flags visible |
| Redis | `XLEN lrip:stream:osint` | ≤ 10,000 |
| Supabase | verification SQL (pg_class / policies) + anon smoke reads | RLS explicit + reads work |
| NIM | live gateway call | real completion, no canned string |

---

## 5. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Live schema differs from committed DDL (migrations 001–004 missing) | Diagnose before migrating; write migrations idempotently (`if not exists` / guarded) |
| TomTom tiling multiplies request count against rate limits | Corridor-scoped tiles + per-tile sequential fetch with small sleeps + dedupe |
| NIM catalog ID could change/retire | Startup catalog check logs available models; model in config, not scattered literals |
| RLS migration could break working anon paths | Apply read policies first, verify each table with anon smoke reads before enabling enforcement on the rest |
| Multi-worker duplication (`--workers 2`) | Pollers stay idempotent; do not add "exactly once" assumptions |

---

## 6. Out of Scope (Deferred Watchlist)

Logged from the audit, intentionally not in Phase 55 scope:

- AISStream `mmsi` bridge into `port_queue` events (live maritime enrichment) — `aisstream_adapter.py:217-233` vs `telemetry_service.py:985-989`.
- NASA FIRMS runtime registration + `NASA_FIRMS_MAP_KEY` provisioning.
- Generic health-loop wiring for BMKG/Earth2 (beyond TomTom in S5) and removal of seeded `'ok'` optimism.
- Hardcoded savings constants (18.5% / 14.2%) in `cuopt_tomtom_service.py:131-132` and hardcoded solver latencies in `evaluation_router.py`.
- Dead frontend path `/api/crisis/process` (`frontend/lib/api.ts:75`).
- Social scraper dead config (`settings.twitter_bearer_token`) and `MOCK_SOCIAL_POSTS` residue.

These should become a Phase 56 candidate list once Phase 55 lands.
