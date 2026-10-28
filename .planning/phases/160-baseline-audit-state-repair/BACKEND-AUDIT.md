# BACKEND AUDIT — PreHub FastAPI (`backend/app`)

**Phase:** 160 (M8 — Fast & Durable, phase 1 of 7)
**Date:** 2026-10-27 · **Branch:** `m8-fast-durable` · **Base commit:** `2eeb1ca`
**Method:** read-only static analysis (AST route/dependency extraction + targeted source reads) cross-checked against the runtime OpenAPI document (`fastapi 0.139.2`). No source files were modified by this audit.

> **Working-tree note:** `backend/app/services/weather_fusion_service.py`, `backend/app/routers/routing_router.py` and `SPEC.md` carry uncommitted changes from concurrent Phase-160 work. During this audit `weather_fusion_service.py` briefly failed to import `get_fused_spatial_weather`; it imports again now. Router counts below are pinned to base commit `2eeb1ca`; the working-tree delta is recorded in §1.1a. See §7.

---

## 1. Route inventory

| Metric | Count | Notes |
|---|---|---|
| Router modules | **19** | `app/routers/*.py`, excluding `__init__.py` |
| Route decorators in routers | **81** | matches the "81 routes" in `M8-SPEC.md` |
| `@app.*` routes in `main.py` | 1 | `GET /` (`main.py:402`) |
| Unique handler functions | **73** router + 1 root = **74** | matches "74 handlers" |
| Registered `method + path` entries | **89** | **88** in routers + root; 7 hidden aliases from double `include_router` (`main.py:422`, `:424`) |
| Auth-dependent handlers | **24** | 4 `get_current_user` + 20 `get_optional_user` — **not 23**, see §1.1 |
| Unauthenticated handlers | **49** (50 incl. root) | |
| WebSocket endpoints | 1 | `WS /ws/crisis/{crisis_id}` (`main.py:438`) |

### 1.1 Discrepancy with the expected totals

Expected: 23 auth-dependent (4 current_user + 19 optional_user), 51 unauthenticated.
Actual: **24** auth-dependent (4 + **20**), **49** unauthenticated router handlers.

The missing handler is **`GET /api/v1/auth/session`** (`auth_router.py:76`), which declares `Depends(get_optional_user)`. It is *semantically* guest-friendly (the docstring says "Never fails with 401"), so it is plausible the earlier pass classified it as "unauthenticated by design". If that classification is intended, the prior 23/51 split is correct by that convention and should be documented as such. By dependency count it is 24/49. No other offset exists; `require_roles` is not used by any router, and no `APIRouter(dependencies=[...])` is present.

### 1.1a Concurrent working-tree delta (not in the base commit)

A concurrent Phase-160 change in the working tree adds **`GET /api/v1/weather/summary`** (`routing_router.py:305-…`, `get_optional_user`, Redis-cached 5 min / 24 h stale ceiling). That makes the *working tree* **82 router decorators / 74 router handlers (75 with root) / 25 auth-dependent (4 current + 21 optional) / 49 unauthenticated**.

The counted totals in §1–§1.2 describe base commit `2eeb1ca` (the 81/74/24 that the M8 spec and the phase gate quote). Re-pin the baseline to 82/75/25 once that work is committed, or state explicitly that the gate counts exclude it. Everything else in this audit is unaffected — the new route uses the cache pattern phase 163 should copy, though its `cache_get/cache_set` calls are sync Redis inside `async def` (see F13).

### 1.2 Per-module breakdown

| Module | Routes | Handlers | `current_user` | `optional_user` | Unauth |
|---|---|---|---|---|---|
| `health.py` | 3 | 2 | 0 | 0 | 2 |
| `incidents.py` | 7 | 6 | 0 | 0 | 6 |
| `approvals.py` | 2 | 2 | 0 | 1 | 1 |
| `auth_router.py` | 5 | 5 | 2 | 1 | 2 |
| `agent_router.py` | 6 | 3 | 0 | 0 | 3 |
| `demo_router.py` | 4 | 4 | 0 | 0 | 4 |
| `commodity_router.py` | 3 | 2 | 0 | 0 | 2 |
| `corridor_router.py` | 1 | 1 | 0 | 0 | 1 |
| `routing_router.py` | 6 | 6 | 0 | 4 | 2 |
| `vehicles_router.py` | 4 | 2 | 0 | 2 | 0 |
| `news_router.py` | 5 | 5 | 2 | 0 | 3 |
| `outcomes_router.py` | 4 | 4 | 0 | 0 | 4 |
| `evaluation_router.py` | 4 | 4 | 0 | 0 | 4 |
| `fleet_ingest_router.py` | 8 | 8 | 0 | 5 | 3 |
| `travels_router.py` | 9 | 9 | 0 | 6 | 3 |
| `erp_router.py` | 1 | 1 | 0 | 1 | 0 |
| `intermodal_router.py` | 5 | 5 | 0 | 0 | 5 |
| `geocode_router.py` | 3 | 3 | 0 | 0 | 3 |
| `bnpb_router.py` | 1 | 1 | 0 | 0 | 1 |
| **Total** | **81** | **73** | **4** | **20** | **49** |

Hidden duplicate aliases (serve traffic, absent from OpenAPI): the 4 `/api/demo/*` routes and the 3 `/api/v1/commodity*` routes, from the second `include_router` calls. Visible aliases also exist for `/vehicles`, `/api/agents/status`, `/api/notify`, `/simulate/stream`, `/health`.

---

## 2. Auth boundary

### 2.1 Dependency semantics

```python
# backend/app/auth/supabase_auth.py:452-457
if credentials and credentials.credentials:
    try:
        return decode_and_verify_token(credentials.credentials)
    except HTTPException:
        logger.info("Optional auth token invalid, falling back to default Guest session.")
# → returns UserSession(role=GUEST, is_offline_guest=True)
```

| Behaviour | Routes | Result |
|---|---|---|
| No `Authorization` header | all 20 optional routes | guest session (intended) |
| **Invalid/expired token supplied** | all 20 optional routes | **silently downgrades to GUEST, HTTP 200** |
| Invalid/expired token | 4 `get_current_user` routes | **401 fail-closed** ✅ |
| No token | 4 `get_current_user` routes | 401 ✅ |

### 2.2 The 24 auth-dependent routes

| Route | Handler / line | Dep | Tenant-scoped? | Invalid token |
|---|---|---|---|---|
| `GET /api/v1/auth/me` | `auth_router.py:68` | current | no | 401 ✅ |
| `POST /api/v1/auth/switch-role` | `auth_router.py:119` | current | inherits `company_id` | 401 ✅ |
| `GET /api/v1/news/hitl-pending` | `news_router.py:610` | current | **no** (all tenants) | 401 ✅ |
| `POST /api/v1/news/hitl-action` | `news_router.py:690` | current | **no** (approval id only) | 401 ✅ |
| `GET /api/v1/auth/session` | `auth_router.py:76` | optional | n/a | guest 200 ⚠️ |
| `POST /api/v1/approvals` | `approvals.py:126` | optional | writes `operator_id`; no company scope | guest → 403 ⚠️ |
| `GET /api/v1/erp/summary` | `erp_router.py:22` | optional | **query param can widen** (`:34-37`) | guest 200 ⚠️ |
| `POST /api/v1/fleet/register` | `fleet_ingest_router.py:103` | optional | `company_id` from claim | guest → 403 ⚠️ |
| `POST /api/v1/fleet/upload-manifest` | `fleet_ingest_router.py:150` | optional | claim | guest → 403 ⚠️ |
| `POST /api/v1/fleet/upload-manifest/file` | `fleet_ingest_router.py:208` | optional | claim | guest → 403 ⚠️ |
| `GET /api/v1/fleet/custom` | `fleet_ingest_router.py:290` | optional | dispatcher locked to claim ✅ | guest 200 (macro) ⚠️ |
| `DELETE /api/v1/fleet/custom/{id}` | `fleet_ingest_router.py:309` | optional | **no ownership check** | guest → 403 ⚠️ |
| `GET /api/v1/weather/spatial-polygons` | `routing_router.py:100` | optional | public by design | guest 200 ✅ |
| `GET /api/v1/fire/hotspots` | `routing_router.py:140` | optional | public by design | guest 200 ✅ |
| `GET /api/v1/traffic/flow-segments` | `routing_router.py:436` | optional | public by design | guest 200 ✅ |
| `POST /api/v1/traffic/tomtom/reset-latch` | `routing_router.py:487` | optional | global latch; any guest can reset | guest 200 ⚠️ |
| `POST /api/v1/fleet/trucks` | `travels_router.py:70` | optional | `company_id` taken from **body** (`:78`) | guest → 403 ⚠️ |
| `DELETE /api/v1/fleet/trucks/{id}` | `travels_router.py:121` | optional | **no ownership check** | guest → 403 ⚠️ |
| `POST /api/v1/fleet/travels` | `travels_router.py:145` | optional | via truck asset | guest → 403 ⚠️ |
| `GET /api/v1/fleet/travels` | `travels_router.py:167` | optional | **query param can widen** (`:56-62`) | guest 200 ⚠️ |
| `PATCH /api/v1/fleet/travels/{id}` | `travels_router.py:201` | optional | **no ownership check** | guest → 403 ⚠️ |
| `POST /api/v1/fleet/travels/{id}/hedging` | `travels_router.py:221` | optional | **no ownership check** | guest → 403 ⚠️ |
| `GET /api/v1/fleet/vehicles` | `vehicles_router.py:37` | optional | dispatcher locked to claim ✅ | guest 200 (macro) ⚠️ |
| `GET /api/v1/fleet/vehicles/{id}/geometry` | `vehicles_router.py:165` | optional | **no tenant filter** (`:176-191`) | guest 200 ⚠️ |

**Public by design (tenant-free) and unauthenticated:** all of `health`, `incidents`, `corridor`, `commodity`, `evaluation`, `intermodal`, `geocode`, `bnpb`, `demo`, `agent`, `outcomes`, `news/live|market-regime|verify`, plus `GET /fleet/trucks`, `GET /fleet/trucks/{id}`, `GET /fleet/travels/{id}`, `GET /api/v1/approvals`.

**Fail-open/anonymous writes worth naming:** `POST /api/v1/auth/guest-session` mints a signed token for **any role in the request body** (`auth_router.py:90-103`), including `DISPATCHER`, with `company_id` from the body. `POST /fleet/telemetry/ingest`, `/fleet/telemetry/simulate-ping`, `/incidents/simulate`, `/incidents/simulate/stream`, `/simulate/stream` and `/notify` are fully unauthenticated.

---

## 3. Cache inventory

| Domain | Endpoint(s) | Mechanism | TTL | Invalidation | Survives Render restart? |
|---|---|---|---|---|---|
| Auth session | all authenticated routes (`get_current_user`/`get_optional_user`) | process dict + Redis (`lrip:cache:auth:{sha256}`) | 60 s | expiry only (no revocation hook) | Redis only |
| Corridor | `GET /api/v1/corridor/context` | process dict **+** Redis `lrip:corridor:context:{id}` | 180 s mem / 300 s Redis | TTL | Redis only (`corridor_service.py:33,57,298`) |
| Fleet list | `GET /fleet/vehicles`, `/api/v1/fleet/vehicles` | process dict (`_fleet_cache`, `_response_cache`), keyed by tenant | 8 s sliding | `clear_fleet_cache()` on every fleet write | **No** |
| Fleet geometry | `GET /fleet/vehicles/{id}/geometry` | process dict only | 8 s | same | **No** |
| News | `GET /api/v1/news/live` | process dict `_NEWS_CACHE` | 30 s | reset to `0.0` after each ingestion (`:254`) | **No** |
| News ingestion lock | `run_background_news_ingestion` | Redis `lrip:lock:news_ingestor` + `asyncio.Lock` | 300 s TTL | token-checked release | Redis (lock only) |
| Health `/health` | `GET /health`, `/api/v1/health` | none — constant dict (`health.py:175-182`) | — | — | n/a |
| Health sources | `GET /api/v1/health/sources` | process dict `_SOURCES_CACHE` | 30 s | TTL | **No** |
| Weather | `GET /weather/spatial-polygons`, routing proof context | **none** (`weather_fusion_service.py:475-521`) | — | — | n/a |
| Fire | `GET /fire/hotspots` | Redis `lrip:state:source:nasa_firms` (written by poller, 3 h) + live fallback write | 3 h | poller overwrite | Redis |
| Commodity | `GET /api/v1/commodities`, `/prices`, `/spikes` | Redis + memory fallback (`cache_get/set`) | 60 s | TTL | Redis only |
| ERP | `GET /api/v1/erp/summary` | process dict `_erp_mem` + Redis `lrip:cache:erp:*` | 120 s | explicit on create/update/hedging | Redis only |
| Incidents | `GET /api/v1/incidents`, `/{id}` | **none** | — | — | n/a |
| Evaluation | `/evaluation/benchmark`, `/live`, `/test-matrix`, `/corridor-efficiency` | **none** (file re-read + Supabase query per request) | — | — | n/a |
| Geocode | `/geocode/search`, `/reverse` | bounded process dict (512) + Redis | 24 h Redis / unbounded mem | TTL | Redis only |
| Demo / agent | `/demo/*`, `/agents/status` | process `DEMO_STORE` / `AGENT_STATUS_STORE` | forever | process death | **No** |

Backend sets **no `Cache-Control` on JSON responses** — only the two SSE endpoints (`incidents.py:401`, `agent_router.py:196`). Whatever Vercel does with authenticated GETs is therefore the proxy's default, which is precisely the M8 root cause #4.

---

## 4. Sync I/O on the event loop

All of the following run inside `async def` (handler or awaited service) without `await asyncio.to_thread`. Supabase methods are blocking `httpx` under `postgrest-py`; Redis is sync `redis-py` (`socket_timeout=5`, `redis_client.py:37`).

| # | Location | Blocking call | Reached from |
|---|---|---|---|
| 1 | `incidents.py:132` | `query.execute()` (via `:202`) | `GET /api/v1/incidents` |
| 2 | `news_aggregator.py:1655` | `query.execute()` in `async def fetch_news_from_supabase` | `/news/live`, `/news/market-regime`, `/incidents/osint/*` |
| 3 | `news_aggregator.py:332` ← `:522`, `:563`, `news_router.py:447` | `httpx.Client(...).get()` (3.5 s) | `/news/live` (per unresolved Google URL) |
| 4 | `supabase_auth.py:294-295` | `PyJWKClient.get_signing_key_from_jwt` (network on cold JWKS) | every asymmetric-token request |
| 5 | `supabase_auth.py:340` | `sb_client.auth.get_user(token)` | Path-3 relay fallback |
| 6 | `supabase_auth.py:392` | `profiles.select(...).execute()` | UUID subject with no `company_id` claim |
| 7 | `telemetry_service.py:1868,1871` → `travel_supabase.py:158,426` | truck_assets + travels `.execute()` | `GET /fleet/vehicles` (every 8 s) |
| 8 | `travel_ledger_service.py:1093,1194,1237` | `sb.rpc("erp_ledger_totals").execute()` + travels fetch | `GET /erp/summary` |
| 9 | `outcome_evaluation_service.py:485` | `ground_truth_outcomes.select("*").limit(1000).execute()` | `/evaluation/benchmark`, `/evaluation/live` (unauth) |
| 10 | `intermodal_router.py:132-138` | `fuel_prices` `.execute()` | `GET /intermodal/toll-tariffs` |
| 11 | `news_router.py:621,739,758,795` | `route_approvals` `.execute()` (and `get_write_client()` per request) | `/news/hitl-pending`, `/news/hitl-action` |
| 12 | `approvals.py:68,75` | `incidents`/`route_approvals` `.execute()` in `_resolve_approval_forecast` | `POST /approvals` |
| 13 | `commodity_router.py:132`; `routing_router.py:182`; `bnpb_router.py:28`; `geocode_router.py:186`; `travel_ledger_service.py:960`; `supabase_auth.py:229` | sync `redis.get/set` (up to 5 s on hiccup) | every cached read |
| 14 | `unified_news_ingestor.py:883,894,930,974,1009,1085` | `.execute()` writes/reads | news ingestion cycle (boot poller + request trigger) |

Correct counter-examples to copy: `approvals.py:302`, `outcomes_router.py:266`, `commodity_router.py:154`, `health.py:200-213`, `corridor_service.py:149-151` wrap `.execute()` in `asyncio.to_thread`.

---

## 5. Persistence map

| Store | What lands there | Durable on Render? |
|---|---|---|
| **Supabase** | `incidents` (`agents/tools/supabase_tools.write_incident`), `route_approvals`, `route_decision_traces`, `news_articles`, `ground_truth_outcomes`, `incident_impact_assessments`, `truck_assets`, `travels`, `data_sources` | ✅ yes |
| **Local SQLite** (`backend/data/prehub_local.db`, `local_storage.py:18-19`) | `route_decision_traces` mirror, `ground_truth_outcomes` mirror, **`custom_fleet_vehicles` (only store)**, `fleet_telemetry_logs`, `incident_impact_assessments`, `truck_assets`/`travels` fallback | ❌ **wiped** — ephemeral FS |
| **Memory** | `DEMO_STORE` (`demo_router.py:17`), `AGENT_STATUS_STORE`, `_live_pings`, `_custom_vehicles_extra`, `_active_reroutes`, `_snapped_corridors`, all §3 process caches, TomTom credit latch | ❌ gone on restart/deploy |
| **Redis (Upstash)** | `lrip:cache:*`, `lrip:state:source:*`, `lrip:corridor:context:*`, streams (`lrip:stream:validated_alerts`, `lrip:events:*`), locks | ⚠️ only if `REDIS_URL` points at the external instance (see §7) |

**Ephemeral / lost-on-restart behaviour:**

- Self-serve fleet onboarding (`POST /fleet/register`, `/upload-manifest*`) writes **only** to `custom_fleet_vehicles` in SQLite (`telemetry_service.py:1465`, `local_storage.py:749`). Registered trucks disappear on the next Render restart; the master-asset path (`truck_assets`) *is* Supabase-primary.
- GPS pings (`fleet_telemetry_logs`) and the live map position (`_live_pings`) are restart-scoped.
- Demo runs and replay are process-local (`DEMO_STORE`) — a restart during a demo loses the run (only the incident row survives, if the background write finished).
- `local_storage.py:395` calls `init_db()` at **import time** — schema DDL on every cold import, on the ephemeral disk.

**Recomputed rather than reused:**

- Weather fusion: BMKG + Open-Meteo fetched on every call, no cache (`weather_fusion_service.py:495`), including the routing proof path (`routing_router.py:42`).
- Live evaluation aggregate: SQLite scan + 1000-row Supabase read + PIHPS file scan + calibration fit per request.
- Canonical news URL decoding: re-run on read for legacy rows (`news_aggregator.py:1688`) and for any Google URL (`news_router.py:447`).
- Routing proof context: `_fetch_proof_context()` re-fetches weather + TomTom + news for each `POST /routing/optimize` / `solve-path` with `include_proof=true`.
- Agent swarm output: every `POST /simulate*`, `/demo/start` runs the full LLM pipeline; nothing is memoised per scenario (demo mock mode is the exception).
- LLM news verification (`POST /news/verify`): no cache, recomputed per claim.

**Not persisted at all:** route results, snapshot/bootstrap read model (phase 163), section freshness, dashboard request state.

---

## 6. Ranked findings

### P0

**F1 — Invalid supplied token never fails closed.** `supabase_auth.py:452-457`. All 20 optional routes downgrade to GUEST with HTTP 200. A dispatcher whose access token expired silently becomes a guest: writes return 403 (wrong code, no re-auth signal), reads silently return the macro view instead of the tenant view. This is exactly the M8 "no silent guest" failure and it also blocks the `Secure`/refresh work from being observable. **Owner: 161.**

**F2 — Anonymous token minting for `DISPATCHER`.** `POST /api/v1/auth/guest-session` accepts `{"role": "DISPATCHER", "company_id": "..."}` with no auth (`auth_router.py:84-115`, `supabase_auth.py:117-161`) and returns a valid HS256 JWT carrying `fleet:write`, `approvals:write`, `routes:plan`. Any anonymous visitor can mint a dispatcher token for any tenant, which makes the 24-route auth boundary decorative. If this is the intended evaluator sandbox, gate it on `ENVIRONMENT != production` or restrict it to `GUEST`; otherwise every RBAC claim in §2 is bypassable. **Owner: 161.** (Also note the fallback signing secret at `supabase_auth.py:114` / `config.py:20` — forgeable if `SUPABASE_JWT_SECRET` is unset in prod.)

### P1

**F3 — Unauthenticated writes and LLM execution.** `fleet_ingest_router.py:266-286` (`POST /fleet/telemetry/ingest`), `:357-363` (`simulate-ping`), `incidents.py:303-405` (`/incidents/simulate`, `/simulate/stream`), `agent_router.py:141-199` (`/simulate/stream`), `agent_router.py:107` (`/notify`). Anyone can reposition fleet assets and spawn 4-stage LangGraph runs (`asyncio.create_task(run_crisis_event(...))`, `incidents.py:341`) with no rate limit, on a 0.1-CPU box. **Owner: 161 (auth) / 162 (work admission).**

**F4 — Sync Supabase on the read hot path.** 14 sites in §4; the dashboard-relevant ones are `GET /fleet/vehicles` (2 blocking PostgREST round-trips every 8 s), `GET /incidents`, `GET /news/live`, `GET /erp/summary`, `GET /evaluation/benchmark|live` (1000-row read, unauthenticated). Each blocks the single event loop for the full TLS+PostgREST latency, which is why `/health` starves during a burst even though its handler is a constant dict. **Owner: 164.**

**F5 — Weather fusion has no cache.** `weather_fusion_service.py:475-521` / `routing_router.py:106-143`. Every dashboard mount and every proof-enabled routing POST re-fetches BMKG + Open-Meteo (23-point grid). Combined with F4 and the ~25–30 first-mount requests, this is a direct contributor to the "first data < 5 s" miss. **Owner: 163.**

**F6 — Cross-tenant read/write surface.** (a) `travels_router.py:56-62,175` — an explicit `?company_id=` overrides the dispatcher claim, so `GET /fleet/travels?company_id=other` reads another tenant's ledger; (b) same shape in `erp_router.py:34-37`; (c) `GET /fleet/trucks`, `GET /fleet/trucks/{id}`, `GET /fleet/travels/{id}` (`travels_router.py:99,108,188`) and `GET /api/v1/approvals` (`approvals.py:288`) have **no auth at all**; (d) `DELETE /fleet/trucks/{id}` (`:120`), `PATCH /fleet/travels/{id}` (`:200`), `POST .../hedging` (`:220`), `DELETE /fleet/custom/{id}` (`fleet_ingest_router.py:308`) check permission but never ownership; (e) `vehicles_router.py:176-191` scans **all** tenants' cached fleets to resolve a vehicle id. Impact: tenant isolation is convention, not enforcement. **Owner: 161 (with 163 for the snapshot contract).**

**F7 — Restart-loses-data on the onboarding path.** See §5: `custom_fleet_vehicles` is SQLite-only, and `init_db()` runs at import (`local_storage.py:395`). A Render restart empties the self-serve fleet while `truck_assets` survives — two onboarding paths with different durability. **Owner: 163.**

**F8 — News cache self-invalidates.** `news_router.py:254` sets `last_fetched_at = 0.0` immediately after an ingestion cycle, so the next request misses the 30 s cache and re-runs Supabase fetch + per-article re-tier + canonical URL resolution. The boot poller calls `get_live_news(force_refresh=True)` every 300 s (`main.py:255`), so on the free tier this is a continuous ingestion loop competing with request handling. **Owner: 164** (matches the spec's "news re-tier write-back, `last_fetched_at` fix").

### P2

**F9 — `get_write_client()` builds a new client per call.** `supabase_client.py:108-119,132-134`; used at `approvals.py:200`, `news_router.py:620,738`, `intermodal_router.py:131`, `travel_supabase.py:45`. Each call re-creates the Supabase client (TLS + header setup) on a write path. Singletons exist for reads (`supabase_auth.py:193-210`) but not for writes. **Owner: 164.**

**F10 — JWKS cold-path blocking.** `supabase_auth.py:294-295` performs the JWKS fetch inline; `PyJWKClient` caches keys but the first request per key-id set pays the full network cost inside the dependency — on login, which is the SLO being measured. **Owner: 164.**

**F11 — Per-request file + calibration work.** `/evaluation/benchmark` and `/live` re-read `test-results/benchmark_evaluation_report.json` and recompute calibration for every request (`evaluation_router.py:347-363,407-418`), with no cache. Cheap to memoise by file mtime. **Owner: 163** (read-path budget).

**F12 — Route/alias sprawl + no cache directives.** 89 registered entries for 73 handlers (7 hidden aliases) and no `Cache-Control` on JSON. Both raise proxy-cache ambiguity for the phase-164 `private/no-store` work and inflate the frontend's request budget. **Owner: 164.**

**F13 — Redis calls are sync inside async.** `redis_client.py:37` (`socket_connect_timeout=5`, `socket_timeout=5`) reached from §4 row 13. A single Redis hiccup serialises the whole process for up to 5 s even though the code path is "best effort". **Owner: 164.**

---

## 7. Runtime unknowns (not statically verifiable)

1. **Env values:** whether `SUPABASE_JWT_SECRET` is set in prod (if not, tokens are forgeable via the default at `config.py:20`); whether Supabase issues `HS256` or `ES256/RS256`; whether `REDIS_URL` points at Upstash (durable) or defaults to `redis://localhost:6379` (memory fallback, all Redis caches die with the process); `POLLERS_ENABLED`, `DEMO_OFFLINE`, `DEMO_MOCK_AGENTS`.
2. **Live RLS:** policies on `incidents`, `route_approvals`, `news_articles`, `ground_truth_outcomes`, `truck_assets`, `travels`. The backend reads some tables with the anon client (`outcome_evaluation_service.py:473-486`, `news_aggregator.py:1646`) and writes others with service-role; whether anon SELECT is permitted is unverified here.
3. **Supabase project settings:** connection pool size, PostgREST cold latency, statement timeouts, `erp_ledger_totals` / `commodity_baseline_means` / `dashboard_snapshots` RPC availability.
4. **Deployment shape:** uvicorn worker count on Render, instance count, whether more than one instance serves traffic (would make `DEMO_STORE`, `_NEWS_CACHE`, `_fleet_cache` inconsistent across requests), Vercel's cache-key behaviour with `Authorization`.
5. **Actual latencies:** warm/cold `/health`, per-endpoint p95, PostgREST RTT, BMKG/Open-Meteo/Nominatim latency, real first-mount request count — all belong to the phase-160 baseline capture, not this static audit.
6. **Upstash limits:** eviction policy / `maxmemory` and whether 3 h/24 h keys survive a restart window.
7. **Transient working-tree state:** `weather_fusion_service.py`, `routing_router.py` and `SPEC.md` carry uncommitted changes from another actor. During this audit the fusion module briefly failed `from ... import get_fused_spatial_weather` (`routing_router.py:10`); it imports again now. Any runtime measurement taken during that window is invalid.

---

## Phase 160 verdict

The route contract is real and countable: **19 router modules, 81 route decorators, 73 router handlers (74 with `GET /`), 89 registered method+path entries** at base commit `2eeb1ca`. One number must be corrected in the M8 planning text: auth-dependent handlers are **24 (4 `get_current_user` + 20 `get_optional_user`), not 23**, with `GET /api/v1/auth/session` (`auth_router.py:76`) as the one omitted route; the unauthenticated count is therefore **49** (50 including root), not 51. If `/auth/session` is deliberately classified as "guest-intentional", the 23/51 framing is defensible — but it must be stated, not silently assumed. Concurrent Phase-160 work adds one route (`/weather/summary`), taking the working tree to 82/75/25; §1.1a records the delta.

The audit confirms the M8 root causes with line-level evidence: auth fails open on every optional route (F1) and is bypassable outright by anonymous token minting (F2); the read path blocks the event loop on synchronous PostgREST/Redis calls (F4); weather has no cache at all (F5); and restart-durability is split between Supabase and an ephemeral SQLite store (F7). Two items are *not* in the M8 spec and should be triaged before phase 161 closes: anonymous `guest-session` minting (F2) and the cross-tenant query-param/ownership gaps (F6).

No fixes were applied. Phases 161–165 own the remediation as mapped above.
