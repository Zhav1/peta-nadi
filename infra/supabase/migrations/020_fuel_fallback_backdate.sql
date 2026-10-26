-- Migration 020: Backdate 016 biosolar fallback artifact so SK rows win ordering.
--
-- The 016 seed FP-BIOSOLAR-NASIONAL used effective_date=CURRENT_DATE with
-- is_fallback TRUE. On databases seeded/migrated after the Oct 2026 SK freeze,
-- that artifact date (e.g. 2026-10-26) is NEWER than the verified SK freeze
-- row FP-BIOSOLAR-NASIONAL-FREEZE20261005 (effective 2026-10-05, SK
-- 218.K/MG.01/MEM.M/2022), so the latest-date-wins resolver returned
-- PERTAMINA_FALLBACK instead of ESDM_SK 6800.
--
-- Fix (data only, history kept): move the artifact to 2022-09-02, the day
-- before SK 218 took effect (2022-09-03). Same price, still is_fallback TRUE.
-- Frozen travels rows are unaffected — they store their own frozen
-- fuel_effective_date / fuel_rate_used_idr and are never recomputed unless
-- explicitly repriced. Code-side, get_fuel_rate_for_trip now also prefers
-- non-fallback rows, so this migration is defence-in-depth for ordering.
--
-- Idempotent + conflict-safe: skips if another (biosolar, NASIONAL,
-- 2022-09-02) row already occupies the target slot.

UPDATE fuel_prices
SET effective_date = '2022-09-02',
    updated_at = NOW()
WHERE id = 'FP-BIOSOLAR-NASIONAL'
  AND is_fallback IS TRUE
  AND effective_date <> '2022-09-02'
  AND NOT EXISTS (
    SELECT 1 FROM fuel_prices f
    WHERE f.fuel_type = 'biosolar'
      AND f.region = 'NASIONAL'
      AND f.effective_date = '2022-09-02'
      AND f.id <> 'FP-BIOSOLAR-NASIONAL'
  );
