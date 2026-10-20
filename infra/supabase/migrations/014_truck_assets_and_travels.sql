-- Migration 014: Truck Asset Master & Travel (Rit) Ledger
-- Splits the master truck asset from the transactional travel/rit and stores
-- the ERP savings split derived from BPJT tariffs + Pertamina fuel + spoilage.
--
-- Backward compatibility: `custom_fleet_vehicles` (migration 007) is untouched.
-- New travels may reference either truck_assets.truck_id or a legacy
-- custom_fleet_vehicles.vehicle_id.

-- ==========================================================
-- 1. Master truck asset (registered once — Step 1 onboarding)
-- ==========================================================
CREATE TABLE IF NOT EXISTS truck_assets (
  id                TEXT PRIMARY KEY,
  truck_id          TEXT UNIQUE NOT NULL,          -- nopol / vehicle_id
  name              TEXT NOT NULL,
  modality          TEXT NOT NULL DEFAULT 'truck',
  vin               TEXT,
  vehicle_golongan  TEXT NOT NULL DEFAULT 'GOL_II', -- BPJT GOL_I..GOL_V
  driver_name       TEXT,
  driver_phone      TEXT,
  company_id        TEXT DEFAULT 'org-prehub-pilot',
  company_name      TEXT,
  gross_weight_ton  NUMERIC DEFAULT 12.0,
  fuel_type         TEXT NOT NULL DEFAULT 'biosolar',
  notes             TEXT,
  created_by        TEXT,
  sync_status       TEXT NOT NULL DEFAULT 'synced',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_truck_assets_company ON truck_assets(company_id);
CREATE INDEX IF NOT EXISTS idx_truck_assets_sync ON truck_assets(sync_status);

ALTER TABLE truck_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read access to truck assets" ON truck_assets;
CREATE POLICY "Allow read access to truck assets"
  ON truck_assets FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "Allow dispatchers to write truck assets" ON truck_assets;
CREATE POLICY "Allow dispatchers to write truck assets"
  ON truck_assets FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Allow dispatchers to update truck assets" ON truck_assets;
CREATE POLICY "Allow dispatchers to update truck assets"
  ON truck_assets FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow dispatchers to delete truck assets" ON truck_assets;
CREATE POLICY "Allow dispatchers to delete truck assets"
  ON truck_assets FOR DELETE TO authenticated USING (true);

-- ==========================================================
-- 2. Travel / rit ledger (transactional — Step 2 onboarding + ERP)
-- ==========================================================
CREATE TABLE IF NOT EXISTS travels (
  id                        TEXT PRIMARY KEY,
  truck_id                  TEXT NOT NULL,
  truck_name                TEXT,
  company_id                TEXT,
  driver_name               TEXT,

  -- Gazetteer-resolved endpoints (no centroid fallback)
  origin_name               TEXT NOT NULL,
  origin_ref                TEXT,
  origin_coords             JSONB NOT NULL DEFAULT '[0,0]'::jsonb,
  destination_name          TEXT NOT NULL,
  destination_ref           TEXT,
  dest_coords               JSONB NOT NULL DEFAULT '[0,0]'::jsonb,

  -- Cargo & SLA
  commodity_key             TEXT NOT NULL,
  cargo_tonnage             NUMERIC NOT NULL,
  cargo_value_idr           NUMERIC NOT NULL DEFAULT 0,
  cargo_value_source        TEXT NOT NULL DEFAULT 'declared',
  vehicle_golongan          TEXT NOT NULL DEFAULT 'GOL_II',
  fuel_type                 TEXT NOT NULL DEFAULT 'biosolar',
  sla_deadline_hours        NUMERIC NOT NULL,

  -- Baseline (open corridor)
  baseline_distance_km      NUMERIC,
  distance_source           TEXT DEFAULT 'declared',
  baseline_time_hours       NUMERIC NOT NULL,
  blocked_delay_hours       NUMERIC NOT NULL DEFAULT 0,
  baseline_fuel_liters      NUMERIC,
  baseline_toll_segments    JSONB NOT NULL DEFAULT '[]'::jsonb,
  baseline_fuel_cost_idr    NUMERIC NOT NULL DEFAULT 0,
  baseline_toll_cost_idr    NUMERIC NOT NULL DEFAULT 0,
  baseline_spoilage_idr     NUMERIC NOT NULL DEFAULT 0,
  baseline_labor_idr        NUMERIC NOT NULL DEFAULT 0,
  baseline_cost_idr         NUMERIC NOT NULL DEFAULT 0,

  -- Actual (realised)
  actual_time_hours         NUMERIC,
  actual_recorded           BOOLEAN NOT NULL DEFAULT FALSE,
  actual_fuel_liters        NUMERIC,
  actual_toll_segments      JSONB NOT NULL DEFAULT '[]'::jsonb,
  actual_fuel_cost_idr      NUMERIC NOT NULL DEFAULT 0,
  actual_toll_cost_idr      NUMERIC NOT NULL DEFAULT 0,
  actual_spoilage_idr       NUMERIC NOT NULL DEFAULT 0,
  actual_labor_idr          NUMERIC NOT NULL DEFAULT 0,
  actual_cost_idr           NUMERIC NOT NULL DEFAULT 0,

  -- Savings split (components sum to saved_cost_idr)
  saved_time_hours          NUMERIC NOT NULL DEFAULT 0,
  saved_fuel_liters         NUMERIC NOT NULL DEFAULT 0,
  saved_fuel_cost_idr       NUMERIC NOT NULL DEFAULT 0,
  saved_toll_idr            NUMERIC NOT NULL DEFAULT 0,
  saved_spoilage_idr        NUMERIC NOT NULL DEFAULT 0,
  saved_labor_idr           NUMERIC NOT NULL DEFAULT 0,
  saved_cost_idr            NUMERIC NOT NULL DEFAULT 0,
  efficiency_pct            NUMERIC NOT NULL DEFAULT 0,

  -- Execution
  rerouted                  BOOLEAN NOT NULL DEFAULT FALSE,
  disruption_id             TEXT,
  status                    TEXT NOT NULL DEFAULT 'planned',
  inflation_shock_factor    NUMERIC NOT NULL DEFAULT 0,

  -- Persisted hedging decision (Continue / Reroute / Hold)
  hedging                   JSONB,
  hedging_policy            TEXT,
  hedging_net_savings_idr   NUMERIC,
  hedging_solved_at         TIMESTAMPTZ,

  notes                     TEXT,
  created_by                TEXT,
  sync_status               TEXT NOT NULL DEFAULT 'synced',
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivered_at              TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_travels_company ON travels(company_id);
CREATE INDEX IF NOT EXISTS idx_travels_truck ON travels(truck_id);
CREATE INDEX IF NOT EXISTS idx_travels_status ON travels(status);
CREATE INDEX IF NOT EXISTS idx_travels_disruption ON travels(disruption_id);
CREATE INDEX IF NOT EXISTS idx_travels_created ON travels(created_at DESC);

ALTER TABLE travels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read access to travels" ON travels;
CREATE POLICY "Allow read access to travels"
  ON travels FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "Allow dispatchers to insert travels" ON travels;
CREATE POLICY "Allow dispatchers to insert travels"
  ON travels FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Allow dispatchers to update travels" ON travels;
CREATE POLICY "Allow dispatchers to update travels"
  ON travels FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow dispatchers to delete travels" ON travels;
CREATE POLICY "Allow dispatchers to delete travels"
  ON travels FOR DELETE TO authenticated USING (true);
