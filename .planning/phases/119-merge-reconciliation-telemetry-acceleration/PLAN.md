# Phase 119: Merge Reconciliation & Telemetry Pipeline Acceleration

**Status:** PLANNED ⏳
**Date:** 2026-10-25
**Role:** Architect (Gemini 3.8 Flash High) / Executor (DeepCoder Gemini 3.8 Flash Medium)

## 1. Context & Objectives

1. **Merge Reconciliation**:
   Remote commit `4aab64d` (by Zhav1) introduced key functional improvements to `AnalyticsSection.tsx`:
   - Full removal of redundant map canvas in favor of a single full-width dashboard view.
   - `regionToDb` slug translation (`sumut` -> `north_sumatra`, `''` -> `undefined`).
   - True calendar date formatting on the price histogram (`formatDayMonth` / `formatFullDate`).
   - Hand-rolled glass day filter buttons and animated shimmer CTA button.
   Simultaneously, Phase 115 introduced strict Watermelon Base-UI primitives (`Select`, `Tooltip`, `Card`, `Chip`, `Empty`, `Skeleton`).
   *Goal*: Merge `origin/main` cleanly without losing either Zhav1's functionality or Base-UI architectural contracts.

2. **Telemetry Acceleration**:
   Currently, `/api/v1/fleet/vehicles` takes ~2.8s on localhost because `vehicles_router.py` calls `telemetry_service.get_unified_fleet(...)` twice sequentially, looping over all 45 trucks, 96 AIS vessels, and ADS-B flights.
   *Goal*: Optimize `vehicles_router.py` into a single-pass extraction with an in-process sliding TTL cache (5-10s), reducing local latency from ~2.8s to < 50ms on warm hits.

---

## 2. Work Packages (Atomic Breakdown)

### WP1: Git Merge & AnalyticsSection Reconciliation
- Execute `git merge origin/main`.
- Resolve merge conflict in `frontend/components/dashboard/AnalyticsSection.tsx`:
  - Adopt Zhav1's full-width structure (no Mapbox map canvas).
  - Adopt Zhav1's `regionToDb` mapping and `formatDayMonth` / `formatFullDate` on price history bars.
  - Adopt Zhav1's hand-rolled shimmer CTA button.
  - Preserve Phase 115 Base-UI `Select` with `portal={false}` for commodity and region filters.
  - Preserve Phase 115 Base-UI `Tooltip` with `portal={false}` for price history bars (replacing native `title=`).
  - Preserve Phase 115 Base-UI `Card`, `Chip`, `Empty` (preserving E2E hook `role="status"`), and `Skeleton`.
- Resolve any merge conflicts in `.planning/ROADMAP.md` and `.planning/STATE.md`.

### WP2: Telemetry Router Optimization & Single-Pass Caching
- Modify `backend/app/routers/vehicles_router.py`:
  - Eliminate the second call `all_units = telemetry_service.get_unified_fleet(..., include_geometry=False)`.
  - Calculate `modality_counts` directly from the single list of vehicles in one pass.
  - When `include_geometry=False` is requested, strip geometry in-memory without re-invoking the entire generation pipeline.
  - Implement a fast in-process TTL cache (e.g., 5 seconds) for default macro fleet queries to prevent redundant heavy enrichment on frequent polling.

### WP3: Test Suite Alignment & Verification Gate
- Update `frontend/scripts/test_phase115_watermelon_mcp_connect.ts` or add Phase 119 assertions to ensure tests reflect the map-less layout while still verifying the 7 Base-UI primitives.
- Run `npm run test:phase115`.
- Run `npx tsc --noEmit` (0 errors required).
- Run `npm run build` (Next.js production build, 7/7 routes).
- Run backend `pytest tests/test_adapters.py tests/test_news_pipeline.py`.
- Benchmark `/api/v1/fleet/vehicles` using PowerShell `Measure-Command` to confirm latency reduction.

---

## 3. Definition of Done (Proof of Work)
1. Git working tree clean, merge commit created without conflict artifacts.
2. `AnalyticsSection.tsx` incorporates both Zhav1 features and Base-UI primitives with 0 syntax or runtime errors.
3. `/api/v1/fleet/vehicles` latency drops significantly (< 500ms on warm local calls).
4. All verification gates pass (TypeScript, Next.js build, Pytest).
