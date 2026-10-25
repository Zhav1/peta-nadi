# PLAN — Phase 117: Analitik Simplification

**Status:** COMPLETE ✅ (docs-only pass; simplification already in working tree)
**Date:** 2026-10-25
**Window:** Xhigh orchestrator + High subagent (no app edits this turn)

## Goal

Simplify Analitik to exactly what the 6 user notes require: shared filters + green/red price trend + honest-empty spikes + Laporan link + accessible day selector. Remove regime / freshness / telemetry / map-overlay / ops surfaces.

## User notes → scope map

1. Remove market-regime badge + freshness popover → deleted pre-simplification `AnalyticsSection.tsx:982` (regime `Badge`), `L1028` (vertical `Separator`), `L1032-1051` (freshness `Popover`, trigger `Button` L1035, `PopoverContent side="bottom" sideOffset={8} w-72 p-4` L1040).
2. Remove telemetry HUD chips → deleted gods-eye chip call sites (`AnimatedValue` L988/L996/L1004/L1081/L1105) and `corridorContext`/telemetry-driven meters; props retained only for `DashboardClient` wiring, intentionally ignored (`void` L114-116).
3. Remove map data overlay → base globe canvas only: `MapboxOverlay({ interleaved: false, layers: [] })` + fog + `ResizeObserver` (current L231-297); no `ScatterplotLayer`/`TextLayer` data layers (old L5-6 imports removed).
4. Remove ops filters + rank/disparity table → deleted `corridorFilter`/`advisoryFilter` (old L399-409), `rankRows` memo (old L878-882), disparity heatmap/table, `Progress` meters (old L32-33); price scope is single `priceRegion` only.
5. Keep filters + green/red trend + spikes honest-empty + Reports link → kept (see Kept section).
6. Days selector a11y → `role="group" aria-label="Rentang waktu"` + per-button `aria-pressed` / `aria-label` (`"${d} hari terakhir"`) / `title` + `tabular-nums text-xs h-8` (current L358-368).

## Kept (current `frontend/components/dashboard/AnalyticsSection.tsx`, 526 lines)

- Filters: `COMMODITY_OPTIONS` L38-43 (4 komoditas), `REGION_OPTIONS` L45-55 (8 provinsi + Semua), `DAY_OPTIONS` L57 (7/14/30), filter bar L330-374, URL sync L134-164 (`?commodity&region&days`, `replaceState`).
- Price trend: `loadPrices` L167-200 (`api.commodities.prices`, `limit: days`), `barHeights` L302-304, `barColors` L307-313 (up `#ef4444`, down `#10b981`, flat `#64748b`), `hasEnoughRecords` L317 (`>= 3`), honest empty L420-443.
- Spikes: `SpikeItem` L84-93, `loadSpikes` L203-229 (server region-filtered + `spikeRecordsTotal` from `/prices limit: 100`), `filteredSpikes` L319-323 (sort `spike_pct` desc), table L479-506 (`Table h-11`, `severityBadge` L95-100), honest empty guard L470-477 (`filteredSpikes.length === 0 || spikeRecordsTotal < 3` with backend-guard message L473-474).
- Reports link: `onSwitchTab('reports')` button L508-517 (`FileText` L11/L515, props contract L29).
- Read-only: only `GET prices` + `GET spikes` (L34-35, L172/L208-210); no POST, no new backend routes.

## Guardrails (carried)

- Dark editorial: 12px min, `tabular-nums` on numerics, Lucide only, `motion-safe:` on animations (`AnimatedValue` L65-82, `AnalyticsMotionStyle` L59-63).
- No Portal over Mapbox; honest empty never interpolates (`< 3` → `AnalyticsEmpty`).
- One writer per file; docs-only turn — no app edits, no commit (operator pushes).
