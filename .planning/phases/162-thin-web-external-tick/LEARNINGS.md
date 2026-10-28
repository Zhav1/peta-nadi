# LEARNINGS — Phase 162: Thin web + external tick

**Window:** 2026-10-27 (phase) · 2026-10-28 (docs pass)
**Commit:** `557a467` · **Rule:** arithmetic and code are evidence; anything measured
elsewhere is marked as such; anything unprovable is **UNVERIFIED** with the reason.

---

## 1. The default budget cannot serve the default cadences

| Quantity | Value | Derivation |
|---|---|---|
| Ticks/day | 288 | 24 × 60 / 5 |
| Job slots/day at `TICK_MAX_JOBS=2` | **576** | 288 × 2 |
| Runs/day the registry asks for | **685** | 576 (news 288 + bmkg 288) + 48 tomtom + 24 social + 24 bnpb + 8 firms + 4 open_meteo + 1 pihps |
| Deficit | **109 runs/day** | 685 − 576 |

So at the shipped defaults the system is ~16 % short of its own schedule. The
`age / cadence` ordering (`job_scheduler.py:280-290`) means the shortfall lands on the
**300 s jobs** — `news` and `bmkg` run slower than every 5 minutes — while daily/weekly
jobs still fire. That is the correct starvation to have, but it is still a real
behaviour: **do not claim "news every 5 minutes" in production.**

The "~660–690 demand" framing matches this arithmetic (685). Anything outside that band
should be recomputed from the registry, not quoted.

Raising `TICK_MAX_JOBS` is a CPU decision, not an arithmetic one: each extra job per tick
is more synchronous work inside one 120 s window on a 0.1 CPU instance. Measure
`scheduler_jobs.last_finished_at` lag and Render CPU before changing it.

## 2. `TICK_BUDGET_SECONDS` is shared across the jobs in a tick

`job_scheduler.py:444-460` recomputes `remaining = budget − elapsed` **before each job**
and passes it as that job's timeout:

```python
remaining = budget - (time.monotonic() - started)
if remaining <= 1.0:
    deferred = plan.due[index:]      # rest deferred, still due
    break
...
executed.append(await _execute_job(name, remaining, run_id))
```

Consequences:

1. A slow first job eats the second job's entire allowance. The second job then either
   gets a tiny timeout (`budget_exceeded: job did not finish within Ns`) or is deferred
   by the `<= 1.0` guard.
2. The 120 s budget is a **tick** budget, not a per-job budget. A job that legitimately
   needs 90 s cannot coexist with another job in the same tick.
3. **Reported at the time:** `pihps` received ~**93 s** of the 120 s because the first job
   in that tick consumed the rest. **UNVERIFIED** — I found no log/artifact in the repo
   recording that tick; the mechanism is proven by the code above, the exact 93 s figure
   is not reproducible from a committed artifact. Treat it as an anecdote that matches
   the mechanism, not as a measurement.

If per-job fairness matters later, the fix is a per-job timeout with a tick-level
deadline, not a larger shared budget.

## 3. External scheduler constraints (and what is actually verified)

| Constraint | Status |
|---|---|
| 5 min interval is required to stay under Render free's 15 min idle sleep | **verified** by platform behaviour documented in the runbook; not re-measured here |
| The tick must be `POST` | **verified** — it mutates lease + ingestion state; a `GET` could be cached/prefetched |
| **cron-job.org timeout: the runbook assumes a 30 s default and sets 90 s** | **UNVERIFIED** — the 30 s figure appears only as a parenthetical in `docs/KEEPALIVE_RUNBOOK.md:140`; cron-job.org's actual maximum was never checked from its docs/dashboard, and `M8-SPEC.md` open item #3 is still open. What *is* true: 30 s is too short for a Render cold boot, so 90 s is the right operational choice regardless of what the ceiling is |
| Only one scheduler may own the token | **verified as a rule** (runbook); two schedulers would make the timeline unauditable even though the lease prevents duplicate execution |

## 4. `INPROCESS_BATCH_POLLERS=false` must be explicit — the code default is `true`

`config.py:92` defaults `inprocess_batch_pollers = True` so local dev keeps the old loops.
Production therefore depends on an **environment value**, not on code:

- If `render.yaml` is not synced, or a dashboard variable overrides it, production
  silently starts **8 ingestion loops** again and the whole phase is undone — with no
  error, only a `BOOT:` log line (`main.py:511-526`).
- The same class of drift already happened for a different variable: `/health` reported
  `environment: "development"` on Render although `render.yaml` says
  `ENVIRONMENT: production` (`M9/COMPLETION.md:62,85,153,159`; first observed in phase 58).
  Diagnosis on record: the service is **not synced from the blueprint**, and dashboard
  env overrides the yaml. The code default is `development` (`config.py:10`), so an
  unsynced deploy looks exactly like a local one.
- **Rule:** a yaml value is a request, not a fact. Verify the *running* value from an
  endpoint or a log line (`/health` for `environment`; the `BOOT:` line for pollers)
  before claiming thin-web mode is live.

This also means `INTERNAL_TICK_TOKEN` must be set in the dashboard (it is `sync: false`);
until it is, `/internal/tick` correctly returns `404`, which can look like a routing bug.

## 5. Cold start: the first tick after a sleep can be reported as a timeout

Chain on the free plan: sleep after 15 min idle → first request pays the boot → the cron
client's timeout may expire while the instance is still starting. Two things follow:

1. A failed tick **does not lose work**: jobs are selected from
   `last_finished_at + cadence`, so the missed window is caught up on the next tick
   (runbook §1b). This is the reason the durable last-run is `last_finished_at` and not
   `last_started_at`.
2. A first-tick timeout is **not** an incident. A `502/503` from Render or a client-side
   timeout with `curl_exit: 28` means "still booting"; a `202` that never arrives after
   the instance is warm is the real signal.

The 75 s deferral of AIS/fan-out is part of the same trade: boot, `/health` and the first
login get the CPU first, and no alert is lost because the terminal SSE event always
carries the `alert` field and late subscribers get a replay.

## 6. Quota arithmetic worth remembering

| Item | Value | Status |
|---|---|---|
| GitHub Actions keep-alive runs | **4,320 / month** | **computed**: `*/10 * * * *` = 144 runs/day × 30 = 4,320. The *minutes* quota was not checked in this pass |
| Render free instance hours | **750 h / month** | **UNVERIFIED** — platform quota used in planning; it is not recorded anywhere in the repo and was not checked against Render's terms here. Note 744 h ≈ one always-on service, so a second always-on free service would exhaust it |
| Scheduler job runs demanded | 685 / day | computed from the registry (§1) |
| Job slots supplied | 576 / day | computed from the tick |

The point of the table is not the numbers but the shape: **a 5-minute cron plus a 2-job
cap is a hard capacity ceiling**, and the two probes on different intervals (5 min tick,
10 min GH probe) are two separate quota consumers that must both be reasoned about.

## 7. Gotchas — do not repeat

1. **Do not put `GET` on the tick.** A cache, a prefetch, or an uptime monitor's
   retry-on-GET would each start ingestion. The 404-on-empty-token behaviour is also
   deliberate: an empty setting must not mean "empty header matches".
2. **Do not use `/api/v1/health/sources` as a waker.** It fans out to Supabase/Redis; it
   is a DB probe, not a cheap wake. The waker is `GET /health`.
3. **Do not make the lease shorter than the budget.** `LOCK_TTL_SECONDS = 600` exists
   because 120 s budget + a slow job must fit inside the lease; a 120 s lease would let
   the next tick re-run a live cycle. Conversely, a stuck lease now blocks a job for up
   to 10 minutes — that is the accepted cost.
4. **Do not treat `state_unavailable` as a bug in the tick.** With RLS enabled and no
   policies, only the service-role key can read `scheduler_jobs`. Local dev without a
   service key logs `state_unavailable` and skips; that is by design (`PLAN.md` decision
   6).
5. **Do not rely on `plan_failed` to be a 5xx.** It is a deliberate `202` with
   `accepted: true, due: []` so the cron job does not retry-storm a database outage.
6. **Do not call `Scraper().run()` from the scheduler.** `run()` never returns; the cycle
   seam is `run_once()`. PIHPS/social were exactly this bug.
7. **Do not assume the alias is public.** `/api/v1/internal/tick` is registered with
   `include_in_schema=False`; it has the same guard, so hiding it is cosmetic, not
   security.
8. **Do not start the tick from two schedulers** (e.g. GH Actions *and* cron-job.org).
   The lease prevents duplicate execution, but two timelines make `last_finished_at` lag
   impossible to interpret.

## 8. Open concerns

| # | Concern | Evidence |
|---|---|---|
| 1 | Capacity shortfall (576 < 685) means news/bmkg run below cadence | §1; registry + budget |
| 2 | Shared budget can starve the second job of a tick | §2; `job_scheduler.py:444-460` |
| 3 | Production env may still be `development` / may still run in-process pollers | §4; `M9/COMPLETION.md` |
| 4 | Live RPC + cron path never exercised | no tick artifact |
| 5 | Sync Redis writes inside the cycle bodies remain (audit F13) | phase 164 scope |
| 6 | Eager router imports still cost ~2.7 s at boot (`corridor_router` → `app.adapters`) | importtime, §6 of the walkthrough |

## 9. Not verified (explicit)

| Claim | Reason |
|---|---|
| `pihps` got 93 s in a real tick | no tick log/artifact in the repo |
| cron-job.org's maximum timeout | not checked against the provider; runbook assumes 30 s default |
| Render's 750 h/month free quota | external platform quota, not recorded in the repo |
| GitHub Actions minutes consumed per run | only the run count is computable (4,320/month) |
| Cold boot duration on Render after these changes | import-time is local (2.72 s), not Render |
| Live `POST /internal/tick` → 202 → `scheduler_jobs` rows | hermetic tests only; owner phase 165 |
