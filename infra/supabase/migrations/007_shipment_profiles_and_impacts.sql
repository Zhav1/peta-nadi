-- Migration 007: Shipment Profiles, Business Constraints & Disruption Impact Assessments
-- Synchronizes active fleet shipments, spoilage constraints, and closed-loop impact assessments with Supabase.

-- 1. Table for custom and onboarded fleet vehicles with first-class ShipmentProfiles
CREATE TABLE IF NOT EXISTS custom_fleet_vehicles (
  id                    TEXT PRIMARY KEY,
  vehicle_id            TEXT UNIQUE NOT NULL,
  name                  TEXT NOT NULL,
  driver_name           TEXT,
  driver_phone          TEXT,
  modality              TEXT NOT NULL DEFAULT 'truck',
  cargo                 TEXT,
  commodity_key         TEXT,
  cargo_tonnage         NUMERIC DEFAULT 10.0,
  cargo_value_idr       NUMERIC,
  vehicle_golongan      TEXT DEFAULT 'GOL_II',
  gross_weight_ton      NUMERIC DEFAULT 12.0,
  sla_deadline_hours    NUMERIC DEFAULT 8.0,
  has_bkhit_cert        BOOLEAN DEFAULT FALSE,
  origin                TEXT,
  destination           TEXT,
  speed_kmh             NUMERIC DEFAULT 60.0,
  temperature_c         NUMERIC,
  path_json             TEXT,
  status                TEXT DEFAULT 'moving',
  mmsi                  TEXT,
  imo                   TEXT,
  vin                   TEXT,
  icao24                TEXT,
  callsign              TEXT,
  organization_id       TEXT DEFAULT 'org-prehub-pilot',
  created_by            TEXT DEFAULT 'dispatcher',
  sync_status           TEXT DEFAULT 'synced',
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_custom_vehicles_modality ON custom_fleet_vehicles(modality);
CREATE INDEX IF NOT EXISTS idx_custom_vehicles_commodity ON custom_fleet_vehicles(commodity_key);
CREATE INDEX IF NOT EXISTS idx_custom_vehicles_sync ON custom_fleet_vehicles(sync_status);

-- Enable Row Level Security (RLS) on custom_fleet_vehicles
ALTER TABLE custom_fleet_vehicles ENABLE ROW LEVEL SECURITY;

-- RLS Policy: All authenticated users and anon guests can read fleet vehicles
CREATE POLICY "Allow public read access to fleet vehicles"
  ON custom_fleet_vehicles
  FOR SELECT
  TO public
  USING (true);

-- RLS Policy: Dispatchers can insert or update fleet vehicles
CREATE POLICY "Allow dispatchers to insert fleet vehicles"
  ON custom_fleet_vehicles
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow dispatchers to update fleet vehicles"
  ON custom_fleet_vehicles
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- 2. Table for Disruption Impact Assessment Traces
CREATE TABLE IF NOT EXISTS incident_impact_assessments (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id             TEXT NOT NULL,
  hazard_type             TEXT NOT NULL DEFAULT 'flood',
  latitude                NUMERIC NOT NULL,
  longitude               NUMERIC NOT NULL,
  radius_km               NUMERIC NOT NULL DEFAULT 15.0,
  severity                TEXT NOT NULL DEFAULT 'critical',
  total_fleet_scanned     INTEGER NOT NULL DEFAULT 0,
  impacted_vehicles_count INTEGER NOT NULL DEFAULT 0,
  impacted_vehicles       JSONB NOT NULL DEFAULT '[]'::jsonb,
  evaluated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_impact_assessments_incident ON incident_impact_assessments(incident_id);
CREATE INDEX IF NOT EXISTS idx_impact_assessments_evaluated ON incident_impact_assessments(evaluated_at DESC);

-- Enable Row Level Security (RLS) on incident_impact_assessments
ALTER TABLE incident_impact_assessments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to impact assessments"
  ON incident_impact_assessments
  FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Allow insert impact assessments"
  ON incident_impact_assessments
  FOR INSERT
  TO authenticated
  WITH CHECK (true);
