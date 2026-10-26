# PLAN — Phase 121: Analitik Fixes Followup (6 User Notes)

**Status:** COMPLETE ✅ (docs-only pass, no app edits, no commit)
**Date:** 2026-10-26
**Window:** Xhigh orchestrator + High subagents (docs only, never temp files, no commit)

## Goal

Document the follow-up Analitik fixes applied per 6 user notes, on top of Phase 118 (Analitik Fixes) and Phase 119 (PIHPS 8-Province Scraper) / Phase 120 (multiregion aggregation).

## Scope (applied fixes)

1. **Map canvas removed entirely** — the base globe rendered with `layers: []` (empty globe) plus a misleading Sumatera–Jawa label; removal eliminates the empty-by-construction heatmap and the `no Portal over map` surface at once. Full-width single column (`col-span-12`).
2. **Hand-rolled glass days pills + shimmer Lihat Laporan** — base-ui `Button` outline variant renders transparent on `#0c1017` (bare text). Registry review: only `shimmer-button` is zero-motion adoptable; other registry buttons require motion. Decision: hand-rolled CSS with `motion-safe:` only — no `shadcn add`, no new deps. Days group keeps `role=group` + `aria-pressed`/`aria-label`/`title`.
3. **REGION_TO_DB short-term slug map** — `sumut`/`sumbar`/… → `north_sumatra`; `Semua` → `undefined`. Short-term because the DB only holds `north_sumatra` rows at this point; superseded by the Phase 119 1:1 map + Phase 120 `sumatra_aggregate` once multi-region rows land.
4. **Trend: DD/MM date labels from `time`** — per-bar `DD/MM` via `formatDayMonth` (`T-` index labels only as fallback when `time` is missing); dynamic header `Tren min(days, rows)`; green-down/red-up (`#10b981` down / `#ef4444` up); header shows latest price + date sublabel via `formatFullDate`.
5. **Spikes kept with honest empty** — `spikeRecordsTotal < 3` guard + backend message; `< 5%` threshold guard retained. Empty here is truthful (`eq(sumut)` matches 0 live rows), not a bug.
6. **Tooltip status** — `frontend/components/base-ui/tooltip.tsx` exists (103 lines, dark, render-pattern, no `hideWhenDetached`) but is scaffold-only with zero consumers; Analitik uses native `title` per the no-Portal-over-map rule. Built for future spikes table cells.

## Root cause (producer vs consumers)

- `pihps_scraper.py`: `REGION = north_sumatra` + `SUMUT_PROVINCE_ID = 2` single-province hardcode.
- Pan-Sumatra expansion had reached consumers only (8 ANTARA bureaus, weather spine, gazetteer, Analitik 8-filter UI) but never the producer.
- BI province IDs live-confirmed: aceh=1, north_sumatra=2, west_sumatra=3, riau=4, jambi=6, bengkulu=7, south_sumatra=8, lampung=10.
- Expansion itself (province loop, region-scoped Redis + `latest` compat, 1:1 slug map) was implemented in the prior unit — this window documents the follow-ups only.

## Guardrails (carried)

- Xhigh orchestrator + High subagents MUST (no default subagent); never direct tool calls — always via subagents.
- Playwright auto-check required; E2E no-interference (`?section=analytics` + tab cycle, no POST, honest empty `role=status`).
- Dark editorial, 12px min, `tabular-nums`, Lucide only; `motion-safe:` + reduced-motion static; no Portal over map; no `asChild` misuse.
- Environments: frontend Next 14.2.35 + standalone server on `:3000` (stale server 404s `_next/static` — kill PID + fresh server per Phase-118 learning); backend uvicorn `:8000`; root `npx tsc` shim is wrong — run from `frontend/`.
