# M8 — Fast & Durable

**Status:** READY
**Created:** 2026-10-27
**Scope:** Performance + reliability. No visual redesign.
**Budget:** $0. No paid tier. Free-host migration is a fallback gate only.

## Goal

Make the authenticated PreHub dashboard fast on first load and durable across sessions on the zero-cost Render/Vercel stack by:

1. Fixing Supabase session refresh and cookie policy.
2. Thinning the web process and moving batch ingestion to an idempotent external tick.
3. Serving a DB-backed dashboard bootstrap snapshot with lazy-mounted sections.
4. Hardening the proxy cache boundary.
5. Proving it with Playwright and a 7-day soak.

## Root causes (evidence)

1. **Boot starvation.** Nine pollers start immediately in one uvicorn worker on 0.1 CPU (`backend/app/main.py:335-346`). Each does synchronous Supabase writes, sync Redis with a 5s timeout, and sync JWKS/profile lookups inside `async def`. `/health` is a constant dict (`backend/app/routers/health.py:173-182`); it times out because the process cannot serve, not because the handler is slow.
2. **Token refresh is not wired.** Supabase refreshes its own session, but nothing copies the new access token into `prehub_auth_token`. The 48h cookie holds a ~1h token, so middleware redirects and `get_optional_user` silently downgrades to guest.
3. **Read-path fan-out.** ~25–30 requests on first dashboard mount, including hidden sections; weather is fused live from BMKG + Open-Meteo with no cache; no request timeouts; overlapping polls. The LLM is not re-run on refresh (DB-first dedupe), but read-path re-tiering, evaluation, routes, and cold caches are recomputed.
4. **False monitoring.** The GitHub keep-alive job can take 600s of curl time under a 5-minute job timeout, and `curl` lacks `-f`. The proxy marks authenticated GETs `public, s-maxage=60`.

### P0 prerequisite discovered in phase 160

The phase-160 audit (`phases/160-baseline-audit-state-repair/BACKEND-AUDIT.md` §6)
found two P0 defects that sit **inside** the auth work and must be fixed before any
session-durability claim is meaningful:

1. **Optional auth fails open (F1).** All 20 `get_optional_user` routes downgraded a
   supplied-but-invalid token to GUEST with HTTP 200, so an expired dispatcher token
   looked like a read-only visitor and the client never learned it had to re-auth.
2. **Anonymous persona minting (F2).** `POST /api/v1/auth/guest-session` issued a
   signed DISPATCHER/REGULATOR token for any role and tenant to an unauthenticated
   caller, which made the 24-route auth boundary bypassable outright.

Phase 161 therefore lands the fail-closed contract (`no header → guest`,
`supplied invalid token → 401`) and restricts persona minting/switching to
authenticated evaluators inside `demo_sandbox` (env-extendable via
`M8_EVALUATOR_EMAILS` / `M8_EVALUATOR_COMPANIES`) **in the same phase** as the
client refresh work. Scope is unchanged otherwise; the fixes are prerequisites, not
new milestone scope.

## Non-goals

- No visual redesign; landing page and its 121-frame sequence are untouched.
- No `@supabase/ssr` HttpOnly migration or backend-owned session table.
- No paid infrastructure.
- No full async rewrite of all 81 backend routes.
- No new product features; no route-result persistence in this milestone.
- No soak completion inside one agent session.

## Decisions locked

| # | Decision | Choice |
|---|---|---|
| 1 | Milestone scope | Performance + reliability, no redesign |
| 2 | Budget | $0; free-host migration only if the cold-start gate fails |
| 3 | Auth | Surgical refresh + hardening; defer HttpOnly migration |
| 4 | Job topology | Thin web + protected external tick |
| 5 | Read path | Bootstrap snapshot + lazy-mounted sections |
| 6 | Definition of done | Hard SLOs + 7-day soak |
| 7 | Verification | Hybrid: local suite + production smoke |
| 8 | Test data | Dedicated tenant with dispatcher/regulator/guest accounts |
| 9 | Landing page | Out of scope |
| 10 | Proxy caching | Fix now: authenticated GETs `private/no-store`, anonymous allowlist |
| 11 | Snapshot storage | DB-backed read model in Supabase |
| 12 | Session lifetime | 7 days sliding, renewed on refresh, cleared on logout |
| 13 | Soak observability | GitHub Actions probe + JSON artifact + daily summary |
| 14 | Continuous tasks | AIS WebSocket + alert fanout in-process, deferred start |
| 15 | Deploy autonomy | Branch → local verify → merge main → production smoke |
| 16 | Milestone closure | Code-complete + soak started; verdict in follow-up |

## Architecture and interfaces

### External tick
- `GET /internal/tick`, protected by `X-Internal-Token` (constant-time compare).
- Returns `202 { accepted, due, run_id }` immediately; never waits for jobs.
- Postgres advisory lock or `job_runs` table (`locked_until`) ensures one tick at a time.
- Jobs run based on `last_run_at` + cadence, with a per-tick CPU budget; remaining jobs are deferred.
- Missed ticks catch up on the next run; no duplicate execution of an already-completed cycle.
- Trigger: cron-job.org every 5 minutes, timeout 90s, retries on. GitHub Actions is the secondary prober.

### Dashboard bootstrap
- `GET /api/v1/dashboard/bootstrap?modality=truck|vessel|air`.
- Auth-aware: guest gets public data; dispatcher gets tenant-scoped fleet by `company_id`.
- Reads `dashboard_snapshots` in Supabase; returns `computed_at`, `stale`, per-section freshness.
- Missing snapshot → bounded live compute (10s cap) + async snapshot write.
- Response is `private, no-store`.

### Auth session
- Boot: `supabase.auth.getSession()`, not a blind localStorage read.
- `onAuthStateChange` syncs every `TOKEN_REFRESHED` / `SIGNED_IN` into localStorage and the cookie.
- Magic-link redirect handled via `detectSessionInUrl` + `SIGNED_IN`.
- Cookie: `prehub_auth_token`, `Max-Age=604800`, `Path=/`, `SameSite=Lax`, `Secure` in production; renewed on refresh; cleared on logout.
- Middleware rejects tokens without `exp`; backend remains authoritative.
- Backend: no token → guest; supplied but invalid token → 401.
- Optimistic hydration from JWT claims; `/auth/me` reconciles in the background and never blocks first paint.
- Cross-tab login/logout sync via `storage` event or `BroadcastChannel`.
- Logout during in-flight login cancelled by an auth-generation counter.

### Client transport
- `fetchWithTimeout`: 15s default, 30s for bootstrap; one retry with backoff; no proxy fallback on timeout.
- Remove `Content-Type: application/json` on GET to eliminate CORS preflights.
- Abort on unmount; no overlapping polls; poll only visible sections.
- Static server-rendered shell/skeleton on `/dashboard` while the client chunk loads.

### Proxy boundary
- Authenticated GET → `Cache-Control: private, no-store`.
- Explicit anonymous allowlist may use `public, s-maxage=60, stale-while-revalidate=120`.
- Preserve `Idempotency-Key`; never cache SSE; keep direct-to-Render as the primary path.

### Boot and continuous consumers
- Lazy-import numpy/scipy/langgraph/adapters; no `init_db()` at import in production; pre-warm JWKS after startup.
- No batch pollers at boot.
- AIS WebSocket and Redis alert fanout start 60–90s after boot, supervised with backoff.

## Edge cases

- Cold start during login → optimistic shell + explicit waking state + retry.
- Token expires mid-session → refresh; if refresh fails, clear token and show login modal, not guest.
- Invalid supplied token → 401; guest only when no token was sent.
- Snapshot missing/corrupt → bounded live fallback + stale badge.
- Tick overlap → second tick returns `202 skipped`.
- Redis down → DB snapshot still serves; log degraded.
- Role/claim mismatch → verify with real tokens; fix mapping in phase 161 if needed.
- Any deploy during the soak resets the soak window; record the new start time.

## Verification hooks

### Baseline
Cold/warm `/health`, login latency, dashboard first-data time, request count, token `exp`, role/company claims from the three test accounts.

### Local gates
`npx tsc --noEmit` · `npm run build` · `pytest backend/tests` · Playwright local suite.

### Production gates
Playwright smoke on `pre-hub.vercel.app` + `peta-nadi.onrender.com`; two-user cache-isolation assertion; session survival; request-count reduction.

### SLOs

| Metric | Baseline | Target | Measurement |
|---|---|---|---|
| Cold first response p95 | 60–80s documented | < 20s | Cold-window Playwright/curl |
| Warm `/health` p95 | unknown | < 500ms | GH probe artifact |
| Warm login p95 | unknown | < 3s | Playwright |
| Dashboard first data | ~25–30 requests | < 5s Fast 4G | Playwright trace + throttle |
| Session survival | ~1h (token expiry) | 2h idle + refresh, 7-day sliding | Playwright + short-TTL test |
| 7-day stability | currently failing | 0 probe failures | Soak artifact |

If the cold-start gate fails after phase 165, trigger the free-host migration decision — not a paid upgrade.

### Soak
GitHub Actions every 10 minutes; `--fail-with-body`, `max-time 120`, one retry, 15-minute job timeout, `concurrency` guard. JSON artifact + daily summary for 90 days. Delayed runs recorded as delayed, not failed.

## Milestone phases

| Phase | Name | Deliverable | Gate |
|---|---|---|---|
| 160 | Baseline, audit, state repair | `BACKEND-AUDIT.md` (81 routes, 23 auth-dependent, caches, sync I/O); baseline metrics; Playwright scaffold; GH probe fix; reconcile stale M2/M4/M5/M7 state and register M8 | Baseline recorded; audit published |
| 161 | Auth session durability | Refresh, magic link, 7-day sliding, Secure, exp-required, fail-closed, optimistic hydration, cross-tab, logout race | Session survives refresh + simulated expiry; no silent guest |
| 162 | Thin web + tick | Lazy imports, no batch pollers at boot, `/internal/tick`, DB lock/last-run, deferred AIS/fanout | Cold boot < 20s; `/health` survives a tick |
| 163 | Bootstrap snapshot + read path | `dashboard_snapshots`, endpoint, client, lazy sections, weather/incidents cache, timeouts/abort | First data < 5s; request count down |
| 164 | Backend hot-path + proxy hardening | Client singleton, JWKS pre-warm, async I/O on auth/hot paths, news re-tier write-back, `last_fetched_at` fix, proxy cache headers | Warm login < 3s; two-user cache isolation |
| 165 | Production verification + SLO gate | Deploy, smoke, measure, free-host decision | All SLOs except soak green |
| 166 | Soak start + review | Start 7-day window, record artifact URL, leave review checklist | 0 failures over 7 days (follow-up) |

## Open items — must verify

1. Supabase access-token and refresh-token TTL; 7-day policy is capped by the refresh-token setting.
2. Whether the test accounts' `app_metadata.role` and `company_id` claims produce DISPATCHER/REGULATOR.
3. cron-job.org's real interval/timeout. Set to 5 min / 90s.
4. Vercel's cache key behavior with `Authorization`; fix is `private/no-store` regardless.
5. Push access from this session; fallback is a PR.

## Deliberately deferred

- HttpOnly `@supabase/ssr` migration and backend-owned sessions.
- RLS verification and classification of the 51 unauthenticated routes.
- Landing-page media optimization (121 frames + video).
- Route-result persistence across refresh.
- BMKG freshness drops from 60s to the 5-minute tick; revisit if alerts lag.
- 7-day soak verdict (follow-up session).

## Execution model

- **Orchestrator/planner:** main session (DeepSeek V4.1 Flash Max).
- **Research + implementation subagents:** `opencode/deepseek-v4.1-flash-free#high`, fallback `opencode-go/deepseek-v4.1-flash#high`. No default subagent.
- **Chain:** `/gsd-new-milestone` → `/boost` → `/goal` → soak review.
