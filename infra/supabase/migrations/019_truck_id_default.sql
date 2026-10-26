-- Migration 019: Supabase-first id defaults (server-minted PKs).
--
-- Remote truck_assets.id / travels.id / fuel_prices.id were TEXT PRIMARY KEY
-- with NO server default, so every insert without an explicit id violated
-- NOT NULL. The Supabase adapter worked around this by minting TRKASSET- /
-- RIT- ids client-side — which rotates the PK on every upsert of the same
-- truck_id when the caller omits id.
--
-- Supabase-first fix: let the server mint the PK. Keep TEXT type for
-- TRKASSET- / RIT- / FP- parity (client-supplied ids keep working; only
-- absent ids now default instead of failing).
--
-- Requires pgcrypto for gen_random_uuid() (present on Supabase Postgres).

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Backfill legacy rows that slipped in with an empty-string id before the
-- default existed. (PK is NOT NULL so NULLs cannot exist, but the predicate
-- is kept for safety.)
UPDATE truck_assets
SET id = gen_random_uuid()::text
WHERE id IS NULL OR id = '';

UPDATE travels
SET id = gen_random_uuid()::text
WHERE id IS NULL OR id = '';

UPDATE fuel_prices
SET id = gen_random_uuid()::text
WHERE id IS NULL OR id = '';

ALTER TABLE truck_assets
  ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;

ALTER TABLE travels
  ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;

ALTER TABLE fuel_prices
  ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;
