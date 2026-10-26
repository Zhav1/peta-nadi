# PLAN — Phase 131: Ledger Math + Freeze + Backfill Reprice

**Status:** COMPLETE ✅ (app edits landed pre-docs; this window is docs-only, no commit)
**Date:** 2026-10-26

## Goal

Derive every rupiah figure from first principles per trip: per-truck
efficiency (override → golongan → legacy), payload penalty, reefer burn,
SK-frozen fuel price, BPJT tolls, 4-tier spoilage, driver labor — with savings
split summing exactly to the total, and a one-time backfill that reprices old
rows to golongan math + current SK.

## Scope files (read, not edited)

- `backend/app/services/travel_ledger_service.py`
  - `:50-64` Supabase-primary routing (SQLite fallback only when unconfigured
    or on failure); `:171-173` `_storage_backend()`.
  - `:287-373` `_resolve_trip_fuel_context`: efficiency override → asset →
    `GOLONGAN_DEFAULT_KMPL` → legacy flat (unknown golongan only); payload
    penalty `load_factor=clamp(tonnage/gross,0,1)`,
    `eff_adj=eff_base*(1-0.15*load_factor)` (`:299,329`);
    reefer active only when commodity tier `requires_reefer` AND unit is
    reefer, lph travel → asset → 2.0 default (`:331-342`);
    price = SK row at `created_at` × (1+shock) (`:344-347`).
  - `:376-528` `_apply_ledger`: distance declared else `haversine_gazetteer`
    (`:415-423`); `haversine_km` (`:191-202`); baseline fuel =
    distance/eff_adj + reefer lph×hours (`:428-434`); unrecorded actuals mirror
    baseline, zero savings (`:436-447`); tolls via BPJT segments (`:449-456`) —
    unrecorded/no-segment actuals → `[]` → toll 0; spoilage exponential
    (`:458-460`); labor × `DRIVER_OVERTIME_HOURLY_IDR` (`:462-463`); split
    rounded once, components sum exactly (`:481-486`); provenance persisted
    (`:488-498`); `efficiency_pct` guarded on baseline>0 (`:526`).
  - `:604-657` `solve_and_persist_hedging`: per-trip efficiency inversion (never
    global 3.5), detour from measured fuel/time deltas, reefer volume pricing
    override into the solver.
  - `:725-779` `_trip_row`: economy = distance / actual fuel only when
    `actual_recorded` and both > 0, else `None` (`:725-736`); `L/100km` inverse
    (`:736`); fallback flag derived from source (`:737-740`).
- `backend/app/services/spoilage_hedging_service.py`
  - `:100-130` single-source constants: base rates, `TRUCK_FUEL...3.5` (GOL_II
    default, deprecated universal), `DRIVER_OVERTIME_HOURLY_IDR 50000.0`,
    `GOLONGAN_DEFAULT_KMPL`, `REEFER_DEFAULT_LPH 2.0`, `VALID_FUEL_SOURCES`.
  - `:367-451+` solver: per-trip efficiency, reefer volume-vs-tariff branches,
    CONTINUE/REROUTE/HOLD policies.
- `backend/scripts/backfill_fuel_golongan.py:1-143`
  - Contract (`:1-20`): `--dry-run` audit vs `--apply` persist; old rows
    otherwise never repriced.
  - Behavior (`:64-113`): `_reprice_at_date=today`, clear declared baseline
    fuel (recompute golongan), keep measured actuals, `_apply_ledger`,
    stamp `fuel_source="migrated_golongan"`, audit JSONL.

## Decisions

1. Freeze-at-created_at (ledger key) + explicit one-time reprice (backfill key).
2. Measured actuals are observations: backfill never recomputes recorded
   `actual_fuel_liters`.
3. Haversine is the declared-fallback distance estimator, never a road-network
   claim (`distance_source='haversine_gazetteer'`).
4. Savings split is exact by construction (rounded components define the total).
