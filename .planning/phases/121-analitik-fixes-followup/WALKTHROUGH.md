# WALKTHROUGH — Phase 121: Analitik Fixes Followup

**Date:** 2026-10-26
**Type:** Docs-only (no app edits, no commit)

## What was documented

1. **Map removal** — empty globe (`layers: []`) + misleading Sumatera–Jawa label → canvas deleted, single full-width column.
2. **Buttons** — transparent base-ui outline on `#0c1017` looked like bare text → hand-rolled glass days pills (`role=group`, `aria-pressed`/`label`/`title`) + zero-motion shimmer `Lihat Laporan` (`motion-safe:` only). Registry audit: only `shimmer-button` adoptable as-is; others need motion. No `shadcn add`, no new deps.
3. **REGION_TO_DB (short-term)** — 8 slugs collapse to `north_sumatra`, `Semua` → `undefined`; valid only while DB holds north_sumatra rows. Superseded by Phase 119 1:1 map.
4. **Trend honesty** — per-bar `DD/MM` from `time` (`T-` fallback only when `time` missing), header latest price + full-date sublabel, `Tren min(days, rows)`, green `#10b981` down / red `#ef4444` up. Note: `64.750` header figure has no constant — it is live `items[0]`.
5. **Spikes honest-empty** — `spikeRecordsTotal < 3` guard + `< 5%` threshold; `eq(sumut)` matches 0 live rows, so empty is correct output, not a defect.
6. **Tooltip scaffold** — `tooltip.tsx` (103 lines, dark, render-pattern, no `hideWhenDetached`) ships with zero consumers; Analitik stays on native `title`. Reserved for future spikes cells.

## Prior-unit boundary

Producer expansion (province loop over BI ids 1/2/3/4/6/7/8/10, region-scoped Redis + `latest` compat, 1:1 slug map) belongs to the prior unit. This window covers follow-ups only.

## Verification carried from window tail

- `tsc` 0 errors, `npm run build` 7/7, pytest green (shared tail), Playwright 1 passed (live, E2E no-interference preserved).
- Stale e2e `m7` gate spec still asserts the removed map — left for owner (flagged, not edited here).
