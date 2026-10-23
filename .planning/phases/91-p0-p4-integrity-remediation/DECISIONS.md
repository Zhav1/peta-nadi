# Phase 91 — Decisions

All dates are **2026-10-23**. Each decision is tied to the code that
implements it (`git show 20c7fa5`). Decisions are listed in the order they
constrain the pipeline.

| # | Decision | Why | Evidence |
|---|---|---|---|
| D1 | **All incident writes go through `agents/tools/supabase_tools.write_incident()`.** Demo and simulation must not build their own rows. | `demo_router` inserted `dict(state)`, which contains agent-only keys and fails against PostgREST; two write paths also meant two different schemas in flight. | `backend/app/routers/demo_router.py`; `supabase_tools.py` |
| D2 | **The payload is an explicit whitelist of real `incidents` columns.** Fields without a column go into `evidence` JSONB. | A "best effort" payload silently fails the whole insert. Packing extras into `evidence` keeps `is_simulated`, `region`, `causal_chain`, forecasts and the evidence chain without schema churn. | `_INCIDENT_UPDATE_FIELDS`, `db_payload` |
| D3 | **`incident_id` is derived deterministically:** real UUID passthrough, else `uuid5(NAMESPACE_URL, "prehub:crisis:{crisis_id}")`. | Replaying the same crisis must hit the same row. The live column is TEXT, so no DB-side UUID cast is required. | `_incident_key` |
| D4 | **Writes are upserts on `incident_id`, with check-then-update first and a legacy fallback.** | Replay previously hit the unique constraint. Existence check avoids the constraint path and lets the log say "reused"; upsert covers first write; insert-race fallback preserves the row. | `_persist_incident` |
| D5 | **No silent anon fallback for incident writes.** If `SUPABASE_SERVICE_ROLE_KEY` is absent, skip the write and report `supabase_write_disabled`. | The anon client is RLS-denied; attempting it produced a false "saved" path and lost data. Explicit degradation keeps the in-memory replay truthful. | `write_incident`, `backend/app/db/supabase_client.py` |
| D6 | **Write capability is observable at boot and via `/health/sources`.** `lrip:health:supabase_write` is `enabled` or `disabled_no_service_key`. | Ops must see *why* writes are missing, not discover it from an empty table. | `init_write_health`, `record_write_health`, `health.py` |
| D7 | **Geometry is normalized to GeoJSON at the boundary.** Backend emits GeoJSON; frontend re-validates with `toLonLatRing()` and drops invalid shapes. | PostgREST returns WKB hex; forwarding it breaks the map layer. Normalizing twice is deliberate (server for all consumers, client for stale caches/legacy payloads). | `_normalize_geojson_polygon`, `frontend/lib/polygonGeom.ts` |
| D8 | **`affected_area` is the write target; `affected_polygon` is read-only legacy.** | The PostGIS column is `affected_area`. Reading both keeps old rows drawable; writing both is impossible. | `_to_ewkt_polygon`, `get_hazard_polygons` |
| D9 | **Forecast = nearest-segment anchor × deterministic horizon decay.** No regression across unrelated segments. | `polyfit` extrapolated from segments with no spatial relation to the event, producing confident nonsense. Decay regresses toward baseline by horizon. | `prediction.py` (`HORIZON_DECAY`, `baseline_delay`) |
| D10 | **Weather uses the nearest grid point by Haversine, with station identity and distance recorded.** | `events[-1]` is "last written", not "nearest"; it applied a far station's weather (observed as Bakauheni) to a North Sumatra event. | `prediction.py` (`candidates`, `selected`) |
| D11 | **Simulated evidence is discounted (`×0.90`), never promoted to a fixed 0.90.** | Rewriting confidence to 0.90 is synthetic certainty; a demo bypass may still route, but the number must reflect evidence quality. | `SIMULATED_EVIDENCE_DISCOUNT`, `validation_mode` |
| D12 | **Missing sensor distance is `+inf`, not `0.0`.** | `0.0` satisfied the `<=30 km` corroboration check, so an unknown sensor self-corroborated. Unknown evidence must never pass a proximity gate. | `_resolve_finding_distance` |
| D13 | **OSINT corroboration requires spatial anchoring:** ≤100 km, or — with no coordinates — region/corridor text match *and* hazard-type alignment. | A keyword hit anywhere in the 3 h stream used to boost confidence, commodities and blocked corridors. | `_evaluate_spatial_relevance`, `SPATIAL_GATE_RADIUS_KM` |
| D14 | **Region is a canonical slug on the wire, a human label in the UI.** Region lives in `evidence` JSONB because `incidents` has no column. | Agents compared free-text regions; the DB rejected `.eq("region", …)`. Slugs stabilize comparisons; a display map keeps the UI readable. | `data_collection.normalize_region`, `frontend/lib/region.ts`, `_row_region` |
| D15 | **Cache TTL is strictly greater than the poll interval; an empty parse never overwrites a good cache.** | TTL == interval created an expiry window exactly at refresh; a transient empty parse blanked the forecast. | `main.py` (`ex=25200`, `if events:`) |
| D16 | **Only one process runs ingestion pollers:** `--workers 1`, `POLLERS_ENABLED` gates the lifespan tasks. | `--workers 2` started BMKG/TomTom/Open-Meteo/FIRMS/AIS/news/PIHPS/social twice, duplicating network calls and LLM spend. | `docker-compose.yml`, `render.yaml`, `backend/app/config.py`, `main.py` |
| D17 | **Health is evidence-based:** Redis telemetry first, `data_sources` mirror second, env capability gate last. Absence = `unknown`; a missing key can never be `healthy`. | Hardcoded `verified_active_adapter` reported dead sources as healthy. | `health.py` (`_SOURCE_SPECS`, `_build_source_entry`) |
| D18 | **Validated alerts fan out per crisis, with no global broadcast channel.** In-process queues + last-alert replay; cross-process bus stays the Redis stream. | A global channel would leak alerts across tenants/crises; an in-process-only design would miss cross-worker producers. SSE `simulation_complete` is the guaranteed delivery path. | `alert_fanout.py`, `main.py` WebSocket, `agent_worker.py` |
| D19 | **Agent 6 calls the notification service directly; `/api/notify` exists only for internal/ops callers.** | The old self-POST to `localhost:8000/api/notify` 404'd and the error was swallowed. | `notification_service.py`, `agent_router.py` |
| D20 | **GraphRAG treats `kg_*` as canonical and legacy tables as fallback; the graph cache is versioned.** | The legacy tables do not exist in the current schema, so the graph was always empty; a version bump invalidates the empty cached graph. | `graphrag.py`, `_GRAPH_CACHE_KEY` |
| D21 | **Seed `kg_relationships` with the corridor dependency edges and a unique triple.** | `000_init.sql` seeded entities but zero relations; `causal_chain` could never be non-empty. | `infra/supabase/migrations/015_kg_relationship_seed.sql` |
| D22 | **UI shows only produced values; absent fields render "Belum tersedia" / "Belum terverifikasi".** | `0.92`, `0.94`, `0.95`, `confidence × 0.94` "Brier", canned delay arrays and cost fallbacks were fabricated. | `EvidenceTab.tsx`, `MitigationTab.tsx`, `CrisisMap.tsx` |
| D23 | **Crisis switches invalidate in-flight impact work.** Clear queue/vehicle immediately; a request counter rejects late responses. | Crisis A's DSS queue could render under crisis B, and a slow A response could overwrite B. | `DashboardClient.tsx` (`crisisSelectionReqRef`, `clearImpactAssessment`) |
| D24 | **OD/cargo keys are normalized once, with camelCase aliases accepted.** `CrisisState` must declare every key LangGraph should carry. | LangGraph 0.2.28 drops undeclared state keys, so dashboard selections vanished before RouteOptimization. Aliases keep older payloads working. | `agents/state.py`, `data_collection.normalize_operational_fields`, `route_optimization.py` |
| D25 | **A declared OD is never rewritten to the graph's first/last node.** If it cannot be resolved, return `no_route`. | The legacy fallback silently routed Belawan→Bakauheni (or arbitrary endpoints) when an operator picked a village. | `route_optimization.py` (`od_declared`) |
| D26 | **STM is one JSON document at `lrip:state:crisis:{id}`.** | Writers used `SET` JSON while the reader used `HGETALL`, causing a Redis WRONGTYPE/empty-state split. | `redis_client.get_stm_state` |

## Rejected alternatives (explicitly not taken)

| Alternative | Rejected because |
|---|---|
| Keep `insert` and catch the unique violation | Loses the existing row's id and forces a second query anyway; upsert expresses the intent. |
| Default missing distance to `0.0` and rely on a separate flag | Any consumer that forgets the flag regains the free pass; `+inf` fails closed. |
| Keep `polyfit` but filter segments by distance | Still extrapolates across different corridors; nearest-anchor + decay is explainable and bounded. |
| Pick `events[-1]` and label it "latest forecast" | The cache order has no spatial meaning; a far station's weather is not evidence for this incident. |
| Return `healthy` when Redis/Supabase are unreachable | Absence of telemetry is not health. |
| Run pollers in every worker and dedupe in Redis | Dedup still pays the network/LLM cost and needs a lock; one poller process is cheaper and simpler. |
| Add a global WebSocket broadcast for alerts | Cross-tenant/crisis leakage; per-`crisis_id` scoping is the security boundary. |
| Compute a Brier-style probability in the UI from confidence | That arithmetic is not a calibrated probability; better to show "Belum tersedia". |
