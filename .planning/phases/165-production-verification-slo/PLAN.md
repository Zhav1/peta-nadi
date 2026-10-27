# PLAN — Phase 165: Production verification + SLO gate

**Window:** 2026-10-27 · **Mode:** deploy + verification
**Milestone:** M8 — Fast & Durable (phase 6 of 7)
**Depends on:** phases 160–164a (all committed), migrations 023/024 applied (done), M9 geocode/gazetteer work committed by the concurrent session.
**Status:** BLOCKED on the M9 commit + Render/cron environment values.

## Goal

Deploy the integration branch to the existing zero-cost Render + Vercel stack, prove the M8 SLOs on the real deployment, and either pass the gate or trigger the free-host migration fallback. Do **not** change application code in this phase except for a verified deploy fix.

## Preconditions

| # | Check | Command / evidence |
|---|---|---|
| 1 | M9 geocode/gazetteer work committed; working tree clean except run artifacts | `git status --porcelain` |
| 2 | Migrations `023_scheduler_jobs`, `024_dashboard_snapshots` applied | Supabase versions `20261027111905`, `20261027111919` |
| 3 | `INTERNAL_TICK_TOKEN` generated and stored in Render + cron-job.org | Render dashboard / password manager |
| 4 | Render env set | `INPROCESS_BATCH_POLLERS=false`, `POLLERS_ENABLED=true`, `TICK_MAX_JOBS=2`, `TICK_BUDGET_SECONDS=120`, `INTERNAL_TICK_TOKEN=<secret>` |
| 5 | cron-job.org updated | `POST https://peta-nadi.onrender.com/internal/tick`, every 5 min, header `X-Internal-Token`, timeout 90s, retries on |
| 6 | Local gates green on the exact commit to merge | `pytest` targeted suites, `npx tsc --noEmit`, `npm run build` |

## Deploy

```bash
git checkout m9-operational-truth
git status --porcelain          # must be clean (or only .planning artifacts)
git log --oneline -10           # confirm the M8 commits are present

git checkout main
git merge --no-ff m9-operational-truth -m "merge: M8 Fast & Durable + M9 integration"
git push origin main
```

- Render auto-deploys `main` (Docker, `backend/Dockerfile`). Watch the deploy log for `Application startup complete`.
- Vercel auto-deploys `main`. Wait for the production alias.
- Do not edit code during the deploy. If the deploy fails, fix forward on a branch, not on `main`.

## Verification

Run from `frontend/` unless noted. Use the DISPATCHER test account via `M8_*` env vars. Never print tokens.

### 1. Liveness and warm latency

```powershell
1..5 | ForEach-Object { curl.exe -s -o NUL -w "%{http_code} %{time_total}\n" https://peta-nadi.onrender.com/health }
```

- Every response `200`; warm p95 `< 500ms`.

### 2. Cold start

- Stop all pingers for 16 minutes (Render free sleeps after 15).
- Measure the first `/health` with a 120s client timeout.
- Target: cold first response p95 `< 20s` (phase-160 documented baseline: 60–80s).
- If >20s after the fixes, start the free-host migration evaluation (Koyeb / Fly / Cloud Run); do not propose a paid tier.

### 3. Login + session

```powershell
$env:M8_BASE_URL='https://pre-hub.vercel.app'
$env:M8_DISPATCHER_EMAIL='...'; $env:M8_DISPATCHER_PASSWORD='...'
npx playwright test e2e/m8-auth.spec.ts --config=playwright.m8.config.ts
```

- 3/3 pass: 7-day `Secure` cookie, stale-token recovery, cross-tab logout.
- Measure login submit → authenticated shell; target p95 `< 3s` warm.
- Session survival: a scheduled check at T+2h (same account) must still be authenticated, not `?guest=1`.

### 4. Read path

```powershell
$env:M8_REQUIRE_BOOTSTRAP='1'
npx playwright test e2e/m8-readpath.spec.ts --config=playwright.m8.config.ts
```

- Bootstrap answers `200` (hard gate now).
- First data `< 5s` on Fast 4G (use `M8_THROTTLE=fast4g` if the spec supports it; otherwise CDP throttle).
- API requests `<= 15`; total `< 91`.
- Analitik / Laporan / Evaluasi do not fetch before their tab is opened.

### 5. Proxy cache isolation

```powershell
npx playwright test e2e/m8-proxy-cache.spec.ts --config=playwright.m8.config.ts
```

- 7/7: authenticated GET `private, no-store`, allowlisted anon GET may cache, tenant anon GET private, SSE no-store, dev target rejected.

### 6. Tick + snapshot

```powershell
curl.exe -i -X POST https://peta-nadi.onrender.com/internal/tick -H "X-Internal-Token: <secret>"
```

- `202` with `accepted: true` and a `run_id`.
- A second immediate call returns `accepted: false` / `already_running`.
- After the tick: `scheduler_jobs` has rows; `dashboard_snapshots` has `snapshot_key='global'` with a recent `computed_at`.
- `/health` remains fast during the tick (does not wait on jobs).

### 7. Keep-alive

- Manually dispatch `.github/workflows/keep-alive.yml`; verify the JSON artifact + step summary and no false timeout.
- Leave the 10-minute schedule as the secondary prober.

## SLO gate

| Metric | Baseline | Target | Evidence |
|---|---|---|---|
| Cold first response p95 | 60–80s documented | **< 20s** | cold-window curl |
| Warm `/health` p95 | 297ms median | **< 500ms** | 5-sample curl |
| Warm login p95 | 7.8s median / 70.6s max | **< 3s** | Playwright |
| Dashboard first data | 12.1s median / 94s max | **< 5s** Fast 4G | Playwright trace |
| First-mount API calls | 28 | **≤ 15** | Playwright recorder |
| Session survival | ~1h token expiry | **2h idle + refresh**, 7-day sliding | scheduled Playwright |
| 7-day stability | currently failing | **0 probe failures** | GH artifact |

If any target fails: diagnose, fix on a branch, redeploy, and re-run the gate. Do not mark the phase done on a partial pass.

## Rollback

- Revert the merge commit on `main` and push; Render/Vercel redeploy the previous build.
- Migrations 023/024 are additive; no schema rollback is required. Leave the tables in place.
- If the tick misbehaves, set `INPROCESS_BATCH_POLLERS=true` temporarily to restore the old in-process loops.

## Soak handoff (phase 166)

- Start the 7-day window only after the final deploy. Record the start time, commit SHA, and GH artifact URL in `.planning/milestones/M8/PROGRESS.md`.
- No backend deploys during the window. Any deploy resets the window.
- The verdict is a follow-up review: 0 probe failures over 7 days, warm `/health` p95, cold samples, and any tick `state_unavailable` events.

## Out of scope

- 164b sync-I/O sweep (blocked by M9 routing/weather ownership).
- HttpOnly `@supabase/ssr` migration.
- Full RLS/security pass.
- Landing-page media optimization.
- Paid infrastructure.
