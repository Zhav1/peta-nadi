# PLAN — Phase 127: Truck/Travel Split + Fuel-Spec Base (014–017)

**Status:** COMPLETE ✅ (app edits landed pre-docs; this window is docs-only, no commit)
**Date:** 2026-10-26
**Window:** docs-only subagent; no app code changes

## Goal

Record the base the fuel-economy work stands on: master/transaction split
(migration 014), KG edge seed (015, dependency-chain context only), fuel-spec
contract columns + versioned price table (016), per-row ledger provenance
columns (017). Ledger math, SK rows, id defaults, and backdate are owned by
Phases 128–131; this phase is schema + contract only.

## Scope files (all read, not edited here)

- `infra/supabase/migrations/014_truck_assets_and_travels.sql:1-156`
  - `truck_assets` master (`:12-30`): `id/truck_id` PK+unique, `vehicle_golongan`
    default `GOL_II`, `fuel_type` default `biosolar`, `sync_status` default
    `synced`; company/sync indexes (`:32-33`); open RLS (SELECT public,
    write authenticated, `:35-51`).
  - `travels` ledger (`:56-132`): snapshot master fields + gazetteer endpoints
    (`origin_coords/dest_coords` JSONB default `[0,0]`), baseline vs actual
    cost columns, savings-split columns, hedging JSON, `sync_status` default
    `synced`; indexes (`:134-138`); same open-RLS shape (`:140-156`).
- `infra/supabase/migrations/015_kg_relationship_seed.sql:15-34`
  - 10 corridor/commodity edges (`ships_via/connects_to/located_in/produces/
    supplies`); idempotent unique edge index; `ON CONFLICT DO NOTHING`.
  - Not fuel logic; recorded because 014/015 ship adjacent and Agent 6 briefings
    read this chain.
- `infra/supabase/migrations/016_fuel_spec_contract.sql:1-118`
  - Golongan efficiency map in header (`:8-17`): GOL_I 4.0 / GOL_II 3.5 /
    GOL_III 3.0 / GOL_IV 2.8 / GOL_V 2.5; NULL asset efficiency MUST resolve via
    map; legacy flat 3.5 stays GOL_II default, deprecated as universal fallback.
  - Asset columns (`:22-36`): `fuel_efficiency_kmpl NULL`,
    `is_reefer NOT NULL DEFAULT FALSE`, `reefer_fuel_lph NULL`.
  - `fuel_prices` table (`:41-58`): `(fuel_type, region, effective_date)` unique;
    `is_fallback NOT NULL DEFAULT TRUE`; open RLS.
  - Fallback seeds (`:82-118`): biosolar NASIONAL 6800 + 20 dexlite/pertamina_dex
    per-province rows at national base rates, all `is_fallback=TRUE`, provenance
    `internal:...#PERTAMINA_FUEL_BASE_RATES`. Explicit note (`:79-80`): no
    verified per-province dex delta in Phase 1.
- `infra/supabase/migrations/017_fuel_ledger_columns.sql:1-36`
  - Nullable/zero-defaulted provenance columns on `travels`:
    `fuel_rate_used_idr, fuel_sk_id, fuel_source, fuel_efficiency_used_kmpl,
    reefer_fuel_lph_used, fuel_effective_date, fuel_sk_number,
    fuel_efficiency_source, fuel_load_factor`.
  - Header contract (`:3-9`): mirrors service dict keys + SQLite `travels`;
    backfill stamps `fuel_source='migrated_golongan'`.

## Decisions (locked, carried forward)

1. Supabase-first persistence; SQLite is dev fallback only (owns Phase 133).
2. No fixed universal 3.5 km/L: golongan map is the contract; flat 3.5 is
   GOL_II-only legacy.
3. Fuel source of truth is ESDM SK rows (Phase 128), never TomTom (traffic data,
   not a fuel authority).
4. Freeze-at-created_at: new trips price at creation; old rows keep frozen rates
   unless explicitly repriced (one-time backfill, Phase 131).
5. Fuel math surfaces only in Laporan/ERP, never map/popover (Phase 132).
6. Null-honest: missing actuals/economy render as absent, never 0 (Phase 132).
