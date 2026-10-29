# Spec — Sumatra scope, dot legibility, first paint

**Status:** READY  
**Scope:** Cosmetic/data-truth pass for the dashboard map and first paint  
**Research basis:** three read-only `explore` subagents on `opencode-go/muse-spark-1.3-contributor#xhigh` / `#high`; no `general`/default subagent. No production code changed by this document.

---

## 1. Goal

1. Every aircraft dot and Titik Panas dot drawn on the map is inside the Sumatra operational scope; counters, clusters, and map agree.
2. Every point has a visible edge at overview zoom, so same-colour dots no longer read as one blob.
3. The dashboard shell, Waspada counter, and news panel paint immediately with honest freshness; duplicate cold work is coalesced.

## 2. Non-goals

- Vessel routes and maritime corridors are unchanged, including the Malacca/Sunda sea lanes.
- Cuaca/Waspada weather polygons are not geographically clipped; marine forecasts over water remain valid.
- No news geocoding change in this phase (the broad Sumatra bbox remains; deferred audit).
- No shape coding, cluster/spiderfy, or new map hues.
- No Render plan/worker upgrade and no change to auth/tenant permissions.
- No FIRMS product/format change; the existing API + keyless CSV stay.
- No initial camera change; Malaysia remains as basemap context, just without Sumatra data drawn on it.

---

## 3. Decisions locked

### 3.1 Geographic scope — hard filter at the source

**Scope:** all 10 Sumatra provinces — mainland plus Simeulue, Weh, Nias, Mentawai, Enggano, Bangka, Belitung, and the Riau archipelago including Batam, Bintan, Natuna, and Anambas.

**Fires:** land-only, with a **1 km tolerance** for FIRMS pixel-centroid error. Offshore/South China Sea flares are dropped.

**Aircraft:** **25 km** buffer around the mainland; **5 km** around satellite islands.

**Foreign-land guard:** subtract non-Sumatra land (Malaysia, Singapore, Java, other islands) from the buffered polygon, so the 25 km mainland buffer cannot bleed across the Sunda Strait into Java or across the Malacca Strait into Malaysia.

**Applied at admission, not just rendering:**

- live ADS-B (`fetch_live_sumatra_aircraft`)
- OpenSky fallback
- FIRMS API + keyless CSV
- backend baseline aircraft
- frontend fallback fleet
- dead-reckoned positions

Out-of-scope dead reckoning resets to the last in-scope fix or hides; it is never clamped to the old bbox.

**Counts:** `count`/`total`/clusters are computed after filtering. If the scope asset is missing, filtered layers return degraded/empty with a health flag — never silently fall back to the bbox.

**Simulated aircraft:** regenerated onto in-scope routes so offline/demo counts survive; they remain labelled `SIMULATION_CACHE`, never `LIVE`.

### 3.2 Dot treatment — dark keyline + smaller low-zoom halos

- Fleet dots: replace the self-coloured stroke with a neutral dark keyline `rgba(12,16,23,0.9)`, **1.5 px** at z4–8, **1.25 px** at z12+.
- Keep the amber **2.5 px** ring for impacted units.
- Keep `ROUTE_ESTIMATED` hollow units on their modality-hued faint ring so tracking mode stays readable.
- Waspada/FIRMS: keep the dark keyline, **1.25 px** below z7 and **1 px** above.
- Waspada visual halo: radius `6@z4 → 8@z8 → 9@z12`; opacity `0.12 → 0.18 → 0.22`.
- FIRMS visual halo: radius `6@z4 → 8@z8`; stroke opacity `0.3 → 0.5`.
- Do **not** shrink click targets: keep a transparent hit layer at radius ≥8 px.
- Add `DS.layer.keyline`; no new hue. Update `scripts/test_fleet_paint.ts` and the existing map-legibility/tooltip contracts.

### 3.3 First paint and loading — public-first + single-flight

**Public-first:** render the shell, Waspada counter, and cached news immediately. Tenant fleet/ERP and role-gated controls wait for auth. No tenant-data flash.

**Additive bootstrap mode:** `GET /api/v1/dashboard/bootstrap?sections=public|tenant|all` (default `all`, so existing callers are unaffected).

- `public`: auth-blind, no tenant sections, returns incidents, news, market regime, fire, `weather_summary`, corridor context. Safe for `Cache-Control: public, s-maxage=30, stale-while-revalidate=60`.
- `tenant`: fleet + ERP only; `private, no-store`.
- Frontend calls `public` on mount, `tenant` after auth.

**Snapshot gains `weather_summary`:** counts only, same shape as `/weather/summary`, never polygons. Degraded/stale-safe; no fake zero.

**Single-flight + stale-while-revalidate** for the global snapshot build, weather fusion, and `get_live_news` read scan:

- first caller starts a detached, shielded task; concurrent callers await the same task;
- a client abort never cancels the shared build;
- a stored snapshot row is served immediately with `stale=true` when older than 600 s, while refresh runs in the background;
- failure serves stale/degraded, never an exception.

**Prewarm** snapshot + weather fusion on boot and after the existing 5-minute internal tick.

**Last-good cache:** `prehub.news.v2` and `prehub.weather.v2` in `localStorage`, 2 h TTL, public data only, versioned. The v2 cutover discards v1 entries that could hold a degraded weather seed or a wall-clock-frozen one-item news feed. Compare data clocks and never replace a newer cached feed with an older bootstrap seed. Freshness badge shows the real data timestamp; cached data is never labelled live.

**Waspada layer:** stays default OFF. Prefetch the medium advisory polygons on idle after the counter resolves (one derived render, no extra upstream when fusion is warm). Toggle shows a “Memuat lapisan…” state; failure shows a stale/error badge, never a blank map.

**Acceptance:** shell <200 ms; Waspada counter + first news card <1.5 s warm, <3 s cold with a stored row. First-ever cold with no row is allowed up to 10 s, with a skeleton — never a blank panel.

---

## 4. Interfaces + edge cases

### 4.1 Scope helper and asset (implemented)

- `is_in_sumatra_scope(lon, lat, profile)` with profiles `fire_land`, `air_mainland`, `air_island`; single helper used by telemetry and FIRMS.
- Runtime asset: `backend/app/fixtures/sumatra_scope_mask.json` — a 0.01° raster mask over `[94,-7,109,7]`, zlib+base64 encoded (about 22 KB on disk), flags: bit 0 fire land, bit 1 air island, bit 2 air mainland. O(1) lookup, no numpy at runtime.
- Audit asset: `backend/app/fixtures/sumatra_scope.geojson` (about 38 KB), generated by the same script.
- Reproducible build: `scripts/build_sumatra_scope.py` decodes Natural Earth admin-1, rasterizes, labels the mainland vs satellite islands, dilates the 1/5/25 km buffers, subtracts non-Sumatra land, and writes both assets.
- Source: Natural Earth admin-1 states/provinces, public domain; the local copy is `gods-eye-view/src/data/local_data/natural_earth/states_provinces.json`.
- A missing/corrupt mask fails closed; `/api/v1/health/sources` exposes `map_scope` with `ok`/`reason`.

### 4.2 Snapshot / bootstrap contract

- `weather_summary` snapshot section: `{status, data: {bbox, generated_at, cuaca, waspada}, error?}`. If it times out, mark degraded/stale and let `/weather/summary` refresh.
- `sections=public` ignores `Authorization` entirely; `sections=tenant` for a guest returns empty sections rather than a 401, so the merge is safe.
- Public mode is auth-blind and cacheable; it must never include tenant fleet/ERP or a `company_id`.

### 4.3 Geographic edge cases

- FIRMS coastal pixel: 1 km tolerance; an offshore flare more than 1 km from land is dropped.
- Land-based industrial flares remain (the consumed CSV has no `type=3` flag); deferred.
- Selected aircraft path: trim/clip to scope; if the current point is out of scope, hide it. Never draw an aircraft trail over Malaysia.
- The 25 km mainland buffer is subtracted by Java/Malaysia/Singapore land; the 5 km satellite buffer also excludes Singapore/Johor.
- The scope asset missing at runtime: filtered layers fail closed (degraded/empty) and health reports `scope_asset_missing`; no silent bbox fallback.
- Vessels, trucks, and maritime routes are not filtered.

### 4.4 Cache edge cases

- Compare timestamps; never replace a newer cached feed with an older bootstrap seed.
- The freshness badge shows the data timestamp, not the fetch timestamp.
- Only public news/weather are cached; fleet/ERP/auth data are never cached.
- On schema change, bump the cache key version and discard older entries.

---

## 5. Verification hooks

### Backend

- New `test_sumatra_scope.py`: KL false; Singapore false for aircraft; South China Sea false for fire; Belawan true; Nias true; Batam true; Natuna land true / Natuna water false for fire.
- Update `test_firms_keyless_fallback.py`: in-bbox/out-of-scope rows dropped; filtered counts; cross-check still works.
- Update `test_vehicles_telemetry.py`: mocked KL plane dropped; offline counts preserved and all in-scope.
- Update `test_dashboard_snapshot_service.py`: `weather_summary` section, stale-first, two concurrent calls → one build, abort safety.
- Update `test_news_router.py`: concurrent cold reads → one scan; stale replay.

### Frontend

- Updated `scripts/test_fleet_paint.ts` for the new paint expressions.
- New `e2e/map-scope.spec.ts` using a post-filter fixture: no fleet/FIRMS feature in the KL/Singapore/SCS exclusion polygons.
- New `e2e/dashboard-first-paint.spec.ts` with a delayed bootstrap: shell <200 ms, skeleton, cached news/weather, freshness badge, no tenant flash.
- Existing `map-legibility`, `map-tooltip-contract`, `fleet-roster`, and `hazard-counter-truth` suites pass.

### Live / build

- Playwright timings against local + Render.
- Five simultaneous cold bootstraps → one snapshot build in logs/metrics.
- `npm run lint`, `npm run typecheck`, backend pytest, frontend e2e.

---

## 6. Open / deliberately deferred

1. Boundary licence: implemented with Natural Earth admin-1 (public domain). If GADM/OSM is required instead, flag it before changing the asset.
2. First-ever cold with no stored snapshot cannot meet <3 s; accepted <10 s skeleton.
3. News geocoding/display scope is unchanged; audit later.
4. Land-based industrial flares are not filtered (no `type` column on the consumed CSV).
5. Edge/CDN caching for `sections=public` is optional; single-flight + stale-first is the primary fix.
6. Shape coding/cluster/spiderfy and a scope mask over Malaysia are deferred.
7. Vessel routes, including the teal Malacca Strait line, remain exactly as they are.

---

## 7. One-line root-cause record

- **Malaysia aircraft:** 250 nm ADS-B queries + a 94.5–109°E / -6.5–6.5°N admission rectangle include Malaysia; no land check exists.
- **South China Sea fires:** the only FIRMS gate is `[94, -6, 108, 6]`; sea flares are correctly admitted by that rectangle.
- **Slow first paint:** one bootstrap request gates news/fleet/corridor/fire; cold snapshot builds are not single-flighted; weather fusion can block 12 s; production is one worker on a free 0.1-CPU plan. Guest concurrency amplifies, but is not the root cause.
- **Merging dots:** fleet dot stroke equals its fill; Waspada/FIRMS halos are larger than the dots and merge at overview zoom; no dot-level declutter.

---

## 8. Implementation record (2026-10-29)

- Scope mask generated and checked in; KL/Singapore/SCS/Jakarta rejected, Belawan/Nias/Batam/Natuna/Medan retained.
- Aircraft live + OpenSky + baseline paths and FIRMS API + keyless CSV paths scope-gated; `/health/sources` reports `map_scope`.
- Snapshot now includes `weather_summary`; bootstrap supports `sections=public|tenant|all`, stale-first, single-flight, 60 s memory cache, and boot prewarm.
- Frontend uses public-first bootstrap, last-good news/weather caches, Waspada advisory prefetch, and dark-keyline dot paint.
- Verified: backend `590 passed, 4 deselected` (the four documented pre-existing baseline failures); targeted 89 passed; `tsc --noEmit` pass; `npm run build` pass; 50 paint assertions pass; Playwright `dashboard-first-paint` + `news-live-audit` 10/10 pass on a clean standalone server.

### 8.1 Refresh regression fix (2026-10-29)

- Fire and weather polygons now paint a snapshot seed **and always issue the live read on mount**; a seed can no longer suppress revalidation for 5 minutes.
- Weather summary precedence is completeness-aware: a degraded/null-count seed cannot veto a complete live summary; only complete summaries are cached.
- Snapshot section truth now mirrors inner fire/weather status (`ok`/`stale`/`degraded`); degraded payloads are never stored as last-good.
- Bootstrap schedules a detached single-flight refresh when a fresh stored row has degraded/stale fire or weather, while still returning the row immediately.
- Snapshot news `last_updated` is the newest kept article's publish time (not wall-clock now), and rows are classified into the `crisis`/`regional` display tiers before seeding.
- Cache keys were bumped to `prehub.news.v2` / `prehub.weather.v2`; the news hook distrusts a `last_updated` more than 10 minutes ahead of its article data clock.
- Verified: 7/7 `dashboard-first-paint` Playwright tests on a clean standalone server; backend snapshot/bootstrap/news suites pass.
