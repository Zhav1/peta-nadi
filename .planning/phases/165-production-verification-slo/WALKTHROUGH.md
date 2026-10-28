# WALKTHROUGH — Phase 165: Production verification + SLO gate

**Milestone:** M8 — Fast & Durable (phase 6 of 7)
**Window:** 2026-10-28
**Status:** **IMPLEMENTATION-GREEN — gate partially closed.** Read path, auth and proxy pass
in production. Cold start, warm login, 2 h session survival, PIHPS tick and the soak are
open.
**Plan:** `PLAN.md` · **Learnings:** `LEARNINGS.md`

---

## What was verified

Deploy was already live (M8 was delivered on `m9-operational-truth`, merged to `main` with
M9, `bfa3337`). This phase ran the gate against the real deployment:

`https://pre-hub.vercel.app` → proxy → `https://peta-nadi.onrender.com`.

| # | Step | Command / method | Result |
|---|---|---|---|
| 1 | Migrations | Supabase migration history | `023_scheduler_jobs` = `20261027111905`, `024_dashboard_snapshots` = `20261027111919` — both **applied** |
| 2 | Render env | Render dashboard / `/health` body | `ENVIRONMENT=production` **now correct** (it read `development` in the M9 R1 deploy), `INPROCESS_BATCH_POLLERS=false`, `INTERNAL_TICK_TOKEN` set, `TICK_MAX_JOBS=3`, `TICK_BUDGET_SECONDS=180` |
| 3 | Tick | `POST /internal/tick` with `X-Internal-Token` | **202** accepted, `run_id` returned |
| 4 | Jobs | `scheduler_jobs` after the tick | `news` **ok**, `bmkg` **ok**, `pihps` **error after 93 s** |
| 5 | Snapshot | `dashboard_snapshots` row `snapshot_key='global'` | **291 KB**, **4 sections**, recent `computed_at` |
| 6 | Bootstrap | Playwright read-path spec with `M8_REQUIRE_BOOTSTRAP=1` | **200**, response **1.9 s** |
| 7 | Read path | same spec | first data **1.017 s**, **8** API requests, **50** total (baseline 28 / 91) |
| 8 | Auth | `e2e/m8-auth.spec.ts` | **3/3 passed** |
| 9 | Proxy cache | `e2e/m8-proxy-cache.spec.ts` | **7/7 passed** |
| 10 | Liveness | 5× `curl /health` | 200, **0.6 s** |

---

## Gate table

| Metric | Baseline | Target | Measured | Verdict |
|---|---|---|---|---|
| Warm `/health` p95 | 297 ms median | < 500 ms | **0.6 s** | **FAIL (marginal)** |
| Cold first response p95 | 60–80 s documented | < 20 s | not measured | **UNVERIFIED** |
| Warm login p95 | 7.8 s median | < 3 s | not measured separately | **UNVERIFIED** |
| Dashboard first data | 12.1 s median / 94 s max | < 5 s Fast 4G | **1.017 s** (unthrottled) | PASS (throttle owed) |
| First-mount API calls | 28 | ≤ 15 | **8** | PASS |
| Session survival | ~1 h token expiry | 2 h idle + refresh | not run | **UNVERIFIED** |
| 7-day stability | failing | 0 probe failures | not started | **NOT STARTED** |

The warm-`/health` miss is 100 ms over a 500 ms target on a single sample series against a
free 0.1-CPU instance. It is reported as a fail rather than rounded into a pass.

---

## What the numbers mean

**1.017 s first data with 8 API calls.** The first mount now makes exactly the reads phase
163 designed for: `auth/me`, `dashboard/bootstrap`, `weather/summary`, `news/hitl-pending`,
`fleet/vehicles` (+ retries/polling inside the measurement window). Analitik, Laporan and
Evaluasi contribute **zero** requests until clicked, which the spec asserts before and after
each tab click.

**1.9 s bootstrap** is the auth dependency plus the row read, not payload parsing. The row is
291 KB and still dominated by news (249 KB) — the trim cut the 785 KB news section down but
did not make news small.

**291 KB vs the < 250 KB target.** Missed by 41 KB. Recorded as PARTIAL in phase 163's final
evidence; not a gate failure for phase 165 because the SLO is latency and request count, not
payload size.

**PIHPS 93 s error.** The daily PIHPS scrape exceeded its window and failed. `TICK_MAX_JOBS`
had been starving news/bmkg at 2, so it was raised to 3; `TICK_BUDGET_SECONDS` had been
starving PIHPS at 120 s, so it was raised to 180 s. Whether that is enough is **unverified** —
the retry after the budget change was not observed.

---

## What could not be verified, and why

| Item | Why |
|---|---|
| **Cold start < 20 s** | Requires stopping every pinger for 16 min (Render free sleeps after 15) and taking the first `/health` with a 120 s timeout. Not done in this window. This is the only gate that can trigger the free-host migration decision, so it must be measured before M8 closes. |
| **Warm login p95 < 3 s** | The auth spec asserts behaviour (7-day cookie, stale-token recovery, cross-tab logout), not latency. No timing harness exists in `m8-auth.spec.ts`. |
| **2 h session survival** | Time-boxed: needs a scheduled re-check at T+2h on the same account. Not run. |
| **PIHPS retry** | The budget was raised after the failure; the next daily run was not watched. |
| **Keep-alive `workflow_dispatch`** | `keep-alive.yml` is rewritten and lint-validated but was still not manually dispatched in this window (carried from phase 160). |
| **Throttled read path** | The read-path spec has no Fast-4G throttling; 1.017 s is an unthrottled production number. |

---

## Deploy / rollback state

- No code changes were made in this phase. Deploy fix scope was respected.
- Render auto-deploys `main`; migration 024 is additive, so no schema rollback exists or is
  needed.
- Restore path if the tick misbehaves: set `INPROCESS_BATCH_POLLERS=true` (old in-process
  pollers) while leaving the endpoint enabled.

---

## Handoff to phase 166

Do **not** start the soak until either (a) the cold-start gate has been measured and passed,
or (b) the milestone is explicitly closed as "code-complete, cold start unverified". A soak
that starts and is then interrupted by a deploy is worth nothing — see
`.planning/phases/166-soak-start-review/WALKTHROUGH.md` for the start checklist.
