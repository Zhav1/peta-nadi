# PLAN — Phase 136: Real PIHPS Backfill 180d + Korelasi/Streak UX

**Status:** COMPLETE ✅ (code landed in `8f30522`; docs-only here)
**Date:** 2026-10-26
**Next phase number:** 136 (follows 135)
**Milestone:** Analitik/Laporan 4-fase — Fase C (real data + UX)

## Objective

Real PIHPS weekly backfill (180 days ≈ 25 points/series) so every region —
incl. `babel`/`kepri` — meets the correlation (n≥10) and streak (≥14) guards
without fabrication. Thin filters get an honest Sumatera-aggregate fallback
with visible labeling; short data stays honest-empty, never zero.

## Scope files (from `8f30522`)

- `backend/app/scrapers/pihps_scraper.py` — window `30d`→`180d` weekly
  (`tipe_laporan=2`); `FETCH_PROVINCE_ORDER` incl. babel/kepriunchanged
- `backend/app/routers/commodity_router.py` — spikes `limit 500`→`1000`
- `frontend/components/dashboard/AnalyticsSection.tsx` — `REGION_FULL_NAMES`
  babel/kepri; `multiSeries` `limit 60`→`100` via `fetchSeries` helper;
  `<14`-point thin-series fallback to Sumatera aggregate (`multiFallback`
  flag); correlation caption "bukan 0 · ambang 10 tetap"; streak caption
  "kurang = data kurang, bukan 0" + fallback note
- `frontend/components/dashboard/analytics/CorrelationMatrix.tsx` —
  `regionActive`/`windowDays`/`onShowAll` props; `n=max/10` readout,
  `role=progressbar` (max 10), "butuh N titik lagi" + "pilih Semua wilayah" CTA,
  "Cara baca" paragraph
- `frontend/components/dashboard/analytics/TimeHeatstrip.tsx` —
  `fallbackActive`/`minPoints=14` props; "Fallback agregat Sumatera aktif" note;
  honest-empty "Bedakan: data kurang … bukan 0 mggu"

## Palette rule

Follows Phase 134 (progress red, negative slate, empty neutral).

## Auth rule

Read-only `GET prices`/`GET spikes`; no auth change.

## Backfill rule (canonical)

- Real PIHPS only: fetch from BI; when BI returns empty, render honest-empty —
  never synthesize points.
- Window 180d weekly; per-region Redis snapshots; `_persist_readings`
  `.eq("region", region)`.
- Thresholds frozen: correlation overlap n≥10 (not computed below, shown as
  blank — never 0); streak needs ≥14 points (short = "data kurang", never
  "0 mggu"). Fallback aggregate must be labeled in-UI whenever active.
