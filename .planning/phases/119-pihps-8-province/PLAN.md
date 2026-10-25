# PLAN — Phase 119: PIHPS 8-Province Scraper

**Status:** COMPLETE ✅ (app edits in working tree, verified green, committed this window)
**Date:** 2026-10-25
**Window:** Xhigh orchestrator + High finisher (verify → docs → commit+push)

## Goal

Expand the PIHPS scraper from single-region (Sumut-only) to all 8 Pan-Sumatra provinces with region-scoped persistence (Supabase `eq(region)` + Redis keys), per-region snapshots, and a 1:1 UI slug map — without breaking the legacy `north_sumatra` compat surface (`lrip:pihps:latest`, `REGION`, `SUMUT_PROVINCE_ID`).

## Scope map

1. **Region tables** (`pihps_scraper.py`, top) — `PROVINCES` 8 canonical DB slugs → BI `province_id` (aceh 1, north_sumatra 2, west_sumatra 3, riau 4, jambi 6, bengkulu 7, south_sumatra 8, lampung 10); `PROVINCE_DISPLAY` Indonesian names; `REGION_SHORT_SLUG` (sumut/sumbar/sumsel shorts for dedup keys); `REGION_CENTROID` per-region city proxies (north_sumatra keeps legacy `3.5952/98.6722`); `FETCH_PROVINCE_ORDER` fixed 8-order; `REGION`/`SUMUT_PROVINCE_ID` kept for back-compat imports.
2. **Region loop** (`fetch()`) — provinces outer × commodities inner, sequential (concurrency 1 ≤ 2), results keyed `{commodity}@{region}` so `parse()` resolves the region; courtesy sleep retained.
3. **Scoped Redis** (`parse()`) — rolling keys `lrip:pihps:rolling:{com}:{region}`; dedup `pihps:{com}:{short}:{YYYYMMDD}` via `REGION_SHORT_SLUG`; per-region `lrip:pihps:latest:{region}` snapshots; bare `lrip:pihps:latest` stays the north_sumatra snapshot for `economic_intelligence` consumers.
4. **Scoped persistence** (`_persist_readings(..., region=REGION)`) — delete+insert use `eq("region", region)`; record `region` + `metadata.province/market` per-region display names; log line `com@region`.
5. **Per-region events** — `lat/lon` from `REGION_CENTROID`, `market`/`province` from `PROVINCE_DISPLAY`, `region` on event + `raw` JSON; legacy Medan centroid only for north_sumatra now.
6. **1:1 slug map** (`AnalyticsSection.tsx:51-60`) — `REGION_TO_DB` 1:1 (sumut→north_sumatra, sumbar→west_sumatra, riau→riau, aceh→aceh, sumsel→south_sumatra, lampung→lampung, jambi→jambi, bengkulu→bengkulu); `'' → undefined` unchanged; replaces the Phase 118 collapse-all-to-north_sumatra (valid then, stale now).
7. **Tests** (`test_scrapers.py` +68) — `test_pihps_region_param_propagates` (parametrized north_sumatra/aceh/lampung: eq-region insert + scoped rolling/latest keys + short-slug dedup) and `test_pihps_multi_province_two_regions` (2 provinces × 1 commodity: per-region inserts/keys + compat `lrip:pihps:latest` + both dedups).

## Guardrails (carried)

- Back-compat: `REGION`, `SUMUT_PROVINCE_ID`, bare `lrip:pihps:latest` (north_sumatra) untouched for existing consumers.
- No concurrency increase: sequential region loop, one `httpx.AsyncClient`, 0.5s courtesy sleep.
- No app feature edits beyond this window; trivial build-blocker fix only (none needed from this window — sibling `Array.from` landed before verification).
- One writer per file; commit message fixed by orchestrator.
