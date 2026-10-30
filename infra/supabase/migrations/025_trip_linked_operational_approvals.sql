-- Bind operational route decisions to the canonical travels ledger row.
-- Existing route_approvals remain readable and explicitly unlinked.

ALTER TABLE public.travels
  ADD COLUMN IF NOT EXISTS approved_route JSONB,
  ADD COLUMN IF NOT EXISTS route_version INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.route_approvals
  ADD COLUMN IF NOT EXISTS travel_id TEXT REFERENCES public.travels(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS trip_version INTEGER,
  ADD COLUMN IF NOT EXISTS prior_route JSONB,
  ADD COLUMN IF NOT EXISTS applied_route JSONB,
  ADD COLUMN IF NOT EXISTS applied_vehicle_id TEXT,
  ADD COLUMN IF NOT EXISTS evidence_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS idempotency_key UUID,
  ADD COLUMN IF NOT EXISTS decision_scope TEXT NOT NULL DEFAULT 'legacy_unlinked',
  ADD COLUMN IF NOT EXISTS execution_status TEXT NOT NULL DEFAULT 'legacy_unlinked';

CREATE INDEX IF NOT EXISTS route_approvals_travel_id_idx
  ON public.route_approvals (travel_id);
CREATE UNIQUE INDEX IF NOT EXISTS route_approvals_idempotency_key_idx
  ON public.route_approvals (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- One transaction records the decision, snapshots prior/proposed route state,
-- and conditionally updates only the selected, eligible trip. It does not call
-- an external dispatcher or claim physical execution.
CREATE OR REPLACE FUNCTION public.apply_trip_route_decision(
  p_travel_id TEXT,
  p_incident_id TEXT,
  p_route_id TEXT,
  p_action TEXT,
  p_tactical_action TEXT,
  p_operator_id TEXT,
  p_company_id TEXT,
  p_expected_route_version INTEGER,
  p_requested_vehicle_id TEXT,
  p_idempotency_key UUID,
  p_recommended_route JSONB,
  p_evidence_refs JSONB,
  p_notes TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_trip public.travels%ROWTYPE;
  v_existing public.route_approvals%ROWTYPE;
  v_approval public.route_approvals%ROWTYPE;
  v_next_version INTEGER;
BEGIN
  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'IDEMPOTENCY_KEY_REQUIRED';
  END IF;

  SELECT * INTO v_existing
  FROM public.route_approvals
  WHERE idempotency_key = p_idempotency_key;

  IF FOUND THEN
    IF v_existing.travel_id IS DISTINCT FROM p_travel_id
       OR v_existing.incident_id::text IS DISTINCT FROM p_incident_id
       OR v_existing.route_id IS DISTINCT FROM p_route_id
       OR v_existing.action IS DISTINCT FROM p_action
       OR v_existing.tactical_action IS DISTINCT FROM p_tactical_action
       OR v_existing.operator_id IS DISTINCT FROM p_operator_id
       OR v_existing.recommended_route IS DISTINCT FROM p_recommended_route
       OR v_existing.notes IS DISTINCT FROM p_notes
       OR v_existing.evidence_refs IS DISTINCT FROM COALESCE(p_evidence_refs, '[]'::jsonb)
       OR p_expected_route_version IS NULL
       OR v_existing.trip_version IS DISTINCT FROM p_expected_route_version + 1 THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'IDEMPOTENCY_KEY_CONFLICT';
    END IF;

    SELECT * INTO v_trip FROM public.travels WHERE id = p_travel_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'TRIP_NOT_FOUND';
    END IF;
    IF p_company_id IS NULL OR v_trip.company_id IS DISTINCT FROM p_company_id THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'TRIP_FORBIDDEN';
    END IF;

    RETURN jsonb_build_object(
      'approval_id', v_existing.id,
      'travel_id', v_existing.travel_id,
      'vehicle_id', v_existing.applied_vehicle_id,
      'approved_at', v_existing.approved_at,
      'created_at', v_existing.created_at,
      'trip_version', v_existing.trip_version,
      'application_status', v_existing.execution_status,
      'idempotent_replay', true
    );
  END IF;

  SELECT * INTO v_trip
  FROM public.travels
  WHERE id = p_travel_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'TRIP_NOT_FOUND';
  END IF;

  -- Recheck after locking the trip so concurrent retries with the same key
  -- return the first committed result instead of being treated as stale.
  SELECT * INTO v_existing
  FROM public.route_approvals
  WHERE idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_existing.travel_id IS DISTINCT FROM p_travel_id
       OR v_existing.incident_id::text IS DISTINCT FROM p_incident_id
       OR v_existing.route_id IS DISTINCT FROM p_route_id
       OR v_existing.action IS DISTINCT FROM p_action
       OR v_existing.tactical_action IS DISTINCT FROM p_tactical_action
       OR v_existing.operator_id IS DISTINCT FROM p_operator_id
       OR v_existing.recommended_route IS DISTINCT FROM p_recommended_route
       OR v_existing.notes IS DISTINCT FROM p_notes
       OR v_existing.evidence_refs IS DISTINCT FROM COALESCE(p_evidence_refs, '[]'::jsonb)
       OR p_expected_route_version IS NULL
       OR v_existing.trip_version IS DISTINCT FROM p_expected_route_version + 1 THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'IDEMPOTENCY_KEY_CONFLICT';
    END IF;
    RETURN jsonb_build_object(
      'approval_id', v_existing.id,
      'travel_id', v_existing.travel_id,
      'vehicle_id', v_existing.applied_vehicle_id,
      'approved_at', v_existing.approved_at,
      'created_at', v_existing.created_at,
      'trip_version', v_existing.trip_version,
      'application_status', v_existing.execution_status,
      'idempotent_replay', true
    );
  END IF;

  IF p_company_id IS NULL OR v_trip.company_id IS DISTINCT FROM p_company_id THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'TRIP_FORBIDDEN';
  END IF;
  IF v_trip.status NOT IN ('planned', 'moving', 'rerouted') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'TRIP_INELIGIBLE';
  END IF;
  IF p_requested_vehicle_id IS NOT NULL AND p_requested_vehicle_id <> v_trip.truck_id THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'TRIP_VEHICLE_MISMATCH';
  END IF;
  IF v_trip.disruption_id IS NOT NULL AND v_trip.disruption_id <> p_incident_id THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'TRIP_INCIDENT_MISMATCH';
  END IF;
  IF p_expected_route_version IS NULL OR v_trip.route_version <> p_expected_route_version THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'TRIP_STALE';
  END IF;

  v_next_version := v_trip.route_version + 1;
  INSERT INTO public.route_approvals (
    incident_id, route_id, action, tactical_action, operator_id,
    recommended_route, notes, sync_status, created_at, approved_at,
    travel_id, trip_version, prior_route, applied_route, applied_vehicle_id, evidence_refs,
    idempotency_key, decision_scope, execution_status
  ) VALUES (
    p_incident_id, p_route_id, p_action, p_tactical_action, p_operator_id,
    p_recommended_route, p_notes, 'synced', now(), now(),
    p_travel_id, v_next_version, v_trip.approved_route, p_recommended_route, v_trip.truck_id,
    COALESCE(p_evidence_refs, '[]'::jsonb), p_idempotency_key, 'operational_route', 'applied_to_trip'
  ) RETURNING * INTO v_approval;

  UPDATE public.travels
  SET approved_route = p_recommended_route,
      route_version = v_next_version,
      disruption_id = COALESCE(disruption_id, p_incident_id),
      updated_at = now()
  WHERE id = p_travel_id;

  RETURN jsonb_build_object(
    'approval_id', v_approval.id,
    'travel_id', p_travel_id,
    'vehicle_id', v_trip.truck_id,
    'approved_at', v_approval.approved_at,
    'created_at', v_approval.created_at,
    'trip_version', v_next_version,
    'application_status', 'applied_to_trip',
    'decision_recorded', true,
    'external_dispatch_status', 'unsupported',
    'observed_outcome', 'not_recorded',
    'idempotent_replay', false
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_trip_route_decision(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, UUID, JSONB, JSONB, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_trip_route_decision(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, UUID, JSONB, JSONB, TEXT
) TO service_role;
