-- Migration 024: Phase 163 (M8) — DB-backed dashboard bootstrap snapshot
-- Idempotent: safe to re-run.
--
-- The dashboard used to fan out to ~25-30 endpoints on first paint (phase 160
-- baseline: 50-94 requests, 9.8-73.8 s first data). This table is the read model
-- that replaces that fan-out with ONE authenticated request:
--
--   WRITE path (tick only)
--     POST /internal/tick -> build_and_store_global_snapshot() upserts
--     snapshot_key='global' every 5 minutes, after the batch jobs finish, inside
--     the tick's background task (never before the 202 response).
--
--   READ path (request path)
--     GET /api/v1/dashboard/bootstrap reads this row and NOTHING else. It never
--     writes: a burst of dashboard mounts (or a cold start) must not amplify
--     into a write storm on the 0.1-CPU free tier. A missing/stale row is served
--     with a bounded live build returned to that caller only (stale=true); the
--     next tick is the sole writer.
--
--   payload          per-section {data, status} map for the public sections
--                    (incidents, news, corridor, weather, fire, commodities,
--                    approvals, source health, evaluation, BNPB). Tenant sections
--                    (fleet, ERP) are NEVER stored here - they are scoped per
--                    caller at read time.
--   source_freshness per-section {status, ms, error?} telemetry from the build.
--   computed_at      when the payload was composed; the read path uses it for the
--                    600 s (= 2 x tick cadence) staleness gate.
--   schema_version   payload contract version; a mismatch is treated as a miss so
--                    a deploy can never serve a shape the client cannot parse.
--
-- Access: the backend reads/writes with the service-role key
-- (`get_write_client`). RLS is enabled with no policies on purpose: anon and
-- authenticated callers cannot read a snapshot built for another caller's
-- freshness window or tamper with the read model. Only BYPASSRLS roles
-- (service_role) can. Supabase grants table privileges to `service_role` by
-- default; a self-hosted database must grant SELECT/INSERT/UPDATE to the backend
-- role.

CREATE TABLE IF NOT EXISTS dashboard_snapshots (
  snapshot_key     TEXT PRIMARY KEY,
  payload          JSONB NOT NULL,
  computed_at      TIMESTAMPTZ NOT NULL,
  schema_version   INTEGER NOT NULL DEFAULT 1,
  source_freshness JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE dashboard_snapshots IS
  'Phase 163 (M8): DB-backed dashboard read model. WRITTEN only by the external tick '
  '(POST /internal/tick). The read path (GET /api/v1/dashboard/bootstrap) only SELECTs - '
  'it never writes, so dashboard traffic can never trigger snapshot writes.';

COMMENT ON COLUMN dashboard_snapshots.payload IS
  'Per-section {data, status} map for public dashboard sections. Tenant sections (fleet, ERP) are scoped per caller at read time and are never stored.';

COMMENT ON COLUMN dashboard_snapshots.computed_at IS
  'When the payload was composed. The read path treats a row older than 600 s (2 x the 5-minute tick cadence) as stale and serves a bounded live build with stale=true.';

COMMENT ON COLUMN dashboard_snapshots.schema_version IS
  'Payload contract version. A row whose version does not match the running backend is treated as a cache miss.';

CREATE INDEX IF NOT EXISTS idx_dashboard_snapshots_computed_at
  ON dashboard_snapshots (computed_at DESC);

ALTER TABLE dashboard_snapshots ENABLE ROW LEVEL SECURITY;
