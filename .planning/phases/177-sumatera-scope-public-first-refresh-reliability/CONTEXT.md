# CONTEXT - Phase 177: Sumatra Scope + Public-First + Refresh Reliability

Read this before changing anything in this phase. It records only verified environment, constraints, user conditions, and production context.

## Environment

- Host: Windows; repo `D:\College\Pidi.id`; shell PowerShell.
- Frontend: Next.js 14 App Router in `frontend/`; production `https://pre-hub.vercel.app`; Vercel deploys frontend only.
- Backend: FastAPI in `backend/`; production `https://peta-nadi.onrender.com`; Render must redeploy for API/filter/bootstrap changes.
- Database: Supabase `https://ulpmmacsdkohwkmyhlwj.supabase.co`; tables `news_articles`, `dashboard_snapshots`, `data_sources`.
- Local API: `http://localhost:8000`; local frontend normally `:3000`.
- Clean Playwright run used a standalone server on `:3001` because an old server on `:3000` returned 404 for `/dashboard`; temporary config was removed.
- Worker model in this window: `opencode-go/glm-5.3-flash#high`; orchestrator/planner DeepSeek V4.1 Flash Max. The user asked for subagents; the GLM quota was later exhausted and documentation work fell back to the default subagent.
- The user explicitly said `git add .` for the docs commit, including the otherwise-unrelated `Final-Gemastik/Lembar_Koreksi_Laporan_PreHub.md`.

## User requirements and conditions

- Fix aircraft over Peninsular Malaysia, fire hotspots in the South China Sea, slow Waspada/news first paint, and dots merging at overview zoom.
- Filter at the data source so counters, clusters, and map agree.
- Scope: all 10 Sumatra provinces; fires land-only; aircraft 25 km mainland / 5 km satellite; subtract foreign land.
- Keep maritime routes unchanged, including the teal Malacca Strait line.
- Dots: dark keyline + smaller low-zoom halos; no shape coding, no clustering.
- First paint: public shell/counters/news immediate; tenant fleet/ERP gated; last-good caches with freshness badges; Waspada seeded from snapshot; advisory layer prewarmed.
- Acceptance: shell <200 ms; Waspada + first news <1.5 s warm, <3 s cold with stored row; first-ever cold <10 s with skeleton.
- No commits during the first implementation pass; user later asked to push for Vercel verification.
- On 2026-10-29 the user asked to document the whole context window, concerns, constraints, conditions, environments, and issues in the respective phase folder, excluding assumptions, then commit/push with `git add .`.

## Verified production context

- `/api/v1/health/sources`: `map_scope.ok: true`, reason `loaded`, bbox [94.0,-7.0,109.0,7.0], resolution 0.01, width 1500, height 1400, generated 2026-10-29T04:59:47Z. BMKG, TomTom, AISstream, NASA FIRMS healthy; Social OSINT disabled (no Twitter token); Supabase write healthy.
- `/api/v1/dashboard/bootstrap?sections=public`: fire ok/12; weather ok, cuaca 0 (empty), waspada 20; news 9 regional; sections `news, incidents, fire_hotspots, weather_summary, news_market_regime`.
- Live Vercel Playwright on `https://pre-hub.vercel.app/dashboard?guest=1`: `counter-cuaca=0`, `counter-waspada=20`, `counter-titik-panas=12`, 9 `berita-card-*`, localStorage `prehub.news.v2` and `prehub.weather.v2`.
- Supabase: 4,531 news rows; 393 created in 24 h; 779 in 48 h; 1,356 without coordinates; 1,361 not geocoded; newest 150 were 149 `DROPPED_IRRELEVANT` + 1 crisis before classification.
- Snapshot history observed: 27 news at 12:46; 23 at 14:05 before fixes; 12 regional at 14:07; 9 after foreign blocklist at 14:11.
- Backend deploy lag observed at about 2 minutes.

## Constraints and traps

- Frontend-only Vercel deploy does not apply aircraft/FIRMS filters or bootstrap contract changes; Render must redeploy.
- Existing local port 3000 may serve an old build or 404; do not run Playwright against it.
- Playwright first-paint suite mocks APIs; production behavior must be checked separately.
- Full backend suite under concurrent build/Playwright load hit a 15-minute timeout at 72%; use isolated affected suites.
- `run_section` outer status can be `ok` while inner fire/weather is degraded; section truth must be checked.
- A degraded weather seed can carry null counts and a wall-clock `generated_at`; it must not veto complete data.
- Snapshot news must use newest article publish time, not build time; it must classify crisis/regional before seeding.
- Foreign conflict stories can be geocoded into Aceh; regional display needs a foreign blocklist.
- Cache semantic changes require a version bump.
- `git add .` can include unrelated files; the user explicitly requested it.

## Open concerns

- 9 regional rows include near-duplicate TNI AU updates and one broad local item.
- Raster ~1.1 km may flip coastal points.
- Industrial flares not filtered because FIRMS payload lacks a `type=3` column.
- News geocoding uses a broad Sumatra bbox.
- News coalescing is per-process.
- Edge/CDN caching not fully verified.
- Live first-paint timings not benchmarked on Render.
- Full backend suite not rerun clean after changes (timeout, no failures).

## Before you change this phase

1. Read `PLAN.md`, `WALKTHROUGH.md`, and `LEARNINGS.md` in this folder.
2. Run `npx tsc --noEmit`, `npm run build`, and the targeted backend suites before editing.
3. If changing news display, inspect production `news_articles` counts and tier distribution first.
4. Verify data/filter changes against `https://peta-nadi.onrender.com/api/v1/dashboard/bootstrap?sections=public` and a fresh Playwright run.
5. Do not let a snapshot seed suppress a live read, and do not treat null counts as complete data.