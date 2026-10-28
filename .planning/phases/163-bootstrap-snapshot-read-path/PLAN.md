# PLAN — Phase 163: Bootstrap snapshot + read path

**Window:** 2026-10-27 · **Mode:** implementation (split unit)
**Milestone:** M8 — Fast & Durable (phase 4 of 7)
**Depends on:** phase 160 (`BACKEND-AUDIT.md` §3 cache inventory, §4 sync I/O, §5 persistence; `BASELINE.md` first-mount fan-out), phase 161 (fail-closed optional auth), phase 162 (external tick = the snapshot writer)
**Branch:** implemented on `m9-operational-truth`, **uncommitted** (M8's own branch is `m8-operational-truth`). The concurrent M9 work (`routing_router.py`, `weather_fusion_service.py`, the routing/weather adapters, the frontend dashboard/route files) was read-only for this unit and left untouched; the M9 session committed its own work as `bb9b61b` while this unit was in progress.

---

## Why

The phase-160 baseline measured the problem: **50–94 requests** (47–70 distinct) on
first dashboard mount and **9.8–73.8 s** first data (median 12.1 s, max 94.0 s), with
the same sections requested twice inside one mount (fire hotspots, weather polygons,
fleet, incidents). The `BACKEND-AUDIT.md` §5 also records that nothing on that read
path was persisted: every mount recomputed weather (no cache), evaluation
(file re-read + Supabase scan), incidents (no cache) and news (cache reset after each
ingestion).

Phase 163 replaces that fan-out with **one** auth-aware request that reads a
DB-backed read model. The unit is split because the concurrent M9 session owned the
frontend dashboard files while the backend half landed; 163b was implemented once
M9's work was committed (`bb9b61b`):

| Unit | Scope | Status |
|---|---|---|
| **163a** | Migration, snapshot service, bootstrap endpoint, tick write hook, backend tests | **DONE** |
| **163b** | Frontend: mount the endpoint instead of the fan-out, lazy sections, timeouts/abort, stale badge | **DONE (implementation) — production measurement pending in 165** |

---

## 163a — backend (this unit)

### Delivered

| Deliverable | Path |
|---|---|
| `dashboard_snapshots` table, index, RLS (no policies), write/read contract comment | `infra/supabase/migrations/024_dashboard_snapshots.sql` |
| Snapshot builder, store/read, staleness helper, tick entry point | `backend/app/services/dashboard_snapshot_service.py` |
| `GET /api/v1/dashboard/bootstrap` + `/dashboard/bootstrap` alias | `backend/app/routers/dashboard_bootstrap.py` |
| Router registration | `backend/app/main.py` (2-line delta; phase 161/162 changes preserved) |
| Post-tick snapshot refresh (`snapshot_built` / `snapshot_failed`) | `backend/app/routers/internal_tick.py` |
| Service tests (11) | `backend/tests/test_dashboard_snapshot.py` |
| Endpoint tests (13) | `backend/tests/test_dashboard_bootstrap.py` |
| Tick-hook tests (3) added to the phase-162 contract suite | `backend/tests/test_internal_tick.py` |

### Endpoint contract

`GET /api/v1/dashboard/bootstrap` (root alias `GET /dashboard/bootstrap`, hidden from
OpenAPI — same convention as `/vehicles` and `/internal/tick`).

| Item | Contract |
|---|---|
| Auth | `Depends(get_optional_user)` (phase 161): no header → anonymous GUEST; supplied-but-invalid/expired token → **401** + `WWW-Authenticate: Bearer` (never a silent guest) |
| Query `modality` | `truck` \| `vessel` \| `air`, default `truck`. Unknown → `400 INVALID_MODALITY` |
| Query `corridor_id` | optional; defaults to the existing default corridor `sumatra_belawan_medan` |
| Staleness gate | `computed_at` older than **600 s** (2 × the 300 s tick cadence) counts as stale |
| Fresh stored row | `200`, `stale=false`, payload straight from `dashboard_snapshots` |
| Missing / stale / unparseable row | bounded live build (**8 s** overall cap), `stale=true`, `reason` = `missing_snapshot` \| `snapshot_stale` \| `unparseable_computed_at` |
| Live build fails/times out | `200` + stored payload when one exists (`reason=live_build_failed`/`live_build_timeout`), else `sections={}` — never a 5xx, never a hang |
| Tenant sections | only for `DISPATCHER` / `REGULATOR`: `fleet` + `erp`, live, each 5 s |
| Tenant section failure | that section is `degraded` with `data:null` + `error`; response stays `200` |
| Headers | `Cache-Control: private, no-store` on 200, 400 and the auth 401 |
| Side effects | none. It never writes a snapshot and never triggers ingestion (the tick is the only writer) |

Response shape:

```json
{
  "schema_version": 1,
  "computed_at": "2026-10-27T09:00:00+00:00",
  "stale": false,
  "role": "DISPATCHER",
  "company_id": "pos_logistik",
  "modality": "truck",
  "sections": {
    "incidents": {"status": "ok", "data": {"items": [], "total": 0}},
    "fleet":     {"status": "ok", "data": {"total_vehicles": 3, "vehicles": []}},
    "erp":       {"status": "degraded", "data": null, "error": "RuntimeError: ledger unavailable"}
  }
}
```

`reason` is present only when `stale=true`. Section statuses are `ok`, `degraded`
(exception) and `timeout` (exceeded its budget); a degraded section that reused an
in-process last-good value also carries `cached: true`.

### Public sections (15) — composed in parallel, 5 s each

| Section | Reused function |
|---|---|
| `incidents` | `app.routers.incidents.list_incidents` |
| `news` | `app.routers.news_router.get_live_news` (with a no-op `BackgroundTasks`, so a cold news cache cannot trigger ingestion from a read) |
| `news_market_regime` | `app.routers.news_router.get_market_regime` |
| `corridor_context` | `app.services.corridor_service.get_corridor_context` (default corridor) |
| `weather_spatial_polygons` | `app.routers.routing_router.fetch_spatial_weather_polygons` (high/50/80 disruption gate) — read-only, owned by M9 |
| `fire_hotspots` | `app.routers.routing_router.fetch_fire_hotspots` — read-only, owned by M9 |
| `commodity_prices` | `app.routers.commodity_router.get_commodity_prices` |
| `commodity_spikes` | `app.routers.commodity_router.get_commodity_spikes` |
| `approvals` | `app.routers.approvals.list_approvals` |
| `source_health` | `app.routers.health.source_health_check` |
| `evaluation_benchmark` | `app.routers.evaluation_router.get_benchmark_report` |
| `evaluation_test_matrix` | `app.routers.evaluation_router.get_test_matrix` |
| `evaluation_corridor_efficiency` | `app.routers.evaluation_router.get_corridor_efficiency` |
| `outcomes` | `app.routers.outcomes_router.list_outcomes` |
| `bnpb_events` | `app.routers.bnpb_router.get_bnpb_events` |

No internal HTTP. Pydantic return values are converted once (`jsonable_encoder`);
sync Supabase work inside the ERP section runs via `asyncio.to_thread`.

### Cached vs live

| Data | Where it comes from | Persists across restart? |
|---|---|---|
| All 15 public sections | `dashboard_snapshots.payload`, written by the tick every 5 min | **Yes** (Supabase) |
| Live fallback (missing/stale row) | same 15 functions, composed in-request under an 8 s cap | returned only; **not** written |
| `fleet` | `vehicles_router.get_active_fleet` → its 8 s per-tenant response cache → `telemetry_service` | no (process cache) |
| `erp` | `travel_ledger_service.build_erp_summary` → its 120 s Redis/mem cache | Redis only |
| Degraded public section | in-process last-good value (`cached: true`) if the process has one, else `null` | no |
| Degraded tenant section | always `null` — the last-good cache is **disabled** for tenant sections (name-only key would cross tenants) | n/a |

### Tick integration

`internal_tick._run_tick` runs `job_scheduler.run_tick(...)` and then
`_refresh_dashboard_snapshot(run_id)` **in the same background task**:

- after the batch jobs, and also on a tick with **nothing due** (so the read model
  never exceeds 600 s just because no batch job was scheduled);
- bounded by `SNAPSHOT_BUILD_TIMEOUT_SECONDS = 30 s` (sections are already 5 s
  parallel, so the real build is ~6 s);
- logs `snapshot_built run_id=… sections=… computed_at=…` or
  `snapshot_failed run_id=…`;
- never fails the tick and never delays the `202` (phase 162 behaviour preserved).

The snapshot is **not** added to the fair job queue: it is a post-tick hook, so it
cannot consume a `TICK_MAX_JOBS` slot or be starved by overdue ingestion jobs.

### Migration 024

`dashboard_snapshots(snapshot_key text pk, payload jsonb not null, computed_at
timestamptz not null, schema_version int not null default 1, source_freshness jsonb,
created_at timestamptz not null default now())`, index on `computed_at`, RLS enabled
with **no policies**, and a table comment stating that the tick writes and the read
path only reads. Idempotent (`IF NOT EXISTS`), matching the 022/023 style. The
backend uses the service-role key (`get_write_client`), so the anon/authenticated
roles cannot read or tamper with the read model.

### Tests

| File | Cases | Covers |
|---|---|---|
| `backend/tests/test_dashboard_snapshot.py` | 11 | failing + timing-out sections isolated (`degraded`/`timeout`) while healthy ones stay `ok`; bounded build; last-good reuse; sync section → thread-safe JSON; store/read round-trip with a fake client; missing row → `None`; Supabase error → `None`; `schema_version` mismatch → miss; age helper; `build_and_store` ok/failure/store-failure never raises |
| `backend/tests/test_dashboard_bootstrap.py` | 13 | guest + fresh snapshot (`stale=false`, no tenant sections); root alias; modality echo; `400`; dispatcher gets `fleet`+`erp` scoped to the claim (fleet `company_id=None`, `include_geometry=False`, `vessel→maritime`); regulator aggregate ERP; `?company_id=` ignored; missing → bounded live fallback; stale → live fallback + reason; hung build returns in <3 s; failed build falls back to the stored payload; invalid token → 401; `Cache-Control` on 200/400/401; degraded tenant sections still 200 |
| `backend/tests/test_internal_tick.py` | +3 | snapshot runs after jobs and when nothing is due; snapshot failure never fails the tick; bounded build releases the tick lock |

### Verification (this session, 2026-10-27)

| Command (from `backend/`, `.venv/Scripts/python.exe`) | Result |
|---|---|
| `pytest tests/test_dashboard_snapshot.py tests/test_dashboard_bootstrap.py -q` | **24 passed**, 3 warnings, **2.68 s**, exit 0 |
| `pytest tests/test_internal_tick.py tests/test_m8_auth_contract.py -q` | **41 passed** (20 tick incl. 3 new + 21 auth), 3 warnings, **3.17 s**, exit 0 |
| `python -c "import app.main"` | `import ok in 2.67s`; routes `/api/v1/dashboard/bootstrap` and `/dashboard/bootstrap` registered |
| Migration SQL | **reviewed manually** — no SQL parser is installed in the repo or venv (`pglast`, `sqlparse`, `sqlglot` all absent); statement list checked against 022/023 for idempotency and Postgres/pgvector compatibility |

### Decisions / deviations

1. **The read path never writes.** The M8 spec's "missing snapshot → bounded live
   compute + async snapshot write" is implemented as *bounded live compute only*; the
   tick remains the single writer. Reason: migration 024's contract (and the M8
   decision "DB-backed read model") depends on a single writer, and a burst of guest
   mounts would otherwise fan out into writes on the 0.1-CPU box. The fallback result
   is returned to that caller only, and the next tick persists a fresh row.
2. **`fleet` never takes a `company_id` argument.** The existing vehicles router
   already locks a DISPATCHER to the JWT claim and gives REGULATOR/GUEST the public
   macro view; passing nothing is what makes a `?company_id=` override impossible
   (audit F6). Geometry is stripped with `include_geometry=False`.
3. **`erp` mirrors `/api/v1/erp/summary` exactly.** DISPATCHER → own claim +
   per-rit detail; REGULATOR/GUEST → macro aggregate, no detail. Scoping a
   regulator to their own near-empty tenant would silently change what they see
   today. No query param is read.
4. **`modality=vessel` maps to the fleet endpoint's `maritime`.** The M8 contract
   says `truck|vessel|air`; `vehicles_router` says `truck|maritime|air`. The response
   echoes the requested value so the client never sees the translation.
5. **`source_freshness` is stored, not returned.** The response shape is the one in
   the unit brief (`sections.<name>.status` is the per-section freshness surface).
   The `{status, ms, error?}` map stays in the row for ops/tick diagnostics.
6. **`reason` only when `stale=true`.** Keeps the happy-path body stable for 163b.
7. **Last-good cache is public-section only.** Keyed by section name; a tenant
   section that failed must return `null`, not another tenant's fleet.
8. **A `schema_version` mismatch is a miss**, so a backend deploy can never serve a
   payload shape the client cannot parse.

### Risks / follow-ups

1. **`fleet`/`incidents`/`erp` still do synchronous PostgREST work** inside their
   async functions (audit F4). The 5 s section budget cannot preempt that block; it
   is bounded by the client's own timeouts today and owned by phase 164's async-I/O
   sweep. The public snapshot is unaffected (the tick absorbs that cost).
2. **Migration 024 must be applied** before the tick can persist anything. Until
   then `read_global_snapshot()` returns `None` and every dashboard mount takes the
   bounded live path (`stale=true`) — correct but slower. Apply + smoke in phase 165.
3. **`evaluation_test_matrix` is a large section** (137 test cases). It is included
   because it is in the required section list; if the 163b trace shows it dominating
   the bootstrap payload, move it to a lazy-mounted section instead of the snapshot.
4. **Weather/fire sections are imported from `routing_router`**, which the
   concurrent M9 session owns. Signatures were read-only for this unit and are called
   by keyword; a rename there must update `section_plan`.
5. **No production measurement yet.** The "< 5 s first data / request count down"
   gate needs the 163b client + a Playwright trace (phase 165).

---

## 163b — frontend integration — DONE (implementation)

Delivered on `m9-operational-truth`, **uncommitted**. The concurrent M9 work was
already committed (`bb9b61b`); every M9 surface named in the brief was preserved
(world-truth hazard counters, freshness badges, route provenance, shared weather
snapshot, no-route surfacing).

### Delivered

| Deliverable | Path |
|---|---|
| `api.dashboard.bootstrap()` (`GET /api/v1/dashboard/bootstrap`, 30 s budget) + per-call `timeoutMs` transport with a composed abort signal | `frontend/lib/api.ts` |
| `DashboardBootstrapResponse` / `DashboardSection<T>` / section payload types | `frontend/lib/types.ts` |
| One-shot bootstrap hook: abort on unmount, 60 s visible-only refresh, manual `refresh()`, server + local staleness | `frontend/hooks/useDashboardBootstrap.ts` |
| Poll gating helper (`isDocumentVisible`, `subscribeVisibility`) | `frontend/lib/visibility.ts` |
| Abort-per-request + no overlapping polls + hidden-tab skip + bootstrap seed for incidents / news / market regime / corridor / weather polygons / fire hotspots | `frontend/hooks/useIncidents.ts`, `useNewsVerification.ts`, `useCorridorContext.ts`, `useFleetVehicles.ts` |
| Lazy-mounted Analitik / Laporan / Evaluasi, bootstrap seeding, visibility-gated pollers, snapshot freshness row in the legend | `frontend/components/dashboard/DashboardClient.tsx` |
| Read-path Playwright proof (bootstrap called, API count vs baseline, lazy tabs, first-data signal) | `frontend/e2e/m8-readpath.spec.ts` |
| Spec registration | `frontend/playwright.m8.config.ts` |

### Transport contract (`frontend/lib/api.ts`)

| Rule | Implementation |
|---|---|
| Read budget | 15 s default (`DEFAULT_READ_TIMEOUT_MS`) |
| Write budget | 60 s default (`DEFAULT_WRITE_TIMEOUT_MS`) — route optimisation and the crisis pipeline legitimately run 30–50 s on 0.1 CPU; a 15 s cap would abort real work |
| Bootstrap | 30 s (`BOOTSTRAP_TIMEOUT_MS`), per-call override |
| On timeout | one **direct** retry after a 400 ms backoff, then `TimeoutError` — never the proxy (a replay would restart the same slow work) |
| On network/CORS failure | unchanged same-origin `/api/proxy` fallback |
| Abort | caller `AbortSignal` × deadline composed through a manual `AbortController` (`AbortSignal.any` avoided for older Safari) |
| `Content-Type` | only sent when a body exists, so anonymous GETs stop paying a preflight |
| Preserved | `getAuthToken` / `setAuthToken` and every existing API signature (new params are optional/trailing) |

**Deviation from the brief:** the brief said "default 15 s". A literal 15 s cap on
POST/PATCH/DELETE would abort route optimisation (documented 30–50 s) and the
crisis pipeline, so writes default to 60 s. Reads — the path this phase is about —
keep the 15 s default, and `timeoutMs` still overrides per call.

### What is seeded, lazy, aborted

| Surface | Before (first paint) | After |
|---|---|---|
| `incidents` | `GET /api/v1/incidents?limit=100` | seeded from `sections.incidents`; 15 s poll |
| `news` + `news_market_regime` | `GET /news/live` + `/news/market-regime` | seeded from `sections.news` / `sections.news_market_regime`; seed still passes through the same permalink/freshness/discourse gates; 30 s poll |
| `corridor_context` | `GET /corridor/context` | seeded from `sections.corridor_context`; 30 s poll |
| `weather_spatial_polygons` (high/50/80) | `GET /weather/spatial-polygons?...` | seeded from `sections.weather_spatial_polygons` (same payload incl. `meta`); 120 s poll |
| `fire_hotspots` | `GET /fire/hotspots` | seeded from `sections.fire_hotspots` (same envelope); 300 s poll |
| Analitik (commodities ×N, BNPB) | fired on every mount (CSS-hidden) | mounted only while `activeSection === 'analytics'` |
| Laporan (approvals, source health) | fired on every mount | mounted only while `activeSection === 'reports'` |
| Evaluasi (benchmark, matrix, corridor efficiency, outcomes) | fired on every mount | mounted only while `activeSection === 'evaluation'` |
| All of the above + HITL poll + weather summary | no abort, poll while hidden | one in-flight request, previous aborted, skipped while `document.hidden`, resumed on visibility |

### Deliberately not seeded

1. **`fleet`** — the snapshot section is built for one modality (default `truck`)
   while the map draws the multimodal macro slice (tenant trucks + situational
   vessels/air). Seeding it would blank the Kapal/Udara pills until the next 10 s
   sync, so `useFleetVehicles` keeps its own read (abort/visibility hardened).
2. **`erp`** — only Laporan consumes it, and Laporan is now lazy.
3. **`weather_summary`** — not a bootstrap section; M9's world-truth counters still
   read `GET /api/v1/weather/summary` on mount (kept unchanged on purpose).

Remaining first-mount API calls (authenticated DISPATCHER, expected):
`auth/me` (phase 161 reconcile) · `dashboard/bootstrap` · `weather/summary` ·
`news/hitl-pending` · `fleet/vehicles`. That is 5, versus 28 to the API host in the
phase-160 baseline.

### Stale rendering

`sections.<name>.status` decides seeding (`ok` only — a `degraded`/`timeout` section
is `null` and the owning hook falls back to its own read, so a spinner never sits
over stale data). The legend's freshness block gains one row, `Snapshot`, driven by
`stale` + `computed_at` + `reason`; the M9 Cuaca/Waspada/Titik Panas rows are
untouched.

### Verification (this session, 2026-10-27)

| Command (from `frontend/`) | Result |
|---|---|
| `npx tsc --noEmit` | **exit 0** (run after the final edit; also covers `e2e/`) |
| `npm run build` | **exit 0** — Next 14.2.35, compiled successfully, 7/7 static pages, `/dashboard` 3.29 kB / 163 kB First Load JS; no dev server was running, `.next` rewritten |
| `npx playwright test e2e/m8-readpath.spec.ts --config=playwright.m8.config.ts` | **1 passed** (12.7 s) against a local production build (`npm start`, `M8_BASE_URL=http://localhost:3000`) with the DISPATCHER account: first data **1,236 ms**, **6** API requests (baseline 28), **35** total (baseline 91), bootstrap called once. `bootstrap_status=null` because `/api/v1/dashboard/bootstrap` is not deployed on the target yet; the spec treats that as a soft gate unless `M8_REQUIRE_BOOTSTRAP=1` (phase 165). Lazy tabs verified: analytics/reports/evaluation only fired after their tab was clicked. |

**Measured on 2026-10-27** on a local production build with the DISPATCHER account.
`next dev` was not used (React StrictMode doubles mount effects). The phase-165 gate
must re-run with `M8_REQUIRE_BOOTSTRAP=1` against the deployed backend.

### Decisions / deviations

1. **Bootstrap is held until the session is resolved** (`enabled: !isAuthLoading`).
   The endpoint is auth-aware; firing before `setAuthToken` runs would fetch the
   guest shape and seed an operator with no tenant sections.
2. **Dependent hooks are gated on `bootstrap.isLoading`**, which only flips once
   (the 60 s refresh never sets it again). That is what removes the duplicate
   mount read; if the bootstrap fails, `isLoading` still flips and every hook falls
   back to its own request.
3. **Sections are conditionally mounted, not merely hidden.** Re-opening a tab
   refetches it (freshness over cache), which is the intended trade against the
   first-paint fan-out.
4. **One snapshot row in the legend.** No new colours, no layout change; the M9
   badge components are reused (`StatusFreshnessBadge`).

### Risks / follow-ups

1. **Production measurement still owed** (phase 165): request count, first data
   < 5 s on Fast 4G, and the `stale` badge against a real snapshot row.
2. **Migration 024 must be applied**, otherwise every mount takes the bounded live
   path (`stale=true`) — correct but slower, and it exercises the 8 s cap.
3. **`evaluation_test_matrix` is still in the bootstrap payload** even though
   Evaluasi is lazy; it inflates the response but not the request count. Move it
   out of the snapshot if the 165 trace shows payload size as the bottleneck.
4. **A long-hidden tab** resumes on visibility only if the last answer is older
   than 60 s; hooks poll immediately on resume. No overlapping requests.

---

## Scope OUT (both units)

- No proxy cache-header work (phase 164).
- No async rewrite of the fleet/incidents/ERP services (phase 164, audit F4).
- No route-result persistence and no visual redesign.
- No `SPEC.md` edit, no `.planning/baseline-pytest.txt` edit, no commit, no deploy.

---

## Snapshot payload trim (2026-10-28)

Production tick works, but the first measurement showed the snapshot is a **full-world
dump**: **796 KB** row, **~785 KB of it news**, **~15 s** build, several sections timing
out at 12-15 s, and a **50 s** first bootstrap request. The 5 s per-section budget in
`run_section` was not effective because the underlying Supabase reads were synchronous and
blocked the single event loop, so "parallel" sections ran one behind another.

### What changed

| Area | Before | After |
|---|---|---|
| Sections | 15 ("all public sections") | **4 map-bootstrap sections** |
| Snapshot row | 796 KB | **target < 250 KB** (measure after redeploy/tick) |
| Build | ~15 s | **target < 5 s** (measure after redeploy/tick) |
| `news` | `get_live_news` (150-article breadth contract + re-tier + may schedule ingestion) | direct `fetch_news_from_supabase(limit=40, include_regional=True)` -> **40 articles max** |
| `incidents` | `list_incidents(limit=100)` | `list_incidents(limit=50)` |
| `fetch_news_from_supabase` | `query.execute()` on the loop | `await asyncio.to_thread(query.execute)` |
| `list_incidents` | `_fetch_incident_rows(...)` on the loop | `await asyncio.to_thread(_fetch_incident_rows, ...)` |
| `persist_re_tiered_news_rows` | already off-loop | unchanged (`asyncio.to_thread`) |

### New section list (4)

| Section | Factory |
|---|---|
| `incidents` | `app.routers.incidents.list_incidents(status=None, severity=None, limit=50)` |
| `news` | `fetch_news_from_supabase(limit=40, include_regional=True)` wrapped in `{status,total,last_updated,articles}` |
| `news_market_regime` | `app.routers.news_router.get_market_regime` |
| `fire_hotspots` | `app.routers.routing_router.fetch_fire_hotspots` (M9 surface, read-only, unchanged) |

Removed from the plan (still served by their own routers when the frontend asks):
`corridor_context`, `weather_spatial_polygons`, `commodity_prices`, `commodity_spikes`,
`approvals`, `source_health`, `evaluation_benchmark`, `evaluation_test_matrix`,
`evaluation_corridor_efficiency`, `outcomes`, `bnpb_events`. Rationale: the frontend
fetches weather/corridor live (phase 163b seeds them from the snapshot, but they are cheap
and M9-owned) and only mounts Analitik/Laporan/Evaluasi when the tab is opened, so writing
them every 5 minutes was pure waste.

The old `_NoopBackgroundTasks` helper is gone: the news section no longer calls
`get_live_news`, so there is nothing for a cold news cache to schedule.

### Notes / non-changes

1. `run_section` isolation, timeout and last-good-cache behaviour is **unchanged**. The
   `to_thread` fixes are what make the budget real; without them a 12 s sync read blew
   past it because nothing could preempt the blocking call.
2. The breadth/tiering logic in `news_aggregator` is untouched. Only the read moved off the
   event loop; the v7 re-tier and the batched `persist_re_tiered_news_rows` write-back are
   unchanged (and were already off-loop).
3. `section_plan()` keeps its `corridor_id` parameter for call-site compatibility; no
   remaining section is corridor-scoped, so it is ignored.
4. **No production size/timing claim.** 796 KB -> < 250 KB and ~15 s -> < 5 s are targets;
   they must be measured on the first tick after redeploy (phase 165).

