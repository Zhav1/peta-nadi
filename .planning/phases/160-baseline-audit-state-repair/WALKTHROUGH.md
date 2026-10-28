# WALKTHROUGH — Phase 160: Baseline, Audit, State Repair

**Window:** 2026-10-27 (implementation, 08:12–15:52 UTC+7 span) · 2026-10-28 (this
docs pass)
**Branch:** `m8-operational-truth` (see §6 — the branch named in the audit header is
not the branch that holds the commits)
**Commits:** `51b3903` (code + tests + probe + specs), `61c0ae5` (audit + probe
reasoning + M8 progress)
**Mode:** measure and record; no fix for any audited finding

---

## 1. Why this phase existed

M8's SLO table was written against numbers nobody had measured on the deployed stack.
Without a pre-change baseline, every later phase (161–165) could claim an improvement
it did not produce. The phase therefore ran in this order:

1. Register M8 and scaffold the plan → `2eeb1ca` (15:06 +0700 / 08:06 UTC).
2. Capture production baseline with the three test accounts (08:12–08:52 UTC).
3. Audit the backend read path statically against the same tree.
4. Fix the keep-alive probe so the soak has a data source.
5. Reconcile `.planning` state and commit the evidence.

## 2. Chronological work

| Time (UTC) | Step | Result |
|---|---|---|
| 08:06 | `2eeb1ca` — register M8, rewrite `SPEC.md`, scaffold `phases/160/PLAN.md` | 8 planning files, +589/−43 |
| 08:12 | First harness run | **failed** — error locator matched a dashboard age badge, not the modal alert (`"3 mggu"`) |
| 08:13 | Second attempt (REGULATOR) | aborted on the same locator |
| 08:21–08:22 | Locator fixed; DISPATCHER + REGULATOR | **failed assertion** — the reload check re-used `?guest=1`, which middleware treats as an allowed guest visit. This is how the `?guest=1` residue was found |
| 08:22 | GUEST run | passed |
| 08:36 | Unthrottled, login split added | 3/3 pass (first run with Supabase `/auth/v1/token` timed separately from `/auth/me`) |
| 08:40 | Unthrottled | 3/3 pass — the run quoted in `PROGRESS.md` §160 |
| 08:45 | Fast 4G throttle (150 ms RTT, 1.6/0.75 Mbps) | 3/3 pass |
| 08:48 | **Canonical unthrottled run** | 3/3 pass |
| before 08:51 (authoring window) | `BACKEND-AUDIT.md` written from AST extraction + targeted reads, cross-checked against the runtime OpenAPI doc | 19 routers / 81 decorators / 24 auth-dependent |
| before 08:51 (authoring window) | `keep-alive.yml` rewritten; YAML + both `run:` scripts validated, executed against a local fake backend | 775 s worst case under a 900 s ceiling |
| 08:51 | `51b3903` | 13 files, +2297/−275 |
| 08:52 | `61c0ae5` | 3 docs, +551 |

Timestamps before 08:51 are the baseline artifacts' own UTC clocks; commit times are
`+0700` and have been converted.

## 3. Exact commands and results

Baseline capture (from `frontend/`, credentials supplied only via env):

```powershell
npx playwright test e2e/m8-baseline.spec.ts --config=playwright.m8.config.ts

# Fast 4G variant
$env:M8_THROTTLE='fast4g'
npx playwright test e2e/m8-baseline.spec.ts --config=playwright.m8.config.ts
```

Warm `/health`, 5 sequential samples (PowerShell):

```powershell
1..5 | ForEach-Object {
  curl.exe -s -o NUL -w "sample=$_ http=%{http_code} dns=%{time_namelookup}s connect=%{time_connect}s ttfb=%{time_starttransfer}s total=%{time_total}s" --max-time 120 https://peta-nadi.onrender.com/health
}
```

```text
sample=1 http=200 total=0.404212s
sample=2 http=200 total=0.668005s
sample=3 http=200 total=0.279728s
sample=4 http=200 total=0.297500s
sample=5 http=200 total=0.284054s
```

(dns/connect/ttfb columns trimmed here; the raw block is in `BASELINE.md` §5.)

→ median **297 ms**, max **668 ms** (SLO p95 < 500 ms: at the edge, not clearly passing).

Workflow validation:

```bash
python -c "import yaml,sys; yaml.safe_load(open('.github/workflows/keep-alive.yml'))"  # exit 0
bash -n <each extracted run: script>                                                 # exit 0
```

Frontend gate:

```bash
cd frontend && npx tsc --noEmit   # exit 0
```

Re-run in this docs pass (2026-10-28):

```powershell
backend\.venv\Scripts\python.exe -m pytest tests\test_weather_summary_contract.py -q
# 7 passed, 3 warnings in 1.53s
```

## 4. Audit counts (and the 23/51 dispute)

Source: `BACKEND-AUDIT.md` §1–§1.2, base commit `2eeb1ca`.

| Metric | Count |
|---|---|
| Router modules (`app/routers/*.py`, no `__init__`) | 19 |
| Route decorators in routers | **81** |
| `@app.*` routes in `main.py` | 1 (`GET /`) |
| Unique handlers | 73 router + 1 root = 74 |
| Registered `method + path` entries | 89 (7 hidden aliases from the second `include_router` pass) |
| Auth-dependent handlers | **24** = 4 `get_current_user` + 20 `get_optional_user` |
| Unauthenticated handlers | **49** (50 with root) |
| WebSocket endpoints | 1 (`WS /ws/crisis/{crisis_id}`) |

The spec and the phase brief said **23 auth-dependent / 51 unauthenticated**. The audit
found 24/49. The one-route offset is `GET /api/v1/auth/session`
(`auth_router.py:76`), which declares `Depends(get_optional_user)` but is documented
as "never fails with 401", i.e. guest-intentional. Conclusion recorded in §1.1:
**23/51 is defensible only as a stated classification convention, never as a
dependency count.** No other offset exists (`require_roles` is unused, no
router-level `dependencies=[...]`).

Current tree drift (measured 2026-10-28): 21 routers / 87 decorators / 77 handlers /
27 auth-dependent (26 direct `Depends` + 1 `bootstrap_user` wrapper) / 49 unauth router
handlers (50 with the root `GET /`). See `PLAN.md` §Final status for the per-module
attribution.

## 5. Baseline metrics

Canonical unthrottled run — `artifacts/m8-baseline-2026-10-27T08-48-56-659Z.md`:

| Account | Login (Supabase + `/auth/me`) | First data | Requests | Token lifetime | Role / company |
|---|---|---|---|---|---|
| DISPATCHER | 70 566 ms (1 295 + 70 010) | 12 105 ms | 71 (66 distinct) | 3600 s | DISPATCHER / `pos_logistik` |
| REGULATOR | 5 061 ms (1 840 + 4 220) | 93 991 ms | 94 (65 distinct) | 3600 s | REGULATOR / `bapanas` |
| GUEST | 11 695 ms (890 + 11 115) | 10 592 ms | 50 (47 distinct) | 3600 s | GUEST / `demo_sandbox` |

Fast 4G run — `artifacts/m8-baseline-2026-10-27T08-45-38-331Z.md`:

| Account | Login | First data | Requests |
|---|---|---|---|
| DISPATCHER | 10 708 ms | 15 220 ms | 72 (66) |
| REGULATOR | 7 246 ms | 26 388 ms | 79 (70) |
| GUEST | 45 220 ms | 3 198 ms | 50 (47) |

Aggregates over n=9 unthrottled runs (`BASELINE.md` §2): login median **7 771 ms**,
max **70 566 ms**; first data median **12 105 ms**, max **93 991 ms**. Throttling did
not make first data meaningfully worse — the backend, not the last mile, is the
bottleneck.

`?guest=1` residue (new finding, `BASELINE.md` §3): after a successful operator login
the URL keeps `?guest=1&commodity=beras&days=7` in **3/3 runs** for DISPATCHER and
REGULATOR; GUEST is clear in 3/3. UI is authenticated (badge correct), so it is a
stale URL flag, not a permission leak. Root cause was left to phase 161.

**Citation correction:** `PROGRESS.md` §160 attributes the table
(7 771 / 73 812 / 91 …) to `m8-baseline-2026-10-27T08-45-38-331Z.md`. Those numbers
belong to `…T08-40-46-501Z.md`; the `08-45-38` artifact is the Fast 4G run above.

### Not measured (recorded as unknown, not estimated)

| Item | Reason | Owner |
|---|---|---|
| Cold first response | needs ≥15 min idle + a long probe; documented baseline 60–80 s | 165 |
| Refresh-token TTL | Supabase project setting, absent from the JWT | 161 |
| Session survival past token expiry | needs a short-TTL token or a 1 h wait | 161 |
| Throttled **login** | only first data was throttled | 165 |
| `/health` under a running tick | tick did not exist yet | 162 |

## 6. Keep-alive timeout math (what was broken)

Old workflow, per step `--max-time 90 --retry 2 --retry-delay 10` (= **3** attempts):

| Old step | Worst case | Cumulative |
|---|---|---|
| 1 · `GET /health` | 290 s | 290 s |
| 2 · `sleep 20` + `GET /health` | 310 s | **600 s** |
| 3 · `GET /api/v1/health/sources` | 290 s | 890 s |
| 4 · Supabase REST (`--max-time 20`) | 20 s | **910 s** |

Job ceiling was `timeout-minutes: 5` = **300 s**. So step 1 alone consumed 290 s and
the runner killed the job 10 s into step 2 — the Supabase REST probe, the only one
that refreshes the free database's inactivity timer, **never ran**. The job was green
when warm and cancelled when cold: the inverse of useful.

Second defect: `curl -s -o /dev/null -w '%{http_code}'` without `-f` /
`--fail-with-body` exits **0** on 4xx/5xx. A 502 cold-start page printed a warning and
the step stayed green. Exit codes were also discarded, so timeout (28), DNS failure
and `"000"` were indistinguishable from a real response.

New budget:

| Probe | Endpoint | `--max-time` | Worst case |
|---|---|---|---|
| 1 | `GET /health` (cold wake) | 120 s | 2 × 120 + 10 = 250 s |
| — | `sleep 15` | — | 15 s |
| 2 | `GET /health` (warm confirm) | 120 s | 250 s |
| 3 | `GET /api/v1/health/sources` (DB probe) | 90 s | 190 s |
| 4 | Supabase REST `data_sources?select=name&limit=1` | 30 s | 70 s |
| | **total** | | **775 s (12 m 55 s)** |

Ceiling raised to `timeout-minutes: 15` (900 s) → ~125 s headroom for runner startup,
summary and artifact upload. `--retry 1` (2 attempts) everywhere,
`concurrency: {group: keep-alive, cancel-in-progress: false}`,
`permissions: contents: read`, JSON Lines artifact
(`soak/keepalive-<run_id>.json`) with `retention-days: 90`.

Route correction: the brief said `/health/sources`; no such route exists
(`health.py:185`). The probe uses `/api/v1/health/sources`.

## 7. Found vs fixed

| Finding | Found | Fixed in 160? | Owner |
|---|---|---|---|
| F1 optional auth fails open (20 routes → GUEST 200) | yes | **no** | 161 |
| F2 anonymous `DISPATCHER` token minting | yes | **no** | 161 |
| F3 unauthenticated writes / LLM execution | yes | **no** | 161 / 162 |
| F4 sync PostgREST on the read hot path (14 sites) | yes | **no** | 164 |
| F5 weather fusion has no cache | yes | **partially** — `/weather/summary` added with a Redis cache; the fusion path itself is still uncached | 163 |
| F6 cross-tenant query-param / ownership gaps | yes | **no** | 161 / 163 |
| F7 restart loses self-serve fleet (SQLite only) | yes | **no** | 163 |
| F8 news cache self-invalidates (`last_fetched_at = 0.0`) | yes | **no** | 164 |
| F9 `get_write_client()` per call | yes | **no** | 164 |
| F10 JWKS cold-path blocking | yes | **no** | 164 |
| F11 per-request evaluation file/calibration work | yes | **no** | 163 |
| F12 route/alias sprawl, no `Cache-Control` on JSON | yes | **no** | 164 |
| F13 sync Redis inside `async def` | yes | **no** | 164 |
| Keep-alive probe structurally cannot finish | yes | **yes** (`keep-alive.yml`) | 160 |
| `?guest=1` residue after operator login | **new** | **no** | 161 |

What phase 160 shipped besides the docs: the world-truth hazard counters
(`DashboardClient.tsx`, `TopNavTelemetry.tsx`, `lib/api.ts`, `lib/types.ts`) with
`degraded → "—"` and verified-empty `→ 0`, its contract test, and two Playwright
specs. That work is why `51b3903` is not a docs-only commit.

## 8. What a future window should not repeat

1. Do not cite `BACKEND-AUDIT.md`'s 81/24 as current. The tree is 87/26+1 (2026-10-28)
   and will keep moving while M9 lands.
2. Do not run the baseline harness against a `?guest=1` URL to test session survival —
   middleware allows that path, so the assertion measures nothing.
3. Do not treat the four baseline pytest failures as regressions (two travel-fuel
   cases were order/state-coupled and pass later).
4. Do not add a probe without `--fail-with-body` and an artifact; a green step that
   discards its status code is not evidence.
5. Do not assume `artifacts/` is untracked — `8a4c7c2` committed it.

See `LEARNINGS.md` for constraints, gotchas and open concerns.
