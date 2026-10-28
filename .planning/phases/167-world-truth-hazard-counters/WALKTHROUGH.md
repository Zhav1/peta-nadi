# WALKTHROUGH — Phase 167: World-Truth Hazard Counters

**Mode:** docs-only. Source, specs, and tests untouched. Test results
below are those recorded for `51b3903`; they were **not re-run** in this
pass, so they are marked *recorded*, not *verified*.

## What was done

1. Read the `51b3903` diff (13 files, +2297/−275).
2. Traced the old count path: `advisoryFeatures = showWeatherAdvisory ?
   ... : []` in `DashboardClient.tsx` → `advisoryFeatures.length` in
   `TopNavTelemetry.tsx`. Both the toggle and the backend
   `MAX_WEATHER_FEATURES = 24` cap sat between the world and the badge.
3. Traced the new path: `/api/v1/weather/summary` →
   `getWeatherSummary()` → `WeatherSummary` → `TopNavTelemetry`.
4. Confirmed the tri-state (`ok` | `stale` | `degraded` | `empty`) is
   emitted server-side in `routing_router.py`, with `cuaca` at
   high/critical and `waspada` at medium.
5. Wrote this folder's `PLAN.md` / `WALKTHROUGH.md` / `LEARNINGS.md`.

## Evidence

| Claim | Source |
|---|---|
| Counts no longer toggle-gated | `advisoryFeatures` is consumed by layer drawing only in `DashboardClient.tsx` |
| Cap no longer truncates counts | summary totals come from the uncapped inventory; `MAX_WEATHER_FEATURES = 24` (`weather_fusion_service.py:34`) guards polygons |
| Tri-state exists | `"ok"` / `"empty"` / `"stale"` / `"degraded"` branches in `routing_router.py` |
| Severity split | `cuaca` → high/critical, `waspada` → medium |
| Contract test present | `backend/tests/test_weather_summary_contract.py` (328 lines) |
| Browser test present | `frontend/e2e/hazard-counter-truth.spec.ts` (182 lines) |
| Contract pytest | passed — *recorded* at build time |
| `tsc --noEmit` | exit 0 — *recorded* |
| Production build | exit 0 — *recorded* |
| Playwright | 4 passed — *recorded* |

## Shape of the change

```
before:  world ──> MAX_WEATHER_FEATURES(24) ──> advisoryFeatures
              ──> showWeatherAdvisory ? advisoryFeatures : []
              ──> .length ──> badge

after:   world ──> uncapped inventory ──> /weather/summary ──> badge
              └─> MAX_WEATHER_FEATURES(24) ──> polygons ──> map
```

## Deliberately NOT done

- No re-run of pytest / tsc / build / Playwright in this docs pass.
- No code, spec, or test edits; no commit, no push.
- No attempt to reconcile the `m8-160` label in the commit subject with
  the `167` folder number — the folder number is the planning identity.
