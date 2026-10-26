# WALKTHROUGH — Phase 123: Hybrid Layout + Inline Aktual

**Date:** 2026-10-26
**Type:** Docs-only (app edits landed in merge 1de382e; no edits, no commit here)

## What was documented

1. **Hybrid composition** — `LaporanHybridPanel.tsx` (577 lines read): KPI strip,
   savings split (Baseline → Aktual), filter bar, export toolbar, charts,
   tier/period tables, collapsible rincian (`audit-table`), collapsible ledger.
2. **Aktual modal** — `LaporanAktualModal.tsx`: PATCH actuals with `>0` validation,
   Esc close, dispatcher-only (`canEdit`/`disabledHint`).
3. **Roles** — dispatcher sees per-rit detail + `Aktual`/`Hitung`; regulator sees
   per-company aggregates only (`REGULATOR_AGGREGATE`).
4. **Router** — `travels_router.py`: `fleet:write` gate, dispatcher tenant default.

## Fixes tried (carried from work)

- `>0` guards; disabled buttons + read-only fallback for non-dispatcher;
  collapsible rincian/ledger; `solvingTripId` anti-double-submit.

## Verification carried

- `tsc` 0 errors, build 7/7, hermetic Playwright laporan specs pass;
  backend RBAC tests (`test_auth_rbac.py`, `test_fleet_ingest.py` with
  `pos_logistik` claims) green.

## Open flags (not fixed here)

- `Aktual` button lacks `data-testid` (role/text lookup only).
- Solved rits (`hedging_policy` set) cannot re-solve `Hitung` from UI.
