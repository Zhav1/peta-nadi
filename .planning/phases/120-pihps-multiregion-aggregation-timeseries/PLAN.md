# Phase 120: PIHPS Pan-Sumatra Multi-Region Daily Aggregation & Honest Time-Series Sync

**Status:** COMPLETE ✅
**Date:** 2026-10-25
**Role:** Architect (Gemini 3.8 Flash High) / Executor (DeepCoder Gemini 3.8 Flash Medium)

## 1. Context & Root Cause Analysis

### What Was Wrong on `origin/main`?
1. The PIHPS database in Supabase contains 294 real historical price records covering 7 commodities across 8 provinces.
2. In `origin/main` (commit `77efa2b`), Zhav1 expanded the scraper and added 1:1 slug mapping (`sumbar` -> `west_sumatra`, `sumut` -> `north_sumatra`, etc.), but **left the "Semua wilayah" (`region=None`) query unresolved in the backend**:
   ```sql
   SELECT * FROM commodity_prices WHERE commodity = 'beras' ORDER BY time DESC LIMIT 7;
   ```
3. Because all 8 provinces record prices on the same reporting date (`2026-10-18`), `LIMIT 7` returned 7 rows from 7 different provinces **all on the exact same date (18 Okt 2026)**.
4. The frontend plotted these as a pseudo-time-series, causing:
   - All 7 bars to display the identical date `18/10`.
   - Wild inter-provincial price jumps (e.g. Sumbar Rp 18.650 vs Sumut Rp 15.550) turning all bars **RED** (falsely signaling a massive price spike).
   - Header price displaying South Sumatra's price (`Rp 16.650 / kg`) rather than an aggregate or Sumut baseline.

### What is the Fix?
1. **Backend Aggregation**: When `region` is None/empty (Semua Wilayah), `commodity_router.py` must group records by distinct reporting date (`time`) and compute the true daily average price across reporting provinces (`AVG(price_idr)`). This guarantees that `LIMIT N` returns **N distinct chronological dates**.
2. **Per-Province Integrity**: When a specific region is requested (`sumut`, `sumbar`, etc.), the router continues returning that province's specific time series.
3. **Frontend Precision**: Tooltips and subtitles in `AnalyticsSection.tsx` clearly state whether the displayed price is a single province or the Pan-Sumatra 8-Province Aggregate.

---

## 2. Work Packages (Atomic Breakdown)

### WP1: Backend Daily Aggregation in `commodity_router.py`
- In `backend/app/routers/commodity_router.py`:
  - When `region` is None or empty:
    - Fetch candidate rows for the commodity (up to `limit * 10` rows to cover all provinces).
    - Group by `time` (or date string).
    - Compute `avg_price = round(sum(prices) / len(prices), 2)` for each distinct timestamp.
    - Set `region = "sumatra_aggregate"`.
    - Set `metadata`: `{"province": "Seluruh Sumatera (Agregat PIHPS)", "market": "Pasar Tradisional 8 Provinsi", "sample_count": len(prices)}`.
    - Return the top `limit` distinct date points sorted descending by time.
  - When `region` is specified:
    - Return the province-specific rows ordered by `time DESC LIMIT limit`.
  - Add backend unit test in `backend/tests/test_commodity_aggregation.py` validating that `get_commodity_prices(commodity="beras", limit=7)` returns exactly 7 distinct dates with no duplicate `time`.

### WP2: Frontend Subtitle & Tooltip Polish in `AnalyticsSection.tsx`
- Ensure `AnalyticsSection.tsx` reflects:
  - If `priceRegion` is empty (`Semua wilayah`): Subtitle indicates `Harga Rata-rata 8 Provinsi Sumatera · PIHPS Bank Indonesia`.
  - Tooltips on histogram bars indicate date, price, and scope.
  - Ensure bar delta colors (`barColors`) truthfully reflect inflation/deflation on the aggregated series.

### WP3: Verification Gate
- Run `backend/tests/test_commodity_aggregation.py` (all tests pass).
- Verify via API query: `http://127.0.0.1:8000/api/v1/commodities/prices?commodity=beras&limit=7` yields 7 unique dates (`04/09`, `11/09`, `18/09`, `25/09`, `04/10`, `11/10`, `18/10`).
- Run `npm run test:phase115` (8/8 pass).
- Run `npx tsc --noEmit` (0 errors).
- Run `npm run build` (Next.js production build succeeds).
- Confirm zero Git conflict markers across repository.
