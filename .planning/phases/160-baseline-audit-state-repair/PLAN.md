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

---

## Final status (2026-10-28)

**Status: DONE** — baseline recorded, audit published, probe rewritten, planning
state reconciled. Three gates did not close as written (full suite not green, probe
never dispatched, audit's 23-route count corrected to 24); they are listed as open
below rather than ticked. Cold-start measurement was out of scope by design (needs a
≥15 min idle window).

### Commits

| Commit | Contents | Contained by |
|---|---|---|
| `51b3903` | 13 files, +2297/−275: `keep-alive.yml` rewrite, `GET /api/v1/weather/summary` + world-truth counters, `tests/test_weather_summary_contract.py`, `e2e/hazard-counter-truth.spec.ts`, `e2e/m8-baseline.spec.ts`, `playwright.m8.config.ts`, `SPEC.md` | `m8-operational-truth`, `main` |
| `61c0ae5` | 3 docs, +551: `M8/PROGRESS.md` §160, `BACKEND-AUDIT.md`, `KEEPALIVE-FIX.md` | `m8-operational-truth`, `main` |

**Branch reality check** (`git branch --contains`, verified 2026-10-28):
`m8-fast-durable` — the branch named in the `BACKEND-AUDIT.md` header — is still at
`2eeb1ca` and contains **neither** commit. `m8-operational-truth` has `51b3903` +
`61c0ae5` and stops there (phase 161+ never landed on it).

**Artifact tracking changed after the phase.** `BASELINE.md` and all nine baseline runs
(18 `artifacts/m8-baseline-*` json+md files) are **tracked**: they were added by the
later bulk docs commit `8a4c7c2`, not by `61c0ae5`. `PROGRESS.md`'s "untracked by
design" note no longer describes the repository.

### Gate results

| PLAN gate | Result | Evidence / caveat |
|---|---|---|
| `npx tsc --noEmit` → exit 0 | **PASS** | re-verified in the phase; re-run in 161, 163b and 164a as well |
| `npm run build` → 0 errors, all static routes | **reported, not reproduced** | no build artifact kept; not re-run here |
| `pytest backend/tests` → green | **FAIL (recorded)** | baseline run **380 passed / 4 failed / 14 warnings / 436.77 s**. The 4 failures are pre-existing and named in `PROGRESS.md` §160 — the honest baseline, not regressions |
| Playwright baseline green + artifact | **PASS** | canonical run `m8-baseline-2026-10-27T08-48-56-659Z` = 3/3 accounts unthrottled; Fast 4G `…08-45-38` = 3/3 |
| Audit 81 routes / 23 auth-dependent, divergence stated | **PASS with correction** | 81 decorators confirmed; auth-dependent is **24**, unauth **49**. §1.1 states the 23/51 split is defensible only if `/auth/session` is deliberately classed "guest-intentional" |
| Baseline metrics for all three accounts | **PASS, partial** | all three captured with `exp` + claims; cold first response and refresh-token TTL explicitly unknown |
| `keep-alive.yml` math consistent + manual dispatch artifact | **HALF** | math is internally consistent (775 s worst case under a 900 s ceiling) and both shell steps were run against fake backends; the workflow was **never dispatched** |

### Route-count reconciliation

`BACKEND-AUDIT.md` pins its counts to base `2eeb1ca`; the tree has moved twice since.

| Ref | Routers | Decorators | Handlers (router + root) | Auth-dependent | Unauth (router) |
|---|---|---|---|---|---|
| `2eeb1ca` (audited) | 19 | 81 | 74 | 24 (4 + 20) | 49 |
| phase-160 working tree (§1.1a) | 19 | 82 | 75 | 25 (4 + 21) | 49 |
| current tree, 2026-10-28 | 21 | 87 | 77 | 27 (4 + 22 + `bootstrap_user`) | 49 |

Unauthenticated **router** handlers did not change (49); with the unauthenticated root
`GET /` the total is 50 in every row. Only the auth-dependent side grew.

Measured deltas: `internal_tick.py` +2 decorators, `dashboard_bootstrap.py` +2,
`routing_router.py` +1 (`/weather/summary`, this phase), `news_router.py` +1
(`/api/v1/news/yield`, M9 commit `83a12fe`). The wrapper is `bootstrap_user`
(`dashboard_bootstrap.py:67`), which calls `get_optional_user` directly, so a naive
`Depends(get_optional_user)` grep undercounts by one. `/news/yield` is guarded by
`X-Internal-Token`, not a `Depends(...)`, so the audit's dependency-based
classification no longer covers every route.

**No re-pin of `BACKEND-AUDIT.md` was performed in this pass.** Later phases must
quote the count they measure, not the count in the audit title.

### Re-verified in this pass (2026-10-28)

| Command | Result |
|---|---|
| `backend\.venv\Scripts\python.exe -m pytest tests\test_weather_summary_contract.py -q` | **7 passed**, 3 warnings, 1.53 s |
| `backend\.venv\Scripts\python.exe -X importtime -c "import app.main"` | exit 0; `app.main` cumulative **2.72 s**; **zero** `numpy` / `scipy` / `langgraph` / `pandas` / `sklearn` entries |
| Route/auth count | AST walk over 21 `backend/app/routers/*.py` modules (decorator + `Depends` count) |

### Not done here (owned elsewhere)

Cold-window measurement, refresh-token TTL, `workflow_dispatch` of the probe,
throttled login, RLS verification, and re-pinning the audit — see `LEARNINGS.md` §5
and the owner table in `PROGRESS.md`.
