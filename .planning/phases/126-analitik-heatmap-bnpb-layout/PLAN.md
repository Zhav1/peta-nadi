# PLAN — Phase 126: Analitik Heatmap + BNPB Layout Milestone

**Status:** COMPLETE ✅ (app edits landed pre-docs: `35d6d42`, `6b3317f`, `53c12e2`/`7bb1668` merges, `c6eba1b`; docs-only here)
**Date:** 2026-10-26
**Window:** Xhigh orchestrator + High subagents only; plan md inside phase folder, never temp files
**Next phase number:** 126 (max observed 125 → `125-supabase-primary-ledger-seeds-hitl-trigger/`)

## Goal

Ship the Analitik mixed dashboard milestone: 4 heatmaps + 7 KPIs + rich tooltips on
PIHPS prices/spikes, Babel/Kepri backfill, BNPB async 1h adapter with CKAN tier,
and a mixed horizontal+vertical grid layout — with Playwright gates proving all of it.

## Workstreams

### WS1 — BNPB adapter, 1h async cadence
- **Scope files:** `backend/app/adapters/bnpb_adapter.py:365-368` (`BNPBAdapter`,
  `poll_interval_seconds = 3600`), `backend/app/adapters/__init__.py`,
  `backend/app/adapters/base.py`, `backend/app/routers/bnpb_router.py:1-58`,
  `backend/app/main.py` (poller wiring), `backend/app/services/redis_client.py`,
  `backend/app/workers/ingestion_worker.py`, `backend/app/config.py`
- **Decisions:** mount-only fire-and-forget feed; BNPB never blocks prices/spikes
  (`AnalyticsSection.tsx:423-447`); stale chip at >24h (`AnalyticsSection.tsx:451-458`);
  honest empty when unavailable (`AnalyticsSection.tsx:1101-1106`); GET-only.
- **Interfaces:** `GET /api/v1/bnpb/events?limit=20` → `api.bnpb.events()` →
  `bnpbEvents`/`bnpbLoading`/`bnpbUpdatedAt`/`bnpbAvailable` state.

### WS2 — Babel/Kepri + backfill (PIHPS 10-province)
- **Scope files:** `backend/app/scrapers/pihps_scraper.py:27-36` (`PROVINCES`,
  `bangka_belitung: 9`), `:44-67` (`PROVINCE_DISPLAY`, `REGION_SHORT_SLUG`
  `babel`/`kepri`), `:98-107` (`FETCH_PROVINCE_ORDER`), `:199-203`
  (`_split_key` `{commodity}@{region}`, bare keys → `north_sumatra`),
  `:214-215`/`:388-395` (per-region snapshots `lrip:pihps:latest:{region}`),
  `frontend/lib/region.ts`, `frontend/components/dashboard/AnalyticsSection.tsx`
  (Wilayah filter options `babel`/`kepri`).
- **Decisions:** region-outer fetch loop keyed `{commodity}@{region}`; region-scoped
  rolling/dedup/latest Redis keys; bare `latest` stays `north_sumatra` compat;
  `_persist_readings` `.eq("region", region)` (`pihps_scraper.py:441`).
- **Interfaces:** Wilayah filter → `?region=` URL merge (spec
  `analitik-heatmap-tooltip-bnpb.spec.ts:34-38`); e2e asserts
  `option[value="babel"]` / `option[value="kepri"]` (`:31-32`).

### WS3 — 4 heatmaps + 7 KPIs
- **Scope files:** `frontend/components/dashboard/analytics/PriceHeatmap.tsx`,
  `BencanaHeatmap.tsx`, `CorrelationMatrix.tsx`, `TimeHeatstrip.tsx`,
  `heatScale.tsx`, `KpiStrip.tsx`, `frontend/lib/priceStats.ts`,
  `frontend/components/dashboard/AnalyticsSection.tsx:584-656`
  (heatmap memos: PriceHeatmap all-spikes filter-independent; BencanaHeatmap
  BNPB/BMKG/FIRMS × commodity 30d + 48h flag; CorrelationMatrix Pearson overlap
  ≥10; TimeHeatstrip 4-pekan + streak), `:579-582` (7-KPI memo),
  `:818` (`<KpiStrip>`), `:916`/`:937`/`:950`/`:963` (heatmap mounts).
- **Decisions:** honest-empty `< 3` records (no interpolation); no RED synthesis;
  `AnalyticsEmpty` on short data; `tabular-nums`; Lucide icons only.
- **Interfaces:** `GET prices` + `GET spikes` read-only; `priceHistory` /
  `filteredSpikes` / `bnpbEvents` memo inputs; KPI list
  `role="list" name="Indikator analitik"` with 7 pills incl. `Risiko komposit`.

### WS4 — Rich tooltips
- **Scope files:** `frontend/components/dashboard/analytics/AnalyticsTip.tsx`
  (`TipRow`/`TipTitle`/`TipSource`/`fmtRp`), `AnalyticsSection.tsx:781`
  (filter-bar tips), `:1012` (table-row tips), no Portal over map canvas.
- **Decisions:** base-ui tooltip popup (`data-slot="tooltip-content"`);
  hand-rolled glass styling; e2e hovers first KPI pill and asserts popup visible
  (spec `:47-48`).
- **Interfaces:** `<AnalyticsTip>` wraps KPI pills + table cells; hover → popup.

### WS5 — Mixed layout remix
- **Scope files:** `frontend/components/dashboard/AnalyticsSection.tsx:820-821`
  (grid shell `grid-cols-12`), `:824` (trend `col-span-12 lg:col-span-8`),
  `:879` (donut `col-span-12 lg:col-span-4`), `:904`/`:925` (heatmaps 6+6),
  `:945`/`:958` (korelasi 6+6), `:971` (tabel 8) + `:1069` (BNPB panel 4),
  `frontend/components/dashboard/analytics/PriceTrendChart.tsx` (new),
  `SpikeShareDonut.tsx` (new); merges `53c12e2` (4 heatmaps + 7 KPIs + Base-UI
  daily aggregation) and `7bb1668` (PriceTrendChart + SpikeShareDonut mixed layout).
- **Decisions:** mixed horizontal+vertical to maximize space (user constraint):
  trend+donut side-by-side (8+4), heatmap pairs (6+6), table+BNPB bottom row (8+4);
  map canvas removed entirely (single column, no `main canvas` — spec `:51`).
- **Interfaces:** `Card`/`section` grid children; `?section=analytics` entry;
  `#nav-*` tab cycle (spec `:57-63`).

### WS6 — CKAN tier (BNPB aggregate mapper)
- **Scope files:** `backend/app/adapters/bnpb_adapter.py:74-92`
  (`CKAN_BASE`, `CKAN_DATASETS`, `CKAN_PAGE_LIMIT=500`,
  `CKAN_MAX_PAGES_PER_RESOURCE=12`, `CKAN_MAX_ROWS_TOTAL=5000`,
  `CKAN_POLITE_DELAY_SECONDS=1.0`), `:113-130` (`CKAN_HAZARD_COLUMNS`,
  `CKAN_GEO_KEYS`, `CKAN_ID_KEYS`, `CKAN_LEVEL_RADIUS_KM`),
  `:257-536` (`_ckan_count`, `_ckan_float`, `ckan_row_hazards`, `ckan_row_geo`,
  `ckan_row_region`, `ckan_row_in_sumatra`, `ckan_row_level`, `_ckan_get`,
  `_fetch_ckan`, `_datastore_search_all`), `:565-702` (`parse`,
  `_parse_ckan_items`), `backend/tests/test_bnpb_ckan.py` (6 tests).
- **Decisions:** Tier-0 CKAN Action API first (`fetch:392-400` returns
  `{"status": "ckan", ...}` on hit), then DIBI guesses, then bulletin, else honest
  empty; `datastore_search` limit+offset paging; health probe counts CKAN too
  (`:370-385`); never raises (returns None on failure `:433-446`).
- **Interfaces:** `package_search` → `package_show` → `datastore_search`
  (limit 500 + offset); row → event mapper (kab 10 km / prov 25 km radius).

## Constraints (carried)
- Orchestrator Xhigh + High subagents only, never direct tool calls (manager delegates).
- E2E non-interference: tab IDs / `?section=` / `?guest` merge / GET-only / no canvas /
  no vehicles / guard ≥3 (spec has tabs `:57`, `?section` `:13,36`, GET-only, canvas
  guard `:51`, zero pageerror `:54,64`).
- Playwright auto-check always; chain `/goal` + `/boost`; grill-me one-question-at-a-time.
- Push to GitHub for Vercel visibility; plan md inside phase folder, not temp.
- Continue phase numbering (126 = 125 + 1).
