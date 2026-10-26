-- Migration 017: Fuel-ledger provenance columns on travels (Phase 2).
--
-- Phase 2 persists per-row fuel provenance computed by
-- `travel_ledger_service._apply_ledger` (SK-frozen rate, SK id, source,
-- efficiency used). These columns mirror the service-layer dict keys and the
-- SQLite `travels` table. All nullable/zero-defaulted so existing rows and
-- E2E flows keep working unchanged; the one-time backfill
-- (backend/scripts/backfill_fuel_golongan.py) stamps
-- fuel_source = 'migrated_golongan' on repriced rows.

ALTER TABLE travels
  ADD COLUMN IF NOT EXISTS fuel_rate_used_idr NUMERIC NOT NULL DEFAULT 0;

ALTER TABLE travels
  ADD COLUMN IF NOT EXISTS fuel_sk_id TEXT;

ALTER TABLE travels
  ADD COLUMN IF NOT EXISTS fuel_source TEXT;

ALTER TABLE travels
  ADD COLUMN IF NOT EXISTS fuel_efficiency_used_kmpl NUMERIC;

ALTER TABLE travels
  ADD COLUMN IF NOT EXISTS reefer_fuel_lph_used NUMERIC;

ALTER TABLE travels
  ADD COLUMN IF NOT EXISTS fuel_effective_date DATE;

ALTER TABLE travels
  ADD COLUMN IF NOT EXISTS fuel_sk_number TEXT;

ALTER TABLE travels
  ADD COLUMN IF NOT EXISTS fuel_efficiency_source TEXT;

ALTER TABLE travels
  ADD COLUMN IF NOT EXISTS fuel_load_factor NUMERIC;
