-- Migration 022: Phase 5 perf — composite indexes + SQL aggregate RPCs
-- Idempotent: safe to re-run.
--
-- 1. travels composite index (company_id, created_at DESC) so tenant-scoped
--    ledger lists and ERP windows are index range scans, not sorts.
-- 2. commodity_prices composite index (commodity, region, time DESC) for the
--    spikes 30-day window and the aggregate fetch path.
-- 3. erp_ledger_totals(p_company_id) — per-company SUM/COUNT aggregates so the
--    ERP summary never scans O(C×N) rows in Python.
-- 4. commodity_baseline_means(p_since, p_region) — one-call per-group means
--    for the spikes baseline (replaces the Python mean over 300 rows).

-- 1. travels composite index
CREATE INDEX IF NOT EXISTS idx_travels_company_created
  ON travels (company_id, created_at DESC);

-- 2. commodity_prices composite index (region included for spikes filter)
CREATE INDEX IF NOT EXISTS idx_commodity_prices_comm_region_time
  ON commodity_prices (commodity, region, time DESC);

-- 3. ERP ledger aggregates: one row per company, unbounded (no LIMIT —
--    totals always cover the full ledger; the detail window is capped
--    separately in the service layer).
CREATE OR REPLACE FUNCTION erp_ledger_totals(p_company_id TEXT DEFAULT NULL)
RETURNS TABLE (
  company_id TEXT,
  n BIGINT,
  active BIGINT,
  delivered BIGINT,
  failed BIGINT,
  reroute_ok BIGINT,
  reroute_fail BIGINT,
  sla_ok BIGINT,
  base NUMERIC,
  actual NUMERIC,
  saved NUMERIC,
  th NUMERIC,
  fl NUMERIC,
  f NUMERIC,
  t NUMERIC,
  s NUMERIC,
  l NUMERIC
)
LANGUAGE sql STABLE AS $$
  SELECT
    travels.company_id,
    COUNT(*) AS n,
    COUNT(*) FILTER (WHERE status IN ('planned', 'moving', 'rerouted')) AS active,
    COUNT(*) FILTER (WHERE status = 'delivered') AS delivered,
    COUNT(*) FILTER (WHERE status = 'failed') AS failed,
    COUNT(*) FILTER (WHERE rerouted AND status IN ('rerouted', 'delivered')
      AND saved_cost_idr > 0) AS reroute_ok,
    COUNT(*) FILTER (WHERE rerouted AND (status = 'failed' OR saved_cost_idr < 0)) AS reroute_fail,
    COUNT(*) FILTER (WHERE status = 'delivered' AND sla_deadline_hours > 0
      AND actual_time_hours <= sla_deadline_hours) AS sla_ok,
    COALESCE(SUM(baseline_cost_idr), 0) AS base,
    COALESCE(SUM(actual_cost_idr), 0) AS actual,
    COALESCE(SUM(saved_cost_idr), 0) AS saved,
    COALESCE(SUM(saved_time_hours), 0) AS th,
    COALESCE(SUM(saved_fuel_liters), 0) AS fl,
    COALESCE(SUM(saved_fuel_cost_idr), 0) AS f,
    COALESCE(SUM(saved_toll_idr), 0) AS t,
    COALESCE(SUM(saved_spoilage_idr), 0) AS s,
    COALESCE(SUM(saved_labor_idr), 0) AS l
  FROM travels
  WHERE (p_company_id IS NULL OR travels.company_id = p_company_id)
  GROUP BY travels.company_id;
$$;

-- 4. Commodity baseline means for the spikes detector.
CREATE OR REPLACE FUNCTION commodity_baseline_means(
  p_since TIMESTAMPTZ,
  p_region TEXT DEFAULT NULL
)
RETURNS TABLE (
  commodity TEXT,
  region TEXT,
  mean_price NUMERIC,
  n BIGINT
)
LANGUAGE sql STABLE AS $$
  SELECT
    commodity_prices.commodity,
    commodity_prices.region,
    AVG(price_idr) FILTER (WHERE price_idr > 0) AS mean_price,
    COUNT(*) FILTER (WHERE price_idr > 0) AS n
  FROM commodity_prices
  WHERE time >= p_since
    AND (p_region IS NULL OR commodity_prices.region = p_region)
  GROUP BY commodity_prices.commodity, commodity_prices.region;
$$;
