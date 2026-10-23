# Phase 92 — P0 Walkthrough (what was actually implemented)

**Code commit:** `20c7fa5` — *"P0-P4: OSINT hazard + prediction remediation,
idempotent writes, honest confidence, map/UI null-guards, OD preservation,
notify fanout, spatial gate"* (2026-10-23 11:45:35 +0700).
**This documentation pass changed code:** no. It wrote `.planning/` files only.
**Working tree:** clean before this pass; the docs are left uncommitted.

> Source of record: `git show 20c7fa5 -- <path>`. Line numbers below are in the
> post-fix working tree.

---

## 1. Items delivered

### 1.1 Column whitelist + `evidence` JSONB packing

`write_incident` no longer forwards agent-only keys as columns.

- Writable set: `agents/tools/supabase_tools.py:25-39`
  (`_INCIDENT_UPDATE_FIELDS`).
- Payload construction: `supabase_tools.py:517-539`. Fields without a column
  (`is_simulated`, `region`, `evidence_chain`, `inflation_forecast`,
  `causal_chain`, `decision_support_output`) are nested under `evidence`.
- `affected_area` is written as EWKT via `_to_ewkt_polygon`
  (`supabase_tools.py:64-128`, call at `:509-511`); `affected_polygon` is read
  only.

### 1.2 Deterministic incident identity

`_incident_key` (`supabase_tools.py:53-61`):

| Input `crisis_id` | Output |
|---|---|
| blank / `None` | fresh `uuid4()` |
| parseable UUID | the same UUID string |
| any other string | `uuid5(NAMESPACE_URL, "prehub:crisis:<id>")` |

The live `incidents.incident_id` column is TEXT, so this is replay identity,
not a DB type requirement.

### 1.3 Idempotent persistence

`_persist_incident` (`supabase_tools.py:355-449`) executes, in order:

1. `select("incident_id").eq("incident_id", …).limit(1)` — a **strict list**
   check decides `reused` (`:378-381`), because mock clients return non-list
   sentinels.
2. If reused → `update(update_fields).eq("incident_id", …)`.
3. Else → `upsert(db_payload, on_conflict="incident_id")`.
4. If `upsert`/`on_conflict` is rejected → update, then insert, then update
   again if an insert races the replay (`:410-449`).

`write_incident` logs whether the row was reused (`:544-557`) and returns the
persisted id (`:542`).

### 1.4 Fail-closed write gate

- `has_service_role_key`, `is_write_configured`, `get_write_status`,
  `record_write_health`, `init_write_health`:
  `backend/app/db/supabase_client.py:26-91`.
- Health key: `lrip:health:supabase_write` (`supabase_client.py:17`).
- `write_incident` refuses to run without the service key, appends
  `supabase_write_disabled`, and returns `""`
  (`supabase_tools.py:474-484`).
- Boot check is called from the lifespan (`backend/app/main.py:278-279`).

### 1.5 Demo persistence unified

`backend/app/routers/demo_router.py:158-176` now calls `write_incident` inside
the background task and logs `degraded_sources` when the write returns empty;
the in-memory `DEMO_STORE` remains the replay path.

### 1.6 Single STM representation + key migration

- `agents/memory/stm.py:6` imports `STM_PREFIX` from the backend; `:15` keeps
  `LEGACY_STM_PREFIX = "lrip:crisis:"`.
- `save_crisis_state` writes `lrip:state:crisis:{id}` and deletes the legacy key
  (`stm.py:45-56`).
- `load_crisis_state` reads the canonical key, falls back to the legacy key,
  copies it forward, then deletes it (`stm.py:63-79`).
- `backend/app/services/redis_client.py:79-93` now does `GET` + `json.loads`
  instead of `HGETALL`.

### 1.7 One poller process

- `docker-compose.yml`: `--workers 1` with the reason inline.
- `backend/app/config.py:71-73`: `pollers_enabled: bool = True`.
- `backend/app/main.py:284-301`: all eight pollers are created only when the
  flag is true; otherwise startup logs `POLLERS_ENABLED=false — HTTP-only
  process`.
- `main.py:126-137`: Open-Meteo cache TTL 25 200 s (> 21 600 s interval) and an
  empty parse does not overwrite the cache.

### 1.8 Operational decision (OD) state contract

LangGraph 0.2.28 only carries keys declared on the state schema. The dashboard
sent OD/cargo fields that were not declared, so they vanished before Agent 4.

- Declared in `agents/state.py:92-111`, including camelCase aliases
  (`cargoTonnage`, `hasBkhitCert`, `vehicleGrossWeightTon`, `start_location`,
  `end_location`).
- Mirrored to canonical snake_case by
  `agents/nodes/data_collection.py:241-279` (`normalize_operational_fields`)
  and returned additively from the agent (`:349-402`).
- Agent 4 reads both spellings (`route_optimization.py:96-132`) and, when an OD
  was declared but cannot be resolved, returns `status: "no_route"` with a
  `no_route_reason` instead of falling back to the graph's first/last node
  (`:334-392`).

---

## 2. Files changed by the commit (P0 subset)

| File | Change |
|---|---|
| `agents/tools/supabase_tools.py` | `_incident_key`, `_persist_incident`, whitelist + `evidence` packing, write gate, GeoJSON normalizer, `degraded_sources` on `get_hazard_polygons` |
| `backend/app/db/supabase_client.py` | write-capability flags + Redis health key |
| `backend/app/routers/demo_router.py` | delegate to `write_incident` |
| `agents/state.py` | declare OD/cargo keys + aliases |
| `agents/nodes/data_collection.py` | `normalize_operational_fields` |
| `agents/nodes/route_optimization.py` | `no_route` instead of first/last-node fallback |
| `backend/app/main.py` | `init_write_health`, `POLLERS_ENABLED` gate, Open-Meteo cache guard |
| `backend/app/config.py` | `pollers_enabled` |
| `backend/app/services/redis_client.py` | STM `GET` JSON |
| `agents/memory/stm.py` | canonical key + legacy migration |
| `docker-compose.yml` | `--workers 1` |
| `backend/tests/test_agents.py` | 2 new P0 tests (see below) |

---

## 3. Test commands and results (run in this session)

Environment: Windows PowerShell, Python from `backend/.venv`.

```powershell
cd D:\College\Pidi.id\backend
.\.venv\Scripts\python.exe -m pytest tests/test_agents.py tests/test_consensus_calibration.py -q -p no:cacheprovider
```

**Result:** `33 passed, 4 warnings in 111.94s`.

The P0 assertions inside that run:

| Test | What it proves |
|---|---|
| `test_agents.py:388` `test_demo_start_delegates_persistence_to_write_incident` | `write_incident` awaited exactly once; raw table insert never called |
| `test_agents.py:172` `test_osint_hazard_filters_resolved_and_preserves_severity` | resolved rows excluded; severity is not re-derived |

Additional repository-wide backend suites run this session (unrelated modules,
to confirm the commit did not regress OSINT/news tests):

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_osint_leak_hardening.py tests/test_news_pipeline.py tests/test_pre_llm_filter.py tests/test_phase76_news_spatial_consensus.py tests/test_bmkg_consensus_validation.py tests/test_geocode_search.py tests/test_scrapers.py -q -p no:cacheprovider
```

**Result:** `128 passed, 3 warnings in 14.94s`.

---

## 4. Not implemented / not verified here

- No test asserts `write_incident` returns `""` and appends
  `supabase_write_disabled` when the service key is absent.
- No test asserts `_incident_key` UUIDv5 stability or the STM legacy migration.
- No test asserts `normalize_operational_fields` camelCase mirroring or the
  `no_route` contract (WRITE-D9).
- No test runs against a real PostgREST/PostGIS instance; all Supabase calls are
  mocked.
- `scripts/evaluate_metrics.py` was run, but that is P1 evidence, not P0.

No files outside `.planning/` were modified by this walkthrough.
