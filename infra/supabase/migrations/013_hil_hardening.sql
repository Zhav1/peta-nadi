-- ==============================================================================
-- Migration 013: HITL Hardening — Payload/Schema Convergence (Wave 1-3)
-- ==============================================================================
-- Closes payload-vs-schema gaps found auditing backend writers against
-- infra/supabase/migrations/000-012:
--
-- 1. public.route_approvals.route_id (TEXT, nullable):
--    backend/app/routers/approvals.py (db_payload always sends route_id,
--    default "0") and backend/app/services/unified_news_ingestor.py
--    (approval_row) both INSERT route_id, but the effective schema
--    (000_init + 006 — 005's CREATE TABLE IF NOT EXISTS is a no-op when 000
--    ran first) has no such column, so PostgREST inserts fail. Additive,
--    nullable, non-breaking.
--
-- 2. public.incidents.incident_id (TEXT, nullable + backfill + unique):
--    unified_news_ingestor writes/selects/updates incidents by incident_id
--    (uuid4 strings), and the 005/008 FK clauses reference
--    incidents(incident_id), but 000_init creates incidents with PK "id"
--    only. Additive + backfilled from id::text; no type changes, no FK
--    rewrites, no RLS changes.
--
-- Deliberately NOT added (JSONB/notes-tolerant by design):
-- - route_approvals.committed_by_role: approvals.py + news_router HITL embed
--   "committed_by {op} ({role})" in notes and return it in the API response
--   + local SQLite mirror; no writer sends it as a column, so inserts are
--   safe without it.
-- - dasar_risiko / dampak_uncertainty: members of the route-proof object
--   carried inside recommended_route JSONB (cpu_routing_adapter proof
--   triple); never top-level columns, never sent as columns.
-- - route_approvals.route_name / origin / destination: read-only via dict
--   .get() with fallbacks in news_router hitl-pending; nothing writes them,
--   so missing columns degrade to defaults instead of failing.
--
-- RLS untouched: 010 already grants route_approvals FOR ALL TO authenticated
-- (anon excluded, no public SELECT on route_approvals) plus service_role full
-- access. Idempotent: safe to re-run.
-- ==============================================================================

-- 1. route_approvals.route_id (sent by approvals POST + HITL seeder).
ALTER TABLE public.route_approvals
  ADD COLUMN IF NOT EXISTS route_id TEXT;

CREATE INDEX IF NOT EXISTS route_approvals_route_id_idx
  ON public.route_approvals (route_id);

-- 2. incidents.incident_id (public/text incident key used by ingestors).
ALTER TABLE public.incidents
  ADD COLUMN IF NOT EXISTS incident_id TEXT;

-- Backfill from PK so pre-existing rows satisfy by-incident_id reads.
UPDATE public.incidents
SET incident_id = id::text
WHERE incident_id IS NULL;

-- Uniqueness for 005/008-style FK references; name-guarded for reruns.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'incidents_incident_id_key'
  ) THEN
    ALTER TABLE public.incidents ADD CONSTRAINT incidents_incident_id_key UNIQUE (incident_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS incidents_incident_id_idx
  ON public.incidents (incident_id);
