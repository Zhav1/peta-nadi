# PLAN — Phase 118: Analitik Fixes

**Status:** COMPLETE ✅ (docs-only pass; fixes already in working tree)
**Date:** 2026-10-25
**Window:** Xhigh orchestrator + High subagent (no app edits this turn)

## Goal

Fix the Analitik follow-ups on top of the Phase 117 simplified tree: full-width layout with the map entirely removed, honest region mapping, date-true trend headers, and zero-motion shimmer actions — without `shadcn add`.

## Scope map

1. **Remove map entirely, full-width** — no `MapboxOverlay`/globe canvas remains in `AnalyticsSection.tsx`; content is a single `col-span-12` section (current L343-346, L483); header comment L24-28 locks the contract (filter bar + trend + spikes, read-only).
2. **Hand-rolled glass days + shimmer Lihat Laporan, zero-motion, no shadcn add** — day buttons stay native `<button>` with hand-rolled glass classes (current L323-339: `rounded-full border backdrop-blur ... motion-safe:transition`); `Lihat Laporan` stays a hand-rolled relative/overflow-hidden button with a `motion-safe:`-gated shimmer span (current L469-480: `group ... motion-safe:transition`, shimmer `motion-safe:transition-transform motion-safe:duration-700`); no `shadcn add`, no new deps.
3. **REGION_TO_DB 8→north_sumatra, Semua→undefined** — `REGION_TO_DB` maps all 8 province slugs to `north_sumatra` (current L51-60); `regionToDb('') → undefined` = no filter (current L62-65); slug comments L49-50; applied at both fetches (`loadPrices` L195, `loadSpikes` L235).
4. **Trend DD/MM + header date** — `formatDayMonth` DD/MM per bar (L116-122) with `T-` fallback only when `time` is missing (L379); `formatFullDate` header date under the price (L124-130, call site L358-360); count header `Tren {min(days,len)} Titik Terakhir` (L370).
5. **min(days,len) + green/red** — `barHeights` (L262-264) + `barColors` up `#ef4444` / down `#10b981` / flat `#64748b` (L267-273); `hasEnoughRecords >= 3` guard (L277); tooltip `dateLabel: Rp X` (L380-382).
6. **Spikes keep honest** — `SpikeItem` + `severityBadge` + `prettifyRegion` (L94-114); `loadSpikes` server region-filtered + `spikeRecordsTotal` from `/prices limit: 100` (L230-257); `filteredSpikes` sort `spike_pct` desc (L280-284); honest-empty guard `length === 0 || spikeRecordsTotal < 3` with backend-guard message (L431-438); `Table h-11` (L441-466).

## Guardrails (carried)

- Read-only: only `GET prices` + `GET spikes` (L196-199, L236-239); no POST, no new backend routes.
- Dark editorial: 12px min, `tabular-nums` on numerics, Lucide only (`TrendingUp/Filter/Flame/FileText` L4-9), `motion-safe:` on every animation (`AnalyticsMotionStyle` L69-73, `AnimatedValue` L75-92).
- Honest empty never interpolates (`< 3` → `AnalyticsEmpty`).
- No Portal over Mapbox; no `shadcn add`.
- One writer per file; docs-only turn — no app edits, no commit (operator pushes).
