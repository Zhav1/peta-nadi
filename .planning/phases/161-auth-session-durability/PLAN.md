# PLAN — Phase 161: Auth session durability

**Window:** 2026-10-27 · **Mode:** implementation
**Milestone:** M8 — Fast & Durable (phase 2 of 7)
**Depends on:** phase 160 (`BACKEND-AUDIT.md` findings F1 + F2, baseline session measurements)
**Branch:** committed on the session branch `m9-operational-truth` as `b76baa1` (M8's own branch is `m8-operational-truth`; cherry-pick pending). The concurrent M9 weather work was deliberately left unstaged.

## Goal

Make the Supabase session survive refresh and token expiry on the client, and make
the backend auth boundary honest: a supplied-but-invalid credential is a `401`, not
a silent guest; persona minting is restricted to the demo sandbox; auth verification
no longer blocks the event loop.

The phase has to close the two P0 findings from phase 160 **without breaking the
guest/evaluator demo** (anonymous preview, evaluator login, 1-click persona switch).

## Scope IN

- `get_optional_user` fail-closed + `/auth/session` contract.
- `POST /auth/guest-session` anonymous-minting lockdown (F2).
- `POST /auth/switch-role` evaluator-only + server-forced tenant (F2).
- Async auth dependencies (`asyncio.to_thread`), JWKS pre-warm, cached Supabase clients.
- Client boot from `supabase.auth.getSession()`, refresh → localStorage + 7-day cookie,
  magic-link landing, optimistic hydration, re-auth on 401, logout race, cross-tab sync.
- Middleware: `exp` required; structural-only check preserved.
- Contracts: `backend/tests/test_m8_auth_contract.py`, `frontend/e2e/m8-auth.spec.ts`.

## Scope OUT

- No `@supabase/ssr` / HttpOnly migration, no backend-owned session table (deferred by M8-SPEC).
- No proxy header work (phase 164), no read-path/bootstrap work (phase 163).
- No token TTL change in the Supabase project (server setting, not code).
- No fixes for the four pre-existing full-suite failures.
- No commit, no deploy, no `SPEC.md` edit, no phase archive.

## Auth policy (as implemented)

| Endpoint | Caller | Result |
|---|---|---|
| `GET /auth/session` | no `Authorization` header | `200` anonymous GUEST (`id=default-guest-user`, no tenant) |
| `GET /auth/session` | supplied token invalid/expired | **`401`** + `WWW-Authenticate: Bearer` |
| `GET /auth/me` | no / invalid token | `401` |
| `POST /auth/guest-session` | anonymous, role `GUEST`, company omitted or `demo_sandbox` | `200`, tenant forced to `demo_sandbox` |
| `POST /auth/guest-session` | anonymous, any other role or company | **`403`** |
| `POST /auth/guest-session` | authenticated evaluator†, role inside `demo_sandbox` / `M8_EVALUATOR_COMPANIES` | `200` |
| `POST /auth/guest-session` | authenticated non-evaluator | `403` |
| `POST /auth/switch-role` | unauthenticated | `401` |
| `POST /auth/switch-role` | authenticated non-evaluator | `403` |
| `POST /auth/switch-role` | authenticated evaluator† | `200`, tenant forced to caller's `company_id` (fallback `demo_sandbox`); request body cannot set the tenant |

† **Evaluator** = verified `company_id == "demo_sandbox"` **or** email in
`M8_EVALUATOR_EMAILS` (comma-separated, default `evaluator@kompetisi-lrip.id`).
Anonymous callers are never evaluators. Tenants come from
`M8_EVALUATOR_COMPANIES` (default `demo_sandbox`), so the allowlist is env-extendable
without a code change.

## Tasks

1. **Fail-closed optional auth.** `backend/app/auth/supabase_auth.py`
   (`get_optional_user`), contract text in `backend/app/routers/auth_router.py`
   (`GET /auth/session`). Preserve the sentinel guest id so handlers can still
   distinguish "no header" from a verified GUEST token.
2. **Close anonymous persona minting.** `auth_router.py`
   (`create_guest_session`, `switch_role`), helpers `is_anonymous_guest`,
   `is_evaluator`, `evaluator_emails`, `evaluator_companies` in `supabase_auth.py`,
   settings in `backend/app/config.py`, exports in `backend/app/auth/__init__.py`.
3. **Event-loop safety + client reuse.** Async `get_current_user` /
   `get_optional_user` with `asyncio.to_thread(decode_and_verify_token)`;
   best-effort `prewarm_jwks()` scheduled from `backend/app/main.py` lifespan
   (guarded by `supabase_jwks_key` / `supabase_url`, failure non-fatal);
   cached relay/admin clients in `supabase_auth.py` and a cached service-role
   client in `backend/app/db/supabase_client.py`.
4. **Backend contract test.** `backend/tests/test_m8_auth_contract.py` — hermetic
   (local HS256 signing, monkeypatched decoder for the failure modes);
   `backend/tests/test_auth_rbac.py` expectations updated to the new policy.
5. **Client session durability.** `frontend/lib/authContext.tsx`:
   `getSession()` boot with validated localStorage migration, `onAuthStateChange`
   (`SIGNED_IN` / `TOKEN_REFRESHED` / `INITIAL_SESSION`) mirroring the token into
   localStorage **and** the 7-day cookie, optimistic JWT profile + background
   `/auth/me` reconcile, explicit re-auth on `401`, auth-generation counter,
   `storage` cross-tab sync, listener teardown. `frontend/lib/supabaseClient.ts`
   keeps `persistSession` / `autoRefreshToken` / `detectSessionInUrl`.
6. **Middleware `exp` requirement.** `frontend/middleware.ts` rejects tokens with a
   non-numeric/absent `exp`; no crypto verification added at the edge.
7. **Copy + harness.** Magic-link success copy in
   `frontend/components/auth/AuthModal.tsx` (check your email, do not claim the
   session is live) + re-auth notice; `frontend/e2e/m8-auth.spec.ts` and
   `frontend/playwright.m8.config.ts` test match.
8. **Keep the live-seed tool honest.** `backend/scripts/seed_laporan_render.py`
   relied on the removed anonymous DISPATCHER mint; it now requires
   `DISPATCHER_TOKEN` and says how to obtain one instead of printing an opaque 403.

## Acceptance criteria

- [x] No header → guest `200`; invalid header → `401` with `WWW-Authenticate: Bearer`
      on both `/auth/session` and every other optional route (`test_optional_auth_*`).
- [x] `/auth/me` invalid → `401` (`test_current_auth_*`).
- [x] Anonymous `DISPATCHER` / `REGULATOR` mint → `403`; anonymous `GUEST` → `200`
      with `company_id=demo_sandbox`; anonymous non-sandbox tenant → `403`.
- [x] Evaluator-authenticated `DISPATCHER` mint → `200` (tenant stays `demo_sandbox`);
      tenant outside the allowlist → `403`; non-evaluator operator → `403`.
- [x] `switch-role` non-evaluator → `403`; evaluator → `200` with the company forced
      to the caller's tenant (body `target_company`/`company_id` ignored).
- [x] Auth dependencies are `async` and verify tokens off the event loop.
- [x] JWKS pre-warm is guarded and non-fatal.
- [x] Supabase relay/admin/service clients are cached per process.
- [x] Boot reads the Supabase session first; localStorage is migration-only and is
      validated against `/auth/me`.
- [x] Cookie is `prehub_auth_token`, `Max-Age=604800`, `Path=/`, `SameSite=Lax`,
      `Secure` on HTTPS, renewed on every token event, cleared on logout.
- [x] First paint never waits on `/auth/me`; a `401` clears the session and opens
      the login modal with an explicit notice (never a silent guest).
- [x] Logout invalidates in-flight logins (generation counter) and other tabs.
- [x] Middleware requires a numeric, unexpired `exp`.
- [x] No new frontend dependency.

## Verification

Run from the repo root unless noted.

```bash
# 1. Targeted backend contract (hermetic, ~4s)
pytest backend/tests/test_m8_auth_contract.py -q

# 2. Full backend suite (only because (1) is green; ~7 min)
pytest backend/tests -q

# 3. Frontend typecheck (authoritative one is inside frontend/)
cd frontend && npx tsc --noEmit

# 4. Playwright auth-durability spec (needs a live target + M8_* credentials)
cd frontend && npx playwright test e2e/m8-auth.spec.ts --config=playwright.m8.config.ts
```

### Results (this session, 2026-10-27)

| Command | Result |
|---|---|
| `pytest backend/tests/test_m8_auth_contract.py -q` | **21 passed**, 1 deprecation warning, 4.09 s |
| `pytest backend/tests -q` | **408 passed, 3 failed, 12 warnings, 332.50 s** (details below) |
| `cd frontend; npx tsc --noEmit` | **exit 0** |
| Playwright `e2e/m8-auth.spec.ts` | **3 passed** (1.7m) against a local dev server with the DISPATCHER test account: 7-day cookie, stale-token recovery, cross-tab logout. The backend-acceptance assertion now calls `/api/v1/auth/me` directly with the recovered token and requires a `200` + matching role. |

**Full-suite failures (not fixed here, per instruction):**

| Test | Status | Attribution |
|---|---|---|
| `tests/test_impact_assessment.py::test_disruption_impact_assessment_spatial_filtering` | failing | Known pre-existing (baseline #1) |
| `tests/test_news_pipeline.py::test_news_stampede_guard_prevents_duplicate_runs` | failing | Known pre-existing (baseline #2) |
| `tests/test_cpu_routing_weather.py::test_cpu_routing_service_flags_seed_fallback_when_tomtom_unavailable` | failing, reproducible in isolation | **New vs. the phase-160 baseline list**, but not auth-related: `optimize_fleet_routes_cpu` returns `is_fallback=False` while TomTom is degraded. Owned by the routing/weather work in the tree (phase 160/168), not by phase 161. |
| `tests/test_travel_fuel_guard.py` (2 cases) | **passing now** | Baseline #3/#4 pass in isolation and in this run; the baseline failure was order/state-coupled. |

No auth test regressed: `test_auth_rbac.py` and `test_m8_auth_contract.py` are green in the full run.

## Behaviour changes (intentional, user-visible)

1. An expired/invalid stored token now produces a login modal with
   "Sesi Anda telah berakhir…" instead of a read-only guest dashboard.
2. Anonymous `POST /auth/guest-session` for an operator role is `403` instead of a
   valid dispatcher JWT. The UI never called this unauthenticated path; the
   evaluator account (demo sandbox) still switches personas.
3. `switch-role` from a real operator account (`pos_logistik`, `bapanas`) is `403`.
   It was previously allowed and is not part of the demo path.
4. Magic-link send no longer closes the modal claiming the session is active; it
   says to open the emailed link. The session is applied on landing via
   `detectSessionInUrl` + `SIGNED_IN`.

## Demo-flow impact

- **Anonymous guest preview:** unchanged. Middleware still redirects to
  `?guest=1`; the client still hydrates the restricted guest profile with no token.
- **Guest actions:** unchanged (`GUEST` has read-only permissions; POSTs stay `403`).
- **Evaluator login + persona switch:** preserved for `demo_sandbox` and for the
  email allowlist, including the 1-click DISPATCHER/REGULATOR/GUEST switch, because
  the evaluator's own tenant is `demo_sandbox`.
- **Real operator accounts:** login, `/auth/me`, reads and writes unchanged; they
  simply cannot mint personas.

## Risks / follow-ups

1. **Anonymous GUEST mint remains possible.** Phase 161 restricts it to
   `demo_sandbox` but does not disable it; it still issues a 48 h HS256 token signed
   with the fallback secret when `SUPABASE_JWT_SECRET` is unset (audit §7.1).
   Production must set a real secret — tracked for phase 164/165.
2. **Token TTL is a Supabase project setting.** The 7-day cookie can only be
   honoured while the refresh-token TTL is ≥ 7 days; unverified (M8-SPEC open item
   #1). Session survival past access-token expiry was not measured here.
3. **Cross-tenant gaps (audit F6) remain open** on the fleet/travels/erp routes;
   this phase hardened the auth boundary, not every handler's tenancy check.
4. **`/auth/session` is now `401` on a bad token.** Any un-audited client call that
   relied on the old guest fallback will now surface an error; the app's only call
   sites are inside the auth context, which handles `401` explicitly.
5. **JWKS pre-warm opens a network call at boot on the free tier.** It is scheduled
   non-blocking and its failure is logged; if it proves noisy in production, guard it
   behind an env flag (phase 164 has the hot-path budget).
