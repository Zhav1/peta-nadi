<!-- generated-by: gsd-docs-update (M5 window, Deepseek worker) -->
# Phase 88: Full-Sumatra Grid Overlay — Learnings

**Scope:** durable lessons from `967dc2b` (4 files, +398/−111). Grounded in committed hunks /
file reads. No assumptions.

---

## 1. Fixes tried (what worked, with evidence)

### 1.1 Single-point Medan: gazetteer-snapped bulk grid

- **Issue (Medan-only root cause):** fusion resolved to one point — OM fell back to
  `medan = … or out_points[0]` and BMKG only had Medan's verified adm4, so the overlay was a
  Medan dot masquerading as Sumatra coverage.
- **Fix:** 23-point lattice over 95–106E/−6…6N, each center pre-snapped to the nearest
  `PAN_SUMATRA_GAZETTEER` node (corridor-meaningful names Banda Aceh→Bakauheni) with a
  60 km gazetteer-proximity land mask (`open_meteo_adapter.py`: `SUMATRA_GRID`,
  `GRID_KEEP_RADIUS_KM`, `_grid_points()`).
- **Lesson:** the land mask must be proximity-to-known-nodes, not a bbox test — a raw bbox
  over Sumatra includes Malacca Strait / Indian Ocean cells; snapping to gazetteer nodes
  gives sea-exclusion AND human names in one move.

### 1.2 BMKG per-hub without fabricating adm4 codes

- **Issue:** BMKG public forecast needs village-level adm4; only Medan's
  (`12.71.01.1001`) is verified — guessing other hubs' codes would fabricate attribution.
- **Fix:** `hub_adm4` registry with 8 hubs explicitly `None` + `_weather_urls()` skipping
  unknowns; OM grid covers them meanwhile; parallel `asyncio.gather` + 30-min cache keeps
  the added HTTP fan-out bounded (`bmkg_adapter.py`).
- **Lesson:** unknown-code hubs must be explicit `None` with a named cover (OM grid), never
  omitted silently — the registry doubles as the TODO list for adm4 confirmation.

### 1.3 Backward-compat during migration

- **Evidence:** `data["weather"]` = first hub payload preserved; legacy OM callers still get
  the Medan-point shape (`open_meteo_adapter.py:175-178`, `:286-292`).
- **Lesson:** grid migration keeps the old single-point shape alive at both layers until
  callers are proven migrated — deleting it in the same commit would break the Phase 87
  threshold path that reads the legacy fields.

---

## 2. Concerns (open, evidenced)

| # | Concern | Evidence |
|---|---|---|
| 1 | **No grid tests.** `_grid_points()` land-mask (23 kept / sea dropped) and cap-24 priority have no pinned tests. | `967dc2b` stat: 0 test files touched |
| 2 | **Legacy Medan fallbacks still present** (`or out_points[0]`, `grid["points"][0]`). Safe today (non-empty curated list) but a future empty-grid regression would silently re-Medan-ify. | `open_meteo_adapter.py:175-178`, `:286-292` |
| 3 | **8 BMKG hubs uncovered** until adm4 codes confirmed — those provinces are OM-only (projection semantics, not BMKG warning). | `hub_adm4` 8× `None`; in-code comment |
| 4 | **tsc/pytest not re-run** after `967dc2b` (fusion signature area changed). | No run record this window |
| 5 | **Edge-cache lag on verify** — same as Phase 87 (proxy `s-maxage=60 + SWR 120s`; ~10 min observed lag per orchestrator context). | `route.ts:61-63` + orchestrator note (unmeasured — admit-uncertainty) |

---

## 3. Constraints / conditions / context / env (active, user-given)

| Item | Value |
|---|---|
| Orchestration | Muse Spark orchestrator; Deepseek workers only |
| Deploy target | Prod-only verification (live BMKG/OM bulk data required) |
| Admit-uncertainty | Unverified gates marked NOT-run, never claimed green |
| Schema | 7 keep-both merge `9ea107e` |
| Edge-cache lag | Allow stale reads post-push before re-probing |
| Whole-Sumatra grid requirement | Satisfied in-code by this phase (23-pt grid + cap 24); verification pending |
| Logistics enrichment | Phase 89 owns blue-zone enrichment (builds on this grid) |
| No commit/push in this docs task | Files only; separate step if asked |

## 4. Issues found (carried)

- Single-point Medan → fixed in-code here (verify island spread on prod map).
- Medium clutter → Phase 87 gate applies per-grid-point; confirm combined behavior (grid × threshold) on prod.
- Dots too small → Phase 87 `radius_km` unaffected by grid change (separate path).
- Sim fallback → OM-grid points are projection-grade; BMKG-covered hubs keep warning semantics — confirm label split per feature on prod.
- Popup thin → owned by Phase 89.

## 5. Re-prove recipe (next window — warm `/health` first, allow edge-cache lag)

1. `GET /api/v1/weather/spatial-polygons` → features from Aceh to Lampung (spot-check Banda Aceh + Bakauheni names present).
2. Zero sea-cell features (all feature coords within ~60 km of a gazetteer node).
3. Feature count ≤ 24; response ~30KB or less.
4. Medan-legacy shape intact: single-point callers still resolve.
5. Add `_grid_points` land-mask + cap-24 priority unit tests before claiming green.
