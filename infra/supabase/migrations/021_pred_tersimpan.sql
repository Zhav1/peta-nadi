-- Migration 021: Stored forecast probability columns (WS-A honest pred persistence)
-- Adds nullable forecast-provenance columns to incidents, route_approvals and
-- ground_truth_outcomes so the forecast written at decision time travels with
-- the row instead of being recomputed later from a delay proxy.
--
-- Columns:
--   pred_prob            calibrated consensus probability P (overall_confidence)
--   raw_prob             raw independence product 1 - prod(1 - w_k * p_k)
--   p_max                theoretical max for the active weight profile
--                        (ECONOMIC_ACTIVE 0.688 =
--                         1-(1-0.35)(1-0.25)(1-0.20)(1-0.20);
--                         PHYSICAL_ONLY 0.71 =
--                         1-(1-0.4375)(1-0.3125)(1-0.25), rounded to 4dp)
--   weights_version      'ECONOMIC_ACTIVE' | 'PHYSICAL_ONLY'
--   active_sources       JSONB list of contributing channels/agents
--   forecast_created_at  when the forecast was produced
--
-- All columns are NULLABLE: rows written before this migration (or by writers
-- that have no forecast) keep NULL and are EXCLUDED from the live cumulative
-- aggregate (counted as missing_pred) — never silently defaulted.
-- Idempotent: safe to re-run.

DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY['incidents', 'route_approvals', 'ground_truth_outcomes'];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = tbl) THEN
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS pred_prob DOUBLE PRECISION', tbl);
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS raw_prob DOUBLE PRECISION', tbl);
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS p_max DOUBLE PRECISION', tbl);
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS weights_version TEXT', tbl);
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS active_sources JSONB', tbl);
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS forecast_created_at TIMESTAMPTZ', tbl);
    END IF;
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS incidents_pred_prob_idx ON public.incidents (pred_prob);
CREATE INDEX IF NOT EXISTS ground_truth_outcomes_pred_prob_idx ON public.ground_truth_outcomes (pred_prob);
