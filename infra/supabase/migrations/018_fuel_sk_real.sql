-- Migration 018: Real ESDM SK fuel rows (supabase-first, no fabrication).
--
-- Replaces/augments the 016 fallback seeds with verified SK-sourced rows.
-- Verified values (investigation, Oct 2026):
--   * biosolar NASIONAL 6800, SK 218.K/MG.01/MEM.M/2022, effective 2022-09-03,
--     source https://jdih.esdm.go.id/dokumen/view?id=2299, is_fallback FALSE.
--   * biosolar NASIONAL 6800 policy-hold re-confirm effective 2026-10-05
--     (ANTARA BBM freeze reporting; price unchanged, same SK basis).
--   * dexlite / pertamina_dex NASIONAL 13900/14200 effective 2025-11-01 and
--     23700/25200 effective 2026-09-02, formula basis SK 245.K/MG.01/MEM.M/2022
--     (JBU has no per-liter SK). ANTARA-attributed; exact article URLs were
--     NOT in the verified set, so provenance notes are used instead of
--     invented links. is_fallback FALSE.
-- Scope guard: NO per-province Dex rows (unverified deltas) — the 016
-- per-province fallback rows are left untouched for history.
--
-- All writes are INSERT ... ON CONFLICT (fuel_type, region, effective_date)
-- DO UPDATE on the 016 unique index, keeping old fallback rows intact.

-- Guard: table + unique index come from 016; create index idempotently here
-- so this file is safe to apply standalone.
CREATE UNIQUE INDEX IF NOT EXISTS idx_fuel_prices_unique
  ON fuel_prices (fuel_type, region, effective_date);

-- 1. Biosolar SK row (verified ESDM SK).
INSERT INTO fuel_prices
  (id, fuel_type, region, price_idr, sk_number, effective_date, source_url, is_fallback)
VALUES
  ('FP-BIOSOLAR-NASIONAL-SK218', 'biosolar', 'NASIONAL', 6800,
   '218.K/MG.01/MEM.M/2022', '2022-09-03',
   'https://jdih.esdm.go.id/dokumen/view?id=2299', FALSE)
ON CONFLICT (fuel_type, region, effective_date) DO UPDATE SET
  price_idr  = EXCLUDED.price_idr,
  sk_number  = EXCLUDED.sk_number,
  source_url = EXCLUDED.source_url,
  is_fallback = EXCLUDED.is_fallback,
  updated_at = NOW();

-- 2. Biosolar policy-hold re-confirm (price freeze, same SK basis).
INSERT INTO fuel_prices
  (id, fuel_type, region, price_idr, sk_number, effective_date, source_url, is_fallback)
VALUES
  ('FP-BIOSOLAR-NASIONAL-FREEZE20261005', 'biosolar', 'NASIONAL', 6800,
   '218.K/MG.01/MEM.M/2022', '2026-10-05',
   'ANTARA BBM price-freeze report Oct 2026 (policy hold; price unchanged, SK 218.K/MG.01/MEM.M/2022 remains basis)', FALSE)
ON CONFLICT (fuel_type, region, effective_date) DO UPDATE SET
  price_idr  = EXCLUDED.price_idr,
  sk_number  = EXCLUDED.sk_number,
  source_url = EXCLUDED.source_url,
  is_fallback = EXCLUDED.is_fallback,
  updated_at = NOW();

-- 3. Dexlite / Pertamina Dex NASIONAL (formula basis, SK 245; JBU per-liter SK does not exist).
INSERT INTO fuel_prices
  (id, fuel_type, region, price_idr, sk_number, effective_date, source_url, is_fallback)
VALUES
  ('FP-DEXLITE-NASIONAL-20251101', 'dexlite', 'NASIONAL', 13900,
   '245.K/MG.01/MEM.M/2022', '2025-11-01',
   'ANTARA Pertamina Dex/Dexlite price adjustment report Nov 2025 (formula basis; SK 245.K/MG.01/MEM.M/2022)', FALSE),
  ('FP-DEXLITE-NASIONAL-20260902', 'dexlite', 'NASIONAL', 23700,
   '245.K/MG.01/MEM.M/2022', '2026-09-02',
   'ANTARA Pertamina Dex/Dexlite price adjustment report Sep 2026 (formula basis; SK 245.K/MG.01/MEM.M/2022)', FALSE),
  ('FP-PDEX-NASIONAL-20251101', 'pertamina_dex', 'NASIONAL', 14200,
   '245.K/MG.01/MEM.M/2022', '2025-11-01',
   'ANTARA Pertamina Dex/Dexlite price adjustment report Nov 2025 (formula basis; SK 245.K/MG.01/MEM.M/2022)', FALSE),
  ('FP-PDEX-NASIONAL-20260902', 'pertamina_dex', 'NASIONAL', 25200,
   '245.K/MG.01/MEM.M/2022', '2026-09-02',
   'ANTARA Pertamina Dex/Dexlite price adjustment report Sep 2026 (formula basis; SK 245.K/MG.01/MEM.M/2022)', FALSE)
ON CONFLICT (fuel_type, region, effective_date) DO UPDATE SET
  price_idr  = EXCLUDED.price_idr,
  sk_number  = EXCLUDED.sk_number,
  source_url = EXCLUDED.source_url,
  is_fallback = EXCLUDED.is_fallback,
  updated_at = NOW();
