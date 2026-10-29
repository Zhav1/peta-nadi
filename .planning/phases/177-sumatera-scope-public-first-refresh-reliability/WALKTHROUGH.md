# WALKTHROUGH - Phase 177: Sumatra Scope + Public-First + Refresh Reliability

**Window:** 2026-10-29
**Mode:** retrospective evidence record (read-only inspection)
**Commits:**
- `3914e83` - `feat(map): scope Sumatra telemetry and public-first dashboard paint` (32 files, +2642/-113)
- `833ba8a` - `fix(dashboard): revalidate seeded hazards and repair news clock/tiers` (9 files, +850/-77)
- `4735a74` - `fix(news): reject foreign datelines mislabeled as Sumatra regional` (3 files, +58/-1)

## Chronology

1. User reported four issues: aircraft over Peninsular Malaysia; fire hotspots in the South China Sea; slow Waspada/news first paint; dots merging at overview zoom.
2. Spec confirmed: data-source filtering; all 10 Sumatra provinces; fires land-only; aircraft 25 km mainland / 5 km satellite; subtract foreign land; keep maritime routes including the teal Malacca Strait line; dark keyline and smaller low-zoom halos; no shape coding or clustering; public-first boot; last-good caches; Waspada seed; advisory prewarm; acceptance shell <200 ms, Waspada + first news <1.5 s warm, <3 s cold with stored row, first-ever cold <10 s skeleton.
3. Implementation: scope mask (`backend/app/services/sumatra_scope.py`, `backend/app/fixtures/sumatra_scope_mask.json`, 0.01 deg over [94,-7,109,7], 1500x1400; `scripts/build_sumatra_scope.py`); aircraft/FIRMS gates; dot repaint; `sections=public|tenant|all`; snapshot `weather_summary`; stale-first single-flight; cache and warm path.
4. Commit `3914e83` and push; Render backend and Vercel frontend deployed. Production health showed `map_scope.ok: true`, bbox [94,-7,109,7], resolution 0.01.
5. User refreshed and reported Titik Panas/Waspada/Cuaca disappearing for several minutes; Berita showed one article after 7-8 minutes.
6. Diagnosis via read-only subagents plus production Supabase/API: fire seed suppressed the live read for 300 s; weather degraded seed had wall-clock `generated_at` and null counts; news snapshot used wall-clock `last_updated` and lacked `relevance_tier`; `run_section` treated inner degraded payloads as ok; stored degraded sections were not revalidated.
7. Fix `833ba8a`: paint-then-revalidate fire/polygons; complete-summary precedence; complete-only caching; v2 cache keys; snapshot section truth; background revalidation; slow-section budgets fire 15 s / weather 12 s; first-paint caller 8 s; news data clock plus crisis/regional classification.
8. Production deploy verified: bootstrap fire 12, weather waspada 20, cuaca 0, news 12 regional; sample included Gaza and Hormuz false positives from Tribun Aceh geocoding.
9. Fix `4735a74`: narrow foreign conflict blocklist in `is_regional_context`; tests.
10. Production now: news 9 regional; counters correct. Live Playwright on Vercel: 0 / 20 / 12, 9 cards, v2 cache keys.

## Evidence

| Claim | Verification |
|---|---|
| Scope mask loaded | `https://peta-nadi.onrender.com/api/v1/health/sources` -> `map_scope.ok: true`, bbox [94,-7,109,7], resolution 0.01, 1500x1400 |
| Fire count | Bootstrap `fire_hotspots.data.count = 12` |
| Weather counters | Bootstrap `cuaca=0` (empty), `waspada=20` |
| News feed | Bootstrap `news.total=9`, all `relevance_tier=regional`, `last_updated=2026-10-29T13:54:45Z` |
| Live UI | Playwright on `https://pre-hub.vercel.app/dashboard?guest=1`: `counter-cuaca=0`, `counter-waspada=20`, `counter-titik-panas=12`, 9 `berita-card-*`, localStorage `prehub.news.v2` and `prehub.weather.v2` |
| TypeScript | `npx tsc --noEmit` pass |
| Build | `npm run build` pass |
| Paint | 50 paint assertions pass |
| First-paint | 7/7 Playwright on clean standalone server at port 3001 |
| Targeted backend | 62 passed (snapshot, bootstrap, weather summary, news read path) |
| Affected subset | 115 passed (tick, API routers, news pipeline/feed/tiers, snapshot, bootstrap) |
| Foreign blocklist | 30 passed (news tiers, snapshot) |
| Pre-change full suite | 590 passed, 4 known baseline failures deselected |
| Full rerun after changes | Hit 15-minute wall at 72%; no reported assertion failure; not claimed clean |
| Supabase | 4,531 news rows; 393 created in 24 h; 779 in 48 h; 1,356 no coords; 1,361 not geocoded; newest 150 were 149 dropped + 1 crisis before classification |

## Environment and issues

- Vercel deploys frontend only; Render must redeploy backend for filtering/bootstrap changes.
- Local port 3000 had an old dev server returning 404 for `/dashboard`; Playwright used a standalone server at 3001 with a temporary config, removed afterward.
- Playwright first-paint suite mocks APIs; the production pass was separate.
- Windows/PowerShell; repo `D:\College\Pidi.id`; backend `https://peta-nadi.onrender.com`; frontend `https://pre-hub.vercel.app`.
- Render deploy lag observed at about 2 minutes.
- `git add .` for the docs commit includes `Final-Gemastik/Lembar_Koreksi_Laporan_PreHub.md`.

## Open concerns

- 9 regional rows include near-duplicate TNI AU updates and one broad local item.
- Raster ~1.1 km may flip coastal points.
- Industrial flares not filtered because FIRMS payload lacks a `type=3` column.
- News geocoding uses a broad Sumatra bbox.
- News coalescing is per-process.
- Edge/CDN caching not fully verified.
- Live first-paint timings were not benchmarked on Render.
- Full backend suite not rerun clean after changes.

## What a future window should do first

1. Read `CONTEXT.md` and `LEARNINGS.md` in this folder.
2. Run `npx tsc --noEmit`, `npm run build`, and the targeted backend suites before changing anything.
3. If working on news display, inspect production `news_articles` counts and `zone_tier`/`relevance_tier` distribution before changing gates.
4. Verify any data/filter change against `https://peta-nadi.onrender.com/api/v1/dashboard/bootstrap?sections=public` and a fresh Playwright run.
5. Do not let a seed suppress a live read, and do not treat null counts as complete data.