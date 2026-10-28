# WALKTHROUGH — Phase 162: Thin web + external tick

**Window:** 2026-10-27 · **Docs pass:** 2026-10-28
**Commit:** `557a467` — `feat(m8-162): thin web + external ingestion tick`
(12 files, +2107/−252)
**Lineage:** on `m9-operational-truth` + all `m9-*` + `main`; not on either `m8-*` branch
**Mode:** implementation; hermetic tests; no live tick was fired from this phase

---

## 1. Problem

Nine pollers started in the lifespan of a single uvicorn worker on ~0.1 CPU
(`M8-SPEC.md` root cause #1). Each did synchronous Supabase writes, sync Redis with a
5 s timeout, and sync JWKS/profile lookups inside `async def`. `/health` is a constant
dict, so it could not be "slow" — the process simply could not serve while the pollers
ran. That is why login took 70 s while `/health` answered in 280 ms minutes earlier.

The fix had to keep ingestion running (the product needs the data) without letting it
compete with boot or user requests on the same CPU.

## 2. Thin web

`backend/app/main.py:496-552` gained three independent switches:

| Switch | Production | Effect |
|---|---|---|
| `POLLERS_ENABLED` | `true` | master switch for any in-process worker |
| `INPROCESS_BATCH_POLLERS` | **`false`** | the 8 batch loops do not start; the external tick is the only driver |
| `CONTINUOUS_TASK_DELAY_SECONDS` | `75` | delay before AIS WebSocket and validated-alert fan-out start |

- `batch_pollers_enabled = pollers_enabled and inprocess_batch_pollers`
  (`main.py:505-508`); when false the process logs `BOOT: INPROCESS_BATCH_POLLERS=false
  - thin web…` and starts nothing batch.
- Default in code is `inprocess_batch_pollers = True` (`config.py:92`), so dev keeps the
  old loops and production must opt out explicitly. See `LEARNINGS.md` §4.
- `POLLERS_ENABLED=false` still produces an HTTP-only replica: no AIS, no fan-out
  (`main.py:528-541`).

Each poller body was split into `_run_<source>_cycle()` (one pass, raises) and the old
`_poll_<source>_loop()` is now `while True: await cycle(); sleep(dev cadence)`. The
scheduler resolves `_run_*_cycle` **from `app.main` at call time**, so ingestion logic
exists once and the scheduler imports no adapters.

PIHPS and social previously called `await Scraper().run()` — an infinite loop.
`BaseScraper.run_once()` was extracted and `run()` is now
`while True: run_once(); sleep(interval)` (`backend/app/scrapers/base_scraper.py`), so the
tick and the dev loop share one cycle.

## 3. `POST /internal/tick`

`backend/app/routers/internal_tick.py:151-215`.

| Case | Response |
|---|---|
| `INTERNAL_TICK_TOKEN` empty (disabled) | **`404`** — an empty supplied header never matches, so the route behaves as absent |
| wrong / missing token | **`401`** + `WWW-Authenticate: Bearer` |
| valid, work scheduled | **`202 {"accepted": true, "due": [...], "skipped": [...], "run_id": "..."}`** |
| second concurrent call in the same process | **`202 {"accepted": false, "reason": "already_running", ...}`** |
| planning failed (Supabase unreachable / 10 s cap) | `202 {"accepted": true, "reason": "plan_failed", "due": [], "skipped": [{"job": …, "reason": "state_unavailable"}]}` |

- Token check is `secrets.compare_digest` against the setting (`:61-62,157-169`).
- Overlap inside one process: an `asyncio.Lock` held across the background task, released
  in a `finally` (`:55,146-148,171-184`). The check-and-acquire has no `await` in between,
  so it is atomic on the loop.
- Overlap across processes/restarts: the per-job `locked_until` lease in Supabase
  (`job_scheduler.acquire/release`).
- Work is `asyncio.create_task` (`:205-207`); the response never waits for jobs. Only the
  *plan* is awaited, capped at 10 s (`:46,188-190`), because the 202 must report `due`.
- `/health` never touches this module.

`POST` was chosen over the spec's `GET`: a tick mutates state (lease + ingestion), so it
must not be cacheable or prefetchable. `docs/KEEPALIVE_RUNBOOK.md` documents `POST`.

## 4. Job registry, lease, budget

`backend/app/services/job_scheduler.py`:

| Job | Cadence | Cycle body |
|---|---|---|
| `news` | 300 s | `_run_news_cycle` |
| `bmkg` | 300 s | `_run_bmkg_cycle` |
| `tomtom` | 1800 s | `_run_tomtom_cycle` |
| `open_meteo` | 21600 s | `_run_open_meteo_cycle` |
| `firms` | 10800 s | `_run_firms_cycle` |
| `pihps` | 86400 s | `_run_pihps_cycle` |
| `social` | 3600 s | `_run_social_cycle` |
| `bnpb` | 3600 s | `_run_bnpb_cycle` |

(`:72-84`; registry order is only the tie-break for equally overdue jobs.)

| Mechanism | Value / behaviour | Line |
|---|---|---|
| Durable last-run | `last_finished_at`, advanced **only** on `status=ok` | migration 023 `release_scheduler_job` |
| Failure | `last_error` + `retry_after` = now + 120 s; `last_finished_at` unchanged, so the job stays due | `:50`, migration 023 |
| Lease TTL | **`LOCK_TTL_SECONDS = 600`** — must outlive the 120 s tick budget plus the slowest single job, otherwise the next tick could re-run a slow cycle | `:47-49` |
| Per-tick cap | `TICK_MAX_JOBS=2` | `:414-443` |
| Per-tick wall clock | `TICK_BUDGET_SECONDS=120`, shared across the jobs in the tick | `:421-460` |
| Remaining jobs | deferred but still due; ordering is `age / cadence`, so long-cadence jobs cannot be starved by 300 s jobs | `:280-290` |
| Missing RPC | if `acquire_scheduler_job` is absent (migration not applied) the scheduler falls back to an atomic compare-and-set on `locked_until` and logs the degradation | `:164-219` |

The shared budget is the subtle part: `remaining = budget − elapsed` is recomputed before
each job, so a slow first job can leave the second with very little. See `LEARNINGS.md`
§2 for the observed consequence.

Migration: `infra/supabase/migrations/023_scheduler_jobs.sql` — `scheduler_jobs`
(job_name PK, last_started_at, last_finished_at, last_status, last_error, locked_until,
retry_after, created_at, updated_at), index on `(last_finished_at, retry_after)`, RLS
enabled with **no policies** (service-role only), plus
`acquire_scheduler_job(p_job, p_ttl_seconds)` and
`release_scheduler_job(p_job, p_status, p_error, p_retry_after_seconds)`.

Applied to the project on 2026-10-27 as version `20261027111905`; smoke test: acquire
`true` → second acquire `false` → release → cleanup left 0 rows.

## 5. What still runs in-process (production)

| Worker | Runs? | Note |
|---|---|---|
| 8 batch pollers | **no** | tick-driven |
| AISstream WebSocket | yes | deferred **75 s**, supervised with exponential backoff (`main.py:539`) |
| validated-alert Redis fan-out | yes | deferred 75 s, supervised (`main.py:548-552`); still per-process for `/ws/crisis` |
| JWKS pre-warm | yes | phase 161, off-loop, non-fatal |
| Redis ping + `init_write_health` | yes | unchanged |
| `/health` | yes | constant dict |

The fan-out is **not** gated on `POLLERS_ENABLED` (`main.py:543-547`): every API process
tails its own copy of `lrip:stream:validated_alerts`, because WebSocket fan-out is
per-process even for HTTP-only replicas. Clients that connect inside the first 75 s still
receive the terminal SSE `alert` field and the late-subscriber replay.

## 6. Verification

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest tests\test_internal_tick.py -q
# 17 passed, 3.53s, exit 0        <- at 557a467
# 20 passed, 2.18s               <- re-run 2026-10-28 (phase 163a appended 3 tick-hook tests)

.\.venv\Scripts\python.exe -m pytest tests\test_m8_auth_contract.py -q
# 21 passed, 4.61s               <- phase gate
```

Import-time audit (`python -X importtime -c "import app.main"`), phase run ~2.8 s,
re-verified 2026-10-28 at **2.72 s cumulative, exit 0**. Per-module values below are
from the phase run; only the total and the absence of heavy imports were re-checked.

| Cumulative | Module | Why |
|---|---|---|
| 2.72–2.82 s | `app.main` | root |
| ~1.29 s | `app.routers.corridor_router` | eagerly imported router |
| ~1.28 s | `app.services.corridor_service` | corridor stack |
| ~1.27 s | `app.adapters` (via `bmkg_adapter`) | pulled by the corridor stack |
| ~0.61 s | `app.adapters.cpu_routing_adapter` / `networkx` | routing adapter |
| ~0.62 s | `fastapi` | framework |

**`numpy`, `scipy`, `langgraph`, `pandas`, `sklearn`, `agents` are not imported.** The
pollers contribute zero imports at boot; the remaining cost is the eager router list
(phase 164 scope). This was re-checked on 2026-10-28 with a zero-match grep over the
importtime output.

Production config (`render.yaml`, re-read 2026-10-28): `INPROCESS_BATCH_POLLERS=false`,
`POLLERS_ENABLED=true`, `TICK_MAX_JOBS=2`, `TICK_BUDGET_SECONDS=120`,
`INTERNAL_TICK_TOKEN` `sync: false`, `healthCheckPath: /health`, plan `free`, region
`singapore`.

## 7. Not verified here

1. **No live tick.** The endpoint was never called against Supabase from this phase; the
   RPC path, the lease under real latency and the 202 timing are hermetic-only.
2. **No cron-job.org job.** The scheduler was not created; the runbook documents the
   two jobs (waker + tick) but the dashboard side is a user action.
3. **No production cold-boot measurement.** The import-time figure is local, not Render.
4. **Capacity is short by construction** — 576 slots/day vs 685 scheduled runs/day. See
   `LEARNINGS.md` §1.
5. Redis writes inside the cycle bodies are still synchronous (audit F13) — deliberately
   not fixed here.
