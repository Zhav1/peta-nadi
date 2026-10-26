# PLAN — Phase 124: Export + Playwright E2E

**Status:** COMPLETE ✅ (app edits landed pre-docs; this window is docs-only, no commit)
**Date:** 2026-10-26
**Window:** Xhigh orchestrator + High subagents only (never temp files, no commit)

## Goal

Ship regulator-safe export (JSON/CSV/PDF with `REGULATOR_AGGREGATE` per-company-only
rule) plus hermetic Playwright specs that mock the network so runs never depend
on live Render or Mapbox.

## Files changed (verified by reading)

- `frontend/lib/laporanExport.ts` (260 lines, fully read): `escapeLaporanHtml`,
  `buildLaporanPayload` (regulator → `per_company` only, never `trips`),
  `exportLaporanJSON` / `exportLaporanCSV` / `printLaporanPDF` (Blob download +
  `window.open` print with filter badge, KPI cards, negative-as-loss footnote).
- `frontend/e2e/laporan-fixtures.ts` (verified head 60 lines; 237 lines per merge
  stat 8fba88d): `dispatcherProfile()` (`pos_logistik`/DISPATCHER), `regulatorProfile()`
  (`bapanas`/REGULATOR), `tripRow()`, `dispatcherSummary()` (scope
  `DISPATCHER_DETAIL`, `generated_at 2026-10-20`), `mockLaporanApi()` single
  `/api/` branch handler.
- `frontend/e2e/laporan-hybrid.spec.ts` (41 lines), `laporan-aktual.spec.ts`
  (46 lines), `laporan-export.spec.ts` (56 lines), `laporan-filters.spec.ts`
  (30 lines) — all import the shared fixtures (verified `laporan-hybrid.spec.ts:2`
  imports `mockLaporanApi, dispatcherSummary`).
- `frontend/components/dashboard/LaporanHybridPanel.tsx:284-316` (read): export
  toolbar wiring (`data-testid="export-json/csv/pdf"`) passing
  `{filtered, filters, granularity, totals, summary}`.

## Fixes tried

1. Regulator CSV initially leaked per-rit rows → split `buildLaporanCSV`:
   aggregate-only header (`company_id,total_trips,...,cost_efficiency_pct`) vs
   dispatcher per-rit header.
2. Print view XSS via notes/search → `escapeLaporanHtml` on every interpolated
   string in `printLaporanPDF`.
3. Specs flaked on live backend latency → single `/api/` route mock in fixtures;
   no real Mapbox, no backend changes.
4. CSV commas/quotes broke Excel parse → `csvCell` quoting (`/[",\n]/`).

## Constraints (carried)

- Muse Spark High executors only; Supabase-only truth; trigger-only
  backend-computed numbers (export reflects ledger, never fabricates).
- No e2e breakage: E2E is no-interference (mocked network, no POST to live);
  honest-empty `role=status` paths covered.

## Environment notes

- Local: Playwright against `next dev`/standalone `:3000` + backend `:8000`.
- Shared Supabase: specs never touch it (mocked); live Laporan tab reads
  Supabase-primary.
- Render ephemeral + cold timeouts: specs immune (no live calls); live export on
  production can hit cold-start delay — print window opens client-side, data is
  already in-memory, so export never blocks on network.
- Vercel→Render: export is fully client-side (Blob/`window.open`), zero backend
  dependency at export time.

## Issues found (evidence, no assumptions)

- Evidence: `laporanExport.ts:80` — `a.download = PreHub_Laporan_${Date.now()}.json`
  uses wall-clock, unassertable in E2E; specs assert payload/link, not filename.
  Flagged as accepted trade-off.
- Evidence: `printLaporanPDF` returns `false` when `window.open` blocked (popup
  blocker) with no user-facing toast — silent failure path. Flagged, not changed.
- Evidence: regulator print path (`printLaporanPDF:204-221`) hides per-rit rows
  with the aggregate-only notice — verified correct, no leak.
