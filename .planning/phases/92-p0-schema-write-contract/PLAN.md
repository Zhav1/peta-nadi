# Phase 92 — P0: Schema / Write Contract

**Workstream:** P0 (schema + persistence + process contract)
**Status:** IMPLEMENTED in commit `20c7fa5` (2026-10-23). Documentation uncommitted.
**Pre-fix revision:** `20c7fa5^` (Phase 90, `9f0a854`)

---

## 1. Why this phase exists

Every alert the swarm produced had to become a row in Supabase, and every
replay had to resolve to the same row. The pre-fix code had four independent
write paths (agent, demo router, simulation router, worker) that each built a
different payload, plus a silent anon-client fallback that made an RLS denial
look like a successful save.

**Evidence of the split behaviour**

| Pre-fix fact | File:line at `20c7fa5^` |
|---|---|
| `write_incident` payload contained non-column keys (`is_simulated`, `region`, `affected_polygon`) | `agents/tools/supabase_tools.py:25-32` |
| First write was a bare `insert(db_payload)`; replay hit the unique constraint | `agents/tools/supabase_tools.py:47` |
| Demo inserted raw LangGraph state: `db_row = dict(state)` then `insert(db_row)` | `backend/app/routers/demo_router.py:165-167` |
| Health reported `verified_active_adapter` even with Supabase unreachable | `backend/app/routers/health.py:44-46`, `:117` |
| STM writer/reader disagreed: `SET` JSON vs `HGETALL` | `backend/app/services/redis_client.py:82` |
| `docker compose` started uvicorn with `--workers 2` (duplicated pollers) | `docker-compose.yml` (pre-fix command) |

---

## 2. Defect register (WRITE-D*)

Each row is a plan-assigned ID; the evidence is the pre-fix line and the
post-fix line, both verifiable with `git show`.

| ID | Defect | Pre-fix evidence | Fixed at |
|---|---|---|---|
| WRITE-D1 | Payload contained keys with no `incidents` column, so PostgREST rejected the insert | `supabase_tools.py:25-32` (pre) | `agents/tools/supabase_tools.py:25` (`_INCIDENT_UPDATE_FIELDS`), `:517-539` (`db_payload`), `:456-471` (docstring: extras packed into `evidence` JSONB) |
| WRITE-D2 | Replay performed a bare insert and failed the unique constraint, returning an empty id | `supabase_tools.py:47` (pre) | `supabase_tools.py:355-449` (`_persist_incident`: existence check → update → `upsert(on_conflict="incident_id")` → update/insert fallback) |
| WRITE-D3 | Incident identity was not derivable from `crisis_id`, so replays could not target one row | no `_incident_key` before the commit | `supabase_tools.py:53-61` (`uuid4` only for blank, real UUID passthrough, else `uuid5(NAMESPACE_URL, "prehub:crisis:{id}")`) |
| WRITE-D4 | Demo persistence bypassed the shared writer and inserted agent-only keys | `demo_router.py:165-167` (pre) | `backend/app/routers/demo_router.py:161-176` (delegates to `write_incident`, logs `degraded_sources`, keeps in-memory replay) |
| WRITE-D5 | Missing service-role key fell back to the anon client and was silently RLS-denied | `supabase_client.get_write_client()` pre-fix warning-only branch | `backend/app/db/supabase_client.py:17` (health key), `:26-41` (`has_service_role_key` / `get_write_status`), `:64-89` (`init_write_health`); `supabase_tools.py:474-484` (skip + `supabase_write_disabled`) |
| WRITE-D6 | STM used two key spaces: `agents.memory.stm` wrote `lrip:crisis:*`, backend read `lrip:state:crisis:*` | `backend/app/services/redis_client.py:82` (`hgetall`), `agents/memory/stm.py` (pre-fix literal `lrip:crisis:`) | `agents/memory/stm.py:6` (`STM_PREFIX` import), `:15` (`LEGACY_STM_PREFIX`), `:44-58` (canonical write + legacy delete), `:61-80` (legacy read-through migration); `redis_client.py:79-93` (`GET` + JSON) |
| WRITE-D7 | Two uvicorn workers duplicated every lifespan poller (BMKG/TomTom/Open-Meteo/FIRMS/AIS/news/PIHPS/social) | `docker-compose.yml` pre-fix `--workers 2` | `docker-compose.yml` (`--workers 1`), `backend/app/config.py:71-73` (`pollers_enabled`), `backend/app/main.py:287-301` (gate + list), `:278-279` (`init_write_health` at boot) |
| WRITE-D8 | Open-Meteo cache TTL equalled the poll interval and an empty parse overwrote a good cache | `backend/app/main.py:121-127` (pre) | `backend/app/main.py:126-137` (`ex=25200`, `if events:`) |
| WRITE-D9 | Dashboard OD/cargo keys were absent from `CrisisState`, so LangGraph 0.2.28 silently dropped them; RouteOptimization then fell back to the graph's first/last node | `agents/state.py` pre-fix (no `origin`/`destination`/`cargo*` keys); `route_optimization.py:226-227`, `:261-267` (pre) | `agents/state.py:92-111` (declared keys + camelCase aliases); `data_collection.py:241-279` (`normalize_operational_fields`); `route_optimization.py:334-392` (`od_declared` → `no_route` instead of invented endpoints) |

---

## 3. Contract changes (authoritative)

1. **One writer.** `write_incident(state, degraded_sources=None) -> str`
   (`supabase_tools.py:452-455`). All callers must use it; `dict(state)` inserts
   are forbidden.
2. **Explicit column whitelist.** `incident_id, title, description, type,
   severity, status, confidence, lat, lon, location, affected_area,
   recommendations, evidence, updated_at` (`supabase_tools.py:517-539`).
   Fields without a column go into `evidence` JSONB:
   `is_simulated, region, evidence_chain, inflation_forecast, causal_chain,
   decision_support_output`.
3. **Idempotent identity.** `incident_id` is stable for a given `crisis_id`
   (`supabase_tools.py:53`). Replays update the row and return the same id.
4. **Fail-closed writes.** No service-role key → no write attempt; return `""`
   and append `supabase_write_disabled` to `degraded_sources`
   (`supabase_tools.py:474-484`).
5. **Write capability is observable.** Redis key
   `lrip:health:supabase_write` is `enabled` or `disabled_no_service_key`
   (`supabase_client.py:17-23`, `:64-89`).
6. **One STM document.** `lrip:state:crisis:{id}` holds a JSON string; legacy
   `lrip:crisis:{id}` is read once and migrated (`stm.py:44-80`).
7. **One ingestion process.** `--workers 1`; extra replicas set
   `POLLERS_ENABLED=false` (`config.py:73`, `main.py:287`).
8. **Every carried state key is declared.** `CrisisState` now declares
   `origin`, `destination`, `start_location`, `end_location`, `origin_coords`,
   `dest_coords`, `commodity`, `cargo_tonnage`/`cargoTonnage`,
   `has_bkhit_cert`/`hasBkhitCert`, `vehicle_gross_weight_ton`/
   `vehicleGrossWeightTon`, `modality`, `radius_km`
   (`agents/state.py:92-111`). CamelCase aliases are mirrored to snake_case by
   `normalize_operational_fields` (`data_collection.py:241-279`). A declared OD
   that cannot be resolved returns `status: "no_route"` instead of the graph's
   first/last node (`route_optimization.py:334-392`).

---

## 4. Fail-today / pass-after tests

"Fail today" is a **static** statement: the pre-fix code path cannot satisfy the
assertion (symbol absent or value differs). It was not re-executed against
`20c7fa5^` in this session; the pass-after column is executed.

| Test | Pre-fix (fail today) | Post-fix (pass after) | Evidence |
|---|---|---|---|
| `backend/tests/test_agents.py::test_demo_start_delegates_persistence_to_write_incident` | Demo router inserts `dict(state)`; patched `write_incident` is never awaited (`await_count == 0`) | `write_incident` awaited once, `mock_supabase.table.assert_not_called()` | pre: `demo_router.py:165-167`; post: `demo_router.py:165-168`; test `test_agents.py:388-408` |
| `backend/tests/test_agents.py::test_osint_hazard_filters_resolved_and_preserves_severity` | `get_hazard_polygons` had no `degraded_sources` parameter and did not drop `status='resolved'` rows in Python | Only `active-1` returned, `severity == "critical"` preserved | pre: `supabase_tools.py:65-82`; post: `:577-712`; test `test_agents.py:172-202` |
| Static contract check: `grep -n "dict(state)" backend/app/routers/demo_router.py` | present at pre-fix line 165 | no match | `demo_router.py` current |

> No unit test exists yet for WRITE-D5 (service-key gate), WRITE-D3 (UUIDv5) or
> WRITE-D6 (STM legacy migration). They are P4 obligations, not claimed green.

---

## 5. Acceptance gate

```powershell
cd D:\College\Pidi.id\backend
.\.venv\Scripts\python.exe -m pytest tests/test_agents.py tests/test_consensus_calibration.py -q -p no:cacheprovider
```

- Gate: **all tests pass**, including the two P0 tests above.
- Static gate: no `insert(dict(state))`-style bypass remains in
  `backend/app/routers/demo_router.py`.
- Runtime gate (not exercised in CI): with
  `SUPABASE_SERVICE_ROLE_KEY` unset, startup logs
  `Supabase writes are DISABLED` and `/api/v1/health/sources` reports
  `Supabase Write = degraded` (implementation: `supabase_client.py:64-89`,
  `health.py:42-90`, `:126-175`).

**Result in this session:** 33 passed (see `WALKTHROUGH.md`).

---

## 6. Out of scope / carried to P4

- Real Postgres DDL test (mock Supabase clients still define the schema).
- Cross-process replay race is last-writer-wins, not a DB transaction.
- `get_write_client()` still returns the anon client for non-incident callers;
  only `write_incident` checks `is_write_configured()`.
- No test for `init_write_health()` / `record_write_health()`.
