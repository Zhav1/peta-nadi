-- ==============================================================================
-- PetaNadi / LRIP — Initial Database Schema
-- Migration: 000_init.sql
-- Run this in: Supabase SQL Editor → New Query → Run
-- ==============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE EXTENSION IF NOT EXISTS vector;

-- ==============================================================================
-- Data Source Health Tracking
-- Tracks the live status of each external API adapter
-- ==============================================================================
CREATE TABLE IF NOT EXISTS data_sources (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,           -- 'bmkg', 'tomtom', 'aisstream', 'nasa_firms', 'pihps'
  status      TEXT NOT NULL DEFAULT 'ok',     -- 'ok', 'degraded', 'down'
  last_ok_at  TIMESTAMPTZ,
  cached_at   TIMESTAMPTZ,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Seed known data sources
INSERT INTO data_sources (name, status) VALUES
  ('bmkg', 'ok'),
  ('tomtom', 'ok'),
  ('aisstream', 'ok'),
  ('nasa_firms', 'ok'),
  ('pihps', 'ok'),
  ('lightpanda_marketplace', 'ok'),
  ('lightpanda_social', 'ok')
ON CONFLICT (name) DO NOTHING;

-- ==============================================================================
-- Incidents — Validated Crisis Events
-- Core table: all detected and validated logistics disruption events
-- ==============================================================================
CREATE TABLE IF NOT EXISTS incidents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title           TEXT NOT NULL,
  description     TEXT,
  type            TEXT NOT NULL,               -- 'flood', 'port_closure', 'wildfire', 'congestion', 'earthquake'
  severity        TEXT NOT NULL DEFAULT 'low', -- 'low', 'medium', 'high', 'critical'
  status          TEXT NOT NULL DEFAULT 'unconfirmed',
                                               -- 'unconfirmed' → 'validating' → 'validated' → 'resolved'
  confidence      FLOAT DEFAULT 0,             -- 0.0–1.0; consensus gate fires at 0.85
  location        GEOGRAPHY(Point, 4326),      -- PostGIS point (incident epicenter)
  affected_area   GEOGRAPHY(Polygon, 4326),    -- PostGIS polygon (disruption zone)
  evidence        JSONB DEFAULT '{}',          -- raw evidence payload from all agents
  recommendations JSONB DEFAULT '[]',          -- Decision Support Agent recommendations array
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  resolved_at     TIMESTAMPTZ
);

-- Spatial index for fast geographic queries (e.g., "find all incidents near Belawan")
CREATE INDEX IF NOT EXISTS incidents_location_idx ON incidents USING GIST (location);
CREATE INDEX IF NOT EXISTS incidents_status_idx ON incidents (status);
CREATE INDEX IF NOT EXISTS incidents_created_at_idx ON incidents (created_at DESC);

-- Auto-update updated_at on any row change
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_incidents_updated_at
  BEFORE UPDATE ON incidents
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- ==============================================================================
-- Route Approvals — Human-in-the-Loop KPI Logging
-- Records every operator approval of an AI-recommended route
-- ==============================================================================
CREATE TABLE IF NOT EXISTS route_approvals (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id       UUID REFERENCES incidents(id) ON DELETE CASCADE,
  operator_id       TEXT,                      -- dashboard user identifier
  recommended_route JSONB NOT NULL,            -- full route object (waypoints, ETA, fuel estimate)
  approved_at       TIMESTAMPTZ DEFAULT NOW(),
  outcome           TEXT                       -- NULL until v1.1: 'resolved', 'partial', 'no'
);

CREATE INDEX IF NOT EXISTS route_approvals_incident_idx ON route_approvals (incident_id);

-- ==============================================================================
-- Commodity Prices — Time-Series (TimescaleDB Hypertable)
-- High-frequency commodity price tracking for inflation detection
-- ==============================================================================
CREATE TABLE IF NOT EXISTS commodity_prices (
  time        TIMESTAMPTZ NOT NULL,
  commodity   TEXT NOT NULL,                   -- 'beras', 'cabai_merah', 'cabai_rawit', 'bawang_merah',
                                               --  'bawang_putih', 'minyak_goreng', 'telur_ayam', 'gula_pasir'
  region      TEXT NOT NULL,                   -- 'north_sumatra', 'national', 'medan', 'belawan'
  price_idr   NUMERIC NOT NULL,               -- price in Indonesian Rupiah
  source      TEXT NOT NULL,                   -- 'pihps', 'tokopedia', 'shopee'
  metadata    JSONB DEFAULT '{}'              -- additional context (market, store, etc.)
);

-- Convert to TimescaleDB hypertable (partitioned by time)
SELECT create_hypertable('commodity_prices', 'time', if_not_exists => TRUE);

-- Composite index for efficient time-range + commodity queries
CREATE INDEX IF NOT EXISTS commodity_prices_commodity_time_idx
  ON commodity_prices (commodity, time DESC);

-- ==============================================================================
-- LTM Episodes — Long-Term Memory (pgvector)
-- Historical disaster-to-inflation episode embeddings for semantic retrieval
-- ==============================================================================
CREATE TABLE IF NOT EXISTS ltm_episodes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  description TEXT,
  embedding   vector(1536),                   -- semantic embedding (OpenAI/Gemini text-embedding-3-small compatible)
  metadata    JSONB DEFAULT '{}',             -- {disaster_type, region, lag_days, price_impact_pct, commodity, year}
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- IVFFlat index for approximate nearest-neighbor search
CREATE INDEX IF NOT EXISTS ltm_episodes_embedding_idx
  ON ltm_episodes USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- ==============================================================================
-- Knowledge Graph — Entities
-- Nodes in the supply chain graph (Ports, Routes, Warehouses, Commodities, Suppliers)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS kg_entities (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type        TEXT NOT NULL,                  -- 'port', 'route', 'warehouse', 'commodity', 'supplier', 'region'
  name        TEXT NOT NULL,
  location    GEOGRAPHY(Point, 4326),         -- NULL for abstract entities (commodities, regions)
  metadata    JSONB DEFAULT '{}',             -- type-specific properties
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS kg_entities_type_idx ON kg_entities (type);
CREATE INDEX IF NOT EXISTS kg_entities_location_idx ON kg_entities USING GIST (location);

-- ==============================================================================
-- Knowledge Graph — Relationships
-- Edges connecting supply chain entities
-- ==============================================================================
CREATE TABLE IF NOT EXISTS kg_relationships (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_entity UUID NOT NULL REFERENCES kg_entities(id) ON DELETE CASCADE,
  to_entity   UUID NOT NULL REFERENCES kg_entities(id) ON DELETE CASCADE,
  relation    TEXT NOT NULL,                  -- 'depends_on', 'ships_via', 'located_in', 'supplies', 'connects_to'
  weight      FLOAT DEFAULT 1.0,             -- relationship strength / criticality score
  metadata    JSONB DEFAULT '{}',             -- e.g., {volume_tons_per_day, commodity_type}
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS kg_relationships_from_idx ON kg_relationships (from_entity);
CREATE INDEX IF NOT EXISTS kg_relationships_to_idx ON kg_relationships (to_entity);
CREATE INDEX IF NOT EXISTS kg_relationships_relation_idx ON kg_relationships (relation);

-- ==============================================================================
-- Seed: North Sumatra Corridor Knowledge Graph
-- Minimum viable entity graph for MVP demo
-- ==============================================================================
INSERT INTO kg_entities (type, name, location, metadata) VALUES
  ('port',      'Belawan Port',             ST_Point(98.6776, 3.7922)::geography,  '{"province":"North Sumatra","daily_capacity_teu":5000}'),
  ('port',      'Dumai Port',               ST_Point(101.4567, 1.6795)::geography, '{"province":"Riau","daily_capacity_teu":2000}'),
  ('route',     'Trans-Sumatra Highway',    NULL,                                   '{"length_km":2818,"type":"toll_road"}'),
  ('route',     'Medan-Belawan Corridor',   NULL,                                   '{"length_km":26,"type":"local_road"}'),
  ('region',    'North Sumatra',            ST_Point(98.6667, 3.5852)::geography,  '{"population":14799361,"province_code":"SU"}'),
  ('commodity', 'Cooking Oil',              NULL,                                   '{"unit":"liter","category":"food_staple"}'),
  ('commodity', 'Rice',                     NULL,                                   '{"unit":"kg","category":"food_staple"}'),
  ('commodity', 'Chili',                    NULL,                                   '{"unit":"kg","category":"food_staple"}')
ON CONFLICT DO NOTHING;
