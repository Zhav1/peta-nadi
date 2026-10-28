# WALKTHROUGH — Phase 163: Bootstrap snapshot + read path

**Milestone:** M8 — Fast & Durable (phase 4 of 7)
**Window:** 2026-10-27 (implementation) → 2026-10-28 (trim + production measurement)
**Status:** **DONE** — 163a, 163b and the payload trim all shipped and are deployed.
**Plan:** `PLAN.md` (this folder) · **Learnings:** `LEARNINGS.md` (this folder)

---

## What this phase replaced

Before: every `/dashboard` mount fanned out to ~25–30 backend endpoints (phase-160
baseline: 91 total requests / 28 to the API host for DISPATCHER, first data 73.8 s), and
the sections that were only visible in another tab still fired on first paint because they
were mounted and CSS-hidden.

After: one auth-aware `GET /api/v1/dashboard/bootstrap` reads a DB row composed by the
5-minute external tick, and the three operator tabs mount only when clicked.

---

## 163a — backend

| Deliverable | Path |
|---|---|
| `dashboard_snapshots` table (payload, computed_at, schema_version, source_freshness), `computed_at` index, RLS enabled with **no policies**, write/read contract comments | `infra/supabase/migrations/024_dashboard_snapshots.sql` |
| Snapshot builder, section isolation, store/read, staleness helper, never-raising tick entry point | `backend/app/services/dashboard_snapshot_service.py` |
| `GET /api/v1/dashboard/bootstrap` + hidden `/dashboard/bootstrap` alias | `backend/app/routers/dashboard_bootstrap.py` |
| Router registration (2-line delta) | `backend/app/main.py` |
| Post-tick snapshot refresh (`snapshot_built` / `snapshot_failed`), 30 s outer bound, runs even when no job is due | `backend/app/routers/internal_tick.py` |
| Service + endpoint tests | `backend/tests/test_dashboard_snapshot.py`, `backend/tests/test_dashboard_bootstrap.py` |
| Tick-hook tests (3) | `backend/tests/test_internal_tick.py` |

Commit: **`92e322f`** — `feat(m8-163a): durable dashboard bootstrap snapshot`.

### Endpoint contract (as shipped)

| Case | Response |
|---|---|
| No `Authorization` | `200`, `role=GUEST`, public sections only |
| Invalid/expired token | `401` + `WWW-Authenticate: Bearer` (phase 161 fail-closed) |
| Stored row ≤ 600 s old | `200`, `stale=false`, payload straight from the row |
| Missing/stale/unparseable row | bounded live build (`LIVE_BUILD_TIMEOUT_SECONDS = 8.0`), `200`, `stale=true`, `reason` |
| Live build fails/times out | `200` + stored payload if any, else `sections={}`, never a 5xx |
| `DISPATCHER` / `REGULATOR` | adds live `fleet` (geometry stripped) + `erp` (same policy as `/api/v1/erp/summary`) |
| Headers | `private, no-store` on 200, 400 **and** 401 (`CACHE_CONTROL` constant, one place) |
| Writes | none — the tick is the only writer |

### Migration 024

```sql
CREATE TABLE IF NOT EXISTS dashboard_snapshots (
  snapshot_key     TEXT PRIMARY KEY,
  payload          JSONB NOT NULL,
  computed_at      TIMESTAMPTZ NOT NULL,
  schema_version   INTEGER NOT NULL DEFAULT 1,
  source_freshness JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Applied in production Supabase as version **`20261027111919`**. RLS is on with no
policies: only the service-role key (`get_write_client`) can touch the read model.

---

## 163b — frontend

| Deliverable | Path |
|---|---|
| `api.dashboard.bootstrap()` (30 s budget) + per-call `timeoutMs`, composed abort signal, timeout retry **direct only** | `frontend/lib/api.ts` |
| `DashboardBootstrapResponse` / `DashboardSection<T>` and section payload types | `frontend/lib/types.ts` |
| Bootstrap hook: one fetch per mount, abort on unmount, 60 s visible-only refresh, server + local staleness | `frontend/hooks/useDashboardBootstrap.ts` |
| `isDocumentVisible` / `subscribeVisibility` poll gate | `frontend/lib/visibility.ts` |
| Abort-per-request, no overlapping polls, hidden-tab skip, bootstrap seed | `frontend/hooks/useIncidents.ts`, `useNewsVerification.ts`, `useCorridorContext.ts`, `useFleetVehicles.ts` |
| Lazy-mounted Analitik/Laporan/Evaluasi, bootstrap seeding, visibility-gated pollers, `Snapshot` freshness row | `frontend/components/dashboard/DashboardClient.tsx` |
| Read-path Playwright proof + config registration | `frontend/e2e/m8-readpath.spec.ts`, `frontend/playwright.m8.config.ts` |

Commit: **`c4034f9`** — `feat(m8-163b): bootstrap read path + lazy dashboard sections`.

### Transport budgets (as shipped)

| Call type | Budget |
|---|---|
| Reads | 15 s (`DEFAULT_READ_TIMEOUT_MS`) |
| Writes | 60 s (`DEFAULT_WRITE_TIMEOUT_MS`) — route optimisation legitimately runs 30–50 s on 0.1 CPU |
| Bootstrap | 30 s (`BOOTSTRAP_TIMEOUT_MS`) |

Timeout → one **direct** retry after 400 ms, then `TimeoutError`; never the proxy (a replay
would restart the same slow work). Network/CORS failure keeps the same-origin
`/api/proxy` fallback.

### Abort / visibility behaviour

- One in-flight request per hook; a new poll aborts the previous one.
- `document.hidden` → no poll; on `visibilitychange` a hook re-reads only if its last
  answer is older than the interval.
- Unmount aborts everything (`abortRef.current?.abort()` in the effect cleanup).
- The bootstrap hook never clears `data` on a failed refresh — the badge goes stale instead
  of the dashboard going blank.

---

## Snapshot trim (`60bca8a`)

Production proved the read path worked but the row was a full-world dump:
**796 KB** total, of which **~785 KB was news**, 15 sections, `~15 s` build, and the first
bootstrap request took **50 s**. The 5 s per-section budget was decorative because the
underlying Supabase reads were synchronous and blocked the single event loop.

| Change | Before | After |
|---|---|---|
| Sections | 15 | **4** — `incidents`, `news`, `news_market_regime`, `fire_hotspots` |
| `news` | `get_live_news` (150-article breadth contract, re-tier, may schedule ingestion) | direct `fetch_news_from_supabase(limit=40, include_regional=True)` → **40 articles max** |
| `incidents` | `limit=100` | `limit=50` |
| News PostgREST read | sync `query.execute()` on the loop | `await asyncio.to_thread(query.execute)` (`news_aggregator.py:1826`) |
| Incidents PostgREST read | sync `_fetch_incident_rows(...)` on the loop | `await asyncio.to_thread(_fetch_incident_rows, ...)` (`incidents.py:204`) |
| Row size | 796 KB | **291 KB measured** (target was < 250 KB — missed by 41 KB) |
| Build | ~15 s | reported `snapshot_built` on the next tick; not separately timed |

Removed from the tick write (still served by their own routers):
`corridor_context`, `weather_spatial_polygons`, `commodity_prices`, `commodity_spikes`,
`approvals`, `source_health`, `evaluation_benchmark`, `evaluation_test_matrix`,
`evaluation_corridor_efficiency`, `outcomes`, `bnpb_events`.

`evaluation_test_matrix` and the Dijkstra-based corridor/evaluation work no longer run in
the 5-minute snapshot at all — that was the single largest waste in the first design.

---

## Verification

### Local (re-run in the 2026-10-28 docs pass)

| Command | Result |
|---|---|
| `cd backend; .venv/Scripts/python.exe -m pytest tests/test_dashboard_snapshot.py tests/test_dashboard_bootstrap.py -q` | **27 passed**, 3 warnings, **3.26 s**, exit 0 (24 at implementation time, pre-trim) |
| `... -m pytest tests/test_news_read_path.py tests/test_internal_tick.py -q` | **28 passed**, 3 warnings, **2.12 s**, exit 0 |
| `cd frontend; npx tsc --noEmit` | exit 0 (implementation pass) |
| `cd frontend; npm run build` | exit 0, 7/7 static pages, `/dashboard` 163 kB First Load JS (implementation pass) |
| `npx playwright test e2e/m8-readpath.spec.ts --config=playwright.m8.config.ts` (local production build, DISPATCHER) | **1 passed** — first data **1,236 ms**, **6** API requests, **35** total, bootstrap called once, lazy tabs verified (implementation pass) |

### Production (phase 165, 2026-10-28)

| Gate | Result |
|---|---|
| `GET /api/v1/dashboard/bootstrap` with `M8_REQUIRE_BOOTSTRAP=1` | **200** on first mount |
| First data | **1.017 s** |
| API requests / total requests | **8 / 50** (baseline 28 / 91) |
| Bootstrap response time | **1.9 s** |
| Snapshot row | **291 KB**, 4 sections |

---

## Deliberately not done

1. **`fleet` is not seeded** from the snapshot — the snapshot section is single-modality
   while the map draws the multimodal macro slice; seeding it blanked the Kapal/Udara pills.
2. **`erp` is not seeded** — only Laporan consumes it, and Laporan is lazy now.
3. **`weather_summary` is not a snapshot section** — M9's world-truth counters keep reading
   `GET /api/v1/weather/summary` on mount.
4. **Sections are conditionally mounted, not hidden** — re-opening a tab refetches it
   (freshness over cache), which is the intended trade against first-paint fan-out.
5. **The read path never writes** — the spec's "missing snapshot → async snapshot write" was
   implemented as bounded live compute only, so a burst of guest mounts cannot become a
   write storm.

---

## Unverified / open

- **No throttled measurement.** The 1.017 s first-data figure is unthrottled production, not
  the spec's "Fast 4G" condition.
- **The post-trim build time was never timed.** The size was measured (291 KB); the
  `< 5 s` build target was not.
- **Dead seed paths.** `sections.corridor_context` and `sections.weather_spatial_polygons`
  are still read in `DashboardClient.tsx` but are no longer produced by `section_plan()`, so
  those two effects always fall back to their own live reads.
- **`fleet`/`incidents`/`erp` still do sync PostgREST work** on the live path (audit F4);
  only the news and incidents snapshot reads were moved off-loop. 164b owns the rest.
