# PLAN — Phase 141: Evaluasi Split Tabs + Fixes

**Window:** 2026-10-26 → 2026-10-27 · **Commits:** `d7f81d3`, `c10218a`, `08bf11a`
**Mode:** docs (no code changes, no commit)

## Objective

Record the split-and-fix slice: Internal Skenario vs Aktual 1:1 tab split,
laporan Keputusan strip + component split + fleet-efficiency footer, Aktual
delta/target fixes, Catat-verifikasi modal wired inline (replacing the
dead `pidi:open-verifikasi` dispatch), and the fuel plausibility guard
(backend 422 + frontend mirror + test fixture correction).

## Scope IN (this folder only)

- `d7f81d3`: `LaporanHybridPanel.tsx` +60 (Keputusan strip, component split,
  efisiensi armada footer).
- `c10218a`: `EvaluationSection.tsx` +218/−103 — Internal Skenario (batch
  read-only) vs Aktual (live) switcher.
- `08bf11a` (6 files, +387/−22): `travels_router.py` (+5),
  `travel_ledger_service.py` (+139), `test_travel_fuel_guard.py` (+127 new),
  `test_travels_erp.py` (+7/−), `EvaluationSection.tsx` (+96),
  `LaporanAktualModal.tsx` (+35).

## Scope OUT

- Phases 139/140 content. No code edits, no test re-runs, no commit/push.
- Never write temp files; docs only under `.planning\phases\`.

## Decisions locked (from diffs + code reads)

1. Tab A "Internal Skenario" = read-only batch (N=60, rumus 1:1, no outcome
   writes); Tab B "Aktual" = live aggregate (rumus 1:1, writes via Laporan
   flow) (`EvaluationSection.tsx:221,346,364,513-539,833`).
2. Live-vs-batch delta strip hidden from Aktual tab; Aktual deltas/targets
   fixed in `08bf11a`.
3. Catat-verifikasi opens the shared `OutcomeVerificationForm` inline in the
   Evaluasi tab instead of dispatching `pidi:open-verifikasi` (which had no
   listener) (`EvaluationSection.tsx:43,906-979`, esp. `:948-949`).
4. Fuel plausibility guard: truck diesel 1.5–25 km/L + 3× baseline-estimate
   cap; backend raises `FuelPlausibilityError` → 422
   (`travel_ledger_service.py:188-266`, `travels_router.py` 422 mapping);
   frontend mirrors pre-PATCH (`LaporanAktualModal.tsx` guard block) and maps
   422 → inline field error; placeholder `120` → `25`.
5. Loss-making-trip test fixture corrected 60L → 40L (≈1.86 km/L, inside guard)
   so the test asserts negativity, not typo-rejection
   (`test_travels_erp.py` NOTE comment).
