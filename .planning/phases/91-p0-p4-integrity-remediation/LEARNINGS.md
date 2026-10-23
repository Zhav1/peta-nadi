# Phase 91 — P0–P4 Integrity Remediation: Learnings

**Scope:** the P0–P4 session committed as `20c7fa5` —
*"P0-P4: OSINT hazard + prediction remediation, idempotent writes, honest
confidence, map/UI null-guards, OD preservation, notify fanout, spatial gate"*
(40 files, +4462/−850). This folder is new because the work landed after
Phase 90 (`9f0a854`) and had no phase record.

**Evidence base:** the commit diff itself (`git show 20c7fa5 -- <path>`), the
new migration `infra/supabase/migrations/015_kg_relationship_seed.sql`, and the
tests added/changed in `backend/tests/test_agents.py`,
`backend/tests/test_consensus_calibration.py`. No test-run transcript is stored
with this artifact, so this file records *what changed*, not a pass claim.

---

## 1. Fixes tried (what was actually changed)

### F1 — `supabase_tools` payload whitelist (writes no longer invent columns)
**Symptom:** `write_incident()` built a row from agent state keys
(`is_simulated`, `region`, `affected_polygon`, `overall_confidence`,
`evidence_chain`, `route_recommendations`, `inflation_forecast`,
`causal_chain`, `decision_support_output`) that are not `incidents` columns, so
PostgREST rejected every insert with *column does not exist*.
**Change:** `_INCIDENT_UPDATE_FIELDS` is the single writable set; payload is
`incident_id, title, description, type, severity, status, confidence, lat, lon,
location, affected_area, recommendations, evidence, updated_at`. Everything
without a column is packed into the `evidence` JSONB
(`is_simulated`, `region`, `evidence_chain`, `inflation_forecast`,
`causal_chain`, `decision_support_output`).
**Evidence:** `agents/tools/supabase_tools.py` (`_INCIDENT_UPDATE_FIELDS`,
`db_payload`), `backend/app/routers/demo_router.py`.

### F2 — Deterministic incident key (UUIDv5)
**Change:** `_incident_key()` returns a real UUID unchanged, generates
`uuid4` only for a blank id, and otherwise derives
`uuid5(NAMESPACE_URL, "prehub:crisis:{crisis_id}")`. Replaying the same
`crisis_id` therefore targets the same row.
**Note:** the live `incidents.incident_id` column is **TEXT**, so the UUIDv5 is
for stable replay identity, not a database type requirement.
**Evidence:** `supabase_tools.py::_incident_key`.

### F3 — GeoJSON normalizer, backend + frontend
**Symptom:** PostgREST returns PostGIS `geometry` as WKB/EWKB hex
(`0103000020E6...`); the map received a string it could not draw.
**Change (backend):** `_normalize_geojson_polygon()` accepts GeoJSON
object/string, Feature/FeatureCollection, GeometryCollection, WKT/EWKT and
WKB hex (endian-aware reader, EWKB SRID flag, Z/M flags, ISO +1000 type
offsets); returns a GeoJSON Polygon/MultiPolygon or `None` for non-areal input.
`get_hazard_polygons()` now emits `polygon`, `geometry`, `geometry_format` and
`polygon_ring`.
**Change (frontend):** `frontend/lib/polygonGeom.ts::toLonLatRing()` mirrors the
same coercion and always returns a closed `[lon, lat]` ring or `null`;
`DashboardClient` drops invalid hazards instead of rendering them.
**Evidence:** `supabase_tools.py` (`_WKBReader`, `_parse_wkt`,
`_normalize_geojson_polygon`), `frontend/lib/polygonGeom.ts`,
`frontend/components/dashboard/DashboardClient.tsx`.

### F4 — `polyfit` removal → nearest-segment horizon decay
**Symptom:** `numpy.polyfit` was fitted over timestamps/delays of *unrelated*
TomTom segments, then extrapolated 6/12/24/48 h.
**Change:** numpy import removed (now `math`). Forecast anchors on the
**nearest** segment's observed delay; `HORIZON_DECAY = {6h:1.0, 12h:0.85,
24h:0.65, 48h:0.45}`; delays clamped to `[5.0, 300.0]`; unreadable segments are
skipped and reported.
**Evidence:** `agents/nodes/prediction.py`.

### F5 — Nearest-grid Haversine (weather), not the last cached entry
**Symptom:** Open-Meteo cache was read as `events[-1]` — the last element of the
cache list, with no relation to the incident. In this session that surfaced a
station far from the event (reported as Bakauheni) for a North Sumatra crisis.
**Change:** candidates are extracted with `lat/lon/name/predictions`; the
nearest candidate by Haversine to `state.lat/lon` wins (tie-break: cache
index); fallbacks are region-name match and then first candidate. Station name,
`weather_distance_km` and `weather_provenance` are recorded.
**Evidence:** `prediction.py` (`candidates`, `selected`, `weather_provenance`).

### F6 — Simulated-evidence discount (no synthetic 0.90)
**Symptom:** the consensus gate rewrote a simulated run's confidence to a fixed
`0.90`, and the prediction agent *added* `+0.10` for `is_simulated`.
**Change:** `SIMULATED_EVIDENCE_DISCOUNT = 0.90` multiplies the calibrated
confidence; the fixed `0.90` rewrite is gone; `validation_mode` reports
`simulation_bypass` / `physical_corroboration` / `standard`. Prediction now
subtracts `0.05` for simulated input instead of adding.
**Evidence:** `agents/tools/consensus_gate.py`, `prediction.py`.

### F7 — Idempotent upsert / replay-safe persistence
**Symptom:** replaying a crisis did a bare `insert`, hitting the unique
constraint and returning an empty id.
**Change:** `_persist_incident()` does existence check → update when present;
otherwise `upsert(..., on_conflict="incident_id")`; falls back to
update-then-insert for older PostgREST; if an insert still races, it updates the
existing row. Mock responses are checked with `isinstance(rows, list)` so a
non-list sentinel is never mistaken for an existing row.
**Evidence:** `supabase_tools.py::_persist_incident`, `_extract_incident_id`.

### F8 — Health keys and honest source status
**Change:**
- Health contract: `lrip:health:source:{source_name}` (adapters/scrapers),
  `lrip:health:social_scraper`, `lrip:health:supabase_write`.
- `health.py` reads all keys in one Redis pipeline, merges with the
  `data_sources` mirror and an env-capability gate. No telemetry →
  `unknown`; a missing required key forces `degraded` (or `disabled` for
  Twitter), and can never be masked by a stale `ok`.
- `supabase_client.py` adds `has_service_role_key`, `is_write_configured`,
  `get_write_status`, `record_write_health`, `init_write_health`.
- STM representation unified: `redis_client.get_stm_state` now `GET` + JSON
  decode (was `HGETALL`), matching `agents.memory.stm`'s `SET` of a JSON
  document.
**Evidence:** `backend/app/routers/health.py`, `backend/app/db/supabase_client.py`,
`backend/app/services/redis_client.py`.

### F9 — Null-guards and removal of invented UI numbers
**Change:**
- `EvidenceTab`: `ConfidenceBar` accepts `null`; the `0.92` confidence
  fallback is removed; calibrated disruption probability is `null` (no Brier
  score is carried on `CrisisState`); the canned
  `[20,30,25,50,70,90,120]` delay chart is replaced by real
  `evidence.delay_history` or the PredictionAgent horizons.
- `CrisisMap`: `eta_minutes` / `distance_km` null or non-finite → "Belum
  terverifikasi"; cost formatting guarded.
- `MitigationTab`: apply-policy button disabled when no data; impact delay and
  radius render "Belum terverifikasi"/"Belum tersedia" instead of defaults.
**Evidence:** `frontend/components/sidebar/EvidenceTab.tsx`,
`frontend/components/map/CrisisMap.tsx`,
`frontend/components/sidebar/MitigationTab.tsx`.

### F10 — Region normalizer (backend + frontend)
**Change:**
- Backend: `normalize_region()` folds `North Sumatra` / `Sumatera Utara` /
  `Sumut` / gateway cities to canonical slugs (`north_sumatra`, …);
  `region_matches_text()` matches aliases/corridors. The canonical slug is
  written to `normalized_event`, state and evidence; the original spelling is
  kept as `region_raw`.
- Prediction history: `incidents` has **no `region` column**; `_row_region()`
  reads `evidence.region|province|area`, with a ±0.5° bbox query first.
- Frontend: `frontend/lib/region.ts` provides `toRegionSlug`,
  `normalizeRegion`, and `regionSlugFromLatLon` (province bbox table) so the
  payload always carries a slug and the UI always renders a human label.
**Evidence:** `agents/nodes/data_collection.py`, `prediction.py`,
`frontend/lib/region.ts`, `frontend/hooks/useCrisisSimulationStream.ts`.

### F11 — Notification fan-out
**Symptom:** Agent 6 POSTed to `http://localhost:8000/api/notify`, which did not
exist; the 404 was swallowed, so no alert was ever sent.
**Change:** `alert_fanout.py` adds per-`crisis_id` in-process queues (bounded
16), a bounded last-alert replay cache (256) and **no global channel**.
`/ws/crisis/{id}` registers a listener, pumps `validated_alert` events, replays
the last alert to late subscribers, and unregisters on disconnect. Agent 6 calls
`notification_service.notify_validated_alert()` directly; `agent_router` now
exposes `POST /api/v1/notify` and `/api/notify` for internal callers. The
terminal `simulation_complete` SSE event always carries `alert`,
`notification_status` and `degraded_sources`.
**Evidence:** `backend/app/services/alert_fanout.py`,
`backend/app/services/notification_service.py`, `backend/app/main.py`,
`backend/app/workers/agent_worker.py`, `backend/app/routers/agent_router.py`.

### F12 — `kg_*` graph fix
**Symptom:** GraphRAG read only the legacy `entities` / `entity_relations`
tables, which do not exist in the current schema, so `causal_chain` was always
empty. `000_init.sql` also seeded 8 `kg_entities` but **zero**
`kg_relationships`.
**Change:** `ENTITY_TABLES = ("kg_entities", "entities")`,
`RELATION_TABLES = ("kg_relationships", "entity_relations")`; row normalizers
accept both schemas (`id`/`entity_id`, `relation`/`relation_type`, coordinates
from columns or `metadata`/`location`); cache key bumped to
`lrip:graph:entity:v2`; Redis cache read is best-effort. Migration `015` adds a
unique `(from_entity, to_entity, relation)` index and seeds 11 corridor edges
by name join with `ON CONFLICT DO NOTHING`.
**Evidence:** `agents/tools/graphrag.py`, `supabase_tools.py::load_entities_and_relations`,
`infra/supabase/migrations/015_kg_relationship_seed.sql`.

---

## 2. Problems found *while making* it (root causes)

| # | Problem | Root cause | Fix |
|---|---|---|---|
| 1 | `affected_polygon` vs `affected_area` | Writer/readers disagreed on the real column name; legacy key kept being read | Write EWKT to `affected_area`; read `affected_area` first, then legacy keys |
| 2 | `region` column missing | `incidents` has no `region`; code queried `.eq("region", …)` | Region lives in `evidence` JSONB; Python-side filter + bbox |
| 3 | `events[-1]` weather pick | "Latest cache entry" was mistaken for "nearest station" (surfaced Bakauheni) | Haversine nearest + station name/distance/provenance |
| 4 | `ex == interval` cache race | Open-Meteo cache TTL `21600` equalled the `21600`s poll sleep, so the key could expire just before refresh | TTL `25200` (> interval); empty parse no longer overwrites good cache |
| 5 | `distance_km 0.0` free pass | Missing distance defaulted to `0.0`, satisfying the `<=30 km` corroboration check | Missing/unparseable distance → `+inf`; finding carries `None` |
| 6 | `dict(state)` insert failure | Demo path inserted raw LangGraph state | Delegate to `write_incident` |
| 7 | Hardcoded severity / region / confidence / costs / citations | Placeholders shipped as data (`severity="high"`, `region='north_sumatra'` always, `0.94`, `0.92`, Brier math, cost fallbacks, static citation block) | Store/propagate real values; render "Belum tersedia" when absent |
| 8 | Stale impact state | Crisis A's DSS queue/vehicle survived a switch to crisis B; a slow response could overwrite B | `crisisSelectionReqRef` counter + `clearImpactAssessment()` on every switch/clear |
| 9 | `toFixed` null crash | `(crisis.radius_km ?? 4.5).toFixed(1)` assumed a number | `typeof === 'number'` guard + explicit copy |
| 10 | Test blind mocks | Mocks defined a schema the database did not have; assertions passed without exercising the contract | Mocks aligned to `affected_area`; new tests for missing distance, distant report, sim discount, region aliases, poller-disabled |
| 11 | Concurrent edits | Parallel agents edited the same files; later writes overwrote earlier hunks | Single-writer-per-file or re-read before edit; verify by diff after each merge |

---

## 3. Concerns still open

1. **WKB hex rendering is implemented twice.** Python `_WKBReader` and
   TypeScript `fromWkbHex` must stay in sync. There is no shared golden fixture
   or cross-language test; any new EWKB variant (curved geometry, SRID in
   different position) is only covered if both readers are updated.
2. **Replay safety is not atomic at the database layer.** Check-then-upsert can
   race across processes; the insert-unique-violation fallback updates the row,
   so the loser of the race performs a last-writer-wins overwrite. `updated_at`
   is client-generated, not DB time.
3. **Anon fallback is still reachable.** `write_incident` refuses to run without
   a service-role key, but `get_write_client()` still returns the anon client
   for other callers. Any caller that does not check `is_write_configured()`
   can still be silently RLS-denied.
4. **Corroboration can still be fooled.** The spatial gate is a flat 100 km
   radius regardless of hazard footprint (earthquake vs. 1 km flood), and its
   text fallback is alias/substring matching. A provincial mention in a distant
   article that also names the hazard can pass `ner_region_hazard_match`.
5. **Synthetic-weather detection is naming-based.** `weather_provenance` is
   `simulated` only when `source.startswith("open-meteo-sim")`; any other
   synthetic feed is classified `observed`. A simulated *crisis run*
   deliberately bypasses the neutral multiplier, so demos can still escalate on
   synthetic weather.
6. **Demo vs production still diverge in durability.** Demo persistence is a
   background task whose failure is only logged (no health key, no retry); the
   demo store is in-process memory. `--workers 1` is what keeps it coherent.
7. **Pollers ×2 is fixed by configuration, not by code.** There is no leader
   election or Redis lock; `POLLERS_ENABLED=false` on replicas is operator
   discipline. A mis-set replica still duplicates ingestion and LLM spend.
8. **Fabricated values were removed only where audited.** Evidence/Mitigation/
   CrisisMap were cleaned; other components were not exhaustively swept.
   `disruptionProb` is now permanently `null` until a real calibrated score is
   added to `CrisisState`.
9. **STM key migration.** `get_stm_state` now expects a JSON string. Old
   deployments may still hold a *hash* at `lrip:state:crisis:{id}`; `GET` on a
   hash raises `WRONGTYPE` and that error is not caught in `get_stm_state`.
   Old keys need a one-time delete/migration.

---

## 4. Constraints / conditions the user gave this session

- **Subagents only:** use **DeepSeek V4.1 Flash-Free** subagents.
- **Manager mode:** the orchestrator does **not** investigate directly; it
  delegates to preserve the context window.
- **Git workflow:** `git add .`, `git commit -m "<message>"`, `git push`.
  (This documentation task is explicitly **files only — do not commit**.)
- **No temp files** — write artifacts in place.
- **Continue phase numbering** (last phase was 90 → this is 91).
- **Solve in another context window** — leave a self-contained handoff.

---

## 5. Environments & operational facts

- **Shell:** Windows PowerShell. No `head`, no `grep`, no `&&` chaining; use
  `Select-Object` / `Select-String` and `;`.
- **Python:** use `backend/.venv`. System Python lacks
  `google.generativeai`, so `backend/tests/test_agents.py` cannot be collected
  outside the venv (pre-existing).
- **Render:** secrets are declared `sync: false` and set in the dashboard
  (`SUPABASE_SERVICE_ROLE_KEY`, `TOMTOM_API_KEY`, `REDIS_URL`,
  `TWITTER_BEARER_TOKEN`, `NASA_FIRMS_MAP_KEY`, `OPENCODE_*`). Missing service
  role key = writes disabled by RLS, surfaced at `/health/sources`.
- **Vercel:** frontend deployment; backend URL resolved through `lib/baseUrl.ts`
  / `getBaseUrl()`.
- **Supabase live schema:** `incidents.incident_id` is **TEXT** (UUID-shaped
  strings are stored, but the column is not `uuid`). `affected_area` is the
  PostGIS column; `region` does not exist. PostgREST serializes geometry as
  WKB hex.
- **Redis keys:** `lrip:health:source:{name}`, `lrip:health:social_scraper`,
  `lrip:health:supabase_write`, `lrip:state:crisis:{id}` (STM, JSON string),
  `lrip:tomtom:segment:*`, `lrip:cache:open_meteo`,
  `lrip:stream:validated_alerts`, `lrip:stream:osint`,
  `lrip:graph:entity:v2`.
- **TTLs:** STM 86 400 s; Open-Meteo cache 25 200 s (poll every 21 600 s);
  `/health/sources` in-process cache 30 s. Health hashes are written without
  expiry.
- **Process model:** `uvicorn --workers 1`; extra HTTP replicas must set
  `POLLERS_ENABLED=false`.

---

## 6. How to avoid repeating these mistakes

1. **Contract tests against real DDL.** Assert column names against a schema
   fixture (or introspect `information_schema`), never against a hand-written
   mock table. A passing mock is not evidence that PostgREST accepts the row.
2. **One write path.** Demo, simulation and production must call the same
   writer; never `dict(state).insert`.
3. **Idempotency at the database layer.** Derive a stable key, add the unique
   constraint, and use `ON CONFLICT`/`upsert`. Keep the fallback but log it as
   degraded, and prefer DB `now()` for `updated_at`.
4. **Provenance is a field, not a comment.** Every external/synthetic source
   carries `source`, `provenance` (`observed`/`simulated`), distance and station
   identity; the UI renders provenance. Synthetic data never escalates a
   non-simulated run.
5. **Unknown is not zero.** Missing distance/confidence/cost/region must become
   `None` + "Belum tersedia", never `0`, `0.0 km`, `4.5 km`, `0.92` or
   `"Sumatera Utara"`.
6. **TTL strictly greater than the poll interval** (≈1.2×), and never replace a
   good cache with an empty parse.
7. **Anchor evidence spatially.** Haversine + nearest station name + distance;
   a flat radius is a minimum, not a substitute for hazard-specific footprint.
8. **Degradation ledger over booleans.** Return named `degraded_sources` and an
   `evidence_health` of `nominal|quiet|degraded`; "no data" must be
   distinguishable from "path dead".
9. **Test the failure path:** missing service key, missing distance, distant
   report, invalid/empty polygon, replay, empty poll, disabled token.
10. **Parallel work:** assign one writer per file; re-read before editing and
    diff after merging. Docs tasks do not commit.

---

## 7. Verification artifacts added in the commit

New/changed tests in `backend/tests/test_agents.py`:

- `test_osint_hazard_filters_resolved_and_preserves_severity`
- `test_demo_start_delegates_persistence_to_write_incident`
- `test_normalize_region_aliases`
- `test_data_collection_preserves_social_source_and_raw_text`
- `test_osint_social_raw_unpack_and_spatial_boost`
- `test_osint_spatial_gate_rejects_distant_lampung`
- `test_social_poller_disabled_without_token`
- `test_consensus_missing_distance_blocks_corroboration`
- `test_consensus_simulated_run_is_discounted`

`backend/tests/test_consensus_calibration.py` now documents that the benchmark
fixture carries no sensor-proximity metadata, so physical corroboration is
refused and the benchmark's route is not used as the detection decision
(`raw_probability ≈ 0.6518`, `route == "unconfirmed"`).
