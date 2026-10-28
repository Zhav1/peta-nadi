# LEARNINGS — Phase 165: Production verification + SLO gate

**Window:** 2026-10-28 · Grounded facts only. Anything not measured is marked UNVERIFIED.

---

## 1. Render dashboard env overrides `render.yaml` — and `render.yaml` does not re-apply itself

`render.yaml` has declared `ENVIRONMENT: production` since phase 162. Production still
reported `environment: "development"` in the M9 R1 deploy (2026-10-28, `M9/R1-DEPLOY.md`
observation #3), because the Render service was created before the blueprint line existed and
the dashboard value wins. It was corrected manually in the dashboard; `/health` now reports
`production`.

This is not cosmetic: `ENVIRONMENT` gates the evaluator/eval-sandbox policy range and the
`Secure`-cookie expectation. A production service reporting `development` makes every
environment-dependent branch a guess.

**Consequence that is still live:** the same drift now exists for the tick knobs. The
dashboard has `TICK_MAX_JOBS=3` / `TICK_BUDGET_SECONDS=180`, while `render.yaml` still
declares **`2` / `120`**, and `backend/app/config.py` still defaults to **`2` / `120`**. Any
blueprint re-sync, or a service recreated from `render.yaml`, silently re-starves
news/bmkg/PIHPS. Fix the yaml (and the defaults) or the drift will be rediscovered the hard way.

**Lesson:** in a blueprint-managed service, the dashboard is the real config and the repo
file is a suggestion. After every manual env fix, either update `render.yaml` in the same
session or write down that the dashboard is authoritative.

## 2. A 30 s cron cap cannot wake a 60–80 s cold start

cron-job.org is configured with a 90 s timeout, but the *tick* endpoint's own contract is
"return `202` immediately, work in the background". The mismatch shows up at the platform
level: Render free sleeps after 15 minutes idle and takes 60–80 s (documented baseline) to
boot, while a cron invocation that lands during the boot window can time out before the
instance answers. The first tick after a sleep may therefore **never arrive**, and ingestion
waits for the next 5-minute slot.

That is why the design keeps two wakers: cron-job.org every 5 min on `GET /health` (cheap,
no DB) plus the GitHub Actions keep-alive as the secondary prober. The tick is a *third*
call that must be allowed to fail once without breaking the cycle.

**Lesson:** on a free host, "every 5 minutes" is really "every 5 minutes *after* the instance
is awake". Do not put a stateful operation on the first call of a wake window.

## 3. `TICK_MAX_JOBS=2` starved the 5-minute jobs

With eight job cadences and a 2-job cap, the fair queue kept daily jobs from starving — but
the reverse happened: `news` and `bmkg` (both 300 s) need a slot roughly every tick, and two
slots was not enough once a PIHPS or FIRMS job occupied one. Raised to **3**.

Arithmetic worth keeping: 3 jobs × 12 ticks/hour = 36 slots/hour vs eight jobs whose cadences
sum to ~1.6 runs/hour, so 3 is headroom, not a load increase — the budget, not the count,
bounds wall time.

## 4. `TICK_BUDGET_SECONDS=120` starved PIHPS

PIHPS failed at **93 s**. A 120 s budget with a 5-minute cron looks generous, but the budget
is wall-clock across *all* jobs in the tick: any earlier job eating 30–60 s leaves less than a
daily scrape needs, and the job is deferred — repeatedly, because a failed job stays due and
retries after 120 s.

Raised to **180 s**. **UNVERIFIED** whether that is sufficient: the retry after the change was
not observed. A single 93 s failure is not enough data to size the budget; the next daily
PIHPS run is the measurement.

**Lesson:** a per-tick budget is shared, so a single slow job's cost is paid by every other
eligible job. Size it against the slowest job, not the average.

## 5. Render's free tier is 750 instance-hours/month, not unlimited

One always-on free web service uses ~730 hours in a 31-day month. That leaves ~20 hours of
headroom for redeploys and restarts, and **zero** headroom for a second free service on the
same account. Any "free-host migration" (Koyeb / Fly / Cloud Run) must be evaluated as a
*move*, not as an addition — and it must be evaluated on the cold-start number, not on vibes.

## 6. GitHub Actions minutes are the soak's real cost

The 10-minute keep-alive schedule is 144 runs/day → **~1,008 runs** over 7 days, each a
short-lived job. On a private repo that consumes minutes fast; on a public repo it is free.
Before starting the soak, confirm the repo visibility and check the Actions usage page —
otherwise the soak can be rate-limited out on day 3 and produce a partial artifact that looks
like a backend failure.

## 7. Do not put secrets in the docs, including in "evidence" tables

The tick token and the Supabase service-role key are the two things that turn a doc leak into
a production incident. Every command in `WALKTHROUGH.md` and this file uses
`$env:INTERNAL_TICK_TOKEN` / `<secret>` placeholders. The migration versions, commit SHAs and
hostnames are fine; the header **value** never is.

**Rule:** evidence for an authenticated endpoint is the status code, the body shape and the
latency — never the credential that produced it.

## 8. What would bite again

1. **Reporting a marginal miss as a pass.** `/health` at 0.6 s against a 500 ms target is a
   fail. Rounding it up hides a real regression when a future change makes it 0.9 s.
2. **Measuring the read path without throttling** and calling it the Fast-4G SLO. The spec
   target is explicitly throttled.
3. **Starting the soak before the cold-start gate is measured.** A deploy during the window
   resets it; a migration decision during the window invalidates it.
4. **Trusting `/health` alone as "the service is fine".** It is a constant dict — it says the
   process can accept a request, nothing about Supabase, Redis or the tick.
