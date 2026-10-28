# LEARNINGS — Phase 161: Auth session durability

**Window:** 2026-10-27 (phase) · 2026-10-28 (docs pass)
**Commit:** `b76baa1` · **Rule:** claims are tied to files/lines or marked
**UNVERIFIED** with the reason.

---

## 1. The root cause was a 48 h cookie around a 1 h token

Not a refresh *bug* — a refresh *gap*. Supabase's client refreshes its own session; the
application kept its own copy (`prehub_auth_token` in localStorage + a cookie) and
nothing wrote the refreshed value back. Measured on production for all three accounts:

| Account | `exp − iat` | Cookie `Max-Age` (before) |
|---|---|---|
| DISPATCHER / REGULATOR / GUEST | **3600 s** | **172800 s (48 h)** |

So for 47 of the 48 cookie hours the app held a token the backend would reject. The
cookie length was never the bug; the missing mirror was. Both are now aligned in code
(`TOKEN_COOKIE_MAX_AGE_SECONDS = 604800`, `authContext.tsx:64`) but the *server-side*
half is still a project setting — see §6.

## 2. An invalid token used to become a guest — and that hid the bug

Old `get_optional_user` caught the 401 and returned a GUEST session with HTTP 200. Two
consequences, both bad:

1. The client had **no signal** to re-authenticate. It rendered a read-only dashboard
   for an operator whose session had expired.
2. The bug was invisible in testing: every optional route "worked" for every token
   state, because every state produced 200.

The fail-closed contract (`no header → guest`, `supplied invalid → 401` +
`WWW-Authenticate: Bearer`) is what makes the refresh path observable. If a later change
ever restores the catch-and-downgrade, the 7-day session becomes unverifiable again even
if the client code is perfect.

**Constraint:** the sentinel guest (`id == default-guest-user`) is load-bearing.
`is_anonymous_guest()` is how `guest-session`/`switch-role` distinguish "no credential"
from "verified GUEST token". Removing the sentinel or giving both the same id would
silently re-open anonymous persona minting.

## 3. The P0 was an anonymous DISPATCHER mint, not a role check

`POST /api/v1/auth/guest-session` accepted `{"role": "DISPATCHER", "company_id": "…"}`
with no auth and returned a signed HS256 token carrying `fleet:write`,
`approvals:write`, `routes:plan` for the requested tenant. The RBAC layer was correct;
the token *issuer* was open. Fixing the 24-route dependency surface without fixing the
issuer would have left a bypass.

Rules now enforced:

| Caller | Result |
|---|---|
| anonymous | GUEST only, tenant forced to `demo_sandbox`, else `403` |
| authenticated evaluator | any role, tenant must be in `M8_EVALUATOR_COMPANIES` (default `demo_sandbox`) |
| authenticated non-evaluator | `403` |
| invalid supplied token | `401` |

`switch-role` never reads the tenant from the body (`auth_router.py:231`), so persona
switching cannot mint a token for someone else's tenant.

**Residual risk (unchanged):** anonymous GUEST minting is still enabled. It is signed
with the fallback secret when `SUPABASE_JWT_SECRET` is unset
(`supabase_auth.py:127-129` / `config.py:20`), which would make tokens forgeable
regardless of this policy. Production must set a real secret (owner: 164/165).

## 4. Claim behaviour: `app_metadata.role` only, `company_id` can come from two places

Verified in `supabase_auth.py:486-519` and against the phase-160 decoded tokens:

| Field | Read from | Fallback |
|---|---|---|
| `role` | **`app_metadata.role` strictly** | `payload["role_override"]`, then `GUEST`. `user_metadata.role` is **never** read (security: user metadata is mutable) |
| `company_id` | `app_metadata.company_id` → `user_metadata.company_id` | `profiles` lookup via the service-role client, but **only** when missing and the subject is a 36-char UUID; then `DEFAULT_ROLE_COMPANIES[role]` |
| `org_name` | `app_metadata` → `user_metadata` | role default |

Baseline reality that makes this matter: **DISPATCHER carries no
`user_metadata.role`** (only `app_metadata.role`), while REGULATOR and GUEST carry both.
Any new code that reads `user_metadata.role` returns `null` for dispatcher — the
claim-location inconsistency from M8-SPEC open item #2 is confirmed, not theoretical.

Corollary for evaluation: evaluator status depends on `company_id`, which for real
Supabase users may arrive from `user_metadata` (mutable by the user in some setups). The
authoritative path is `app_metadata`/`profiles`; treat the `user_metadata` fallback as a
compatibility shim, not a trust boundary.

## 5. What the tests actually prove

| Test | Proves | Does **not** prove |
|---|---|---|
| `tests/test_m8_auth_contract.py` (21, hermetic) | policy matrix, `401` + challenge, async deps, evaluator gating, tenant forcing | anything about a real Supabase token |
| `e2e/m8-auth.spec.ts:149` | cookie is written with 7-day `Max-Age` and `Secure` on HTTPS | that the *session* lasts 7 days |
| `e2e/m8-auth.spec.ts:179` | a stale stored token is recovered from the Supabase session, and the recovered token is accepted by `/api/v1/auth/me` | recovery after a real refresh-token expiry |
| `e2e/m8-auth.spec.ts:250` | logout in tab A clears tab B (and the Supabase session) | server-side revocation (there is none) |

The backend-acceptance assertion in case 2 is the important one: without it the spec
would pass on a client that writes a cookie nobody accepts.

## 6. Session survival past 1 h is still unverified

The refresh path is wired and the mirror runs on `TOKEN_REFRESHED`. What has **not** been
measured:

1. A live session crossing a real access-token expiry (needs a short-TTL test project or
   a ≥1 h wait).
2. The Supabase **refresh-token TTL** — a project setting, absent from the JWT
   (`BASELINE.md` §3, M8-SPEC open item #1). If it is < 7 days, the 7-day cookie is
   cosmetic.
3. Behaviour when the refresh token is revoked/expired: the client should clear the
   token and show the login modal, but only the "stale token" branch is covered.

Do not describe M8's "2 h idle + refresh, 7-day sliding" SLO as met until (1) and (2)
are measured. Owner: phase 165.

## 7. The demo sandbox flow was the thing most at risk

The lockdown had to reject anonymous operator mints **without** breaking the demo. What
was preserved and why:

- Anonymous preview → middleware still redirects to `?guest=1`; the client still
  hydrates the restricted guest profile with no token.
- Evaluator login → the evaluator's tenant is `demo_sandbox`, which satisfies both
  `is_evaluator` and the tenant allowlist, so the 1-click DISPATCHER/REGULATOR/GUEST
  switch still works.
- Real operator accounts (`pos_logistik`, `bapanas`) lost `switch-role` and anonymous
  minting — neither was part of the demo path.

If a future phase tightens `M8_EVALUATOR_COMPANIES`, the demo breaks silently: the
evaluator would be authenticated but `403` on every persona mint. Any change to that
setting needs a Playwright run of the demo path, not just the contract tests.

## 8. Gotchas — do not repeat

1. **Do not count `Depends(get_current_user)` as the auth surface.** 20 of 24
   auth-dependent routes used `get_optional_user`; the open half was the larger half.
2. **Do not add a wrapper that calls `get_optional_user(credentials)` and forget it in
   the audit.** Phase 163's `bootstrap_user` (`dashboard_bootstrap.py:67-77`) does
   exactly this; it inherits the 401 contract but is invisible to a
   `Depends(get_optional_user)` grep.
3. **Do not rely on `security_scheme` to reject a malformed header.** The fail-closed
   behaviour comes from `decode_and_verify_token` raising; the test matrix covers it,
   the dependency signature does not.
4. **Never record test-account credentials.** They exist only as
   `M8_<ROLE>_EMAIL` / `M8_<ROLE>_PASSWORD` in the shell; artifacts store token length
   and decoded claims. No password belongs in a plan, walkthrough, learning, spec or
   artifact — including "just for reproduction".
5. **Do not shorten the cookie to the token lifetime as a "fix".** That would delete the
   session every hour. The session length belongs to the refresh-token TTL; the cookie
   should express the intended policy and the client must refresh.
6. **Do not treat `/auth/session` 401 as a regression.** It is now fail-closed by
   design; any client call site outside `authContext` that relied on the old guest
   fallback will surface an error it must handle.
7. **Do not migrate to `persistSession: false`** to "avoid stale tokens". All three
   Supabase flags are load-bearing (`supabaseClient.ts:13-23`): persistence holds the
   refresh token, auto-refresh renews the 1 h access token, `detectSessionInUrl` applies
   the magic-link session.

## 9. Constraints observed

- Auth decisions read `app_metadata` only; user metadata is never an authorization
  source.
- The backend stays authoritative; the edge middleware does structural checks only
  (`exp` required, no signature verification).
- No new frontend dependency was added; no `@supabase/ssr` / HttpOnly migration (M8
  non-goal).
- No token TTL change was made in the Supabase project — that is out of code scope.
