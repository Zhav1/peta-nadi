-- Phase 179: Versioned Snapshot Coordination, Ingest Runs Audit, Realtime Nudge, and pg_cron Backup
-- Pinned to 2026-11-07 for Phase 179 Realtime Fusion Early Warning.

-- 1. Add version column to public_dashboard_snapshots
ALTER TABLE public.public_dashboard_snapshots
  ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 1;

COMMENT ON COLUMN public.public_dashboard_snapshots.version IS
  'Monotonically increasing snapshot generation integer for cache invalidation and realtime sync.';

-- 2. Create ingest_runs table for single-flight worker execution audit & deduplication verification
CREATE TABLE IF NOT EXISTS public.ingest_runs (
  run_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'skipped_locked', 'failed')),
  snapshot_version BIGINT,
  jobs_executed JSONB NOT NULL DEFAULT '[]'::jsonb,
  upstream_calls JSONB NOT NULL DEFAULT '{}'::jsonb
);

COMMENT ON TABLE public.ingest_runs IS
  'Audit log of single-flight worker ticks and snapshot builds for Phase 179 fan-out verification.';

ALTER TABLE public.ingest_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ingest_runs FROM PUBLIC;
GRANT SELECT ON TABLE public.ingest_runs TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ingest_runs TO service_role;

DROP POLICY IF EXISTS ingest_runs_anon_read ON public.ingest_runs;
CREATE POLICY ingest_runs_anon_read
  ON public.ingest_runs
  FOR SELECT TO anon, authenticated
  USING (true);

-- 3. Update publish_public_dashboard_snapshot with monotonic version guarantees & clock monotonicity
CREATE OR REPLACE FUNCTION public.publish_public_dashboard_snapshot(
  p_lease_name TEXT,
  p_owner_id UUID,
  p_fence BIGINT,
  p_snapshot JSONB
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_lease private.refresh_leases%ROWTYPE;
  v_section RECORD;
  v_observed TIMESTAMPTZ;
  v_valid_until TIMESTAMPTZ;
  v_existing_version BIGINT;
  v_next_version BIGINT;
  v_computed_at TIMESTAMPTZ;
  v_final_snapshot JSONB;
  v_rows INTEGER;
BEGIN
  SELECT * INTO v_lease
    FROM private.refresh_leases
   WHERE lease_name = p_lease_name
   FOR UPDATE;

  IF NOT FOUND
     OR v_lease.owner_id <> p_owner_id
     OR v_lease.fence <> p_fence
     OR v_lease.expires_at <= clock_timestamp()
     OR p_snapshot->>'snapshot_key' <> 'sumatra_mainland'
     OR (p_snapshot->>'schema_version')::INTEGER <> 1 THEN
    RETURN false;
  END IF;

  FOR v_section IN
    SELECT key, value
      FROM jsonb_each(coalesce(p_snapshot->'sections', '{}'::jsonb))
  LOOP
    IF v_section.value->>'status' IN ('ok', 'healthy', 'stale')
       AND v_section.value ? 'data'
       AND v_section.value->'data' <> 'null'::jsonb THEN
      v_observed := NULLIF(v_section.value->>'observed_at', '')::TIMESTAMPTZ;
      v_valid_until := NULLIF(v_section.value->>'valid_until', '')::TIMESTAMPTZ;
      INSERT INTO private.public_snapshot_sections (
        section_name, status, data, observed_at, valid_until, source_freshness, updated_at
      ) VALUES (
        v_section.key,
        v_section.value->>'status',
        v_section.value->'data',
        v_observed,
        v_valid_until,
        coalesce(p_snapshot->'source_freshness'->v_section.key, '{}'::jsonb),
        clock_timestamp()
      )
      ON CONFLICT (section_name) DO UPDATE
        SET status = EXCLUDED.status,
            data = EXCLUDED.data,
            observed_at = EXCLUDED.observed_at,
            valid_until = EXCLUDED.valid_until,
            source_freshness = EXCLUDED.source_freshness,
            updated_at = EXCLUDED.updated_at;
    END IF;
  END LOOP;

  -- Determine next monotonic version
  SELECT version INTO v_existing_version
    FROM public.public_dashboard_snapshots
   WHERE snapshot_key = 'sumatra_mainland'
   FOR UPDATE;

  v_next_version := COALESCE(v_existing_version, 0) + 1;
  IF (p_snapshot ? 'version') AND ((p_snapshot->>'version')::BIGINT > v_next_version) THEN
    v_next_version := (p_snapshot->>'version')::BIGINT;
  END IF;

  v_computed_at := (p_snapshot->>'computed_at')::TIMESTAMPTZ;
  v_final_snapshot := jsonb_set(p_snapshot, '{version}', to_jsonb(v_next_version), true);

  INSERT INTO public.public_dashboard_snapshots (snapshot_key, schema_version, computed_at, payload, version)
  VALUES (
    'sumatra_mainland',
    1,
    v_computed_at,
    v_final_snapshot,
    v_next_version
  )
  ON CONFLICT (snapshot_key) DO UPDATE
    SET schema_version = EXCLUDED.schema_version,
        computed_at = EXCLUDED.computed_at,
        payload = EXCLUDED.payload,
        version = EXCLUDED.version
    WHERE public.public_dashboard_snapshots.computed_at <= EXCLUDED.computed_at;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows >= 0;
END;
$$;

GRANT EXECUTE ON FUNCTION public.publish_public_dashboard_snapshot(TEXT, UUID, BIGINT, JSONB) TO service_role;

-- 4. Realtime broadcast and pg_notify trigger
CREATE OR REPLACE FUNCTION public.notify_public_dashboard_snapshot_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Standard postgres channel notification
  BEGIN
    PERFORM pg_notify(
      'prehub_snapshot_nudge',
      json_build_object(
        'snapshot_key', NEW.snapshot_key,
        'version', NEW.version,
        'computed_at', NEW.computed_at
      )::text
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- Supabase Realtime broadcast to prehub-snapshot-nudge channel
  BEGIN
    PERFORM realtime.send(
      jsonb_build_object(
        'snapshot_key', NEW.snapshot_key,
        'version', NEW.version,
        'computed_at', NEW.computed_at
      ),
      'snapshot_updated',
      'prehub-snapshot-nudge',
      false
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_public_dashboard_snapshot_change ON public.public_dashboard_snapshots;
CREATE TRIGGER trg_notify_public_dashboard_snapshot_change
  AFTER INSERT OR UPDATE ON public.public_dashboard_snapshots
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_public_dashboard_snapshot_change();

-- 5. Conditional pg_cron + pg_net backup tick (every 10 minutes)
-- Invokes worker /api/v1/internal/tick in case external cron fails.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     AND EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'prehub_backup_tick_10m') THEN
      PERFORM cron.schedule(
        'prehub_backup_tick_10m',
        '*/10 * * * *',
        $cron$
        SELECT net.http_post(
          url := coalesce(current_setting('app.settings.worker_url', true), 'https://prehub-sumatra-worker.koyeb.app') || '/api/v1/internal/tick',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'X-Internal-Token', coalesce(current_setting('app.settings.internal_tick_token', true), '')
          ),
          body := '{}'::jsonb
        );
        $cron$
      );
    END IF;
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;
