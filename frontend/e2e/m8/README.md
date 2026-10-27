# M8 baseline harness (phase 160)

Read-only production baseline for the M8 "Fast & Durable" milestone. It measures
login latency, JWT claims, first-mount network fan-out, time to first dashboard
data, and whether the session survives a clean mount and a page reload.

It **never** writes business data: no approvals, no route commits, no fleet
mutation. The only state it touches is its own browser context (localStorage +
the `prehub_auth_token` cookie), which is discarded when the test ends.

## Run

From `frontend/`:

```powershell
# 1) Provide the test accounts (never commit these values)
$env:M8_DISPATCHER_EMAIL='…'
$env:M8_DISPATCHER_PASSWORD='…'
$env:M8_REGULATOR_EMAIL='…'
$env:M8_REGULATOR_PASSWORD='…'
$env:M8_GUEST_EMAIL='…'
$env:M8_GUEST_PASSWORD='…'

# 2) Run the baseline against production
npx playwright test e2e/m8-baseline.spec.ts --config=playwright.m8.config.ts
```

Bash equivalent:

```bash
cd frontend
M8_DISPATCHER_EMAIL=… M8_DISPATCHER_PASSWORD=… \
M8_REGULATOR_EMAIL=… M8_REGULATOR_PASSWORD=… \
M8_GUEST_EMAIL=… M8_GUEST_PASSWORD=… \
npx playwright test e2e/m8-baseline.spec.ts --config=playwright.m8.config.ts
```

Artifacts (JSON + Markdown) are written to
`.planning/phases/160-baseline-audit-state-repair/artifacts/` by default.

## Environment variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `M8_DISPATCHER_EMAIL` / `M8_DISPATCHER_PASSWORD` | for the DISPATCHER test | — | `pos_logistik` operator account |
| `M8_REGULATOR_EMAIL` / `M8_REGULATOR_PASSWORD` | for the REGULATOR test | — | `bapanas` regulator account |
| `M8_GUEST_EMAIL` / `M8_GUEST_PASSWORD` | for the GUEST test | — | `demo_sandbox` evaluator account |
| `M8_ACCOUNTS` | no | all three | Comma list, e.g. `DISPATCHER,GUEST` |
| `M8_BASE_URL` | no | `https://pre-hub.vercel.app` | Target frontend |
| `M8_ARTIFACT_DIR` | no | `.planning/phases/160-baseline-audit-state-repair/artifacts` | Artifact output directory |
| `M8_THROTTLE` | no | off | Set to `fast4g` for Chromium CDP throttling (150 ms RTT, ~1.6 Mbps down / 750 kbps up) |

A test whose credentials are absent is **skipped with a message**, not failed.

## What each test records

1. **Login** — submit click → AuthModal closed and the JWT persisted, split into
   the Supabase `/auth/v1/token` leg and the backend `/api/v1/auth/me` leg.
2. **Claims** — decoded `exp`, `iat`, lifetime, `app_metadata.role`,
   `user_metadata.role`, `user_metadata.company_id`, masked `email`. The token
   itself is never logged (only its length).
3. **First mount** — navigates to the canonical `/dashboard` with the session
   already established, counts every request until the data signal fires, and
   reports the total, distinct count, per-host totals, and top 15 by URL.
   Mapbox `access_token` query params are redacted.
4. **Data signal** — `N Sumber Terverifikasi` in the news wire (data-driven).
   Falls back to the Mapbox canvas if the wire never reports and records
   `signal_fallback_used: true`.
5. **Session survival** — a clean `/dashboard` mount and then a reload must both
   keep the role badge, keep the same JWT subject, return `200` from
   `/api/v1/auth/me`, and never redirect to `?guest=1`.
6. **Known residue** — the harness also records whether the app cleared the
   middleware's `?guest=1` flag after login (`guest_flag_cleared_by_app`). This
   is a finding, not a gating assertion.

## CI

Same command; export the env vars from CI secrets. The spec is Chromium-only and
uses one worker because the three accounts share a backend. No packages beyond
`@playwright/test` (already in `frontend/package.json`); JWTs are decoded with
`Buffer.from(payload, 'base64url')`.

If a login fails, the test reports the exact modal error and the Supabase
`/auth/v1/token` `error` / `error_code` / `msg` fields instead of retrying.
