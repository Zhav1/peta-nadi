# PLAN — Phase 137: Analitik/Laporan Playwright Gate Green

**Status:** COMPLETE ✅ (specs landed in `8f30522`; docs-only here)
**Date:** 2026-10-26
**Next phase number:** 137 (follows 136; max after this milestone: 137)
**Milestone:** Analitik/Laporan 4-fase — Fase D (gate)

## Objective

Hermetic Playwright gate proving Fase A–C: palette contract, guest hard-block,
audit guided/mixed ledger, correlation/streak UX, spike honest-empty — plus
regression appends to the heatmap-tooltip and M7 gates. Zero `pageerror`
everywhere.

## Scope files (from `8f30522`)

- `frontend/e2e/analitik-fixtures.ts` (new, 131 lines) — `mockAnalitikApi`
  (`fullPoints`/`thinPoints`, region-thin vs aggregate routing)
- `frontend/e2e/analitik-palette-3neutral.spec.ts` (new, 92 lines) — source
  grep (14 files, no `#f97316`/`#22d3ee`) + computed-style scan (excl. fixed
  portals, `getClientRects` visibility) + `#38b8f8` trend pin
- `frontend/e2e/guest-laporan-hardblock.spec.ts` (new, 48 lines) — nav
  disabled + `aria-disabled` + title; ledger never mounts; deep-link bounce
  (map active + `alertdialog` + toast); forced-click still blocked
- `frontend/e2e/laporan-audit-guided-empty.spec.ts` (new, 86 lines) —
  guided empty copy + CTA→map; mixed Demo/Real badges (`Demo 1`/`Real 1`)
- `frontend/e2e/analitik-korelasi-streak.spec.ts` (new, 71 lines) — `n=5/10`
  + progressbar + CTA→`n=8/10`; fallback banner; honest-empty "Bedakan"
- `frontend/e2e/analitik-spike-honest-empty.spec.ts` (new, 68 lines) —
  spike honest-empty guard
- `frontend/e2e/analitik-heatmap-tooltip-bnpb.spec.ts` (+15) — appends for
  new UX; `frontend/e2e/m7-analytics-regression-gate.spec.ts` (+6) —
  `mockDispatcherAuth` update; `frontend/e2e/laporan-filters.spec.ts` (+5)
  — Select-migration queries; `laporan-fixtures.ts` (+4)

## Palette rule

Gate enforces Phase 134 (grep + computed-style, sky exception pinned).

## Auth rule

Gate enforces Phase 135 (guest triple-lock, dispatcher mock for ledger paths).

## Backfill rule

Gate enforces Phase 136 (thin-filter fixtures: 8/5 unrescuable, 20/5 fallback,
2/2 honest-empty; real-only, no synthetic fixtures beyond mock transport).
