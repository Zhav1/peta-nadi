# Slice 182-05: Laporan Recharts Loop Prevention & North Sumatra Province Boundary Framing Summary

## Deliverables
- **frontend/components/dashboard/LaporanCharts.tsx**:
  - Hoisted all inline object/element props (`CHART_MARGIN`, `X_TICK`, `AXIS_LINE`, `Y_TICK`, `BAR_CURSOR`, `LINE_CURSOR`, `LINE_DOT`, `LINE_ACTIVE_DOT`, `CHART_TOOLTIP_CONTENT = <ChartTooltip />`) to stable module-level constants.
  - Aligned with the fix previously applied in `PriceTrendChart.tsx` (commit `2cec89b`), guaranteeing that Recharts 3.9.2 internal Redux store does not detect prop identity shifts on re-renders, permanently avoiding React Error #185 ("Maximum update depth exceeded").
- **frontend/components/dashboard/DashboardClient.tsx**:
  - Split `SUMATRA_LOCATION_FALLBACK_MAP` entry:
    - `{ keywords: ['medan'], coords: [98.6722, 3.5952], zoom: 11.5 }` (city/urban scale focus).
    - `{ keywords: ['sumatera utara', 'sumut'], coords: [99.0722, 2.7052], zoom: 7.8 }` (pan-provincial framing covering Langkat to Mandailing Natal & Nias).
- **backend/app/nlp/geocoding_service.py**:
  - Updated `PROVINCE_CENTROIDS["Sumatera Utara"]` from Kota Medan `(3.5952, 98.6722)` to the geographic centroid of North Sumatra `(2.7000, 99.0700)` near Lake Toba / Pematang Siantar, preventing macro province mentions from collapsing onto Medan alone.

## Verification
- `npx tsc --noEmit`: Exit code 0 (0 type errors).
- `pytest backend/tests/test_hazard_routing_evidence.py`: 13 passed in 5.94s (100% pass).
- `pytest backend/tests/test_gazetteer_coverage.py backend/tests/test_geocode_search.py backend/tests/test_news_breadth_confidence.py`: 38 passed in 8.65s (100% pass).
- Committed as `a9a3507`.
