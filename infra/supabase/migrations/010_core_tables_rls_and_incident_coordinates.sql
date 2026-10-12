-- ==============================================================================
-- Migration 010: Core Tables RLS Hardening + Concrete Incident Coordinates
-- ==============================================================================
-- Part A (S4 Layer 2): add numeric lat/lon columns to public.incidents, backfilled
-- from the PostGIS/WKT 'location' column so coordinates are indexable without
-- runtime WKT parsing.
-- Part B (S7): enable Row Level Security on the seven core tables with deliberate
-- Public-Read + Privileged-Write policies: anon/authenticated may SELECT public
-- domain tables; mutations are restricted to service_role (backend ingestors,
-- workers) and authenticated operators for route_approvals.
-- Idempotent: safe to re-run against partially migrated databases.
-- ==============================================================================

-- ==============================================================================
-- Part A: Concrete incident coordinates
-- ==============================================================================
ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS lat double precision;
ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS lon double precision;

UPDATE public.incidents
SET
  lat = ST_Y(location::geometry),
  lon = ST_X(location::geometry)
WHERE location IS NOT NULL
  AND (lat IS NULL OR lon IS NULL);

CREATE INDEX IF NOT EXISTS incidents_lat_lon_idx ON public.incidents (lat, lon);

-- ==============================================================================
-- Part B: Row Level Security (Public Read + Privileged Write)
-- ==============================================================================

-- B.1 Enable RLS on every core table, regardless of current state.
DO $$
DECLARE
  tbl text;
  rls_tables text[] := ARRAY[
    'incidents',
    'data_sources',
    'route_approvals',
    'news_articles',
    'commodity_prices',
    'kg_entities',
    'kg_relationships'
  ];
BEGIN
  FOREACH tbl IN ARRAY rls_tables LOOP
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = tbl) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
    END IF;
  END LOOP;
END $$;

-- B.2 Public (anon + authenticated) SELECT on public domain tables.
-- route_approvals is intentionally excluded: operator decision traces are
-- readable only through privileged backend paths.
DO $$
DECLARE
  tbl text;
  public_read_tables text[] := ARRAY[
    'incidents',
    'data_sources',
    'news_articles',
    'commodity_prices',
    'kg_entities',
    'kg_relationships'
  ];
BEGIN
  FOREACH tbl IN ARRAY public_read_tables LOOP
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = tbl)
       AND NOT EXISTS (
         SELECT 1 FROM pg_policies
         WHERE schemaname = 'public'
           AND tablename = tbl
           AND cmd = 'SELECT'
           AND (roles::text LIKE '%anon%' OR roles::text LIKE '%authenticated%' OR roles::text LIKE '%public%')
       )
    THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT TO anon, authenticated USING (true)',
        'allow_public_read_' || tbl, tbl
      );
    END IF;
  END LOOP;
END $$;

-- B.3 Mutations (INSERT/UPDATE/DELETE) restricted to service_role for backend
-- ingestors and workers.
DO $$
DECLARE
  tbl text;
  write_tables text[] := ARRAY[
    'incidents',
    'data_sources',
    'route_approvals',
    'news_articles',
    'commodity_prices',
    'kg_entities',
    'kg_relationships'
  ];
BEGIN
  FOREACH tbl IN ARRAY write_tables LOOP
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = tbl)
       AND NOT EXISTS (
         SELECT 1 FROM pg_policies
         WHERE schemaname = 'public'
           AND tablename = tbl
           AND roles::text LIKE '%service_role%'
       )
    THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
        'allow_service_role_full_access_' || tbl, tbl
      );
    END IF;
  END LOOP;
END $$;

-- B.4 Authenticated operators may write route_approvals (Globot-style HITL decisions).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'route_approvals')
     AND NOT EXISTS (
       SELECT 1 FROM pg_policies
       WHERE schemaname = 'public'
         AND tablename = 'route_approvals'
         AND policyname = 'allow_authenticated_operators_route_approvals'
     )
  THEN
    CREATE POLICY "allow_authenticated_operators_route_approvals"
      ON public.route_approvals FOR ALL
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;
