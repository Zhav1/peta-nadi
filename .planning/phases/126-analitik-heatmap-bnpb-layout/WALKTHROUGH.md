# WALKTHROUGH — Phase 126: Analitik Heatmap + BNPB Layout Milestone

**Date:** 2026-10-26
**Commits:** `35d6d42` (4 heatmaps + 7 KPIs + tooltips + Babel/Kepri + BNPB 1h + gates),
`6b3317f` (mixed layout trend+donut, heatmaps 2-col, table+BNPB row),
`53c12e2` + `7bb1668` (reconcile merges), `c6eba1b` (CKAN tier + tests).
Docs-only phase folder; no new app edits here.

## What was built

1. **BNPB adapter, 1h async** (`backend/app/adapters/bnpb_adapter.py:365-400`,
   `backend/app/routers/bnpb_router.py`, `main.py` poller wiring): independent
   fire-and-forget feed (`AnalyticsSection.tsx:423-447`); stale chip >24h
   (`:451-458`); honest empty (`:1101-1106`); GET-only.
2. **Babel/Kepri backfill** (`pihps_scraper.py:27-107` PROVINCES/DISPLAY/SHORT_SLUG/
   FETCH_ORDER; `:199-203` split-key; `:388-395` per-region snapshots): 10-province
   PIHPS keyed `{commodity}@{region}`; Wilayah filter gains `babel`/`kepri`.
3. **4 heatmaps + 7 KPIs** (`PriceHeatmap` / `BencanaHeatmap` / `CorrelationMatrix` /
   `TimeHeatstrip` + `heatScale`, `KpiStrip`, `priceStats.ts`; memos
   `AnalyticsSection.tsx:579-656`): honest-empty <3, no RED synthesis.
4. **Rich tooltips** (`AnalyticsTip.tsx`: `TipRow`/`TipTitle`/`TipSource`/`fmtRp`;
   used `:781`, `:1012`): base-ui popup, no Portal over map.
5. **Mixed layout remix** (`AnalyticsSection.tsx:820-1069`; new `PriceTrendChart.tsx`,
   `SpikeShareDonut.tsx`): trend 8 + donut 4 · heatmaps 6+6 · korelasi 6+6 ·
   tabel 8 + BNPB 4; map canvas removed.
6. **CKAN tier** (`bnpb_adapter.py:74-92`, `:257-536`, `:630-702`;
   `test_bnpb_ckan.py` 6 tests): Tier-0 `data.bnpb.go.id/api/3/action`
   with limit+offset paging, aggregate row→event mapper, kab 10 km / prov 25 km.
7. **Uncommitted code included in this push** (fuel spec contract, pre-existing worktree
   changes, committed together per `git add .` instruction): `truck_assets` gains
   `fuel_efficiency_kmpl` / `is_reefer` / `reefer_fuel_lph`
   (`backend/app/schemas/travel.py`, `backend/app/db/travel_supabase.py:56-101`
   `_ASSET_FIELDS` + `_row_to_asset`, `backend/app/db/local_storage.py:226-321`
   DDL + dynamic-column migration + `save_truck_asset`/`_truck_row_to_dict`) plus
   new `infra/supabase/migrations/016_fuel_spec_contract.sql`.

## Verification logs (reported in-window, carried here)

- `npx tsc --noEmit` → exit 0.
- `npm run build` → clean.
- `pytest` → 16 passed; `test_bnpb_ckan.py` → 6 passed
  (verified present: `test_ckan_mapper_aceh_row_yields_flood_event:54`,
  `test_ckan_mapper_kab_row_uses_kab_radius:79`,
  `test_ckan_mapper_drops_non_sumatra_no_geo_zero_rows:94`,
  `test_ckan_fetch_unavailable_when_network_down:114`,
  `test_ckan_fetch_paging_uses_limit_offset:131`,
  `test_bnpb_events_router_serves_cached_ckan_events:186`).
- Playwright `m7-analytics-regression-gate` + new `analitik-heatmap-tooltip-bnpb`
  → 2 passed; laporan specs → 5 passed.
- `phase57` suite → 8 pre-existing failures, documented as unrelated copy drift
  (Run Demo / Detail rute 0 matches) — not caused by this milestone.
- BNPB CKAN status: DEGRADED → CKAN stats live; realtime via BMKG/FIRMS.
