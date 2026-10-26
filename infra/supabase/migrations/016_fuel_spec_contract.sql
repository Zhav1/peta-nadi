-- Migration 016: Fuel-spec contract foundation (DB only, no ledger-math change)
--
-- Phase 1 of fuel-spec goal: add per-asset fuel-efficiency contract columns and a
-- versioned Pertamina fuel-price table. Ledger math, UI, and seeds are untouched
-- in this phase; these columns are nullable / defaulted so all existing rows
-- and E2E flows keep working unchanged.
--
-- Golongan default fuel-efficiency map (km per liter, diesel freight truck):
--   GOL_I   4.0
--   GOL_II  3.5  (== legacy TRUCK_FUEL_CONSUMPTION_KM_PER_LITER fallback)
--   GOL_III 3.0
--   GOL_IV  2.8
--   GOL_V   2.5
-- When truck_assets.fuel_efficiency_kmpl IS NULL, consumers MUST resolve the
-- efficiency from vehicle_golongan via the map above. The legacy flat 3.5
-- km/L constant (backend/app/services/spoilage_hedging_service.py) remains the
-- GOL_II default and is DEPRECATED as a universal fallback for other golongan.

-- ==========================================================
-- 1. Per-asset fuel contract columns (all nullable/defaulted)
-- ==========================================================
ALTER TABLE truck_assets
  ADD COLUMN IF NOT EXISTS fuel_efficiency_kmpl FLOAT NULL;

ALTER TABLE truck_assets
  ADD COLUMN IF NOT EXISTS is_reefer BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE truck_assets
  ADD COLUMN IF NOT EXISTS reefer_fuel_lph FLOAT NULL;

COMMENT ON COLUMN truck_assets.fuel_efficiency_kmpl IS
  'Per-asset fuel efficiency (km/L). NULL = resolve from vehicle_golongan defaults: GOL_I 4.0, GOL_II 3.5, GOL_III 3.0, GOL_IV 2.8, GOL_V 2.5.';
COMMENT ON COLUMN truck_assets.is_reefer IS
  'True when the unit hauls cold-chain cargo with a diesel reefer genset.';
COMMENT ON COLUMN truck_assets.reefer_fuel_lph IS
  'Reefer genset consumption (liters/hour). NULL = no reefer / unknown.';

-- ==========================================================
-- 2. Versioned Pertamina fuel-price table (reference data)
-- ==========================================================
CREATE TABLE IF NOT EXISTS fuel_prices (
  id            TEXT PRIMARY KEY,
  fuel_type     TEXT NOT NULL,               -- biosolar | dexlite | pertamina_dex
  region        TEXT NOT NULL,               -- 'NASIONAL' or province name
  price_idr     NUMERIC NOT NULL,            -- IDR per liter
  sk_number     TEXT,                        -- ESDM SK reference when known
  effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
  source_url    TEXT,                        -- provenance pointer
  is_fallback   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_fuel_prices_unique
  ON fuel_prices (fuel_type, region, effective_date);
CREATE INDEX IF NOT EXISTS idx_fuel_prices_fuel ON fuel_prices(fuel_type);
CREATE INDEX IF NOT EXISTS idx_fuel_prices_region ON fuel_prices(region);

ALTER TABLE fuel_prices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read access to fuel prices" ON fuel_prices;
CREATE POLICY "Allow read access to fuel prices"
  ON fuel_prices FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "Allow dispatchers to write fuel prices" ON fuel_prices;
CREATE POLICY "Allow dispatchers to write fuel prices"
  ON fuel_prices FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Allow dispatchers to update fuel prices" ON fuel_prices;
CREATE POLICY "Allow dispatchers to update fuel prices"
  ON fuel_prices FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- ==========================================================
-- 3. Seed rows (fallback provenance: code constants, NOT scraped SK)
-- ==========================================================
-- Provenance: backend/app/services/spoilage_hedging_service.py
-- PERTAMINA_FUEL_BASE_RATES (biosolar 6800, dexlite 14550, pertamina_dex 15100).
-- All rows are is_fallback = TRUE until replaced by SK-sourced rows.
-- NOTE: dexlite / pertamina_dex are seeded per Sumatra province at the same
-- national base rate (no verified per-province delta available in Phase 1).

INSERT INTO fuel_prices
  (id, fuel_type, region, price_idr, sk_number, effective_date, source_url, is_fallback)
VALUES
  ('FP-BIOSOLAR-NASIONAL', 'biosolar', 'NASIONAL', 6800, NULL, CURRENT_DATE,
   'internal:backend/app/services/spoilage_hedging_service.py#PERTAMINA_FUEL_BASE_RATES', TRUE)
ON CONFLICT DO NOTHING;

INSERT INTO fuel_prices
  (id, fuel_type, region, price_idr, sk_number, effective_date, source_url, is_fallback)
SELECT
  'FP-' || upper(replace(fuel, ' ', '')) || '-' || upper(replace(prov, ' ', '_')),
  fuel, prov, price, NULL, CURRENT_DATE,
  'internal:backend/app/services/spoilage_hedging_service.py#PERTAMINA_FUEL_BASE_RATES',
  TRUE
FROM (VALUES
  ('dexlite', 'Aceh', 14550.0),
  ('dexlite', 'Sumatera Utara', 14550.0),
  ('dexlite', 'Sumatera Barat', 14550.0),
  ('dexlite', 'Riau', 14550.0),
  ('dexlite', 'Kepulauan Riau', 14550.0),
  ('dexlite', 'Jambi', 14550.0),
  ('dexlite', 'Sumatera Selatan', 14550.0),
  ('dexlite', 'Kepulauan Bangka Belitung', 14550.0),
  ('dexlite', 'Bengkulu', 14550.0),
  ('dexlite', 'Lampung', 14550.0),
  ('pertamina_dex', 'Aceh', 15100.0),
  ('pertamina_dex', 'Sumatera Utara', 15100.0),
  ('pertamina_dex', 'Sumatera Barat', 15100.0),
  ('pertamina_dex', 'Riau', 15100.0),
  ('pertamina_dex', 'Kepulauan Riau', 15100.0),
  ('pertamina_dex', 'Jambi', 15100.0),
  ('pertamina_dex', 'Sumatera Selatan', 15100.0),
  ('pertamina_dex', 'Kepulauan Bangka Belitung', 15100.0),
  ('pertamina_dex', 'Bengkulu', 15100.0),
  ('pertamina_dex', 'Lampung', 15100.0)
) AS v(fuel, prov, price)
ON CONFLICT DO NOTHING;
