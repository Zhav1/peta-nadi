# M9 R1 — production rollout record (2026-10-28)

Branch: `m9-operational-truth` → `main`
Rollback tag: `pre-m9-r1` = `b1ebf7b` (pushed to origin)
Merge commit: `bfa3337` (push `b1ebf7b..bfa3337`)

## Backend gate
`pytest tests/ -q --no-header` → **4 failed, 516 passed** in 335.51s.
All four are the documented baseline (root-cause classes, not regressions):
- `test_impact_assessment.py::test_disruption_impact_assessment_spatial_filtering` — latency 494.8 ms vs 250 ms budget (host speed)
- `test_travel_fuel_guard.py::test_patch_120L_…` / `test_patch_1L_…` — `starlette.status.HTTP_422_UNPROCESSABLE_CONTENT` missing in installed Starlette
- `test_cpu_routing_weather.py::test_cpu_routing_service_flags_seed_fallback_when_tomtom_unavailable` — local Redis holds live TomTom keys
Raw log: `r1-pytest.txt`

## Deploy
- Backend: https://peta-nadi.onrender.com (Render, Docker `backend/Dockerfile`, healthCheckPath `/health`)
- Frontend: https://pre-hub.vercel.app (Vercel Git integration; `NEXT_PUBLIC_API_URL=https://peta-nadi.onrender.com`)
- New build detected: frontend ETag `"2421f8f…"` → `"7693bd5…"` (2 min after push); backend `fire/hotspots` gained the `count`/`status` envelope (40 s after push).

## Smoke
| # | Endpoint | HTTP | Result |
|---|---|---|---|
| 1 | `/health` | 200 | `{"status":"ok","version":"0.1.0","environment":"development",…}` |
| 2 | `/api/v1/weather/summary` | 200 | `cuaca{count:0,status:"empty"}`, `waspada{count:22,status:"ok"}` |
| 3 | `/api/v1/fire/hotspots` | 200 | `count:0,total:0,capped:false,status:"empty",source:"nasa-firms-api"` |
| 4 | `/api/v1/geocode/search?q=pekanbaru` | 200 | `count:10`, offline gazetteer, first result `province:"Riau"` |
| 5 | `https://pre-hub.vercel.app` | 200 | title `PreHub: Sistem Peringatan Dini…`, app shell present |

No rollback performed.

## Observations / follow-ups
1. `fire/hotspots` resolved via `nasa-firms-api` (MAP_KEY present in Render), so the keyless CSV path was **not** exercised in production. Contract is correct either way; to prove the CSV path, unset `NASA_FIRMS_MAP_KEY` and re-probe.
2. `/api/v1/dashboard/bootstrap` returns `stale:true, sections:{}, reason:"live_build_timeout"` on repeated calls. Expected while the snapshot writer is not running: M8 prereqs still pending in the Render dashboard (`INTERNAL_TICK_TOKEN`, `INPROCESS_BATCH_POLLERS=false`, `TICK_MAX_JOBS`, `TICK_BUDGET_SECONDS`) plus the cron-job.org `POST /internal/tick` every 5 min. Frontend degrades gracefully (lazy per-section fetch).
3. `/health` reports `environment:"development"` although `render.yaml` sets `ENVIRONMENT=production`. Only affects logging/serialization today, but the Render service appears not synced to the blueprint — worth fixing in the dashboard.
4. Migrations `023_scheduler_jobs` / `024_dashboard_snapshots` were already applied to production Supabase (versions 20261027111905 / 20261027111919).
