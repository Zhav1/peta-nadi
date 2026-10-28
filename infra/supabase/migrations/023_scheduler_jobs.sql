-- Migration 023: Phase 162 (M8) — scheduler state for the external tick
-- Idempotent: safe to re-run.
--
-- The web process no longer runs batch ingestion (INPROCESS_BATCH_POLLERS=false
-- in production). `POST /internal/tick` (5-minute cron) drives it, and this
-- table is the durable memory that makes the tick idempotent across processes,
-- restarts and missed ticks:
--
--   last_finished_at  the durable "last_run_at": advanced ONLY on success, so a
--                     crashed or failed cycle is still due on the next tick.
--   locked_until      per-job lease; `acquire_scheduler_job` only succeeds when
--                     the lease is free, so two ticks can never run one job.
--   retry_after       short backoff after a failure (default 120s) so the next
--                     tick retries without hammering a failing upstream.
--   last_started_at / last_status / last_error  operator-visible history.
--
-- Access: the backend uses the service-role key (`get_write_client`). RLS is
-- enabled with no policies, so anon/authenticated callers cannot read or tamper
-- with the schedule; only BYPASSRLS roles (service_role) can. Supabase grants
-- table privileges to `service_role` by default; a self-hosted database must
-- grant SELECT/INSERT/UPDATE on this table to the backend role.

CREATE TABLE IF NOT EXISTS scheduler_jobs (
  job_name         TEXT PRIMARY KEY,
  last_started_at  TIMESTAMPTZ,
  last_finished_at TIMESTAMPTZ,
  last_status      TEXT,
  last_error       TEXT,
  locked_until     TIMESTAMPTZ,
  retry_after      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE scheduler_jobs IS
  'Phase 162 (M8): durable per-job state for the protected external tick (POST /internal/tick).';

CREATE INDEX IF NOT EXISTS idx_scheduler_jobs_due
  ON scheduler_jobs (last_finished_at, retry_after);

ALTER TABLE scheduler_jobs ENABLE ROW LEVEL SECURITY;

-- Atomically take a job lease. Inserts the row on first use, then updates only
-- if nobody holds the lease (or the previous holder's TTL expired). Returns true
-- when *this* caller won the lease.
CREATE OR REPLACE FUNCTION acquire_scheduler_job(
  p_job TEXT,
  p_ttl_seconds INTEGER DEFAULT 300
)
RETURNS BOOLEAN
LANGUAGE plpgsql AS $$
DECLARE
  v_now  TIMESTAMPTZ := clock_timestamp();
  v_rows INTEGER := 0;
BEGIN
  INSERT INTO scheduler_jobs (job_name)
  VALUES (p_job)
  ON CONFLICT (job_name) DO NOTHING;

  UPDATE scheduler_jobs
     SET locked_until    = v_now + make_interval(secs => greatest(coalesce(p_ttl_seconds, 300), 1)),
         last_started_at = v_now,
         updated_at      = v_now
   WHERE job_name = p_job
     AND (locked_until IS NULL OR locked_until <= v_now);

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END;
$$;

-- Release a job lease and record the outcome.
--   status = 'ok'    -> last_finished_at advances, retry_after cleared
--   status != 'ok'   -> last_finished_at unchanged (job stays due), retry_after set
CREATE OR REPLACE FUNCTION release_scheduler_job(
  p_job TEXT,
  p_status TEXT,
  p_error TEXT DEFAULT NULL,
  p_retry_after_seconds INTEGER DEFAULT 120
)
RETURNS VOID
LANGUAGE plpgsql AS $$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
  v_ok  BOOLEAN := coalesce(p_status = 'ok', false);
BEGIN
  UPDATE scheduler_jobs
     SET locked_until     = NULL,
         last_status      = p_status,
         last_error       = nullif(left(coalesce(p_error, ''), 500), ''),
         last_finished_at = CASE WHEN v_ok THEN v_now ELSE last_finished_at END,
         retry_after      = CASE
                              WHEN v_ok THEN NULL
                              ELSE v_now + make_interval(secs => greatest(coalesce(p_retry_after_seconds, 120), 1))
                            END,
         updated_at       = v_now
   WHERE job_name = p_job;
END;
$$;
