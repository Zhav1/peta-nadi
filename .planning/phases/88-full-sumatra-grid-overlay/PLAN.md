<!-- generated-by: gsd-docs-update (M5 window, Deepseek worker) -->
# Phase 88 / Plan 01 — Full-Sumatra Grid Overlay

**Goal:** end the single-point Medan root cause — Open-Meteo bulk grid of 23 land points
spanning Banda Aceh (5.55N) to Bakauheni (−5.87N), per-hub BMKG parallelism with 30-min cache,
features capped at 24.

**Status:** IMPLEMENTED-LOCALLY-PUSHED in `967dc2b` on `main`
(`feat(weather): full-Sumatra grid overlay (23-pt OM bulk bbox 95-106E/-6..6N, per-hub BMKG, cap 24)`).

## 1. Objective

- **23-point OM bulk grid:** `SUMATRA_GRID` lattice over bbox 95–106E / −6…6N (coarse step
  ~1.5–2°), each center snapped to the nearest `PAN_SUMATRA_GAZETTEER` corridor node so every
  point carries a corridor-meaningful name; sea cells skipped via gazetteer-proximity land
  mask (`GRID_KEEP_RADIUS_KM = 60.0`, defense-in-depth re-check in `_grid_points()`).
- **Per-hub BMKG:** `hub_adm4` registry (only Medan `12.71.01.1001` verified; 8 other hubs
  `None` until adm4 codes confirmed — OM grid covers them meanwhile); `_weather_urls()`
  builds per-known-adm4 URLs; parallel fetch via `asyncio.gather`; 30-min poll interval with
  `_weather_cache` served between polls; `weather_list` (+ legacy `weather` = first hub for
  backward compat).
- **Cap 24:** fused features capped at 24 (severity + magnitude + corridor-proximity priority,
  ~30KB max) so the whole-island overlay stays payload-bounded.

## 2. Scope

### In scope (committed in `967dc2b`, 4 files, +398/−111)

| File | Lines | Change |
|---|---|---|
| `backend/app/adapters/open_meteo_adapter.py` | +288/− | `SUMATRA_GRID` (23 entries), `GRID_KEEP_RADIUS_KM=60.0`, `_haversine_km`, `_grid_points()` land mask; bulk per-point fetch + Medan-backward-compat shape (`predictions`/`latitude`/`longitude` from Medan point when legacy callers ask) |
| `backend/app/adapters/bmkg_adapter.py` | +74 | `hub_adm4` registry, `_weather_urls()`, parallel `_get()` gather, `_weather_cache` + 30-min interval, `weather_list` + `weather` backward-compat |
| `backend/app/services/weather_fusion_service.py` | +143/− | Per-point OM×BMKG fusion over the grid; cap-24 prioritization; docstring coverage note |
| `backend/app/routers/routing_router.py` | +4 | Endpoint docstring: full-Sumatra coverage note (23 land points, cap 24, ~30KB max) |

### Out of scope

- Disruption threshold (Phase 87, already in-tree below this commit).
- Blue-zone logistics enrichment (Phase 89).
- BMKG adm4 confirmation for the 8 `None` hubs (needs verified village codes — operator/data task, not code).
- New grid/fusion tests — none added this window.

## 3. Decisions (as evidenced in-tree)

- **Gazetteer-snapped lattice, not raw cells:** grid entries are pre-snapped to gazetteer
  nodes (0 km by construction) with `_grid_points()` as re-check — sea points can never enter
  even if the gazetteer import fails (curated list trusted as fallback).
- **Medan backward-compat preserved twice:** `data["weather"]` = first known hub
  (`bmkg_adapter.py`) and legacy single-point callers still get the Medan point
  (`open_meteo_adapter.py:175-178`, `:286-292`) — old consumers never break during migration.
- **Unknown adm4 → skip, OM covers:** hubs without verified adm4 are skipped for BMKG (not
  guessed) while the OM grid covers them — no fabricated BMKG attribution.
- **Cap 24 by priority, not truncation:** severity + magnitude + corridor proximity ordering
  keeps the most decision-relevant features inside the ~30KB budget.

## 4. Walkthrough (what was implemented this window)

1. Added the 23-point `SUMATRA_GRID` + haversine + gazetteer land-mask helpers.
2. Converted OM fetch to per-grid-point bulk with Medan-compat legacy shape.
3. Added BMKG `hub_adm4` registry + parallel per-adm4 fetch + 30-min cache + `weather_list`.
4. Fused per-point OM×BMKG in `weather_fusion_service.py` with cap-24 prioritization.
5. Documented coverage + cap on the `/weather/spatial-polygons` endpoint docstring.

## 5. Verification gates

| Gate | Command / probe | Expected | Status this window |
|---|---|---|---|
| Grid land-only | unit probe `_grid_points()` | 23 kept, 0 sea cells | NOT run — gap, see LEARNINGS §2 |
| Prod spread | `GET /api/v1/weather/spatial-polygons` | features spanning Aceh→Lampung, not Medan-only | NOT probed — needs prod + post-cache wait |
| BMKG compat | `data["weather"]` present when `weather_list` non-empty | Medan payload as first hub | NOT probed — same |
| Payload bound | response size | ≤ ~30KB / ≤ 24 features | NOT probed — same |
| tsc/pytest | `npx tsc --noEmit`, backend suite | green | NOT re-run after `967dc2b` |
