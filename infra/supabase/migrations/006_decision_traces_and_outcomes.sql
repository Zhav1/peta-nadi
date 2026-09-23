-- Migration 006: Operator Decision Traces Taxonomy & Ground-Truth Field Outcomes
-- Extends route_approvals with tactical actions and creates ground_truth_outcomes table

-- 1. Extend route_approvals with multi-action taxonomy and constraint notes
ALTER TABLE route_approvals ADD COLUMN IF NOT EXISTS action text NOT NULL DEFAULT 'ACCEPT';
ALTER TABLE route_approvals ADD COLUMN IF NOT EXISTS tactical_action text NOT NULL DEFAULT 'REROUTE';
ALTER TABLE route_approvals ADD COLUMN IF NOT EXISTS custom_constraints jsonb DEFAULT '{}'::jsonb;
ALTER TABLE route_approvals ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE route_approvals ADD COLUMN IF NOT EXISTS sync_status text NOT NULL DEFAULT 'synced';
ALTER TABLE route_approvals ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS route_approvals_action_idx ON route_approvals (action);
CREATE INDEX IF NOT EXISTS route_approvals_tactical_action_idx ON route_approvals (tactical_action);

-- 2. Create ground_truth_outcomes table for dual-horizon field verification (T+12h / T+24h)
CREATE TABLE IF NOT EXISTS ground_truth_outcomes (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id             text NOT NULL,
  horizon                 text NOT NULL,
  actual_clearance_time   timestamptz,
  observed_delay_hours    numeric NOT NULL DEFAULT 0.0,
  actual_price_spike_pct  numeric NOT NULL DEFAULT 0.0,
  verified_by             text NOT NULL DEFAULT 'anonymous',
  verification_source     text NOT NULL DEFAULT 'FIELD_REPORT',
  notes                   text,
  sync_status             text NOT NULL DEFAULT 'synced',
  created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ground_truth_outcomes_incident_id_idx ON ground_truth_outcomes (incident_id);
CREATE INDEX IF NOT EXISTS ground_truth_outcomes_horizon_idx ON ground_truth_outcomes (horizon);
CREATE INDEX IF NOT EXISTS ground_truth_outcomes_created_at_idx ON ground_truth_outcomes (created_at DESC);
