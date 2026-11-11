-- Phase 182: Unified Hazards Consensus Read Layer
-- Stores multi-source authoritative consensus records (CONFIRMED, WATCH, ADVISORY).

CREATE TABLE IF NOT EXISTS public.hazards_consensus (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  tier TEXT NOT NULL CHECK (tier IN ('CONFIRMED', 'WATCH', 'ADVISORY')),
  confidence DOUBLE PRECISION NOT NULL,
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  geometry JSONB,
  geometry_role TEXT NOT NULL DEFAULT 'buffer_footprint',
  reason TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium',
  title TEXT,
  center JSONB,
  radius_km DOUBLE PRECISION,
  llm_used BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  expires_at TIMESTAMPTZ NOT NULL
);

COMMENT ON TABLE public.hazards_consensus IS
  'Authoritative hazard consensus records synthesized across BMKG, BMKG CAP, weather fusion, news, FIRMS, TomTom, and PetaBencana/BNPB.';

ALTER TABLE public.hazards_consensus ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.hazards_consensus FROM PUBLIC;
GRANT SELECT ON TABLE public.hazards_consensus TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.hazards_consensus TO service_role;

DROP POLICY IF EXISTS hazards_consensus_anon_read ON public.hazards_consensus;
CREATE POLICY hazards_consensus_anon_read
  ON public.hazards_consensus
  FOR SELECT TO anon, authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS idx_hazards_consensus_tier ON public.hazards_consensus (tier);
CREATE INDEX IF NOT EXISTS idx_hazards_consensus_type ON public.hazards_consensus (type);
CREATE INDEX IF NOT EXISTS idx_hazards_consensus_expires_at ON public.hazards_consensus (expires_at);
