<!-- generated-by: gsd-docs-update (M5 window, Deepseek worker) -->
# Phase 87 / Plan 01 — FIRMS Radius-Area + Weather Disruption Threshold

**Goal:** kill medium-drizzle clutter and pin-sized fire dots in one window — weather overlay
returns disruption-only high/critical heavy rain by default (advisory opt-in), and every FIRMS
hotspot carries a severity-mirrored affected-area radius.

**Status:** IMPLEMENTED-LOCALLY-PUSHED in `b28a0db` on `main`
(`feat(weather): disruption-only heavy-rain overlay (high/critical default, advisory opt-in)`).

## 1. Objective

- **Disruption-only default:** `GET /api/v1/weather/spatial-polygons` defaults to
  `min_severity=high`, `min_precip=50.0` (mm/24h), `min_flood=80.0` (pct) — BMKG code 60 /
  medium drizzle excluded unless explicitly requested via the advisory path
  (`?min_severity=medium&min_precip=0&min_flood=0` returns full fidelity as before).
- **Numeric extraction contracts:** `_extract_openmeteo_numbers` (precip/flood/wind from
  `raw_payload.predictions`) and `_extract_bmkg_numbers` (code + mapped sim-grade numerics:
  code 60 → 25.0/55.0 drizzle, codes 95/97 → 65.5/87.5 severe, wind 20.0/42.0) so the
  BMKG desc+code-only API can still pass numeric gates.
- **FIRMS radius-area:** `radius_km` per hotspot, monotonic with severity — critical → 5.0 km,
  high → 2.5 km, medium/low → 1.0 km — additive to the existing hotspot shape; typed in
  `frontend/lib/types.ts` (`FireHotspot.radius_km`).

## 2. Scope

### In scope (committed in `b28a0db`, 7 files, +572/−31)

| File | Lines | Change |
|---|---|---|
| `backend/app/services/weather_fusion_service.py` | +141 | `_SEVERITY_RANK`, `DEFAULT_MIN_SEVERITY="high"`, `DEFAULT_MIN_PRECIP_MM=50.0`, `DEFAULT_MIN_FLOOD_PCT=80.0`; `_extract_openmeteo_numbers` / `_extract_bmkg_numbers` (code-60/95/97 fallback mapping); `get_fused_spatial_weather(min_severity, min_precip, min_flood)` disruption gate |
| `backend/app/routers/routing_router.py` | +34 | `/weather/spatial-polygons` Query params (`min_severity`/`min_precip`/`min_flood`) + advisory-path branch (medium/low disables numeric gates unless explicitly set); `/fire/hotspots` radius-area mapping docstring + per-hotspot `radius_km` |
| `frontend/components/map/CrisisMap.tsx` | +269/−~ | Disruption-default polygon fetching + radius-scaled fire rendering + enriched popups |
| `frontend/components/dashboard/DashboardClient.tsx` | +112 | Overlay toggle/count wiring for the new defaults |
| `frontend/components/dashboard/TopNavTelemetry.tsx` | +33 | Toggle counts reflecting disruption-filtered features |
| `frontend/lib/api.ts` | +13 | `weather.spatialPolygons(params?)` — defaults `min_severity=high`, `min_precip=50`, `min_flood=80` |
| `frontend/lib/types.ts` | +1 | `FireHotspot.radius_km?: number` (5 critical / 2.5 high / 1 medium) |

### Out of scope

- Whole-island coverage (Phase 88 — this window still inherits the single-point Medan root cause).
- Logistics enrichment of blue zones (Phase 89).
- MAP_KEY provisioning (operator action; honest-degraded chain from Phase 85 unchanged).
- New tests for threshold/radius paths — none added this window.

## 3. Decisions (as evidenced in-tree)

- **Disruption-only gate is OR-semantics:** precip ≥ 50 OR flood ≥ 80 passes; either numeric
  gate set to 0 disables it (`eff_precip_h = None if min_precip == 0`). Advisory callers get
  full fidelity without a second endpoint.
- **BMKG sim-grade numerics are explicit fallbacks, not observations:** applied only when BMKG
  carries no numerics (current API: desc+code only); code 60 maps BELOW the gate (25.0/55.0),
  codes 95/97 map ABOVE it (65.5/87.5) — the mapping is the documented reason medium drizzle
  disappears by default.
- **Radius-area is additive:** existing hotspot shape unchanged (`radius_km` included per
  hotspot); frontend may scale dots without breaking older consumers.
- **Prod-only correction (inherited):** overlay assertions run against prod (needs live
  BMKG/OM data); Vercel edge-cache lag applies — verified in-tree proxy cache is
  `s-maxage=60, stale-while-revalidate=120` (`frontend/app/api/proxy/[...path]/route.ts:61-63`);
  orchestrator context notes ~10 min lag observed on `b28a0db` deploys — allow for stale reads
  after push before re-probing.

## 4. Walkthrough (what was implemented this window)

1. Added severity-rank + numeric extraction helpers with BMKG code-fallback mapping.
2. Gated `get_fused_spatial_weather` on (severity rank, precip, flood) with high/50/80 defaults.
3. Exposed the three Query params on `/weather/spatial-polygons` with the advisory-path branch.
4. Added monotonic `radius_km` to `/fire/hotspots` output + `FireHotspot` type.
5. Wired frontend fetch defaults (`api.ts`) and toggle/count/popup rendering
   (`CrisisMap.tsx`, `DashboardClient.tsx`, `TopNavTelemetry.tsx`).

## 5. Verification gates

| Gate | Command / probe | Expected | Status this window |
|---|---|---|---|
| TypeScript | `npx tsc --noEmit -p tsconfig.json` | exit 0 | NOT re-run after `b28a0db` (recorded, not claimed) |
| Pytest threshold/radius | targeted suite for fusion gate + hotspot radius | pass | NOT added/run — gap, see LEARNINGS §2 |
| Prod default | `GET /api/v1/weather/spatial-polygons` (no params) | only high/critical, precip≥50 or flood≥80 | NOT probed — needs prod + post-cache wait |
| Prod advisory | `?...&min_severity=medium&min_precip=0&min_flood=0` | medium/low included | NOT probed — same |
| Prod radius | `GET /api/v1/fire/hotspots` (post-MAP_KEY) | `radius_km` ∈ {5.0, 2.5, 1.0} | BLOCKED on MAP_KEY provisioning |
