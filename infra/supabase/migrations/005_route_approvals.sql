-- Migration 005: Create route_approvals table for Human-in-the-Loop Logging

CREATE TABLE IF NOT EXISTS route_approvals (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id        uuid NOT NULL REFERENCES incidents(incident_id) ON DELETE CASCADE,
  route_id           text NOT NULL,
  recommended_route  jsonb NOT NULL,
  operator_id        text NOT NULL DEFAULT 'anonymous',
  approved_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS route_approvals_incident_id_idx ON route_approvals (incident_id);
CREATE INDEX IF NOT EXISTS route_approvals_approved_at_idx ON route_approvals (approved_at DESC);
