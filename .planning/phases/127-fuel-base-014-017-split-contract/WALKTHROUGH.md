# WALKTHROUGH — Phase 127: Truck/Travel Split + Fuel-Spec Base (014–017)

Docs-only window. No app files edited, no tests run, no commits.

## What was read (file:line)

1. `infra/supabase/migrations/014_truck_assets_and_travels.sql`
   - `:1-7` header: split intent, `custom_fleet_vehicles` untouched, travels may
     reference `truck_assets.truck_id` or legacy `vehicle_id`.
   - `:12-30` master table; `:32-33` indexes; `:35-51` RLS (effectively open:
     public SELECT, authenticated write `USING/WITH CHECK (true)`).
   - `:56-132` travels ledger; `:134-138` indexes; `:140-156` same open RLS.
2. `infra/supabase/migrations/015_kg_relationship_seed.sql:15-34` — 10 edges,
   unique-edge index, conflict-ignore insert.
3. `infra/supabase/migrations/016_fuel_spec_contract.sql`
   - `:8-17` golongan map + deprecation rule; `:22-36` asset columns + comments;
     `:41-58` `fuel_prices` DDL + RLS; `:82-118` fallback seeds.
4. `infra/supabase/migrations/017_fuel_ledger_columns.sql:1-36` — 9 provenance
   columns, all nullable/zero-defaulted; backfill-stamp contract in header.

## Fixes tried

None in this window (docs-only). Historical fixes owned elsewhere:
- Open-RLS + router-side tenancy decision predates this window (see
  `.planning/LEARNINGS.md:224` concern: 014 RLS effectively open, isolation
  rests on router filters).
- No centroid fallback for gazetteer misses is a schema-reviewer rule enforced
  at the boundary, not in these DDL files (defaults remain `[0,0]` JSONB).

## Test evidence

No tests executed in this docs window. Math/provenance coverage lives in
`backend/tests/test_travels_erp.py` (owned by Phase 131 docs):
- `:160-197` ledger uses real BPJT + fuel + spoilage;
- `:431-461` provenance branching (hermetic SQLite vs Supabase SK).
