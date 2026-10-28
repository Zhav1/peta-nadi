# LEARNINGS — Phase 166: 7-day soak start + review

**Status: PENDING.** The soak has not run. There are no findings yet — this file records the
questions the window must answer and the failure modes it is designed to catch, so the
follow-up session knows what "done" looks like.

---

## Why this file exists before the run

A 7-day observation window fails in two boring ways, and both are documentation failures:

1. **Nobody knows when it started.** Then a delayed probe on day 6 cannot be attributed to a
   deploy, a platform hiccup, or the backend.
2. **The artifact is unreadable after the fact.** The JSONL is per-run files, 1,008 of them;
   without a stated method for collecting and counting, the verdict becomes anecdote.

Writing the questions down first is what turns a week of logs into evidence.

---

## Questions this soak must answer

### Q1 — Is the read path stable at 8 API requests per authenticated mount?

Phase 165 measured **1.017 s / 8 API / 50 total** once. The soak should show the request count
does not drift (a new poller, a lazy tab that stops being lazy, or a retry storm would show up
as a higher count or a higher `/health` latency under load).

### Q2 — Does the snapshot stay inside the 600 s staleness window for 7 days?

`computed_at` is refreshed by every tick, including ticks with nothing due. The failure mode is
a silent `snapshot_failed` streak: the row keeps its old `computed_at`, the bootstrap endpoint
starts serving `stale=true`, and the client falls back to the bounded live build without any
obvious error. **The soak must check `computed_at`, not just HTTP 200.**

### Q3 — Does the tick survive a full cold-start cycle, repeatedly?

cron-job.org calls every 5 minutes; Render sleeps after 15 idle. The first call after a sleep
lands during boot. Question: how often does that produce a `state_unavailable` / `plan_failed`
skip, and does the next tick recover without duplicate execution?

### Q4 — Does PIHPS complete after `TICK_BUDGET_SECONDS` was raised 120 → 180?

It failed once at **93 s** (phase 165). One daily run every 24 h means the soak gives **7 data
points**, not 7 failures' worth. If it fails again, the budget is still too small or the scrape
itself is broken — those are different fixes.

### Q5 — Is `/health` genuinely < 500 ms warm, or was 0.6 s the real number?

Phase 165 measured **0.6 s** on a small sample and reported it as a fail. Seven days of
10-minute samples give the distribution: p50, p95, max. If p95 is > 500 ms consistently, the
SLO is wrong or the instance is undersized — not "a fluke".

### Q6 — Does anything reset or restart the service during the window?

Render restarts show up as a cold probe. Any deploy or config edit is supposed to reset the
window; the artifact is how you prove it happened (or did not).

### Q7 — Does the `environment` field stay `production`?

It read `development` until 2026-10-28 because the Render dashboard overrode `render.yaml`.
If it flips back, someone re-synced the blueprint — which is also the moment
`TICK_MAX_JOBS`/`TICK_BUDGET_SECONDS` revert to 2/120 and Q4 regresses.

### Q8 — Is 750 free instance-hours actually enough?

An always-on service is ~730 h/month. A single deploy that keeps a second instance warm can
exhaust the remainder and suspend the service mid-window.

---

## Failure modes the window is designed to catch (ranked by likelihood)

| # | Failure | Signature in the artifact |
|---|---|---|
| 1 | Cold-start boot slower than the probe's `max-time` | `curl_exit: 28` on `render_health_cold`, `http_status: null`, `time_total_s ≈ 120` |
| 2 | Render restart mid-window (deploy or platform) | a `render_health_cold` failure followed by a fast `render_health_warm` |
| 3 | Supabase degraded (RLS, quota, cold PostgREST) | `render_sources` fails while `render_health_warm` is fine |
| 4 | Missing Actions secrets | `supabase_rest_inactivity` → `result: skipped` (never red, never useful) |
| 5 | Actions minute exhaustion / schedule throttling | large gaps between consecutive `started_utc`, jobs queued but not run |
| 6 | Snapshot writer stalls | HTTP 200 everywhere, but `computed_at` ages past 600 s — **invisible to the workflows**, only the manual Supabase query finds it |
| 7 | Tick lock leak | `accepted: false, reason: already_running` on every manual check |

Note #6: the keep-alive workflow cannot see the snapshot. That is why the plan requires a
manual daily query. A "0 failures" artifact with a stale snapshot is a misread pass.

---

## How to read a "0 failures" result honestly

- Count `skipped` separately. Skipped Supabase probes mean the DB half of the soak produced no
  evidence.
- Check the gap distribution between runs before believing the p95. 144 runs/day is the target;
  a day with 60 runs has a different meaning than a day with 144.
- A `fail` on `render_health_cold` at the *start* of a run, followed by a clean
  `render_health_warm`, is a cold-start sample — that is data for the cold-start gate, not
  necessarily a stability failure. Classify it explicitly in the verdict.

---

## What the next session must not repeat

1. **Do not start the soak to "get it over with"** while the cold-start gate is unmeasured —
   the cold-start result is one of the things the soak is supposed to inform.
2. **Do not deploy during the window**, including "just a config fix" on Render (it restarts
   the instance and changes the boot profile).
3. **Do not edit this file during the run.** Findings go in `PROGRESS.md` §166 at the end; the
   start record stays as written.
4. **Do not extend the window to reach a pass.** A FAIL verdict followed by a fix and a new
   window is cheaper than a 10-day window nobody trusts.
5. **Do not put the tick token in the artifact, the summary, or this doc.** The workflow is
   designed not to call `/internal/tick`; keep it that way.
