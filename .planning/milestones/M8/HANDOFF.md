# M8 — Fast & Durable · HANDOFF

**Written:** 2026-10-28 · **Milestone:** M8, phases 160–166
**Spec:** `.planning/M8-SPEC.md` · **Ledger:** `.planning/milestones/M8/PROGRESS.md`
**Phase docs:** `.planning/phases/160…166-*/{PLAN,WALKTHROUGH,LEARNINGS}.md`

Read this first in a new context window. It states what is live, what is proven, what is not,
and what to do next. Every value here is either a repo fact, a commit, or a measurement
recorded by the phase that took it. **UNVERIFIED** marks anything without a measurement.

---

## 1. One-paragraph state

M8 is **code-complete through phase 165 and deployed**, with the SLO gate **partially closed**.
Phases 160–164 are done. Phase 165 is implementation-green: the production read path, auth and
proxy gates pass. Phase 166 (7-day soak) is **NOT STARTED**. Three items still block milestone
closure: the cold-start gate was never measured, 2 h session survival was never measured, and
`/health` warm latency came in at 0.6 s against a 500 ms target.

---

## 2. What is live

| Layer | Where | State |
|---|---|---|
| Backend | `https://peta-nadi.onrender.com` (Render free, Docker `backend/Dockerfile`, Singapore) | deployed, thin web (no in-process batch pollers) |
| Frontend | `https://pre-hub.vercel.app` (Vercel) | deployed, proxy hardened |
| Database | Supabase (service-role access from backend) | migrations 023 + 024 applied |
| Tick | cron-job.org → `POST /internal/tick` every 5 min, `X-Internal-Token`, 90 s timeout | live, returns 202 |
| Secondary prober | `.github/workflows/keep-alive.yml`, every 10 min, 4 probes, JSONL artifact, 90-day retention | scheduled |
| Continuous consumers | AIS WebSocket + validated-alert fan-out | in-process, deferred 75 s after boot, supervised |

Branch reality: **all M8 work landed on `main`** via the `m9-operational-truth` branch. The
older `m8-operational-truth` and `m8-fast-durable` branches exist but are **not** the delivery
branch — do not cherry-pick from them.

---

## 3. Commits (M8 chain)

| Commit | Phase | Content |
|---|---|---|
| `51b3903` | 160 | World-truth hazard counters independent of layer toggles (+ baseline docs) |
| `b76baa1` | 161 | Durable auth sessions + fail-closed auth boundary |
| `557a467` | 162 | Thin web + external ingestion tick |
| `92e322f` | 163a | Durable dashboard bootstrap snapshot (migration 024, endpoint, tick hook, 24 tests) |
| `c4034f9` | 163b | Bootstrap read path + lazy dashboard sections |
| `0f20068` | 164a | Proxy cache isolation + news read-path fixes |
| `00d10ac` | 165 prep | Production-tolerant cache gate + bootstrap hard-gate wait |
| `60bca8a` | 163 (trim) | Trim bootstrap snapshot to 4 map sections + `asyncio.to_thread` reads |
| `bfa3337` | merge | M9 wave 1 merged to `main` (carried the M8 code to production) |
| `3ea7133` | housekeeping | Current `main` HEAD |

Working-tree caveat: `git status` currently shows **9 unstaged deletions** under
`Final-Gemastik/` (pre-existing, unrelated to M8). Do not stage them with a docs commit.

---

## 4. Migrations

| File | Supabase version | State |
|---|---|---|
| `infra/supabase/migrations/023_scheduler_jobs.sql` | `20261027111905` | APPLIED — table + `acquire_scheduler_job` / `release_scheduler_job` |
| `infra/supabase/migrations/024_dashboard_snapshots.sql` | `20261027111919` | APPLIED — 6 columns, RLS enabled, no policies |

Both are additive; no rollback exists or is needed. Migration 024 is **load-bearing**: without
it `read_global_snapshot()` returns `None` and every dashboard mount takes the bounded 8 s live
path with `stale=true`.

---

## 5. Environment keys (names only — values live in the Render dashboard)

| Key | Purpose | Note |
|---|---|---|
| `ENVIRONMENT` | gates environment-dependent branches | **must be `production`**; was `development` until 2026-10-28 |
| `INPROCESS_BATCH_POLLERS` | must be `false` in production | thin web |
| `POLLERS_ENABLED` | gates continuous consumers only | `true` |
| `INTERNAL_TICK_TOKEN` | `X-Internal-Token` shared secret | **secret — dashboard only, never in repo/docs** |
| `TICK_MAX_JOBS` | jobs per tick | production **3**; `render.yaml` + `config.py` still say **2** |
| `TICK_BUDGET_SECONDS` | wall-clock budget per tick | production **180**; `render.yaml` + `config.py` still say **120** |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_ANON_KEY` | Supabase access | service-role required for the snapshot read model |
| `SUPABASE_JWT_SECRET` | token signing/verification | fallback secret is a known prod risk if unset |
| `REDIS_URL` | caches, locks, SSE fan-out | durability depends on this being Upstash, not localhost |
| `DATABASE_URL` | Postgres | |
| `TOMTOM_API_KEY`, `NASA_FIRMS_MAP_KEY`, `AISSTREAM_API_KEY`, `TWITTER_BEARER_TOKEN` | ingestion sources | missing → explicit degraded, never fabricated |
| `OPENCODE_API_KEY`, `OPENCODE_*_MODEL`, `GEMINI_API_KEY`, `NVIDIA_*` | LLM gateway | |
| `NEXT_PUBLIC_API_URL`, `API_PROXY_TARGET` | frontend base + proxy upstream | keep distinct; the proxy prefers `API_PROXY_TARGET` |
| `M8_EVALUATOR_EMAILS`, `M8_EVALUATOR_COMPANIES` | persona-minting allowlist | default `demo_sandbox` |

**Blueprint drift (fix this):** `render.yaml` declares `TICK_MAX_JOBS=2` /
`TICK_BUDGET_SECONDS=120`, and `backend/app/config.py` defaults to the same. Production is
dashboard-overridden to 3/180. A blueprint re-sync silently re-starves news/bmkg/PIHPS.

---

## 6. Production metrics (2026-10-28)

| Metric | Target | Measured | Verdict |
|---|---|---|---|
| Dashboard first data | < 5 s (Fast 4G) | **1.017 s** (unthrottled) | PASS / throttle owed |
| First-mount API requests | ≤ 15 | **8** | PASS |
| First-mount total requests | < 91 | **50** | PASS |
| Bootstrap endpoint | 200 | **200**, **1.9 s** | PASS |
| Snapshot row | 4 sections, < 250 KB | **291 KB, 4 sections** | PASS on shape, target missed by 41 KB |
| Auth durability spec | 3/3 | **3/3** | PASS |
| Proxy cache matrix | 7/7 | **7/7** | PASS |
| Tick | 202 + `run_id` | **202** | PASS |
| Jobs after tick | news + bmkg ok | **news ok, bmkg ok** | PASS |
| PIHPS job | completes | **error after 93 s** | **FAIL** |
| Warm `/health` | < 500 ms | **0.6 s** | **FAIL (marginal, small sample)** |
| Cold first response | < 20 s | not measured | **UNVERIFIED** |
| Warm login | < 3 s | not measured | **UNVERIFIED** |
| Session survival 2 h | authenticated | not run | **UNVERIFIED** |
| 7-day stability | 0 failures | not started | **NOT STARTED** |

Baseline for comparison (phase 160, DISPATCHER): 73.8 s first data, 91 total / 28 API requests.

---

## 7. Open issues

### Blocks milestone closure

1. **Cold start unmeasured.** Render free sleeps after 15 min and boots in 60–80 s
   (documented). This is the only gate that can trigger the free-host migration decision. Stop
   all pingers for 16 min, take the first `/health` with a 120 s timeout, five samples.
2. **2 h session survival unmeasured.** Phase 161 wired refresh + mirroring but the 7-day
   cookie is only meaningful if the Supabase refresh-token TTL is ≥ 7 days (open item).
3. **Warm `/health` at 0.6 s vs a 500 ms target.** Re-sample before concluding; a single
   series is not a p95.

### Functional defects

4. **PIHPS fails at ~93 s.** `TICK_BUDGET_SECONDS` was raised 120 → 180 after the failure;
   the retry was never observed. Daily cadence = slow feedback.
5. **`render.yaml` / `config.py` tick knobs are stale** (2/120 vs the live 3/180).
6. **Dead snapshot seed paths.** `DashboardClient.tsx` still reads
   `sections.corridor_context` and `sections.weather_spatial_polygons`, which the trimmed
   `section_plan()` no longer produces. Harmless (falls back to live), but misleading.
7. **`force_refresh` can queue two ingestion tasks per request** (pre-existing, two scheduling
   blocks in `get_live_news`; the lock dedupes concurrent runs only).
8. **`fetch_existing_articles` re-tier is still read-only** (third site; 164a fixed the two
   that mattered).

### Deferred by decision

9. **164b sync-I/O sweep** — `/incidents`, `/fleet/vehicles`, `/erp/summary`, `/evaluation/*`,
   `/intermodal/toll-tariffs` still do blocking PostgREST inside `async def`; sync Redis
   everywhere (audit F13). Deferred because it touches the M9 routing/weather surface.
10. **Known baseline test failures** (4, pre-existing, documented in `PROGRESS.md` §160):
    `test_impact_assessment.py::test_disruption_impact_assessment_spatial_filtering`,
    `test_news_pipeline.py::test_news_stampede_guard_prevents_duplicate_runs`,
    `test_travel_fuel_guard.py` ×2 (`starlette.status.HTTP_422_UNPROCESSABLE_CONTENT` absent).
11. **`keep-alive.yml` never manually dispatched** on the current commit (carried from 160).
12. **RLS / 51 unauthenticated routes** unclassified; cross-tenant gaps (audit F6) open.

---

## 8. Exact next steps for a new context window

Do these in order. Step 1 is a measurement, not a code change.

```powershell
# --- 1. Cold start (the blocking gate) -------------------------------------
# a. Disable cron-job.org job and the GitHub keep-alive schedule; wait 16 min.
# b. Then, with a 120 s client timeout, five cold samples:
1..5 | ForEach-Object {
  curl.exe -s -o NUL -w "%{http_code} %{time_total}\n" --max-time 120 https://peta-nadi.onrender.com/health
  Start-Sleep -Seconds 960   # re-sleep between samples (only if measuring cold each time)
}
# Verdict: p95 < 20 s -> PASS. > 20 s -> start the free-host migration evaluation
# (Koyeb / Fly / Cloud Run). Do NOT propose a paid tier.

# --- 2. Warm health distribution -------------------------------------------
1..20 | ForEach-Object { curl.exe -s -o NUL -w "%{http_code} %{time_total}\n" https://peta-nadi.onrender.com/health }
# Verdict: p95 < 500 ms. Record p50/p95/max.

# --- 3. Session survival ---------------------------------------------------
# Log in as DISPATCHER, record the time, re-open the dashboard at T+2h without touching it.
# Expect: still authenticated (no ?guest=1, no login modal).
# Note the Supabase refresh-token TTL while you are there (M8-SPEC open item #1).

# --- 4. PIHPS --------------------------------------------------------------
# Force a tick and watch scheduler_jobs for the pihps row:
curl.exe -i -X POST https://peta-nadi.onrender.com/internal/tick -H "X-Internal-Token: $env:INTERNAL_TICK_TOKEN"
# In Supabase: select job_name, last_finished_at, last_error from scheduler_jobs order by job_name;
# Verdict: last_error null and last_finished_at fresh, or the 180 s budget is still too small.

# --- 5. Only after 1-4: start the soak ------------------------------------
# Follow .planning/phases/166-soak-start-review/WALKTHROUGH.md § Exact start checklist.
# Record start time, commit SHA, artifact URL in that file. No deploys for 7 days.
```

Do **not** fix `render.yaml`'s tick knobs and then deploy — that restarts Render and resets
whatever window you just opened. Sequence: measure → start soak → fix after the window (or fix
before, then measure).

---

## 9. Test commands

Backend (from `backend/`):

```powershell
.venv/Scripts/python.exe -m pytest tests/test_dashboard_snapshot.py tests/test_dashboard_bootstrap.py -q   # 27 passed
.venv/Scripts/python.exe -m pytest tests/test_news_read_path.py tests/test_internal_tick.py -q             # 28 passed
.venv/Scripts/python.exe -m pytest tests/test_m8_auth_contract.py -q                                       # 21 passed
.venv/Scripts/python.exe -m pytest tests -q                                                                # full suite: expect the 4 known failures
```

Frontend (from `frontend/`):

```powershell
npx tsc --noEmit
npm run build
npx playwright test e2e/m8-readpath.spec.ts    --config=playwright.m8.config.ts   # needs M8_DISPATCHER_* + M8_REQUIRE_BOOTSTRAP=1 for the hard gate
npx playwright test e2e/m8-auth.spec.ts        --config=playwright.m8.config.ts   # 3/3
npx playwright test e2e/m8-proxy-cache.spec.ts --config=playwright.m8.config.ts   # 7/7
```

The Playwright specs **skip** (never fail) when credentials are absent — a green run with no
credentials proves nothing. `next dev` doubles mount effects under React StrictMode, so measure
against a production build or the deployed site.

---

## 10. What not to repeat

1. **Do not build a snapshot from endpoint handlers.** The first design called
   `get_live_news` (150-article contract + re-tier + may schedule ingestion) every 5 minutes and
   produced a 796 KB row and a 50 s first request. Read models must call the narrowest function
   that produces the display payload.
2. **Do not trust `asyncio.wait_for` around sync I/O.** A blocking `.execute()` never yields,
   so the timeout cannot fire. Move it to `asyncio.to_thread` first.
3. **Do not assume `render.yaml` is production config.** The Render dashboard wins.
4. **Do not mark a marginal miss as a pass.** 0.6 s vs 500 ms is a fail.
5. **Do not start the soak before the cold-start gate is measured** — and never deploy during a
   soak window.
6. **Do not re-add a tenant path to `ANONYMOUS_PUBLIC_CACHE_PATHS`.** It was the M8 root cause.
7. **Do not put tokens in docs, artifacts or commit messages.** Evidence is status code + body
   shape + latency.
8. **Do not treat a green keep-alive artifact as "the snapshot is fine".** The workflow cannot
   see `dashboard_snapshots.computed_at`; that needs a manual query.

---

## 11. Explicitly UNVERIFIED (do not inherit as fact)

| Claim | Why it is unverified |
|---|---|
| Cold start < 20 s | never measured after the phase-162/163 changes |
| Warm login < 3 s | no latency harness in `m8-auth.spec.ts` |
| Session survives 2 h idle | time-boxed check not run |
| PIHPS completes after the 180 s budget | retry never observed |
| Session survives past access-token expiry (1 h) | needs a short-TTL token or a 1 h wait; phase 161 wired the client but not the measurement |
| Supabase refresh-token TTL ≥ 7 days | project setting, not in the repo |
| `REDIS_URL` points at Upstash (durable caches) | runtime env, not in the repo |
| RLS policies on the dashboard-managed tables | runtime DB state |
| Throttled (Fast 4G) first-data figure | 1.017 s was unthrottled |
| Post-trim snapshot build time | size measured (291 KB), build not timed |
| `keep-alive.yml` dispatched successfully on the current commit | never manually dispatched |
| Two-user cache isolation beyond the 7-case matrix | matrix asserts headers, not a real second tenant reading |
