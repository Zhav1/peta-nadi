# WALKTHROUGH — Phase 118: Analitik Fixes

**Scope:** docs-only pass. Fixes already in working tree (`frontend/components/dashboard/AnalyticsSection.tsx`, ~489 lines). No app edits this turn; no commit.

## Removed

- Map/globe canvas entirely — no `MapboxOverlay`, no `ScatterplotLayer`/`TextLayer`, no `ResizeObserver` globe block; replaced by full-width single column `col-span-12` section (`AnalyticsSection.tsx:343-346`, close `483-485`); contract comment `24-28`.

## Kept / fixed (current file:line, verified by read this window)

- `AnalyticsSection.tsx:4-9` — Lucide only (`TrendingUp`, `Filter`, `Flame`, `FileText`).
- `AnalyticsSection.tsx:12-15` — kept base-ui imports only (`Badge`, `Empty as AnalyticsEmpty`, `Skeleton as LoadingSkeleton`, `Table/*`); no `shadcn add`.
- `AnalyticsSection.tsx:17-22` — `AnalyticsSectionProps` (crisis/corridor/routes in, `onSwitchTab` out only).
- `AnalyticsSection.tsx:24-28` — header contract: filter bar + trend + spikes, single full-width column, read-only GETs.
- `AnalyticsSection.tsx:30-35` — `COMMODITY_OPTIONS` (4).
- `AnalyticsSection.tsx:37-47` — `REGION_OPTIONS` (8 + Semua `''`).
- `AnalyticsSection.tsx:49-65` — `REGION_TO_DB` (8 slugs → `north_sumatra`) + `regionToDb('') → undefined`.
- `AnalyticsSection.tsx:67` — `DAY_OPTIONS` (7/14/30).
- `AnalyticsSection.tsx:69-92` — `AnalyticsMotionStyle` + `AnimatedValue` (`motion-safe:animate-[analytics-fade_300ms_ease]`, `tabular-nums`).
- `AnalyticsSection.tsx:94-114` — `SpikeItem` + `severityBadge` + `prettifyRegion`.
- `AnalyticsSection.tsx:116-130` — `formatDayMonth` (DD/MM) + `formatFullDate` (header date).
- `AnalyticsSection.tsx:140-142` — props `void`-ignored (wiring retained, view renders prices/spikes only).
- `AnalyticsSection.tsx:157-187` — URL sync (`?commodity&region&days`, `replaceState`).
- `AnalyticsSection.tsx:190-227` — `loadPrices` (`regionToDb(priceRegion)`, `limit: days`).
- `AnalyticsSection.tsx:230-257` — `loadSpikes` (server region filter + `spikeRecordsTotal` via `/prices limit: 100`).
- `AnalyticsSection.tsx:262-273` — `barHeights` + `barColors` (up `#ef4444`, down `#10b981`, flat `#64748b`).
- `AnalyticsSection.tsx:275-278` — `commodityLabel` + `hasEnoughRecords (>= 3)` + `lastTime`.
- `AnalyticsSection.tsx:280-284` — `filteredSpikes` (commodity filter + `spike_pct` desc).
- `AnalyticsSection.tsx:291-341` — shared filter bar (Komoditas/Wilayah selects + hand-rolled glass days group `role="group" aria-label="Rentang waktu"` L319, `aria-pressed`/`aria-label`/`title` L326-328, glass classes L330-334).
- `AnalyticsSection.tsx:350-366` — price header (`Rp … / kg` L357, `formatFullDate(lastTime)` L359, `Data tidak tersedia` fallback L363).
- `AnalyticsSection.tsx:368-404` — trend card (`Tren {min(days,len)} Titik Terakhir` L370, PIHPS source L371, `barColors` bars L385-389, per-bar DD/MM label L390 + tooltip L380-382, `T-` fallback L379 only when `time` missing, `LoadingSkeleton` L397, `AnalyticsEmpty` L398/403).
- `AnalyticsSection.tsx:409-468` — spikes card (count L418, baseline note L422-424, skeleton L428, honest-empty guard + backend message L431-438, `Table h-11` L441-466).
- `AnalyticsSection.tsx:469-480` — `Lihat Laporan` → `onSwitchTab('reports')` (hand-rolled glass + `motion-safe:` shimmer span L475, zero motion when reduced).

## Verification evidence (this window tail)

- `npx tsc --noEmit` → exit 0.
- `npm run build` → 7/7 static routes, 0 errors.
- `pytest` → shared window tail green (same suites as Phases 111-114/117).
- Playwright → 1 passed (live Analitik render; E2E no-interference on Peta/Laporan/Evaluasi + `approvals:write`/`fleet:write` 403 paths preserved).
