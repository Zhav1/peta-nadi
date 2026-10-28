# BASELINE — Phase 160: pre-change production measurements

**Captured:** 2026-10-27, 08:12–08:52 UTC (three failed/iterating harness runs, then
four clean runs: three unthrottled, one Fast 4G)
**Environment:** production — frontend `https://pre-hub.vercel.app` (Vercel),
backend `https://peta-nadi.onrender.com` (Render free, 0.1 CPU), Supabase Auth
**Harness:** Playwright 1.62.x / Chromium, Node 24, Windows; `workers: 1`, no retries
**Accounts:** DISPATCHER (`pos_logistik`), REGULATOR (`bapanas`), GUEST (`demo_sandbox`).
Credentials were supplied only through `M8_<ROLE>_EMAIL` / `M8_<ROLE>_PASSWORD`
environment variables; they are not in source or in these artifacts.

All numbers below are measured, not estimated. Where a value could not be measured
it is marked **unknown** with the reason.

---

## 1. Headline baseline

| Metric | Baseline (measured) | SLO target | Verdict |
|---|---|---|---|
| Warm `/health` (n=5) | 404 / 668 / 280 / 297 / 284 ms — median 297 ms, max 668 ms | p95 < 500 ms | at/over edge |
| Cold first response | **not measured** — documented 60–80 s (M8-SPEC) | < 20 s | unknown this session |
| Login, submit → authenticated (n=9, unthrottled) | median 7.8 s; min 4.8 s; **max 70.6 s** | p95 < 3 s | fails |
| Dashboard first data (n=9, unthrottled) | median 12.1 s; min 6.2 s; **max 94.0 s** | < 5 s (Fast 4G) | fails |
| First-mount requests (n=9) | 50–94 total; 47–70 distinct | ~25–30 today → target lower | — |
| Access-token lifetime | 3600 s exactly, all three accounts | 7-day sliding session | fails (1 h token in a 48 h cookie) |
| Role / company claims | correct for all three | — | pass |
| Session survives clean mount + reload | 12/12 account-checks (4 runs) | refresh + simulated expiry | passes only inside the 1 h token window |

The single most important finding: **login time is dominated by
`GET /api/v1/auth/me`, not by Supabase sign-in.** Supabase `/auth/v1/token`
answered in 473–2809 ms, while the backend profile call returned anywhere from
4220 ms to 70010 ms after submit. This is the boot-starvation + 0.1 CPU failure
mode described in M8-SPEC root cause #1, not a network-distance problem.

---

## 2. Per-run measurements (unthrottled)

`login` = submit click → auth modal closed and JWT persisted (this includes the
blocking `/auth/me` call). `me@` = timestamp of the `/auth/me` response measured
from submit, not the duration of that leg.

| Run (UTC) | Account | login | Supabase sign-in | `/auth/me` response @ | First data | Requests (distinct) |
|---|---|---|---|---|---|---|
| 08:36 | DISPATCHER | 37 165 ms | unknown (no split yet) | unknown | 21 144 ms | 74 (66) |
| 08:36 | REGULATOR | 64 230 ms | unknown | unknown | 7 299 ms | 70 (65) |
| 08:36 | GUEST | 5 450 ms | unknown | unknown | 6 184 ms | 50 (47) |
| 08:40 | DISPATCHER | 7 771 ms | 2 809 ms | 6 725 ms | 73 812 ms | 91 (66) |
| 08:40 | REGULATOR | 5 238 ms | 1 809 ms | 4 656 ms | 23 740 ms | 74 (65) |
| 08:40 | GUEST | 4 835 ms | 1 843 ms | 4 064 ms | 9 777 ms | 51 (47) |
| 08:48 | DISPATCHER | 70 566 ms | 1 295 ms | 70 010 ms | 12 105 ms | 71 (66) |
| 08:48 | REGULATOR | 5 061 ms | 1 840 ms | 4 220 ms | 93 991 ms | 94 (65) |
| 08:48 | GUEST | 11 695 ms | 890 ms | 11 115 ms | 10 592 ms | 50 (47) |

Derived (n=9): login median **7 771 ms**, max **70 566 ms**; first data median
**12 105 ms**, max **93 991 ms**. The spread is the signal: the same account and
code path is 10–14× slower when the Render process is busy or waking, which is
exactly the failure the milestone must remove.

### Fast 4G throttle (Chromium CDP: 150 ms RTT, 1.6 Mbps down / 750 kbps up)

| Account | login | Supabase sign-in | `/auth/me` @ | First data | Requests (distinct) |
|---|---|---|---|---|---|
| DISPATCHER | 10 708 ms | 519 ms | 9 758 ms | 15 220 ms | 72 (66) |
| REGULATOR | 7 246 ms | 606 ms | 7 129 ms | 26 388 ms | 79 (70) |
| GUEST | 45 220 ms | 473 ms | 44 449 ms | 3 198 ms | 50 (47) |

Throttling did not make first data meaningfully worse than the unthrottled runs —
the backend, not the last mile, is the bottleneck.

---

## 3. Token, claims, and session state

Decoded from `prehub_auth_token` (the Supabase access token the app stores). Full
tokens are never recorded; artifacts store length + decoded claims only.

| Account | `exp` | `iat` | Lifetime | `app_metadata.role` | `user_metadata.role` | `company_id` | Token length |
|---|---|---|---|---|---|---|---|
| DISPATCHER | 1793094539 (2026-10-27T09:48:59Z) | 1793090939 (08:48:59Z) | 3600 s | `DISPATCHER` | **absent** | `pos_logistik` | 1042 |
| REGULATOR | 1793094626 (09:50:26Z) | 1793091026 (08:50:26Z) | 3600 s | `REGULATOR` | `REGULATOR` | `bapanas` | 912 |
| GUEST | 1793094729 (09:52:09Z) | 1793091129 (08:52:09Z) | 3600 s | `GUEST` | `GUEST` | `demo_sandbox` | 903 |

Notes:
- **Access-token TTL is 1 h on all three accounts.** `authContext.tsx` writes a
  48 h cookie (`TOKEN_COOKIE_MAX_AGE_SECONDS = 172800`) around that 1 h token —
  the 48× mismatch in M8-SPEC root cause #2 is confirmed on production.
- **Refresh-token TTL: unknown.** It is not present in the JWT; it is a Supabase
  project setting and was not readable from this session.
- **DISPATCHER carries no `user_metadata.role`.** Its role exists only in
  `app_metadata.role`; REGULATOR and GUEST carry both. Any code path that reads
  `user_metadata.role` will see `null` for dispatcher tokens — the claim-location
  inconsistency in M8-SPEC open item #2 is real.
- `company_id` lives in `user_metadata` for all three accounts.

### Session survival

| Check | DISPATCHER | REGULATOR | GUEST |
|---|---|---|---|
| Clean `/dashboard` mount keeps session (no `?guest=1` redirect) | yes | yes | yes |
| `/api/v1/auth/me` after mount | 200 | 200 | 200 |
| Role badge restored | yes | yes | yes |
| Same JWT subject after restore | yes | yes | yes |
| Page reload keeps session | yes | yes | yes |
| Reload → auth restored | 135–114 906 ms | 196–20 050 ms | 145–2 182 ms |

That reload-restore range is not noise, it is the milestone's problem: one
DISPATCHER reload waited **114.9 s** for `/auth/me` before the role badge came
back (run 08:40), and one REGULATOR reload waited 20.1 s (run 08:45). Warm
reloads are 135–550 ms. The same route, same token, two orders of magnitude of
difference.

**Caveat, stated deliberately:** these reloads happen minutes after login, while
the access token is still valid. They prove the cookie + `/auth/me` path works
inside the 1 h window. They do **not** prove survival past token expiry — that is
the failure M8-SPEC attributes to the un-wired refresh and must be measured in
phase 161 with a short-TTL token, not inferred from this table.

### `?guest=1` residue after login (new finding)

The middleware sends unauthenticated `/dashboard` visits to `?guest=1`. After a
successful login the app is supposed to strip that flag (`dismissGuestQuery()` in
`AuthModal.tsx`). On production it does not, for operator accounts:

| Account | Post-login URL | Flag cleared |
|---|---|---|
| DISPATCHER | `/dashboard?guest=1&commodity=beras&days=7` | **no** (3/3 runs) |
| REGULATOR | `/dashboard?guest=1&commodity=beras&days=7` | **no** (3/3 runs) |
| GUEST | `/dashboard` | yes (3/3 runs) |

The UI is authenticated (badge shows DISPATCHER/REGULATOR, guest banner hidden),
so this is a stale URL flag, not a permission leak. A manual
`history.replaceState` without `guest` sticks (nothing re-adds it), and the
deployed bundle does contain `.delete("guest")`, so the likely cause is a race:
`router.replace()` inside `dismissGuestQuery` is issued as the modal unmounts, and
the analytics query sync (`AnalyticsSection.tsx:271-283`, which only mounts for
operator roles) writes `commodity`/`days` from the pre-replace URL and wins. That
matches the observed `guest=1&commodity=…&days=…` ordering and the guest account
being unaffected. Root-cause confirmation belongs to phase 161.

---

## 4. First-mount fan-out (DISPATCHER, run 08:48)

Total 71 requests / 66 distinct. By host:

| Host | Requests |
|---|---|
| `pre-hub.vercel.app` (app chunks + proxy) | 25 |
| `peta-nadi.onrender.com` (API) | 28 |
| `api.mapbox.com` (styles, fonts, sprites, sessions) | 13 |
| `events.mapbox.com` (telemetry) | 3 |
| `blob:` (worker script) | 2 |

Most-repeated URLs in that window:

| Count | Method | URL |
|---|---|---|
| 3 | POST | `https://events.mapbox.com/events/v2?access_token=[redacted]` |
| 2 | GET | `https://peta-nadi.onrender.com/api/v1/fire/hotspots` |
| 2 | GET | `https://peta-nadi.onrender.com/api/v1/weather/spatial-polygons?min_severity=high&min_precip=50&min_flood=80` |
| 2 | GET | `https://peta-nadi.onrender.com/api/v1/fleet/vehicles?include_geometry=false` |
| 2 | GET | `https://peta-nadi.onrender.com/api/v1/incidents?limit=100` |
| 2 | GET | `blob:https://pre-hub.vercel.app/…` (worker script) |

Repeated backend GETs inside one mount (fire hotspots, weather polygons, fleet,
incidents) match M8-SPEC root cause #3: the read path fires the same sections more
than once, and the count grows when the mount is slow enough for a poll to overlap
(94 requests / 65 distinct during the 94 s REGULATOR mount). Full top-15 lists and
per-host totals are in each artifact's `dashboard.top_urls` /
`dashboard.requests_by_host`.

---

## 5. Warm `/health`

Command (PowerShell, 5 sequential samples):

```powershell
1..5 | ForEach-Object {
  curl.exe -s -o NUL -w "sample=$_ http=%{http_code} dns=%{time_namelookup}s connect=%{time_connect}s ttfb=%{time_starttransfer}s total=%{time_total}s" --max-time 120 https://peta-nadi.onrender.com/health
}
```

Raw output:

```
sample=1 http=200 dns=0.061175s connect=0.079521s ttfb=0.404085s total=0.404212s
sample=2 http=200 dns=0.008466s connect=0.026644s ttfb=0.667834s total=0.668005s
sample=3 http=200 dns=0.009675s connect=0.027358s ttfb=0.279527s total=0.279728s
sample=4 http=200 dns=0.016046s connect=0.034926s ttfb=0.297444s total=0.297500s
sample=5 http=200 dns=0.008706s connect=0.028004s ttfb=0.283904s total=0.284054s
```

All 200, no `-f` needed; median 297 ms, max 668 ms.

**Cold start:** the documented baseline is 60–80 s (M8-SPEC, "Cold first response
p95"). It was **not** re-measured here: a deliberate cold window requires ≥15 min
idle plus a 60–120 s probe and was out of scope for this unit. It is recorded as a
separate measurement and must be taken in phase 165's cold-window gate.
Indirect evidence that cold/boot-starved behaviour is real: `/auth/me` took 70 s
in run 08:48 despite `/health` answering in under a second minutes earlier.

---

## 6. Harness failures during capture (what failed and why)

1. **08:12 run — false login failure** reported `"3 mggu"` for DISPATCHER and
   REGULATOR. The error locator `div.text-red-300` matched an age badge on the
   dashboard behind the open dialog, not the modal alert. A follow-up hang
   (7 min, GUEST) came from `locator.innerText()` waiting on a selector that does
   not exist on the guest dashboard. Fixed by scoping to the modal status block
   (`div.mx-6.mt-4.text-red-300 span`) and guarding with `isVisible()`.
   Supabase had returned **200** in both cases, i.e. the accounts were fine.
2. **08:21 run — invalid session assertion.** The spec reloaded the post-login URL,
   which still carried `?guest=1`; middleware treats that as an allowed guest
   visit, so "survived reload" was measuring nothing. Two operator tests failed on
   that assertion, which is how the `?guest=1` residue (§3) was found. Fixed by
   testing a clean `/dashboard` mount plus a separate reload.
3. **Artifact JSON parse in PowerShell** failed on the empty-string host bucket for
   `blob:` URLs. Harness now labels those `blob`; run 08:48 and later parse cleanly.
4. **No login failures caused by the accounts.** All three are confirmed: Supabase
   `/auth/v1/token` returned 200 with a usable session in every run. No retry loop
   was needed.

No blocker remains. Nothing in this phase wrote business data: the harness only
logs in, reads, reloads, and discards its browser context.

---

## 7. Evidence

Harness and docs:

- `frontend/e2e/m8-baseline.spec.ts` — the spec (env-gated, read-only)
- `frontend/playwright.m8.config.ts` — live-target config, no local webServer
- `frontend/e2e/m8/README.md` — run command + env matrix

Commands (from `frontend/`, credentials from env only):

```powershell
npx playwright test e2e/m8-baseline.spec.ts --config=playwright.m8.config.ts

# Fast 4G variant
$env:M8_THROTTLE='fast4g'
npx playwright test e2e/m8-baseline.spec.ts --config=playwright.m8.config.ts
```

Artifacts in `.planning/phases/160-baseline-audit-state-repair/artifacts/`:

| File | What it is | Result |
|---|---|---|
| `m8-baseline-2026-10-27T08-12-49-131Z.{json,md}` | first attempt, broken error locator | 1 test failed (harness bug) |
| `m8-baseline-2026-10-27T08-13-29-475Z.*` | aborted REGULATOR attempt | harness bug |
| `m8-baseline-2026-10-27T08-21-53-611Z.*` | first DISPATCHER success; invalid reload assertion | failed assertion (design bug) |
| `m8-baseline-2026-10-27T08-22-24-132Z.*` | REGULATOR, same | failed assertion (design bug) |
| `m8-baseline-2026-10-27T08-22-51-968Z.*` | GUEST, passed | pass |
| `m8-baseline-2026-10-27T08-36-14-381Z.*` | unthrottled, pre-split | 3/3 pass |
| `m8-baseline-2026-10-27T08-40-46-501Z.*` | unthrottled, login split added | 3/3 pass |
| `m8-baseline-2026-10-27T08-45-38-331Z.*` | Fast 4G throttle | 3/3 pass |
| `m8-baseline-2026-10-27T08-48-56-659Z.*` | **canonical unthrottled run** | 3/3 pass |

Supporting gates run in this unit:

```bash
cd frontend && npx tsc --noEmit   # exit 0
```

`npm run build` and `pytest backend/tests` were not re-run here (no source under
those paths changed); the parent phase owns them.

---

## 8. Not measured (explicit unknowns)

| Item | Why | Owner |
|---|---|---|
| Cold first response (60–80 s documented) | needs a ≥15 min idle window + long probe | phase 165 |
| Refresh-token TTL | Supabase project setting, not in the JWT | phase 161 |
| Session survival past access-token expiry | needs a short-TTL token or 1 h wait | phase 161 |
| `/health` under a running tick | tick is not instrumented yet | phase 162 |
| Two-user cache isolation | proxy headers not yet changed | phase 164 |
| Throttled login (only first data was throttled) | kept run time bounded | phase 165 |
