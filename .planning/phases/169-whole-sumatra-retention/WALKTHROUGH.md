# WALKTHROUGH — Phase 169: Whole-Sumatra Retention

**Mode:** docs-only. Source and tests untouched. Test counts are those
recorded for `ef0148a`; they were **not re-run** in this pass.

## What was done

1. Read the `ef0148a` diff (11 files, +1285/−128).
2. Enumerated the three coverage losses and checked each in code:
   `_CORRIDOR_SPINE` acting as a filter, `MAX_WEATHER_FEATURES` capping
   the render, and `GRID_KEEP_RADIUS_KM = 60` dropping off-corridor grid
   points.
3. Verified the grid grew to **58 points** and that the docstring at
   `open_meteo_adapter.py:94` records the removal of the
   `GRID_KEEP_RADIUS_KM` mask.
4. Verified the retention policy constants in
   `backend/app/services/retention.py:16-18`:
   `WEATHER_REFRESH_S = 600`, `WEATHER_VALIDITY_HOURS = 6`,
   `WEATHER_STALE_CEILING_HOURS = 24`.
5. Verified the shared snapshot is what collapses the upstream call
   count, and that `FreshnessBadge.tsx` is a new component.
6. Wrote this folder's `PLAN.md` / `WALKTHROUGH.md` / `LEARNINGS.md`.

## Evidence

| Claim | Source |
|---|---|
| Grid is 58 points | `SUMATRA_GRID` in `open_meteo_adapter.py` (+136/−) |
| Radius mask removed | docstring at `open_meteo_adapter.py:94` states Phase 169 removed `GRID_KEEP_RADIUS_KM` |
| Spine = ordering only | `_CORRIDOR_SPINE` no longer filters zones |
| TTLs | `retention.py:16-18` — 600 s / 6 h / 24 h |
| Render cap still 24 | `weather_fusion_service.py:34` |
| Freshness UI is new | `frontend/components/dashboard/FreshnessBadge.tsx` (+98, new file) |
| Backend test present | `backend/tests/test_weather_retention_coverage.py` (324 lines) |
| Browser test present | `frontend/e2e/weather-freshness.spec.ts` (268 lines) |
| Call budget | 16,704 → 8,352 metered Open-Meteo calls/day — *recorded* |
| pytest | 13 passed — *recorded* |
| Playwright | 11 passed — *recorded* |

## Shape of the change

```
before:  23 grid points ──> spine filter ──> 60 km radius ──> cap 24
         └─ per-consumer fetch (16,704 calls/day)
         └─ TTL == poll interval ──> gaps where the layer vanishes

after:   58 grid points ──> spine orders only ──> shared snapshot
         └─ 600 s refresh / 6 h valid / 24 h ceiling (8,352 calls/day)
         └─ freshness badge + capped notice rendered with the data
```

## Deliberately NOT done

- No re-run of pytest or Playwright in this docs pass.
- No code, spec, or test edits; no commit, no push.
- No change to the 24-feature render cap — it was made visible, not
  removed.
