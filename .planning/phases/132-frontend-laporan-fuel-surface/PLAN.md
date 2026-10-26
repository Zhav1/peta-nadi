# PLAN — Phase 132: Frontend Laporan Fuel Surface (Fuel-Only-in-Laporan)

**Status:** COMPLETE ✅ (app edits landed pre-docs; this window is docs-only, no commit)
**Date:** 2026-10-26

## Goal

Fuel math surfaces exactly once — in Laporan/ERP — with null-honest rendering:
per-truck efficiency display, SK provenance badges, measured-only economy, and
no fixed 3.5 anywhere in the UI contract.

## Scope files (read, not edited)

- `frontend/lib/types.ts:1083-1130`
  - `:1083-1095` fuel-spec contract: `GOLONGAN_DEFAULT_KMPL`
    (4.0/3.5/3.0/2.8/2.5) + `LEGACY_FLAT_KMPL_FALLBACK_DEPRECATED = 3.5`
    (GOL_II only); `:1097-1106` `FuelPrice` shape; `:1108-1130` `TruckAsset`
    with nullable `fuel_efficiency_kmpl` (`:1121-1122`) and `reefer_fuel_lph`
    (`:1124-1125`).
- `frontend/lib/tripCostCalculator.ts` (verified via prior grep; parity owner):
  `:28` golongan-map contract, `:60` imports map from types, `:73`
  `REEFER_DEFAULT_LPH = 2.0`, `:101-112` override → golongan → legacy priority.
- `backend/app/schemas/travel.py:23-32` (schema-side mirror of the same map +
  deprecation note); `ERPTripRow` carries `economy_kmpl / l_per_100km` as
  Optional (`travel.py:380`, ledger fills at `travel_ledger_service.py:777-778`).
- Laporan composition ( Phases 122–124, referenced not re-read):
  `ERPSavingsPanel.tsx` thinned wrapper → `LaporanHybridPanel` rendering;
  `laporanAggregations.ts` pure helpers; `erpRefreshKey` bumped on ERP tab
  reselect (`83-grounded-routing.../83-01-PLAN.md:55`); export buttons
  (`124/PLAN.md:28`).

## Decisions (UI contract)

1. Fuel only in Laporan: map, popovers, and hedging cards never show fuel math.
2. No fixed 3.5 in UI: null asset efficiency resolves via golongan map; the
   flat constant is deprecated display-wise.
3. Null-honest: `economy_kmpl / l_per_100km` render only for recorded actuals
   (`_trip_row:725-736` + test `:464-482`); planned rits show absent, never 0.
4. Provenance visible: `fuel_rate_used_idr / fuel_sk_number / fuel_source /
   fuel_is_fallback / fuel_efficiency_* / reefer_fuel_lph_used` reach the
   dispatcher row (`:767-776`), so ESDM_SK vs PERTAMINA_FALLBACK is inspectable.
