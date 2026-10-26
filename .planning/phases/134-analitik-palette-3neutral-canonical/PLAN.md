# PLAN — Phase 134: Analitik Palette 3+Neutral Canonical

**Status:** COMPLETE ✅ (code landed in `8f30522`; docs-only here)
**Date:** 2026-10-26
**Next phase number:** 134 (max observed 133 → `133-supabase-bridge-seeds-hermetic/`)
**Milestone:** Analitik/Laporan 4-fase — Fase A (style)

## Objective

Canonical palette for Analitik/Laporan: **3 hues + neutral** (red / amber / slate).
Orange and cyan purged from all analitik/laporan surfaces; trend line keeps
single sky exception `#38b8f8`.

## Scope files (from `8f30522`)

- `frontend/components/dashboard/analytics/heatScale.tsx` — `spikeRamp` high≥10 red
  (was orange), `corrRamp` negative slate (was sky blue)
- `frontend/components/dashboard/AnalyticsSection.tsx` — `severityBadge high`
  red; Select triggers `aria-label` Komoditas/Wilayah
- `frontend/components/dashboard/analytics/CorrelationMatrix.tsx` — legend
  negatif slate; progress bar red
- `frontend/components/dashboard/ERPSavingsPanel.tsx` — Dispatcher dot
  cyan→emerald
- `frontend/components/dashboard/LaporanCharts.tsx` — Bar/Area/Line
  `#34d399`/`#22d3ee` → `#10b981`
- Untouched (already canonical): `PriceTrendChart.tsx`, `PriceHeatmap.tsx`,
  `SpikeShareDonut.tsx`, `KpiStrip.tsx`, `TimeHeatstrip.tsx`,
  `BencanaHeatmap.tsx`, `LaporanHybridPanel.tsx`, `LaporanFilterBar.tsx`

## Palette rule (canonical)

- Allowed hues: red `#ef4444`/`#fecaca`, amber `#f59e0b`/`#fde68a`,
  slate `#64748b`/`#94a3b8`/`#cbd5e1`, emerald `#10b981` (Laporan hemat only).
- Banned in analitik/laporan subtree: `#f97316` (orange-500),
  `#22d3ee` (cyan-400), `orange-*`/`cyan-*` Tailwind classes.
- Single exception: trend-line stroke `#38b8f8` (sky) — data ink only,
  asserted in e2e.
- Out-of-scope residual (NOT this phase): `DashboardClient.tsx:199`
  TopNav/legend cyan/orange + `AgentStatusWidget`, `EvaluationSection`
  cyan — map/eval surfaces, deliberately untouched.

## Auth rule

N/A (no auth change in this phase; see Phase 135).

## Backfill rule

N/A (no data-window change in this phase; see Phase 136).
