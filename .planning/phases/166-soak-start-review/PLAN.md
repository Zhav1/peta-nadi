# PLAN — Phase 166: 7-day soak start + review

**Window:** planned, not started
**Mode:** observe only (no code changes, no deploys)
**Milestone:** M8 — Fast & Durable (phase 7 of 7)
**Depends on:** phase 165 production deployment (live), migrations 023/024 (applied),
cron-job.org tick (live), `.github/workflows/keep-alive.yml` (scheduled every 10 min)

**Status:** **PLANNED.** The soak window has **NOT** started. Nothing in this file describes a
completed run.

---

## Why this phase exists

Every SLO in M8 except stability has been measured at a point in time. The milestone's
definition of done (M8-SPEC decision #6) requires **7 consecutive days with 0 probe
failures**, and that cannot be produced inside one agent session (M8-SPEC non-goal: "No soak
completion inside one agent session").

This phase therefore only does three things: start the window, record its identity, and write
the review checklist the follow-up session will execute.

---

## Start conditions (all must be true before day 0)

| # | Condition | How to confirm |
|---|---|---|
| 1 | `main` is the code that is actually running on Render and Vercel | Render deploy log shows the merge commit; Vercel production alias matches |
| 2 | No backend or frontend deploy is *planned* for the next 7 days | Explicit human decision; record it in `WALKTHROUGH.md` |
| 3 | Migrations `023_scheduler_jobs`, `024_dashboard_snapshots` applied | Supabase versions `20261027111905`, `20261027111919` |
| 4 | Tick answers `202` | `POST /internal/tick` with `X-Internal-Token` |
| 5 | Snapshot row is fresh (4 sections) | `dashboard_snapshots` row `snapshot_key='global'`, `computed_at` within 10 min |
| 6 | `keep-alive.yml` has run green at least once on the target commit | Actions run history, artifact present |
| 7 | Actions minutes / repo visibility checked | Usage page; a 7-day run is ~1,008 jobs |
| 8 | Cold-start gate measured **or** consciously waived in writing | `phases/165-.../PLAN.md` gate table |

If 1–7 cannot all be met, do not start. A window that begins with an unverified deploy is a
window that will be restarted.

---

## Hard rules during the window

1. **No backend deploys.** Render deploy → new instance → the 750 h budget and the boot
   profile change mid-window. This includes "harmless" config edits that force a restart.
2. **No frontend deploys that change API call behaviour.** A Vercel deploy alone does not
   restart Render, but a client change that alters the poll rate invalidates the request-count
   and `/health` data.
3. **No migration that the tick writes to.** `scheduler_jobs` and `dashboard_snapshots` must
   keep their shape.
4. **No manual `POST /internal/tick` storms.** One-off manual ticks are fine to diagnose; do
   not script extra ticks.
5. **Any restart or deploy resets the window.** Record the new start time and the reason; do
   not splice two windows together.
6. **Do not "fix" a failing probe mid-window** without recording it as a failure first. The
   artifact is the evidence; a fix that erases the failure destroys the verdict.

---

## Measurement

### Primary: GitHub Actions keep-alive artifact

Workflow: `.github/workflows/keep-alive.yml` — `Keep-Alive Pinger (Render & Supabase)`

| Property | Value |
|---|---|
| Schedule | `*/10 * * * *` (every 10 min) |
| Concurrency | `group: keep-alive`, `cancel-in-progress: false` (queue, never drop) |
| Job timeout | 15 min (775 s worst-case curl budget + headroom) |
| Artifact | `keepalive-<run_id>-<attempt>`, file `soak/keepalive-<run_id>.json` (JSON Lines) |
| Retention | 90 days |
| Probes per run | 4 — `render_health_cold`, `render_health_warm`, `render_sources`, `supabase_rest_inactivity` |
| Failure semantics | `--fail-with-body`, `--retry 1 --retry-delay 10`, `max-time` 120/120/90/30 s |

A run that arrives late is a **delayed schedule, not a failure** — the artifact records
`started_utc`/`finished_utc` and the summary renders gaps explicitly.

### Secondary (manual, daily)

| Metric | Command |
|---|---|
| Warm `/health` | `1..5 \| ForEach-Object { curl.exe -s -o NUL -w "%{http_code} %{time_total}\n" https://peta-nadi.onrender.com/health }` |
| Tick accepted | `curl.exe -i -X POST https://peta-nadi.onrender.com/internal/tick -H "X-Internal-Token: $env:INTERNAL_TICK_TOKEN"` |
| Snapshot age / size | Supabase: `select computed_at, pg_column_size(payload) from dashboard_snapshots where snapshot_key='global';` |
| Job last-run | Supabase: `select job_name, last_finished_at, last_error from scheduler_jobs order by job_name;` |
| `/health` body | `environment` must stay `production` |

Never paste the token value into a doc or a commit.

### Metrics the verdict is scored on

| # | Metric | Threshold |
|---|---|---|
| 1 | Probe failures over 7 days | **0** `result: fail` |
| 2 | Delayed schedules | recorded, **not** counted as failures |
| 3 | Warm `/health` p95 | < 500 ms |
| 4 | Cold samples observed | recorded (first probe after an idle gap), target < 20 s |
| 5 | Tick `202` rate | every manual check accepted |
| 6 | `snapshot_failed` / `state_unavailable` events | 0 unexplained |
| 7 | Snapshot age | always < 600 s during business hours |
| 8 | Snapshot size | stable around 291 KB (no creep) |
| 9 | PIHPS job | completes, no 90 s+ error |
| 10 | `/health` `environment` | `production` for the whole window |

---

## Verdict process (follow-up session)

1. **Collect.** Download every `keepalive-*` artifact for the window; concatenate the JSONL.
   Do not sample — read every line.
2. **Count.** `fail` / `ok` / `skipped` per probe. `skipped` never turns the job red and never
   counts as a pass either: if Supabase secrets were missing, the Supabase probe produced no
   evidence.
3. **Attribute each failure** to one of: cold-start boot (curl exit 28 on the first probe),
   backend error (5xx / curl exit 22), platform (runner failure, no artifact), or unknown.
4. **Check the manual series** (daily table above) for what the workflow cannot see: snapshot
   age, job `last_error`, PIHPS completion.
5. **Score:**
   - **PASS** — 0 failures, `/health` p95 < 500 ms, tick green, snapshot fresh, no unexplained
     `snapshot_failed`.
   - **PASS WITH EXCEPTIONS** — 0 failures but a documented platform/delay caveat.
   - **FAIL** — any `fail`, or a metric outside threshold, or the window was reset.
6. **Write the verdict** into `.planning/milestones/M8/PROGRESS.md` §166 and update
   `.planning/STATE.md`. The verdict is a new section, not an edit of the start record.
7. **Close or extend.** A FAIL verdict either triggers a new window after a fix or escalates to
   the free-host migration decision — **not** a paid tier (M8-SPEC decision #2).

---

## 7-day follow-up (what the next session must do)

| When | Action |
|---|---|
| Day 0 | Record start time (UTC), commit SHA, artifact run URL, and the no-deploy commitment |
| Day 1 | First artifact review — confirm probes are landing and the JSONL parses |
| Day 3 | Mid-window check — Actions minutes burn, delayed-run rate, snapshot age |
| Day 7 | Full review, verdict, and the M8 closure decision |
| Day 7+ | If PASS: close M8. If FAIL: open a fix phase, do not extend silently |

The follow-up session must not need this session's context: everything it needs is the start
record (§ Start record in `WALKTHROUGH.md`), the artifact URL, and the metric table above.

---

## Out of scope

- Any 164b sync-I/O work.
- Any redesign, any new feature.
- Extending the soak beyond 7 days to "get a pass".
- Paid infrastructure.
