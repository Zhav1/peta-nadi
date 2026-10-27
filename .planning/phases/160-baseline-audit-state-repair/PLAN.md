# PLAN — Phase 160: Baseline, Audit, State Repair

**Window:** 2026-10-27 · **Mode:** implementation
**Milestone:** M8 — Fast & Durable (phase 1 of 7)
**Depends on:** none (first M8 phase; no prior phase gates it)

## Goal

Record an honest pre-change baseline and audit the backend read path before any
M8 fix lands, so every later SLO claim has a measured starting point and the
keep-alive probe stops reporting health it never verified.

Deliverables: baseline metrics from the three test accounts, `BACKEND-AUDIT.md`
(81 routes / 23 auth-dependent handlers / cache status / sync I/O /
persistence), a Playwright local + production smoke scaffold with a baseline
report, the `keep-alive.yml` probe fix, and the reconciled planning state
(M8 registration recorded in this pass).

## Scope IN

- **Baseline capture:** cold and warm `/health`, login latency, dashboard
  first-data time, first-mount request count, token `exp`, and
  `app_metadata.role` / `company_id` claims for dispatcher, regulator, guest.
- **`BACKEND-AUDIT.md`:** every route, auth dependency, cache status, blocking
  I/O inside `async def`, persistence gaps, ranked findings.
- **Playwright scaffold:** baseline spec(s) for local + production, artifact
  report written to a known path.
- **`.github/workflows/keep-alive.yml`:** timeout math, `--fail-with-body`,
  `concurrency`, JSON artifact + daily summary.
- **Planning state:** M8 registered (STATE / PROJECT / ROADMAP / REQUIREMENTS /
  config / FEATURE_STATUS) and this plan recorded.

## Scope OUT

- No source-code fixes for the findings (phases 161–164 own the fixes).
- No schema migration; `dashboard_snapshots` lands in phase 163.
- No deploy, no commit, no phase-directory moves or archives.
- No soak start (phase 166) and no paid-infrastructure decision.

## Tasks

1. **Capture baseline production metrics.** Using the three test accounts,
   record cold `/health`, warm `/health` (n≥10), login latency, dashboard
   first-data time (throttled Fast 4G), first-mount request count, decoded
   token `exp`, and the role/`company_id` claims. Write the numbers and the
   exact capture commands into the phase walkthrough; mark unknowns as unknown
   rather than estimated.
2. **Produce `BACKEND-AUDIT.md`.** Enumerate all 81 backend routes with method,
   path, auth dependency, cache header behavior, and handler style; isolate the
   23 auth-dependent handlers; flag sync Supabase/Redis/JWKS calls inside
   `async def`; list persistence touchpoints; close with ranked findings
   (impact × effort) mapped to the owning phase (161–164).
3. **Scaffold the smoke suite.** Add the Playwright local + production baseline
   specs and a baseline report writer (JSON + markdown) so phases 163–165 can
   compare against a fixed artifact instead of memory. Assertions must be
   read-only: no POST, no mutation of operator state.
4. **Fix the keep-alive probe.** Recompute the workflow timeout math against
   `max-time 120` + one retry + job timeout, add `--fail-with-body`, a
   `concurrency` guard, and a JSON artifact plus daily summary. Delayed runs
   must be recorded as delayed, not failed.
5. **Reconcile planning state and record the baseline.** Confirm M8 registration
   is consistent across the six planning files, then store the baseline numbers
   and audit location so phase 165 measures against them.

## Verification

Run from a clean tree; record the exit code of each command.

```bash
# frontend typecheck (run from frontend/; the root tsc shim is not authoritative)
cd frontend && npx tsc --noEmit

# frontend production build
cd frontend && npm run build

# backend test suite
pytest backend/tests

# Playwright baseline suite (local, writes the baseline report artifact)
cd frontend && npx playwright test e2e/m8-baseline.spec.ts
```

Additional gates:

- [ ] `npx tsc --noEmit` → exit 0.
- [ ] `npm run build` → 0 errors, all static routes emitted.
- [ ] `pytest backend/tests` → green (record the pass count).
- [ ] Playwright baseline spec runs green and writes the report artifact.
- [ ] `BACKEND-AUDIT.md` route count equals the actual route count (81) and the
      auth-dependent count equals 23; any divergence is stated, not silently
      rounded.
- [ ] Baseline metrics captured for all three accounts, with `exp` and claims
      recorded verbatim.
- [ ] `keep-alive.yml` timeout math is internally consistent; a manual
      `workflow_dispatch` run produces the JSON artifact.

## Decisions locked

1. Baseline is measured before any fix — no post-hoc reconstruction of
   "before" numbers.
2. Unknowns stay explicitly unknown; no estimated values presented as measured.
3. The audit is descriptive and ranked, not a fix list; fixes belong to
   phases 161–164.
4. The probe must fail visibly (`--fail-with-body`) — a green job that never
   verified the endpoint is worse than a red one.
5. Planning-state reconciliation is part of the phase, not a side task.
