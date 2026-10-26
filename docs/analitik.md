# Analitik Mixed Dashboard + BNPB CKAN Status (Phase 126)

**Status:** COMPLETE ✅ (commits `35d6d42`, `6b3317f`, `53c12e2`/`7bb1668`, `c6eba1b`)

## Mixed dashboard

- Row 1: price trend (8 cols, `PriceTrendChart.tsx`) + spike share donut (4 cols, `SpikeShareDonut.tsx`).
- Row 2–3: 4 heatmaps in 6+6 pairs — `PriceHeatmap` (wilayah × komoditas), `BencanaHeatmap` (BNPB/BMKG/FIRMS × komoditas, 30d + 48h flag), `CorrelationMatrix` (Pearson, overlap ≥10), `TimeHeatstrip` (4 pekan + streak).
- Row 4: commodity table (8) + BNPB panel (4).
- 7-KPI strip (`KpiStrip.tsx`) with base-ui rich tooltips (`AnalyticsTip.tsx`); honest-empty <3 records; no RED synthesis; map canvas removed (GET-only).
- 10-province PIHPS: `babel` / `kepri` backfill via `{commodity}@{region}` fetch keys and per-region Redis snapshots (`backend/app/scrapers/pihps_scraper.py`).

## BNPB CKAN status: DEGRADED → CKAN stats live

- Tier-0 `https://data.bnpb.go.id/api/3/action` (`package_search` → `package_show` → `datastore_search`, limit 500 + offset, ≤1 req/s, 1h async cadence in `BNPBAdapter.poll_interval_seconds`).
- Aggregate row→event mapper (`ckan_row_hazards` / `ckan_row_geo` / `ckan_row_region` / `ckan_row_level`; kab 10 km / prov 25 km radii); lat variants + numeric coercion handled; TSUNAMI text-mapped.
- Fallback chain: CKAN → DIBI → bulletin → honest empty (DIBI 404 / Cloudflare 403 / InaRISK 0-resource / ArcGIS 500 all diagnosed and skipped as tiers).
- Annual aggregates are labelled stats (source note + >24h stale chip), never live alerts; **realtime hazard signal stays on BMKG/FIRMS**.
- Dead ends recorded: no `kab-2025`/`monthly-2025` datasets exist; PNG infografis not machine-readable.

## Gates

- `test_bnpb_ckan.py` 6 passed; Playwright `analitik-heatmap-tooltip-bnpb` + M7 regression gate 2 passed; laporan 5 passed; phase57 8 pre-existing failures (copy drift, unrelated).

## Analitik/Laporan milestone 4-fase (commit `8f30522`, phases 134–137)

- 134 palette 3+neutral canonical → `.planning/phases/134-analitik-palette-3neutral-canonical/`
- 135 guest hard-block + audit guided + demo seed → `.planning/phases/135-laporan-guest-hardblock-audit-seed/`
- 136 real PIHPS backfill 180d + korelasi/streak UX → `.planning/phases/136-pihps-backfill-korelasi-streak-ux/`
- 137 playwright gate green → `.planning/phases/137-analitik-laporan-playwright-gate/`
