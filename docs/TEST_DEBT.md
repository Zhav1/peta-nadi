# Backend test debt

**Status (re-verified 2026-11-11 against a fresh checkout of `main`, no `.env`,
repo venv):** the backend suite collects **773 tests across 71 files** in
`backend/tests`. The 18 files ignored by the CI gate account for **59
failures** in that environment (per-file counts in the table below). The
hermetic gate is **green: 602 passed, 0 failed**.

`.github/workflows/deploy.yml` splits the suite. The **`test` job is the
blocking gate**; the full suite is **non-blocking** (`integration` job with
`continue-on-error: true` and a Redis service container). The reason: the full
suite needs Redis, Supabase and provider network, and still has pre-existing
failures unrelated to any single change — it runs so the debt stays visible
without blocking every deploy on it.

| Job | Scope | Blocking |
|---|---|---|
| `test` | 53 hermetic test files (602 tests) | **yes** |
| `integration` | full suite (773 tests), with a Redis service container | no (`continue-on-error`) |

The hermetic gate was derived empirically: run the suite with no `.env`, take
every file with zero failures. Re-derive it the same way if this drifts.
Re-derived on 2026-11-11: 71 files − 18 ignored = 53 hermetic files, 602
passed / 0 failed with the workflow's exact `--ignore` list.

## Ignored files and why

The list below matches the `--ignore=` flags in the `test` job of
`.github/workflows/deploy.yml` **exactly** (re-checked 2026-11-11 — 18 files,
same set). The workflow is the source of truth; if these two lists ever
diverge, fix this doc first.

Failure counts were re-measured on 2026-11-11 in a fresh no-`.env` checkout
(a CI-like environment except provider network is reachable from this
machine; a fully network-sealed runner may fail a few more).

| File | Fails (2026-11-11) | Previously | Needs |
|---|---|---|---|
| `test_travels_erp.py` | 13 | 13 | Supabase + seeded ERP fixtures |
| `test_firms_keyless_fallback.py` | 9 | 9 | live NASA FIRMS CSV |
| `test_cpu_routing_weather.py` | 5 | 5 | Open-Meteo network |
| `test_vehicles_telemetry.py` | 4 | 5 | Redis AIS + ADS-B network |
| `test_news_tiers.py` | 5 | 5 | Supabase `news_articles` rows |
| `test_pilot_e2e.py` | 3 | 4 | Supabase auth + seeded pilot data |
| `test_fleet_ingest.py` | 2 | 3 | Supabase tenant fixtures |
| `test_commodity_aggregation.py` | 3 | 3 | Supabase `commodity_prices` |
| `test_travel_fuel_guard.py` | 3 | 3 | Supabase travel ledger |
| `test_auth_rbac.py` | 2 | 2 | Supabase JWT/JWKS |
| `test_api_routers.py` | 2 | 2 | Supabase |
| `test_backend_plan_implementation.py` | 2 | 2 | provider network |
| `test_outcomes_decisions.py` | 2 | 2 | Supabase 403 assertions |
| `test_weather_summary_contract.py` | **0** | 1 | BMKG network |
| `test_impact_assessment.py` | 1 | 1 | Supabase spatial fixtures |
| `test_evaluation_router.py` | 1 | 1 | Supabase corridor data |
| `test_precision_fleet_telemetry.py` | 1 | 1 | **live AIS vessel count** — the lean-payload assertion (<250 KB) depends on how many vessels are in the shared Upstash cache at that moment. Fails identically on clean `HEAD`; not a code defect. |
| `test_paths_resolution.py` | 1 | 1 | `PREHUB_DB_PATH` is not read by `config.py` (dead env var) |

### Doc/code mismatch to fix in the workflow

`test_weather_summary_contract.py` now passes (0 failures in the no-`.env`
checkout — the single BMKG-network failure listed here historically has been
fixed), but it is **still in the workflow's `--ignore=` list**. Removing it is
a one-line workflow edit that re-claims its tests for the blocking gate; this
doc is not the blocker. Left as-is here because this change is doc-only.

## Paying it down

1. Remove `test_weather_summary_contract.py` from the `test` job's `--ignore`
   list — it is already green (see mismatch note above).
2. Start with `test_paths_resolution.py` — it is a one-line config fix (either
   wire `PREHUB_DB_PATH` into `Settings` or delete the env var from
   `render.yaml` / `docker-compose.yml`).
3. `test_precision_fleet_telemetry.py` should assert a *ratio*, not an absolute
   byte ceiling, or pin the fleet to a fixture.
4. The Supabase-dependent files need a seeded test project or a Postgres
   service container with the migrations applied — that is the real project.
5. As each file goes green, remove its `--ignore` from the `test` job and update
   the table above.
