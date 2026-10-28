# WALKTHROUGH — Phase 161: Auth session durability

**Window:** 2026-10-27 · **Docs pass:** 2026-10-28
**Commit:** `b76baa1` — `feat(m8-161): durable auth sessions + fail-closed auth boundary`
(19 files, +1704/−150)
**Lineage:** on `m9-operational-truth` and `main`; **not** on `m8-operational-truth`
(which stops at `61c0ae5`) nor `m8-fast-durable` (still `2eeb1ca`)
**Mode:** implementation + hermetic contract tests; no deploy, no TTL change

---

## 1. What was broken (from phase 160)

| # | Defect | Evidence before |
|---|---|---|
| 1 | **A supplied-but-invalid token became a guest.** All 20 `get_optional_user` routes caught the 401 and returned `UserSession(role=GUEST)` with HTTP 200 | `BACKEND-AUDIT.md` F1; old `supabase_auth.py:452-457` |
| 2 | **Anonymous persona minting.** `POST /api/v1/auth/guest-session` returned a signed DISPATCHER/REGULATOR token for any role and tenant to an unauthenticated caller | F2; old `auth_router.py:84-115` |
| 3 | **Nothing copied a refreshed token into the app's own storage.** Supabase refreshed its session; `prehub_auth_token` (localStorage + cookie) kept the stale access token | `M8-SPEC.md` root cause #2 |
| 4 | **A 48 h cookie wrapped a 1 h token** | `BASELINE.md` §3: `exp − iat = 3600 s` on all three accounts; `TOKEN_COOKIE_MAX_AGE_SECONDS = 172800` |
| 5 | **Token verification ran on the event loop** (`PyJWKClient`, `auth.get_user`, `profiles.select`) | audit §4 rows 4–6 |
| 6 | **A token with no `exp` passed the edge check** | old `middleware.ts` structural check |

Defects 1 and 2 are why the phase had to land the backend contract *and* the client
refresh together: fixing only the client would have left the boundary decorative, and
fixing only the backend would have turned every expired session into a hard 401 with no
recovery path in the UI.

## 2. What was built

### 2.1 Fail-closed optional auth

`backend/app/auth/supabase_auth.py:564-587`:

```python
if credentials and credentials.credentials:
    try:
        return await asyncio.to_thread(decode_and_verify_token, credentials.credentials)
    except HTTPException as exc:
        if exc.status_code == status.HTTP_401_UNAUTHORIZED and not exc.headers:
            exc.headers = dict(UNAUTHORIZED_HEADERS)   # WWW-Authenticate: Bearer
        raise

return default_guest_session()
```

- No header → the sentinel guest (`id == default-guest-user`, `is_offline_guest=True`),
  so handlers can still tell "anonymous" from a verified GUEST token
  (`is_anonymous_guest`, `supabase_auth.py:150-152`).
- Header present, token bad → re-raise with `WWW-Authenticate: Bearer`
  (`UNAUTHORIZED_HEADERS`, `:111`).
- `GET /auth/session` documents the same contract in its docstring
  (`auth_router.py:94-101`).

### 2.2 P0 lockdown: `guest-session` and `switch-role`

`backend/app/routers/auth_router.py`:

| Caller | `POST /guest-session` | `POST /switch-role` |
|---|---|---|
| no header | GUEST only (`:133-139`); tenant forced to `demo_sandbox` (`:147`); any other tenant body value → `403` (`:141-146`) | `401` (route requires `get_current_user`) |
| authenticated evaluator | any role, tenant must be in `M8_EVALUATOR_COMPANIES` (`:153-169`) | `200`; tenant forced from the caller's own claim (`:231`) |
| authenticated non-evaluator | `403` (`:153-158`) | `403` (`:223-227`) |
| supplied invalid token | `401` (fail-closed dep) | `401` |

Evaluator policy (`supabase_auth.py:155-167`): `company_id == "demo_sandbox"` **or**
email in `M8_EVALUATOR_EMAILS`; anonymous callers are never evaluators by construction.
Settings default to `evaluator@kompetisi-lrip.id` / `demo_sandbox`
(`config.py:27-29`).

Net effect: the audit's F2 bypass — any visitor minting `fleet:write` /
`approvals:write` / `routes:plan` for any tenant — is gone, while the demo sandbox
(anonymous preview → evaluator login → 1-click persona switch) still works because the
evaluator's own tenant **is** `demo_sandbox`.

### 2.3 Async auth deps, JWKS pre-warm, cached clients

| Change | Where |
|---|---|
| `get_current_user` / `get_optional_user` are `async` and verify via `asyncio.to_thread` | `supabase_auth.py:544-587` |
| `prewarm_jwks()` — blocking helper, called off-loop | `supabase_auth.py:249-275`, `main.py:554-566` |
| Relay (anon) and admin (service-role) clients are idempotent singletons behind a `threading.Lock` | `supabase_auth.py:294-320` |
| Service-role client singleton; `get_write_client()` reuses it | `db/supabase_client.py:18-19,114-150` |
| Profile enrichment is skipped when the JWT already carries `company_id` | `supabase_auth.py:499-511` |

The pre-warm is guarded on `supabase_jwks_key` or `supabase_url` and is non-fatal
(`main.py:559-566`); it removes the cold JWKS TLS fetch from the login SLO.

### 2.4 Client refresh wiring

`frontend/lib/authContext.tsx` (the actual root-cause fix):

| Concern | Implementation |
|---|---|
| Boot | `sb.auth.getSession()` first (`:240-262`); localStorage is a **migration** path only and is validated against `/auth/me` (`:264-307`) |
| Refresh mirror | `onAuthStateChange` on `SIGNED_IN` / `TOKEN_REFRESHED` / `INITIAL_SESSION` writes the access token to localStorage **and** the cookie (`:332-359`) |
| Magic link | handled by `detectSessionInUrl: true` + `SIGNED_IN`; the middleware/`AuthModal` no longer claims the session is live on send |
| Cookie | `prehub_auth_token`, `Max-Age=604800`, `Path=/`, `SameSite=Lax`, `Secure` only on HTTPS (`:60,64,131-137`) |
| Optimistic hydration | profile from JWT claims, `/auth/me` reconciles in the background (`:251-256,349-357`) — first paint never waits |
| Re-auth | `401` → clear the token, show the modal with `REAUTH_NOTICE` (`:281-305`); never a silent guest |
| Logout race | monotonically increasing `authGenerationRef` (`:172-174`); stale async completions are dropped |
| Cross-tab | `storage` event listener; logout also clears the Supabase session so a reload cannot resurrect it (`:371-402`) |
| Listener teardown | `data.subscription.unsubscribe()` on unmount (`:361-364`) |

`frontend/middleware.ts:26-28` now requires a finite numeric `exp` that is in the
future. No crypto verification was added at the edge — FastAPI stays authoritative.

`frontend/lib/supabaseClient.ts:6-32` keeps `persistSession`, `autoRefreshToken`,
`detectSessionInUrl` on, documented as load-bearing, with a module-level singleton.

### 2.5 Magic-link copy

`frontend/components/auth/AuthModal.tsx` no longer closes the modal claiming a live
session after a magic-link send; it says to open the emailed link. The session is
applied on landing. Behaviour change #4 in the plan.

## 3. Verification

Hermetic contract test — 21 cases:

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest tests\test_m8_auth_contract.py -q
# 21 passed, 3 warnings in 2.68s          <- re-run 2026-10-28
```

Phase run recorded 4.09 s for the same 21; the difference is machine load. The file
signs local HS256 tokens and monkeypatches the decoder for the failure modes, so it
needs no Supabase project.

Full suite (phase run, 2026-10-27):

```text
408 passed, 3 failed, 12 warnings in 332.50s
```

The 3 failures: `test_impact_assessment.py::test_disruption_impact_assessment_spatial_filtering`
and `test_news_pipeline.py::test_news_stampede_guard_prevents_duplicate_runs` (known
baseline), plus
`test_cpu_routing_weather.py::test_cpu_routing_service_flags_seed_fallback_when_tomtom_unavailable`
(concurrent M9 routing/weather work; `is_fallback=False` while TomTom is degraded,
reproducible in isolation). The baseline travel-fuel pair passed here.

Typecheck:

```powershell
cd frontend
npx tsc --noEmit        # exit 0 (phase run, twice after the final edit)
```

Playwright durability spec — **3 passed (1.7 m)**, DISPATCHER test account, local
target. The three cases (`frontend/e2e/m8-auth.spec.ts`):

| Line | Case |
|---|---|
| `:149` | login mirrors a 7-day, `Secure`-on-HTTPS auth cookie |
| `:179` | recovers a stale app token from the Supabase session (no silent guest) |
| `:250` | logout in one tab clears the session in another tab |

Command:

```powershell
cd frontend
npx playwright test e2e/m8-auth.spec.ts --config=playwright.m8.config.ts
```

The stale-token case asserts backend acceptance **directly** — it calls
`/api/v1/auth/me` with the recovered token and requires `200` + a matching role, so the
test cannot pass on a client-only illusion. Credentials come from
`M8_DISPATCHER_EMAIL` / `M8_DISPATCHER_PASSWORD`; no password is recorded in this
folder, in the spec, or in any artifact.

## 4. Behaviour changes (user-visible)

1. Expired/invalid stored token → login modal with an explicit "session ended" notice
   (previously: silent read-only guest dashboard).
2. Anonymous `guest-session` for DISPATCHER/REGULATOR → `403` (previously a valid
   operator JWT for any tenant).
3. `switch-role` from a real operator tenant (`pos_logistik`, `bapanas`) → `403`. The
   demo sandbox flow is intact.
4. Magic-link send no longer claims the session is live.
5. `backend/scripts/seed_laporan_render.py` now requires `DISPATCHER_TOKEN`
   (`:88,234-238`) — the documented anonymous one-shot mint is gone by design.

## 5. What this does **not** prove

1. **Session survival past access-token expiry.** The spec starts from a *stale stored*
   token and proves recovery. It does not wait out a real 1 h expiry, and it does not
   prove the Supabase refresh-token TTL is ≥ 7 days — that is a project setting the
   repo cannot show. **UNVERIFIED** (owner: 165).
2. **The 7-day cookie is only as long as the refresh-token TTL.** A 7-day `Max-Age`
   around a session that dies at day 3 is a lie the client cannot detect until day 3.
3. **Deployed behaviour of the new 401 contract.** Only `/auth/me` was asserted against
   a real backend by the spec. The other 21 optional routes are covered hermetically.
4. **Cross-tenant gaps (audit F6)** and client-wide 401 handling outside the auth
   context are untouched.

See `LEARNINGS.md` for the durable rules and the claim/tenant behaviour.
