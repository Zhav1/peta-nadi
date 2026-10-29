# PLAN - Phase 177: Sumatra Scope + Public-First + Refresh Reliability

**Window:** 2026-10-29
**Status:** COMPLETE - implemented, deployed, verified
**Mode:** retrospective record of built work (no new app edits in this pass)
**Commits recorded:**
- `3914e83` - `feat(map): scope Sumatra telemetry and public-first dashboard paint` (32 files, +2642/-113)
- `833ba8a` - `fix(dashboard): revalidate seeded hazards and repair news clock/tiers` (9 files, +850/-77)
- `4735a74` - `fix(news): reject foreign datelines mislabeled as Sumatra regional` (3 files, +58/-1)

## Objective

Fix four reported issues and the regressions found after the first deploy:

1. Aircraft plotted over Peninsular Malaysia.
2. Fire hotspots shown in the South China Sea.
3. Slow Waspada/news first paint.
4. Dots merging visually at overview zoom.

Keep the result honest across counters, clusters, and the map, and keep maritime routes unchanged.

## Scope IN

- Add a Sumatra scope mask and apply it at data admission for aircraft and FIRMS.
- Keep all 10 Sumatra provinces; fires land-only; aircraft 25 km mainland / 5 km satellite; subtract foreign land.
- Keep maritime routes, including the teal Malacca Strait line.
- Repaint dots with a dark keyline and smaller low-zoom halos; no shape coding, no clustering.
- Add public-first bootstrap: shell/counters/news immediate, tenant fleet/ERP gated.
- Add last-good caches with freshness badges; seed Waspada from snapshot; prewarm advisory layer.
- Make stale-first snapshot revalidate degraded/stale fire and weather.
- Repair news data clock, regional classification, and foreign-dateline filtering.

## Scope OUT

- No shape coding or clustering.
- No maritime route changes.
- No tenant data in public cache.
- No new paid infrastructure.
- No full async rewrite of all routes.
- No assumptions recorded as facts.

## Work packages

| WP | Description | Primary files |
|---|---|---|
| WP1 | Scope mask and helper | `backend/app/services/sumatra_scope.py`, `backend/app/fixtures/sumatra_scope_mask.json`, `scripts/build_sumatra_scope.py` |
| WP2 | Aircraft/FIRMS admission filters | `backend/app/services/telemetry_service.py`, `backend/app/routers/routing_router.py`, `backend/app/adapters/nasa_firms_adapter.py`, `backend/app/routers/health.py` |
| WP3 | Dot paint and hit target | `frontend/lib/mapDataPaint.ts`, `frontend/components/map/CrisisMap.tsx`, `frontend/components/map/FleetVehicleLayer.tsx` |
| WP4 | Public/tenant bootstrap contract | `backend/app/routers/dashboard_bootstrap.py` |
| WP5 | Snapshot and warm path | `backend/app/services/dashboard_snapshot_service.py` |
| WP6 | Cache and first-paint UI | `frontend/components/dashboard/DashboardClient.tsx`, `frontend/hooks/useNewsVerification.ts`, `frontend/lib/publicCache.ts` |
| WP7 | Regression fixes | same as WP4-WP6 plus `backend/app/routers/news_router.py` |
| WP8 | Verification | pytest, tsc, build, paint assertions, Playwright, production API, live Vercel |

## Acceptance targets

- Shell paint <200 ms.
- Waspada + first news <1.5 s warm, <3 s cold with stored row.
- First-ever cold <10 s with skeleton.
- Counters, clusters, and map agree because filtering happens at admission.
- No aircraft over Peninsular Malaysia; no fire rings in the South China Sea at overview zoom.

## Verification

- Backend targeted: 62 passed (snapshot, bootstrap, weather summary, news read path).
- Backend affected subset: 115 passed (tick, API routers, news pipeline/feed/tiers, snapshot, bootstrap).
- After foreign blocklist: 30 passed (news tiers, snapshot).
- Frontend: `npx tsc --noEmit` pass; `npm run build` pass; 50 paint assertions pass; 7/7 first-paint Playwright on a clean standalone server at port 3001.
- Production: `map_scope.ok: true`; bootstrap fire 12, waspada 20, cuaca 0, news 9 regional; live Vercel counters 0 / 20 / 12 and 9 news cards; cache keys v2.
- Pre-change backend full suite: 590 passed, 4 known baseline failures deselected. A concurrent full-suite rerun after changes hit a 15-minute wall at 72% with no assertion failure; affected suites were rerun in isolation.

## Constraints

- Vercel deploys frontend only; Render must redeploy backend for API/filter changes.
- Windows host; repo `D:\College\Pidi.id`; PowerShell.
- Local port 3000 may serve an old server/404; use a clean standalone server on 3001 for Playwright.
- Playwright first-paint suite mocks APIs; production behavior must be checked separately.
- Supabase data is the source of truth; production counts were inspected directly.
- `git add .` for the docs commit includes `Final-Gemastik/Lembar_Koreksi_Laporan_PreHub.md`.

## Open concerns

- 9 regional rows include near-duplicate TNI AU updates and one broad local item.
- Raster resolution ~1.1 km can flip coastal points.
- Industrial flares are not filtered because FIRMS payload lacks a `type=3` column.
- News geocoding uses a broad Sumatra bbox.
- News coalescing is per-process.
- Edge/CDN caching not fully verified.
- Live first-paint timings were not benchmarked on Render.
- Full backend suite was not rerun clean after changes.

## Do not regress

- Never let a snapshot seed suppress a live read.
- Never cache degraded weather with null counts.
- Use data clocks, not build clocks, in public feeds.
- Classify display tiers before seeding.
- Mirror inner section status into section status.
- Revalidate fresh-but-degraded sections.
- Reject foreign datelines in regional display.
- Bump cache keys on semantic changes.
- Verify backend and frontend deployments separately.