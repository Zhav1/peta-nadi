# LEARNINGS — Phase 160: Baseline, Audit, State Repair

**Window:** 2026-10-27 (phase) · 2026-10-28 (this docs pass)
**Rule applied:** every claim below is tied to a file, command output, or commit. Anything
not provable is marked **UNVERIFIED** with the reason.

---

## 1. Verified lessons

1. **The planning state had drifted two milestones behind the code.**
   `2eeb1ca` (the commit this phase landed as) rewrote `PROJECT.md` from
   `**Active Milestone:** M5 - High-Fidelity Intelligence & Isolated Operations Engine`
   and `M5 …: Active (Phases 83 to 86)`, while `STATE.md` in the same pre-commit tree
   already said `milestone: M7` / `current_phase: 159` / `status: complete`. M6 and M7
   were **missing entirely** from `PROJECT.md`'s milestone list. Neither file was wrong
   on its own; they described different moments. A milestone boundary needs one
   authoritative file, and the other must be regenerated from it — not hand-edited.
2. **A route count is not a constant.** `BACKEND-AUDIT.md` pins 81 decorators / 24
   auth-dependent to `2eeb1ca`. The same working tree was 82/25 within the hour
   (`/weather/summary`), and is **87 decorators / 77 handlers / 26 direct auth deps + 1
   wrapper** on 2026-10-28. Any gate that quotes a count must state the commit it was
   measured on.
3. **The auth-dependent split needed a convention, not a recount.** 24/49 is the
   dependency count; 23/51 is only correct if `GET /api/v1/auth/session` is classed
   "guest-intentional". Writing that down (§1.1 of the audit) was the fix; silently
   rounding to the spec's number would have hidden a route.
4. **The cookie/token mismatch was real, not theoretical.** All three accounts carried
   `exp − iat = 3600 s` while `authContext.tsx` wrote a 48 h cookie
   (`TOKEN_COOKIE_MAX_AGE_SECONDS = 172800` at the time). That is the measured
   confirmation of M8 root cause #2.
5. **Login latency is backend-bound.** In the canonical run, Supabase
   `/auth/v1/token` answered in 1 295 ms while the backend `/auth/me` leg took
   **70 010 ms** for DISPATCHER. Throttling first data to Fast 4G changed little.
   Optimising the network path would have been the wrong fix.
6. **A timeout budget must be checked against the ceiling, not per step.** The old
   keep-alive could not finish: see §3.1.
7. **`get_optional_user` was the real auth boundary.** 20 of the 24 auth-dependent
   routes used it, and all 20 downgraded an invalid token to GUEST 200. Only 4 routes
   (`get_current_user`) actually failed closed. Counting `Depends(get_current_user)`
   as "the auth surface" understates the exposure by 5×.

## 2. Constraints observed

1. **Render free tier:** one instance, ~0.1 CPU, sleeps after 15 min idle. Documented
   cold first response **60–80 s** (`M8-SPEC.md` §SLO); after phase 162 the runbook
   documents **20–60 s** cold boot. Neither was re-measured in phase 160 — the 60–80 s
   figure is a documented baseline, not a phase-160 measurement.
2. **Baseline capture needs credentials that must never be committed.** Only
   `M8_<ROLE>_EMAIL` / `M8_<ROLE>_PASSWORD` env vars; artifacts store token length and
   decoded claims, never the token.
3. **Playwright against production must be read-only.** The baseline spec only logs in,
   reads, reloads and discards its context. Any spec that writes business data is out
   of scope for a measurement phase.
4. **`?guest=1` is an allowed visit** in `frontend/middleware.ts`. Any test that reuses
   the post-login URL to prove "the session survived" is testing the guest bypass.
5. **The audit is static + OpenAPI cross-check only.** RLS policies, pool size,
   uvicorn worker count, and whether `REDIS_URL` points at Upstash remain runtime
   unknowns (`BACKEND-AUDIT.md` §7).

## 3. Gotchas — do not repeat

### 3.1 The keep-alive job was structurally impossible

Every step used `--max-time 90 --retry 2 --retry-delay 10` = 3 attempts = 290 s per
probe. Two `/health` probes plus a 20 s sleep = **600 s**, against a
`timeout-minutes: 5` (**300 s**) ceiling. On exactly the event the workflow existed
for — a cold instance — the runner killed the job during the second sleep, before the
Supabase REST probe that refreshes the free database's inactivity timer. The job was
green when warm and cancelled when cold.

Lesson: sum the *worst case* (`attempts × max-time + retry delays`) and compare it to
the job ceiling before shipping. The new budget is 775 s under 900 s
(`KEEPALIVE-FIX.md`).

### 3.2 `curl` without `-f` proves nothing

`curl -s -o /dev/null -w '%{http_code}'` exits **0** on 4xx/5xx. A 502 cold-start page
printed a human-readable warning and the step stayed green. Use
`--fail-with-body` (exit 22 on HTTP ≥ 400) and record `curl_exit` — 22 and 28 mean
different things (backend error vs still booting vs hung).

### 3.3 The probe route in the brief did not exist

The brief said `/health/sources`; the router mounts `/api/v1/health/sources`
(`health.py:185`) and `/health` at the root (`health.py:173`). Shipping the brief
literally would have 404-ed every run and looked like an outage.

### 3.4 A run artifact is only untracked if nobody commits it

`PROGRESS.md` records `artifacts/` and `BASELINE.md` as "untracked by design". They are
**tracked**: `git log --diff-filter=A` puts them in `8a4c7c2` (a later bulk M9 docs
commit). If artifacts must stay out of git, they need an ignore rule — a convention in
a markdown file does not survive a `git add -A`.

### 3.5 Citations drift even inside one progress file

`PROGRESS.md` §160 attributes a metrics table to
`artifacts/m8-baseline-2026-10-27T08-45-38-331Z.md`. Those numbers (7 771 / 73 812 / 91
for DISPATCHER) are from `…T08-40-46-501Z.md`; the `08-45-38` file is the Fast 4G run
(10 708 / 15 220 / 72). Anyone comparing phases against "the baseline" must open the
artifact, not the summary table.

### 3.6 The named branch did not hold the work

`BACKEND-AUDIT.md`'s header says `Branch: m8-fast-durable`. That branch is still at
`2eeb1ca` and contains neither `51b3903` nor `61c0ae5`. Both are on
`m8-operational-truth` and `main`; `m8-operational-truth` stops at `61c0ae5`.
A branch name in a document is not evidence of lineage — use
`git branch --contains <sha>`.

### 3.7 A working-tree import failure invalidates a measurement window

During the audit, `weather_fusion_service.py` briefly failed to import
`get_fused_spatial_weather` because another actor was editing it. Any runtime number
taken in that window is invalid. Re-check `import app.main` before trusting a capture.

## 4. Open concerns carried forward

| # | Concern | Evidence | Owner |
|---|---|---|---|
| 1 | Optional auth fails open on 20 routes | `BACKEND-AUDIT.md` F1 | 161 |
| 2 | Anonymous `DISPATCHER` mint for any tenant | F2; `auth_router.py:84-115` | 161 |
| 3 | Fallback JWT signing secret when `SUPABASE_JWT_SECRET` is unset | `supabase_auth.py:127-129`, `config.py:20` | 164/165 |
| 4 | Cross-tenant `?company_id=` and missing ownership checks | F6 | 161/163 |
| 5 | Self-serve fleet lives only in SQLite; `init_db()` runs at import | F7; `local_storage.py:395` | 163 |
| 6 | News cache self-invalidates and re-ingests continuously | F8; `news_router.py:254` | 164 |
| 7 | `?guest=1` residue after operator login | `BASELINE.md` §3, 3/3 runs | 161 |
| 8 | 7-day cookie is capped by the Supabase refresh-token TTL | open item #1 | 161/165 |
| 9 | Four baseline pytest failures still red | `PROGRESS.md` §160 | 165 must state them |

## 5. Not verified (explicit)

| Claim | Status | Reason |
|---|---|---|
| Cold first response (60–80 s) | **UNVERIFIED this phase** | needs ≥15 min idle + a long probe; not run |
| Refresh-token TTL | **UNVERIFIED** | Supabase project setting, not in the JWT |
| Session survival past 1 h | **UNVERIFIED** | needs a short-TTL token or a 1 h wait |
| `npm run build` 0 errors / 4 Playwright truth cases | **reported, not reproduced** | no artifact kept; build writes `.next`, truth spec needs a live server |
| `pytest backend/tests` → "17 passed" phase selection | **UNVERIFIED selection** | the selection was not recorded; only `test_weather_summary_contract.py` (7 cases) is identifiable, and it passes (7 passed, 1.53 s on 2026-10-28) |
| `keep-alive.yml` end-to-end via `workflow_dispatch` | **UNVERIFIED** | never dispatched; validated statically + both shell steps run against fake backends |
| Live RLS / pool size / worker count / Redis durability | **UNVERIFIED** | runtime unknowns, `BACKEND-AUDIT.md` §7 |
