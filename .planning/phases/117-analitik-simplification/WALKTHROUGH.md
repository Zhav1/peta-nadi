# WALKTHROUGH — Phase 117: Analitik Simplification

**Scope:** docs-only pass. Simplification already in working tree (`frontend/components/dashboard/AnalyticsSection.tsx`, 526 lines). No app edits this turn; no commit.

## Removed (pre-simplification line numbers, per Phases 111-114 docs)

- `AnalyticsSection.tsx:982` — market-regime `Badge` (outline variant, P1 chrome).
- `AnalyticsSection.tsx:1028` — vertical `Separator` between regime/freshness chrome.
- `AnalyticsSection.tsx:1032-1051` — freshness `Popover` block (trigger `Button` L1035, `PopoverContent side="bottom" sideOffset={8} w-72 p-4` L1040); static titles keep native `title` only.
- `AnalyticsSection.tsx:399-409` — ops-scoped `corridorFilter` (`all` default) + `advisoryFilter`, explicitly separated from price scope before deletion.
- `AnalyticsSection.tsx:878-882` — `rankRows` memo gated by `corridorFilter` (Koridor label) + disparity heatmap/table + `Progress` meters (old L32-33 imports).
- Telemetry / map-overlay — gods-eye chip call sites (`AnimatedValue` L988/L996/L1004/L1081/L1105), `corridorContext` meters, `ScatterplotLayer`/`TextLayer` data layers (old L5-6); replaced by empty-layers globe (see Kept).
- Portal-over-Mapbox guard (old L1130) and strict-mode `getByText` collision surface (duplicate filter bars) removed with the second bar.

## Kept (current file:line, verified by read this window)

- `AnalyticsSection.tsx:25-30` — `AnalyticsSectionProps` (crisis/corridor/routes in, `onSwitchTab` out only).
- `AnalyticsSection.tsx:32-35` — header contract: filter bar + trend + spikes + base globe, read-only GETs.
- `AnalyticsSection.tsx:38-57` — `COMMODITY_OPTIONS` (4), `REGION_OPTIONS` (8 + Semua), `DAY_OPTIONS` (7/14/30).
- `AnalyticsSection.tsx:65-82` — `AnimatedValue` (`motion-safe:animate-[analytics-fade_300ms_ease]`, `tabular-nums`).
- `AnalyticsSection.tsx:84-100` — `SpikeItem` + `severityBadge` + `prettifyRegion`.
- `AnalyticsSection.tsx:112-116` — props `void`-ignored (wiring retained, view renders prices/spikes only).
- `AnalyticsSection.tsx:134-164` — URL sync (`?commodity&region&days`, `replaceState`).
- `AnalyticsSection.tsx:167-200` — `loadPrices` (`api.commodities.prices`, `limit: days`).
- `AnalyticsSection.tsx:203-229` — `loadSpikes` (server region filter + `spikeRecordsTotal` via `/prices limit: 100`).
- `AnalyticsSection.tsx:231-297` — base globe canvas (dark-v11, globe, fog, `MapboxOverlay layers: []`, `ResizeObserver` + 150 ms resize).
- `AnalyticsSection.tsx:302-313` — `barHeights` + `barColors` (up `#ef4444`, down `#10b981`, flat `#64748b`).
- `AnalyticsSection.tsx:317` — `hasEnoughRecords` (`priceHistory.length >= 3`).
- `AnalyticsSection.tsx:319-323` — `filteredSpikes` (commodity filter + `spike_pct` desc).
- `AnalyticsSection.tsx:330-374` — shared filter bar (Komoditas/Wilayah selects + days group `role="group" aria-label="Rentang waktu"` L358, `aria-pressed`/`aria-label`/`title` L364-366, `tabular-nums text-xs h-8` L368).
- `AnalyticsSection.tsx:379-394` — left spatial canvas + honest status overlay (`Visualisasi Aliran Komoditas Spasial`).
- `AnalyticsSection.tsx:399-443` — price card (`Rp … / kg` L407, PIHPS source L417, bars L421-433, `LoadingSkeleton` L436, `AnalyticsEmpty` L441).
- `AnalyticsSection.tsx:447-507` — spikes card (count L457, baseline/threshold note L462, skeleton L467, honest-empty guard L470-477, `Table h-11` L479-506).
- `AnalyticsSection.tsx:508-517` — `Lihat Laporan` → `onSwitchTab('reports')`.
- `AnalyticsSection.tsx:15-19` — kept base-ui imports only (`Badge`, `Button`, `Empty as AnalyticsEmpty`, `Skeleton as LoadingSkeleton`, `Table/*`); `Popover`/`Separator`/`Progress` gone.

## Verification evidence (this window tail)

- `npx tsc --noEmit` → exit 0.
- `npm run build` → 7/7 static routes, 0 errors.
- `pytest` → 49 passed (`vehicles_telemetry` + `travels_erp` + `auth_rbac` suites; shared window tail, same as Phases 111-114).
- Playwright → 1 passed (live Analitik render; E2E no-interference on Peta/Laporan/Evaluasi + `approvals:write`/`fleet:write` 403 paths preserved).
