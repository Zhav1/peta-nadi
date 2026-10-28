# PLAN — Phase 162: Thin web + external tick

**Window:** 2026-10-27 · **Mode:** implementation
**Milestone:** M8 — Fast & Durable (phase 3 of 7)
**Depends on:** phase 160 (`BACKEND-AUDIT.md`: §1 nine pollers, §4 sync I/O, F3 work admission), phase 161 (JWKS pre-warm + async auth)
**Branch:** implemented on the session branch `m9-operational-truth`, **uncommitted** (M8's own branch is `m8-operational-truth`). The concurrent M9 weather/retention work was deliberately left unstaged and untouched.

## Goal

Stop batch ingestion from competing with boot and user requests, and move it behind
one protected, idempotent, restart-safe external tick.

The web process must be able to answer `/health` and serve the first login while
batch work is happening — on the same 0.1 CPU box. That means: no batch loop at
boot, no adapter import at boot, and no unbounded batch work admitted per tick.

## Scope IN

- `POST /internal/tick` behind `X-Internal-Token` (constant-time), 404 when the
  token setting is empty.
- Supabase-backed job scheduler with cadence, durable last-run, per-job lease,
  `retry_after`, per-tick job/seconds budget.
- Cycle bodies reused from `main.py` (no duplicated ingestion logic).
- Thin-web boot switch (`INPROCESS_BATCH_POLLERS`), deferred + supervised AIS and
  alert fan-out.
- `render.yaml` production env, keep-alive runbook, hermetic tests.

## Scope OUT

- No bootstrap snapshot / read-path work (phase 163).
- No proxy cache headers, no generic sync-I/O sweep (phase 164); the audit's F13
  (sync Redis inside async) is deliberately not fixed here.
- No lazy import of the *router* modules: `app.main` still imports every router,
  and `corridor_router` still pulls `app.adapters` (`networkx`). Measured, listed
  below, owned by phase 164.
- No deploy, no commit, no `SPEC.md` edit, no `baseline-pytest.txt` edit.

## Tick contract (as implemented)

| Item | Contract |
|---|---|
| Method / path | `POST /internal/tick` (+ hidden `/api/v1/internal/tick` alias) |
| Auth | `X-Internal-Token`, `secrets.compare_digest` against `INTERNAL_TICK_TOKEN` |
| Disabled | token setting empty → **404** (an empty supplied value never matches) |
| Bad/missing token | **401** + `WWW-Authenticate: Bearer` |
| Accepted | `202 {"accepted": true, "due": [...], "skipped": [...], "run_id": "..."}` |
| Overlap (same process) | `202 {"accepted": false, "reason": "already_running", ...}` |
| Planning failure | `202 {"accepted": true, "reason": "plan_failed", "due": [], "skipped": [{"job": ..., "reason": "state_unavailable"}]}` |
| Work | `asyncio.create_task`; response never waits for jobs |
| Overlap (cross-process/restart) | `acquire_scheduler_job` lease, `locked_until` TTL 600s |
| Budget | `TICK_MAX_JOBS=2`, `TICK_BUDGET_SECONDS=120`; remainder deferred, still due |
| Success | `last_finished_at` advances (durable `last_run_at`) |
| Failure | `last_error` + `retry_after` (120s), `last_finished_at` unchanged |
| Supabase down | tick logs, runs nothing, returns accepted; `/health` unaffected |

`skipped` entries are `{"job": name, "reason": "locked" | "retry_after" | "not_due" | "state_unavailable"}`.

### Job registry (cadence seconds)

`news 300 · bmkg 300 · tomtom 1800 · open_meteo 21600 · firms 10800 · pihps 86400 · social 3600 · bnpb 3600`

Due selection is ordered by `age / cadence` (most overdue first), never-run jobs
first. This is load-bearing: with 2 jobs per 5-minute tick, registry order would
let `news` + `bmkg` (both 300s) consume the whole budget and starve `pihps`
(86400s) forever.

## Tasks / files

| # | Task | File |
|---|---|---|
| 1 | Tick endpoint, token guard, process lock, background task | `backend/app/routers/internal_tick.py` (new) |
| 2 | Job registry, due selection, Supabase state + RPCs, budget, retry | `backend/app/services/job_scheduler.py` (new) |
| 3 | Durable state table + `acquire_scheduler_job` / `release_scheduler_job` | `infra/supabase/migrations/023_scheduler_jobs.sql` (new) |
| 4 | Split each poller into one-cycle body + dev loop; thin-web gate; deferred AIS/fan-out | `backend/app/main.py` |
| 5 | Settings: `inprocess_batch_pollers`, `internal_tick_token`, `tick_max_jobs`, `tick_budget_seconds`, `continuous_task_delay_seconds` | `backend/app/config.py` |
| 6 | Shared one-cycle scraper seam (PIHPS/social reuse `run()` behaviour) | `backend/app/scrapers/base_scraper.py` |
| 7 | Production env: thin web + tick secret + budget | `render.yaml` |
| 8 | Runbook: cron-job.org POST tick + token, catch-up semantics | `docs/KEEPALIVE_RUNBOOK.md` |
| 9 | Hermetic contract tests (17) | `backend/tests/test_internal_tick.py` (new) |

### Reusing the loop bodies (no duplication)

Each poller became `_run_<source>_cycle()` (one pass, raises on failure) and the
old `_poll_<source>_loop()` is now a thin `while True: await cycle(); sleep(dev
cadence)` wrapper. `job_scheduler.get_job_callable()` resolves `_run_*_cycle`
from `app.main` **at call time**, so the scheduler imports no adapters and the
cycle logic exists once.

PIHPS/social were `await Scraper().run()` (infinite loop). `BaseScraper.run_once()`
was extracted and `run()` is now `while True: run_once(); sleep(interval)`; the
scraper still writes its own health and re-raises so the scheduler can record the
failure.

## What still runs in-process (production, thin web)

| Worker | Runs? | Notes |
|---|---|---|
| 8 batch pollers (BMKG, TomTom, Open-Meteo, FIRMS, news, PIHPS, social, BNPB) | **No** | driven by `POST /internal/tick` |
| AISstream WebSocket (`_run_aisstream`) | Yes | deferred 75s, supervised with backoff |
| Validated-alert Redis fan-out | Yes | deferred 75s, supervised; still per-process for `/ws/crisis` |
| JWKS pre-warm (phase 161) | Yes | unchanged, off-loop, non-fatal |
| Redis ping + `init_write_health` at boot | Yes | unchanged |
| `/health` | Yes | constant dict, never touches the scheduler |

`POLLERS_ENABLED=false` still disables everything (HTTP-only replica), as before.

## Acceptance criteria

- [x] Empty `INTERNAL_TICK_TOKEN` → 404; empty supplied header never matches.
- [x] Wrong/missing token → 401; valid → 202 with `accepted`, `due`, `skipped`, `run_id`.
- [x] Work runs in a background task; response returns before jobs finish.
- [x] Second concurrent tick → `202 accepted:false reason:already_running`, lock released after.
- [x] Per-job lease prevents duplicate execution; a lost lease is reported as `locked`.
- [x] Failure records `last_error` and `retry_after=120`; job is due again only after it.
- [x] `last_finished_at` advances only on success.
- [x] Per-tick cap defers the remainder without dropping it.
- [x] Supabase unavailable → tick logs + skips, no exception, `/health` stays 200.
- [x] Thin-web boot starts zero batch pollers; continuous consumers deferred, not started.
- [x] Default (dev) boot still starts the 8 batch pollers.
- [x] No numpy/scipy/langgraph import from `import app.main` (measured).
- [x] `render.yaml` parses; plan/region/healthCheckPath unchanged.

## Verification commands

```bash
# From backend/ with backend/.venv/Scripts/python.exe
pytest tests/test_internal_tick.py -q                     # 17 passed
pytest tests/test_m8_auth_contract.py -q                  # 21 passed (phase 161 gate)
pytest tests -q                                           # full suite; see results
python -c "import app.main"                               # import smoke
python -X importtime -c "import app.main"                 # heavy-import audit
```

```bash
# From repo root
python -c "import yaml; yaml.safe_load(open('render.yaml'))"
```

## Results (this session, 2026-10-27)

| Command | Result |
|---|---|
| `pytest tests/test_internal_tick.py -q` | **17 passed** (3.53 s), exit 0 |
| `pytest tests/test_m8_auth_contract.py -q` | **21 passed** (4.61 s), exit 0 |
| `pytest tests/test_api_routers.py -q` (with the auth contract) | **37 passed** total, but the interpreter exited 1 on `redis.asyncio` `__del__` (`Event loop is closed`) after the run — unrelated shutdown noise from the SSE test path, no test failed |
| `pytest tests -q` | **431 passed, 5 failed** (288.34 s) — all 5 are known baseline / concurrent-M9 failures, listed in `PROGRESS.md` §162 |
| `python -c "import app.main"` | `import ok`; routes `/api/v1/internal/tick`, `/internal/tick` |
| YAML | plan `free`, region `singapore`, health `/health`; `INPROCESS_BATCH_POLLERS=false`, `TICK_MAX_JOBS=2`, `TICK_BUDGET_SECONDS=120`, `INTERNAL_TICK_TOKEN=sync:false` |

### Import-time audit (`python -X importtime -c "import app.main"`)

Total ~2.8 s on this machine (cold, no warm bytecode):

| Cumulative | Module | Why |
|---|---|---|
| 2815 ms | `app.main` | root |
| 1290 ms | `app.routers.corridor_router` | eagerly imported router |
| 1288 ms | `app.services.corridor_service` | corridor stack |
| 1278 ms | `app.adapters.bmkg_adapter` (→ `app.adapters`) | pulled by the corridor stack |
| 614 ms | `app.adapters.cpu_routing_adapter` / `networkx` | routing adapter |
| 621 ms | `fastapi` | framework |

**`numpy`, `scipy`, `langgraph`, `pandas`, `sklearn`, `agents` are NOT imported.**
The pollers contribute zero imports at boot. The remaining boot cost is the eager
router import list (phase 164 hot-path scope), not ingestion.

## Decisions / deviations

1. **`POST`, not `GET`, for `/internal/tick`.** `M8-SPEC.md` §Architecture says
   `GET`; the phase brief says `POST` and a tick mutates state (lease + ingestion),
   so it must not be cacheable or prefetchable. The runbook documents `POST` and
   the `/api/v1` alias stays hidden from OpenAPI.
2. **`last_finished_at` is the durable `last_run_at`.** Migration 023 uses the
   column list from the brief, so "update last_run_at only after success" is
   implemented as "advance `last_finished_at` only on `status=ok`". A `failed` or
   crashed cycle leaves the job due.
3. **Fair ordering instead of registry order.** Required to avoid starvation at
   `TICK_MAX_JOBS=2` (see above).
4. **RPC + optimistic fallback.** `acquire_scheduler_job` / `release_scheduler_job`
   are the primary path. If PostgREST reports the function is missing (migration
   not yet applied), the scheduler falls back to a compare-and-set update on
   `locked_until` and logs the degradation. The CAS is still atomic; only the
   round-trip count differs.
5. **Planning is awaited, work is not.** The 202 needs the `due` list, so one
   indexed table read is awaited with a 10s cap before responding; the ingestion
   work is not. A planning timeout returns `reason=plan_failed` and starts nothing.
6. **RLS on `scheduler_jobs` with no policies.** Only the service-role key can
   read/write the schedule. Local dev without a service key therefore cannot run
   the tick (it logs `state_unavailable` and skips) — acceptable: the tick is a
   production driver, and dev keeps the in-process loops.
7. **Deferred alert fan-out.** It was previously started immediately; the M8 spec
   asks for both continuous consumers after 60–90s. `/ws/crisis` clients that
   connect in the first 75s get the terminal SSE `alert` field and the late
   subscriber replay, so no alert is lost.

## Risks / follow-ups

1. `TICK_MAX_JOBS=2` × 5 min ≈ 576 job slots/day vs ~661 job runs/day at the
   configured cadences. The overdue-ratio ordering prevents starvation, but the
   daily `pihps` job can be delayed by up to ~1 tick when the backlog is deep.
   Raise `TICK_MAX_JOBS` if `scheduler_jobs.last_finished_at` shows lag.
2. Redis writes inside the cycle bodies are still synchronous (`lpush`/`ltrim`) —
   audit F13, phase 164. They are small and local; they are not on the request path.
3. The `redis-asyncio` `__del__` / `Event loop is closed` noise from
   `test_api_routers.py` is pre-existing interpreter-shutdown behaviour, not a test
   failure and not caused by this phase.
4. `render.yaml` value only applies on the next Render sync; the secret must be set
   in the dashboard before the tick can return anything but 404.
5. The tick was verified hermetically (no live Supabase RPC call was made). The
   migration should be applied and `POST /internal/tick` smoke-tested in phase 165.

---

## Final status (2026-10-28)

**Status: DONE** — the web process is thin, one protected idempotent tick drives the
eight batch jobs, and the continuous consumers start late instead of at boot. What is
**not** done: the capacity is short by design (see §Capacity), and the live RPC path was
never exercised from this phase.

### Commit and lineage

| Item | Value |
|---|---|
| Commit | `557a467` — `feat(m8-162): thin web + external ingestion tick` |
| Size | 12 files, +2107/−252 |
| Contained by | `m9-operational-truth`, all `m9-*` branches, `main` |
| **Not** contained by | `m8-operational-truth` (stops at `61c0ae5`), `m8-fast-durable` (`2eeb1ca`) |

### Gate results

| Command | Result | Source |
|---|---|---|
| `pytest tests/test_internal_tick.py -q` | **17 passed**, 3.53 s, exit 0 at `557a467`; **20 passed**, 2.18 s on 2026-10-28 | phase run + re-run (the extra 3 are the phase-163a tick-hook tests appended to the same file) |
| `pytest tests/test_m8_auth_contract.py -q` | **21 passed**, 4.61 s | phase run; re-verified 21/2.68 s on 2026-10-28 |
| `pytest tests -q` | **431 passed, 5 failed**, 288.34 s | phase run — all 5 are known baseline or concurrent-M9 failures |
| `python -c "import app.main"` | `import ok`; `/internal/tick` + `/api/v1/internal/tick` registered, alias hidden from OpenAPI | phase run |
| `python -X importtime -c "import app.main"` | ~2.8 s; **no** `numpy` / `scipy` / `langgraph` / `pandas` / `sklearn` | phase run; re-verified 2026-10-28: exit 0, `app.main` cumulative **2.72 s**, zero matches |
| `yaml.safe_load(render.yaml)` | parses; plan `free`, region `singapore`, `healthCheckPath: /health` unchanged; `INPROCESS_BATCH_POLLERS=false`, `TICK_MAX_JOBS=2`, `TICK_BUDGET_SECONDS=120`, `INTERNAL_TICK_TOKEN` `sync:false` | phase run; re-read in the file 2026-10-28 |

The full-suite 5: `test_cpu_routing_weather.py::…seed_fallback…` (concurrent M9),
`test_impact_assessment.py::…spatial_filtering` (baseline #1),
`test_news_pipeline.py::…stampede_guard…` (baseline #2), and the two
`test_travel_fuel_guard.py` cases that fail on a missing
`starlette.status.HTTP_422_UNPROCESSABLE_CONTENT` attribute in the pinned Starlette
(environment/version, not this phase). The suite went 408 → 431 because this phase adds
17 tests; the rest is concurrent M9 test churn.

### Deployed prerequisites (as of 2026-10-28)

| Item | Status |
|---|---|
| Migration `023_scheduler_jobs` | **APPLIED** — Supabase version `20261027111905`; acquire/release smoke: acquire `true` → second acquire `false` → release → 0 rows |
| Render env (`INPROCESS_BATCH_POLLERS=false`, `INTERNAL_TICK_TOKEN`, `TICK_MAX_JOBS=2`, `TICK_BUDGET_SECONDS=120`) | set in `render.yaml`; **dashboard values still PENDING** — and see `LEARNINGS.md` §4 on why the yaml alone is not proof |
| cron-job.org `POST /internal/tick` every 5 min | **PENDING** (user action) |

### Capacity (arithmetic, not a measurement)

| Quantity | Value | Derivation |
|---|---|---|
| Ticks per day | 288 | 24 × 60 / 5 |
| Job slots per day | **576** | 288 × `TICK_MAX_JOBS=2` |
| Scheduled runs per day at the configured cadences | **685** | 2×288 (news, bmkg) + 48 (tomtom) + 24 (social) + 24 (bnpb) + 8 (firms) + 4 (open_meteo) + 1 (pihps) |

576 < 685, so **109 runs/day are structurally deferred** at the default settings. The
`age / cadence` ordering means the short-cadence jobs absorb the shortfall (news and
bmkg run slower than their 300 s cadence), while daily jobs still fire. This is a
deliberate budget choice, not a bug — but it must be stated before anyone claims "news
every 5 minutes in production".

### Directions for phase 165

1. Smoke the live path: `202 accepted:true` with a `run_id`, an immediate second call
   returning `already_running`, `scheduler_jobs` rows, `/health` unaffected during a tick.
2. Watch `scheduler_jobs.last_finished_at` for lag; raise `TICK_MAX_JOBS` only after
   measuring CPU, not because the arithmetic says 576 < 685.
3. Do not treat the first tick after a sleep as a failure — the cron client times out
   before the instance finishes booting (see `LEARNINGS.md` §5).

