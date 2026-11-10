-- Phase 180: Per-section freshness guard for the public snapshot publish path.
--
-- Measured production defect (2026-11-10): two workers publish the same snapshot
-- from DIFFERENT Redis caches (VPS worker_id=4b30d5a244c2, Render
-- worker_id=peta-nadi). The outer snapshot row was guarded by computed_at, but
-- the per-section upsert into private.public_snapshot_sections was not, and
-- computed_at is fresh on BOTH publishers. A worker holding 43-minute-old
-- traffic evidence therefore overwrote a 2-minute-old row, so
-- traffic_flow_segments flipped ok <-> stale every few minutes.
--
-- Guard rule (per section, evaluated against the stored row):
--
--   * Evidence stamp = observed_at, else valid_until. computed_at is
--     deliberately NOT part of the comparison: it says when the payload was
--     assembled, not how old the evidence inside it is.
--   * Incoming section HAS an evidence stamp: it replaces the stored row only
--     when its stamp is >= the stored row's evidence stamp. Ties are accepted
--     so the same observation can still publish a status/error transition
--     (ok -> stale when the window lapses) and two workers that observed the
--     same upstream tick are never deadlocked.
--   * Incoming section has NO evidence stamp (observed_at AND valid_until both
--     null, e.g. corridor_contexts): it may only replace a stored row that also
--     has none (write order) or whose valid_until has already lapsed. So a
--     null-observed section neither silently wins over live evidence nor is it
--     frozen out forever once the stored window expires.
--
-- The lease fence (p_lease_name / p_owner_id / p_fence / expiry) is unchanged.
--
-- When the guard rejects a section, the stored (fresher) section is projected
-- back into the published payload, so the served snapshot cannot carry a
-- section older than the durable one.

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
  v_stored private.public_snapshot_sections%ROWTYPE;
  v_section RECORD;
  v_observed TIMESTAMPTZ;
  v_valid_until TIMESTAMPTZ;
  v_existing_version BIGINT;
  v_next_version BIGINT;
  v_computed_at TIMESTAMPTZ;
  v_sections JSONB;
  v_freshness JSONB;
  v_final_snapshot JSONB;
  v_stale BOOLEAN;
  v_replaced BOOLEAN := false;
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

  v_sections := coalesce(p_snapshot->'sections', '{}'::jsonb);
  v_freshness := coalesce(p_snapshot->'source_freshness', '{}'::jsonb);

  FOR v_section IN
    SELECT key, value
      FROM jsonb_each(v_sections)
  LOOP
    IF v_section.value->>'status' IN ('ok', 'healthy', 'stale')
       AND v_section.value ? 'data'
       AND v_section.value->'data' <> 'null'::jsonb THEN
      v_observed := NULLIF(v_section.value->>'observed_at', '')::TIMESTAMPTZ;
      v_valid_until := NULLIF(v_section.value->>'valid_until', '')::TIMESTAMPTZ;

      INSERT INTO private.public_snapshot_sections AS stored (
        section_name, status, data, observed_at, valid_until, source_freshness, updated_at
      ) VALUES (
        v_section.key,
        v_section.value->>'status',
        v_section.value->'data',
        v_observed,
        v_valid_until,
        coalesce(v_freshness->v_section.key, '{}'::jsonb),
        clock_timestamp()
      )
      ON CONFLICT (section_name) DO UPDATE
        SET status = EXCLUDED.status,
            data = EXCLUDED.data,
            observed_at = EXCLUDED.observed_at,
            valid_until = EXCLUDED.valid_until,
            source_freshness = EXCLUDED.source_freshness,
            updated_at = EXCLUDED.updated_at
        WHERE
          -- (A) Incoming carries evidence: it must be at least as new as the
          --     stored evidence stamp. An older observation never wins, no
          --     matter how fresh the incoming computed_at was.
          (
            coalesce(EXCLUDED.observed_at, EXCLUDED.valid_until) IS NOT NULL
            AND (
              coalesce(stored.observed_at, stored.valid_until) IS NULL
              OR coalesce(EXCLUDED.observed_at, EXCLUDED.valid_until)
                 >= coalesce(stored.observed_at, stored.valid_until)
            )
          )
          OR
          -- (B) Incoming carries no evidence at all: only allowed to replace a
          --     stored row that also has none (write order) or whose validity
          --     window has already lapsed.
          (
            coalesce(EXCLUDED.observed_at, EXCLUDED.valid_until) IS NULL
            AND (
              coalesce(stored.observed_at, stored.valid_until) IS NULL
              OR stored.valid_until < clock_timestamp()
            )
          );

      GET DIAGNOSTICS v_rows = ROW_COUNT;
      IF v_rows = 0 THEN
        -- Rejected as stale: publish the durable (fresher) copy instead of the
        -- stale one, so readers never regress.
        SELECT * INTO v_stored
          FROM private.public_snapshot_sections
         WHERE section_name = v_section.key;
        IF FOUND THEN
          v_sections := jsonb_set(
            v_sections,
            ARRAY[v_section.key],
            jsonb_build_object(
              'status', v_stored.status,
              'data', v_stored.data,
              'observed_at', v_stored.observed_at,
              'valid_until', v_stored.valid_until,
              'cached', true
            ),
            true
          );
          v_freshness := jsonb_set(
            v_freshness, ARRAY[v_section.key], v_stored.source_freshness, true
          );
          v_replaced := true;
        END IF;
      END IF;
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
  v_final_snapshot := jsonb_set(p_snapshot, '{sections}', v_sections, true);
  IF v_replaced THEN
    SELECT EXISTS (
      SELECT 1 FROM jsonb_each(v_sections) AS s WHERE s.value->>'status' <> 'ok'
    ) INTO v_stale;
    v_final_snapshot := jsonb_set(v_final_snapshot, '{source_freshness}', v_freshness, true);
    v_final_snapshot := jsonb_set(v_final_snapshot, '{stale}', to_jsonb(v_stale), true);
  END IF;
  v_final_snapshot := jsonb_set(v_final_snapshot, '{version}', to_jsonb(v_next_version), true);

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

COMMENT ON FUNCTION public.publish_public_dashboard_snapshot(TEXT, UUID, BIGINT, JSONB) IS
  'Fenced publish of the curated public snapshot. Per-section upsert is guarded by evidence recency (observed_at, else valid_until; computed_at is not evidence), so a worker with an older observation can never overwrite a fresher section. Rejected sections are projected back from the durable row into the published payload.';

GRANT EXECUTE ON FUNCTION public.publish_public_dashboard_snapshot(TEXT, UUID, BIGINT, JSONB) TO service_role;
