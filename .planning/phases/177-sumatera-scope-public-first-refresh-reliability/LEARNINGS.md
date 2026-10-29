# LEARNINGS - Phase 177: Sumatra Scope + Public-First + Refresh Reliability

**Window:** 2026-10-29
**Goal:** Extract the lessons so a future context window does not repeat the mistakes. Grounded facts only; no assumptions.

## Commits

- `3914e83` - `feat(map): scope Sumatra telemetry and public-first dashboard paint`
- `833ba8a` - `fix(dashboard): revalidate seeded hazards and repair news clock/tiers`
- `4735a74` - `fix(news): reject foreign datelines mislabeled as Sumatra regional`

## What was built

- Natural Earth admin-1 raster scope mask, 0.01 deg over [94,-7,109,7], 1500x1400, fail-closed.
- Aircraft 25 km mainland / 5 km satellite profiles; fires land-only; foreign land subtracted.
- Maritime routes unchanged, including the teal Malacca Strait line.
- Aircraft/FIRMS filters at admission so counters, clusters, and map agree.
- Dark keyline + smaller low-zoom halos; no shape coding or clustering.
- Public-first bootstrap with `sections=public|tenant|all`.
- Stale-first snapshot; 60 s memory cache; single-flight; snapshot `weather_summary`; boot prewarm; Waspada seed; advisory prefetch.
- Cache keys `prehub.news.v2` and `prehub.weather.v2`.
- News data clock, crisis/regional classification, foreign-dateline blocklist.

## Failures found and fixed

1. Fire seed suppressed `/fire/hotspots` for 300 s; weather polygons for 120 s. A stale/degraded seed looked like a data outage. Fix: paint the seed, then always revalidate on mount; keep healthy data when a degraded live envelope returns a null count.
2. Degraded weather seed had `generated_at = now` but null counts. It was cached and vetoed a good live summary with an older fusion timestamp. Fix: completeness-aware precedence; complete-only cache; v2 key.
3. Snapshot news `last_updated` was `datetime.now()`. The live clock was max `published_at`, so the seed always looked newer and the feed froze at one article. Fix: newest kept publish time; client distrusts a `last_updated` more than 10 minutes ahead of the article clock.
4. Snapshot news bypassed `classify_relevance_tier`. 149/150 newest rows were `DROPPED_IRRELEVANT`, so the seed kept only the crisis row. Fix: classify and keep crisis/regional; set `relevance_tier`; drop `dropped`.
5. `run_section` marked any non-raising return as `ok`, including inner `status: degraded` fire/weather payloads. Fix: `_section_truth` mirrors `ok|stale|degraded`; degraded never enters last-good.
6. Fresh stored rows with degraded/stale fire/weather were served without revalidation. Fix: background single-flight refresh while still returning the row immediately.
7. Per-section 5 s timeout was shorter than weather (12 s) and FIRMS (up to ~75 s), so the snapshot section was always cancelled. Fix: slow-section budgets fire 15 s / weather 12 s; background build 16 s; missing-row caller waits at most 8 s and the build continues.
8. Gaza/Hormuz foreign stories were geocoded into Aceh and matched broad topic words. Fix: narrow foreign conflict blocklist in `is_regional_context`.

## What worked

- Filtering at the data source, not hiding in the frontend.
- Additive `sections=` contract preserving old behavior (`all`).
- Stale-first snapshot plus detached refresh.
- Server-side section truth instead of trusting the outer envelope.
- Cache version bump when semantics change.
- Live production Playwright after mocked tests.
- Reading production Supabase counts to distinguish gate-dropped from empty ingestion.

## Traps

- A seed is not a substitute for revalidation.
- Wall-clock timestamps are not data clocks.
- `status: ok` on an outer section can lie about an inner payload.
- Vercel-only deploy cannot apply backend filters or bootstrap changes.
- Mocked Playwright cannot catch live geocoding false positives; production sample did.
- Running the full backend suite concurrently with build/Playwright caused a 15-minute timeout at 72%; use isolated affected suites.
- Port 3000 had an old server returning 404 for `/dashboard`; use a clean standalone server on 3001.
- `git add .` can include unrelated files; this window the user explicitly requested it, so `Final-Gemastik/Lembar_Koreksi_Laporan_PreHub.md` is included.

## Do-not-repeat checklist

- Paint the seed, then fetch live; never wait for the poll.
- Treat null counts as degraded; never let them beat complete data by timestamp.
- Store data clocks, not build clocks, in public feeds.
- Classify display tiers before seeding; do not let the snapshot bypass the live classifier.
- Mirror inner status into section status; never cache degraded payloads as last-good.
- Revalidate fresh-but-degraded sections.
- Reject foreign datelines in regional display.
- Bump cache keys on semantic changes.
- Verify backend and frontend deployments separately.
- Run affected tests isolated; run live Playwright for production.

## Open concerns

- 9 regional rows include near-duplicate TNI AU updates and one broad local item.
- Raster ~1.1 km may flip coastal points.
- Industrial flares are not filtered because FIRMS payload lacks a `type=3` column.
- News geocoding uses a broad Sumatra bbox.
- News coalescing is per-process.
- Edge/CDN caching not fully verified.
- Live first-paint timings not benchmarked on Render.
- Full backend suite not rerun clean after changes (load timeout, no failures).

## Verification facts

- 62 targeted passed; 115 affected subset passed; 30 after foreign blocklist.
- `tsc --noEmit` pass; `npm run build` pass; 50 paint assertions; 7/7 first-paint Playwright.
- Production: `map_scope.ok: true`; bootstrap fire 12, waspada 20, cuaca 0, news 9; live Vercel counters 0/20/12 and 9 cards; cache keys v2.
- Supabase: 4,531 news rows; 393 in 24 h; 779 in 48 h; 1,356 no coords; 1,361 not geocoded; 149/150 dropped + 1 crisis.

## If this repeats

1. Read `CONTEXT.md` and `LEARNINGS.md` in this folder.
2. Run `npx tsc --noEmit`, `npm run build`, and targeted backend suites before editing.
3. Inspect production `news_articles` counts and tier distribution before changing gates.
4. Verify changes against `https://peta-nadi.onrender.com/api/v1/dashboard/bootstrap?sections=public` and a fresh Playwright run.
5. Check whether a seed is suppressing a live read and whether null counts are being cached.