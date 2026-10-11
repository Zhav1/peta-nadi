# Phase 55: Comprehensive Engines Audit & Stabilization (Master Blueprint)

**Status:** READY FOR IMPLEMENTATION
**Scope:** Next context window
**Inputs:** `SYSTEM_ENGINES_AUDIT_REPORT.md` (4 audit passes) · `55-WALKTHROUGH.md` (file:line evidence) · `55-ENVIRONMENT-FIXES-AND-PITFALLS.md` (external constraints) · `55-LEARNINGS.md` (design principles)
**Constraint reminder:** backend engines must keep running with zero regressions; every fallback must become *visible* rather than silent.

---

## 1. Objective

Stabilize the seven audited failure clusters across Telemetry, Intelligence/NLP, and Data Layer. The unifying acceptance criterion, per Phase 54's learnings: **no engine may silently mask a failure — every degradation must be flagged, logged, and surfaced.** The specific outcomes:

1. Weather fusion actually runs both providers (OpenMeteo no longer throws `TypeError`).
2. The LLM layer either produces real model output or explicitly reports degradation (NIM + Gemini model IDs fixed).
3. TomTom obeys the 10,000 km² bbox limit and reports credit exhaustion honestly.
4. Incident data actually reaches the API (fix `[]` despite 108 rows).
5. The OSINT event stream is bounded.
6. Core Supabase tables have deliberate RLS policies instead of accidental lockouts.

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

### S4 (P0) — `/api/v1/incidents` Returns `[]` Despite 108 Rows

| | |
|---|---|
| **Finding** | The endpoint returns a 22-byte `{"items":[],"total":0}` while the DB holds ~108 rows. Compounding causes: (a) `incidents` has **RLS enabled with no policy** → anon select yields HTTP 200 `[]`; (b) the query selects `incident_id, lat, lon` while the writer path inserts `incident_id` + WKT `location` (never `lat`/`lon`) → column mismatch 400; (c) exceptions are swallowed, so both cases are indistinguishable. |
| **Evidence** | `backend/app/routers/incidents.py:33-35,69-96` (anon client `:71`, select `:72-74`, swallow `:95-96`); writer `backend/app/services/unified_news_ingestor.py:153-164,184`; live probe `test-results/live_api_audit_report.json:28-36`; schema drift `000_init.sql:41,49` vs `005:5` / `008:27`. |
| **Remedy** | (1) **Diagnose first** (one-shot script): probe as anon vs service-role; introspect live `information_schema.columns` for `incidents`. (2) **Migration 010**: explicit `alter table public.incidents enable row level security;` + a SELECT policy for `anon, authenticated` (public safety data), leaving writes to service-role/authenticated paths. (3) Align the SELECT list to the live schema; if only `location` exists, select it and derive `lat/lon` via PostGIS (`ST_Y/ST_X`) or backfill concrete columns. (4) Replace the bare swallow: log at `warning` with the Supabase error and add a `degraded` marker (or 503) so empty ≠ broken silently. (5) Optional: raise/parameterize the 50-row `limit` for the 108-row table. |
| **Acceptance** | Live endpoint returns rows (count > 0 against the 108-row table); a deliberately failing query is observable in logs + response; regression test covers populated-table behavior. |

### S5 (P1) — TomTom Bbox Compliance, Credit Fallback & Honest Degradation

| | |
|---|---|
| **Finding** | The incidents request ships a ~1.7M km² bbox (~170× the 10,000 km² limit) → guaranteed HTTP 400; flow requests hit HTTP 403 `InsufficientFunds` on credit exhaustion. Both are silently discarded, and three layers of hardcoded speeds pass as live data. |
| **Evidence** | `backend/app/adapters/tomtom_adapter.py:41` (bbox), `:72-87` / `:90-101` (silent discard), `:67-68` (empty when key missing); hardcoded layers: `cuopt_tomtom_service.py:39-44,71-72,134` (misleading `tomtom_live_speed_kmh` label), `corridor_service.py:46-57` (+ `"ONLINE"` labels `:175-181`), `agents/nodes/prediction.py` `base_delays`; loop `main.py:61-96`. |
| **Remedy** | (1) **Tile the requests**: split coverage into corridor-anchored cells ≤ 10,000 km² each (example: 0.5° lat × 0.75° lon ≈ ≤ 4,600 km² at Sumatra latitudes; per-checkpoint 0.5°×0.5° ≈ 3,070 km² boxes around the 12 checkpoints), dedupe incidents by ID. Full-island coverage via Incident Details v5 is infeasible — scope to monitored corridors. (2) **Credit handling**: on 403, set a `credit_exhausted` state, log once at `warning`, and back off (stop hammering per poll). (3) **Honest fallback**: corridor payloads carry `is_fallback: true` + `status: "DEGRADED"` with the reason; remove/replace the `tomtom_live_speed_kmh` label when values are seed constants. (4) Wire `TomTomAdapter.health_check()` (`:43-61`) into the loop and write `update_source_health()`. |
| **Acceptance** | No request exceeds 10,000 km²; incidents return for corridor tiles when credits exist; with credits exhausted, `/api/v1/corridor/context` exposes the degraded flag and the UI renders `FALLBACK` (Phase 54 contract); health endpoint shows TomTom as degraded, not `healthy`. |

### S6 (P1) — Redis `lrip:stream:osint` Maxlen Trimming

| | |
|---|---|
| **Finding** | The stream held **43,640 unbounded items**: the only hand-rolled `XADD` in the codebase omits `maxlen`, while every adapter stream is capped at 10,000. |
| **Evidence** | `backend/app/services/unified_news_ingestor.py:99` vs `backend/app/services/redis_client.py:63` (`maxlen=10_000, approximate=True`) and list fallback `:70`; consumers `agents/nodes/osint_hazard.py:43-60`; Redis service config has no `maxmemory` (`docker-compose.yml:2-15`). |
| **Remedy** | (1) `r.xadd("lrip:stream:osint", payload, maxlen=10_000, approximate=True)`. (2) Optionally trim the existing backlog (`XTRIM lrip:stream:osint MAXLEN ~ 10000`). (3) Add `maxmemory`/`maxmemory-policy` to the compose Redis service as defense-in-depth. (4) Log `XLEN` after publish (debug) and add an operational threshold warning. |
| **Acceptance** | `XLEN` stabilizes ≤ 10,000 after trimming; consumer (`osint_hazard`) still reads its 3h window correctly; no regression in news ingestion. |

### S7 (P1) — Data Layer RLS Hardening Across Core Tables

| | |
|---|---|
| **Finding** | Seven core `000_init.sql` tables have **no RLS policies** (`data_sources`, `incidents`, `route_approvals`, `commodity_prices`, `ltm_episodes`, `kg_entities`, `kg_relationships`) plus `ground_truth_outcomes`; the live project's RLS-enabled state turns this into silent empty reads and `42501` write failures. Migration 009 is policy-only (assumes RLS enabled out-of-band). |
| **Evidence** | `infra/supabase/migrations/000_init.sql:16-23,40-56,80-89,95-106,116-123,134-141,150-158`; `006:16-28` (ground_truth_outcomes); `007:43,86` and `008:40` (the protected pattern to copy); `009_commodity_prices_public_read.sql:1` (policy without enable). |
| **Remedy** | (1) **Migration 010/011**: for each table ship an explicit decision — `alter table … enable row level security;` + SELECT policies for public-read tables (`incidents`, `commodity_prices`, `data_sources`, `kg_*` as appropriate); writes remain service-role/authenticated by design (documented in the migration comments). (2) Align with S4's incidents policy in a single migration to avoid double-enabling. (3) Backfill the missing `enable row level security` for `commodity_prices` so fresh replays match the live project. (4) Post-migration verification query (pg_class `relrowsecurity`) + anon read smoke tests. |
| **Acceptance** | Every core table has an explicit RLS state and documented policies; anon reads return data (not silent `[]`); anon writes are rejected as designed; fresh-database replay applies RLS identically to prod. |

---

## 3. Execution Order (Recommended)

1. **Diagnostics first:** one-shot live-schema probe (incidents columns + RLS state), NIM `/v1/models` catalog check — these two reads decide S2/S4 details.
2. **S1 + S3** (independent, low blast radius) → run weather-fusion and NLP tests.
3. **S4 + S7 together** (one migration authoring pass; S4 depends on S7's incidents policy).
4. **S2** (gateway contract change + caller filters + tests).
5. **S5** (TomTom adapter rewrite: tiling + credit state + health wiring) → corridor context regression tests.
6. **S6** (one-line XADD + trim + compose memory) → verify XLEN.
7. **Close-out (P2):** full `pytest backend/tests`, `npx tsc --noEmit`, live probe via `scripts/audit_backend_apis.py`, then write Phase 55 walkthrough results and update `ROADMAP.md` status to COMPLETE.

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
