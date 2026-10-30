"""Isolated regression tests for trip-linked operational route approval."""
from __future__ import annotations

import uuid
from copy import deepcopy
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.auth.supabase_auth import ROLE_DISPATCHER, ROLE_REGULATOR, create_guest_token
from app.main import app


class FakeSupabase:
    """Small in-memory RPC contract fake; never contacts a configured project."""

    def __init__(self, trips: dict[str, dict[str, Any]] | None = None, rpc_error: str | None = None):
        self.trips = deepcopy(trips or {})
        self.rpc_error = rpc_error
        self.approvals: dict[str, dict[str, Any]] = {}
        self.rpc_calls: list[dict[str, Any]] = []
        self.inserted_reviews: list[dict[str, Any]] = []

    def rpc(self, name: str, params: dict[str, Any]):
        assert name == "apply_trip_route_decision"
        self.rpc_calls.append(deepcopy(params))
        db = self

        class Query:
            def execute(self):
                if db.rpc_error:
                    raise RuntimeError(db.rpc_error)
                key = params["p_idempotency_key"]
                if key in db.approvals:
                    existing = db.approvals[key]
                    request = existing["request"]
                    comparable = {
                        "travel_id": params["p_travel_id"],
                        "incident_id": params["p_incident_id"],
                        "route_id": params["p_route_id"],
                        "action": params["p_action"],
                        "tactical_action": params["p_tactical_action"],
                        "operator_id": params["p_operator_id"],
                        "expected_route_version": params["p_expected_route_version"],
                        "recommended_route": params["p_recommended_route"],
                        "evidence_refs": params["p_evidence_refs"],
                        "notes": params["p_notes"],
                    }
                    if request != comparable:
                        raise RuntimeError("IDEMPOTENCY_KEY_CONFLICT")
                    return SimpleNamespace(data={**existing["result"], "idempotent_replay": True})
                trip = db.trips.get(params["p_travel_id"])
                if trip is None:
                    raise RuntimeError("TRIP_NOT_FOUND")
                if not params["p_company_id"] or trip["company_id"] != params["p_company_id"]:
                    raise RuntimeError("TRIP_FORBIDDEN")
                if trip["status"] not in {"planned", "moving", "rerouted"}:
                    raise RuntimeError("TRIP_INELIGIBLE")
                if params.get("p_requested_vehicle_id") and params["p_requested_vehicle_id"] != trip["truck_id"]:
                    raise RuntimeError("TRIP_VEHICLE_MISMATCH")
                if trip.get("disruption_id") and trip["disruption_id"] != params["p_incident_id"]:
                    raise RuntimeError("TRIP_INCIDENT_MISMATCH")
                if trip["route_version"] != params["p_expected_route_version"]:
                    raise RuntimeError("TRIP_STALE")
                approval = {
                    "approval_id": str(uuid.uuid4()),
                    "travel_id": trip["id"],
                    "vehicle_id": trip["truck_id"],
                    "trip_version": trip["route_version"] + 1,
                    "application_status": "applied_to_trip",
                    "decision_recorded": True,
                    "external_dispatch_status": "unsupported",
                    "observed_outcome": "not_recorded",
                    "idempotent_replay": False,
                }
                db.approvals[key] = {
                    "result": approval,
                    "request": {
                        "travel_id": params["p_travel_id"],
                        "incident_id": params["p_incident_id"],
                        "route_id": params["p_route_id"],
                        "action": params["p_action"],
                        "tactical_action": params["p_tactical_action"],
                        "operator_id": params["p_operator_id"],
                        "expected_route_version": params["p_expected_route_version"],
                        "recommended_route": deepcopy(params["p_recommended_route"]),
                        "evidence_refs": deepcopy(params["p_evidence_refs"]),
                        "notes": params["p_notes"],
                    },
                }
                trip["approved_route"] = deepcopy(params["p_recommended_route"])
                trip["route_version"] += 1
                trip["disruption_id"] = trip.get("disruption_id") or params["p_incident_id"]
                return SimpleNamespace(data=approval)

        return Query()

    def table(self, name: str):
        db = self

        class Query:
            def __init__(self):
                self.insert_payload = None

            def select(self, *_args, **_kwargs):
                return self

            def eq(self, *_args, **_kwargs):
                return self

            def limit(self, *_args, **_kwargs):
                return self

            def order(self, *_args, **_kwargs):
                return self

            def insert(self, payload):
                self.insert_payload = deepcopy(payload)
                return self

            def execute(self):
                if self.insert_payload is not None:
                    row = {"id": str(uuid.uuid4()), **self.insert_payload}
                    db.inserted_reviews.append(row)
                    return SimpleNamespace(data=[row])
                return SimpleNamespace(data=[])

        return Query()


@pytest.fixture
def operator_client(monkeypatch):
    from app.db import local_storage, supabase_client
    from app.routers import approvals

    db = FakeSupabase({
        "RIT-A": {
            "id": "RIT-A", "truck_id": "BK-TEST-A", "company_id": "org-test",
            "status": "planned", "route_version": 0, "approved_route": None,
            "disruption_id": None,
        },
        "RIT-B": {
            "id": "RIT-B", "truck_id": "BK-TEST-B", "company_id": "org-test",
            "status": "moving", "route_version": 0, "approved_route": None,
            "disruption_id": None,
        },
    })
    monkeypatch.setattr(supabase_client, "get_write_client", lambda: db)
    monkeypatch.setattr(approvals, "_resolve_approval_forecast", lambda *_: (None, "missing"))
    monkeypatch.setattr(local_storage, "save_decision_trace", lambda data: {"id": data.get("id", "local-review"), **data})
    outcome_calls = []
    monkeypatch.setattr(local_storage, "save_ground_truth_outcome", lambda data: outcome_calls.append(data))
    client = TestClient(app)
    token = create_guest_token(role=ROLE_DISPATCHER, company_id="org-test", name="Test Dispatcher")
    return client, db, token, outcome_calls


def route_payload(**overrides):
    payload = {
        "incident_id": "INC-TEST-ROUTE",
        "route_id": "ALT-1",
        "action": "ACCEPT",
        "tactical_action": "REROUTE",
        "notes": "Reviewed incident evidence and selected the safest eligible route.",
        "travel_id": "RIT-A",
        "expected_route_version": 0,
        "idempotency_key": str(uuid.uuid4()),
        "decision_scope": "operational_route",
        "recommended_route": {
            "route_name": "Grounded alternative",
            "description": "Verified bypass",
            "safety_status": "SAFE_DETOUR",
            "proof": "Route analysis linked to verified incident evidence",
            "waypoints": [{"lat": 3.5, "lon": 98.6}],
        },
    }
    payload.update(overrides)
    return payload


def post(client, token, payload):
    return client.post("/api/v1/approvals", json=payload, headers={"Authorization": f"Bearer {token}"})


def test_authorized_route_decision_applies_only_to_selected_trip(operator_client):
    client, db, token, outcome_calls = operator_client
    payload = route_payload()

    response = post(client, token, payload)

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["application_status"] == "applied_to_trip"
    assert body["travel_id"] == "RIT-A"
    assert body["vehicle_id"] == "BK-TEST-A"
    assert body["external_dispatch_status"] == "unsupported"
    assert body["observed_outcome"] == "not_recorded"
    assert db.trips["RIT-A"]["route_version"] == 1
    assert db.trips["RIT-A"]["approved_route"] == payload["recommended_route"]
    assert db.trips["RIT-B"]["route_version"] == 0
    assert db.trips["RIT-B"]["approved_route"] is None
    assert db.rpc_calls[0]["p_operator_id"].startswith("guest-dispatcher-")
    assert outcome_calls == []


def test_route_change_without_trip_is_rejected_but_incident_review_remains_available(operator_client):
    client, db, token, _ = operator_client
    missing_trip = route_payload()
    missing_trip.pop("travel_id")
    assert post(client, token, missing_trip).status_code == 422
    assert not db.rpc_calls

    review = post(client, token, {
        "incident_id": "INC-NEWS-ONLY",
        "route_id": "NEWS-REVIEW",
        "action": "REJECT",
        "tactical_action": "REROUTE",
        "notes": "Evidence does not validate the report.",
    })
    assert review.status_code == 201, review.text
    assert review.json()["application_status"] == "decision_recorded"
    assert db.inserted_reviews[0]["incident_id"] == "INC-NEWS-ONLY"
    assert db.inserted_reviews[0]["decision_scope"] == "incident_review"
    assert "travel_id" not in db.inserted_reviews[0]

    incident_acceptance = post(client, token, {
        "incident_id": "INC-NEWS-ONLY",
        "route_id": "NEWS-VALIDATION",
        "action": "ACCEPT",
        "tactical_action": "REROUTE",
        "decision_scope": "incident_review",
        "notes": "Evidence accepted for incident validation only.",
    })
    assert incident_acceptance.status_code == 201
    assert incident_acceptance.json()["application_status"] == "decision_recorded"
    assert len(db.rpc_calls) == 0

    missing_incident = post(client, token, {
        "route_id": "NEWS-REVIEW",
        "action": "REJECT",
        "tactical_action": "REROUTE",
        "notes": "The report has no incident identifier.",
    })
    assert missing_incident.status_code == 422
    assert len(db.inserted_reviews) == 2


@pytest.mark.parametrize(
    ("trip_id", "state", "expected_status"),
    [
        ("RIT-MISSING", "planned", 404),
        ("RIT-A", "failed", 409),
    ],
)
def test_missing_or_ineligible_trip_is_rejected(operator_client, trip_id, state, expected_status):
    client, db, token, _ = operator_client
    if state == "failed":
        db.trips[trip_id]["status"] = state
    response = post(client, token, route_payload(travel_id=trip_id))
    assert response.status_code == expected_status
    assert db.trips["RIT-A"]["route_version"] == 0


def test_tenant_and_vehicle_assignment_mismatches_are_rejected(operator_client):
    client, db, token, _ = operator_client
    other_tenant = create_guest_token(role=ROLE_DISPATCHER, company_id="org-other")
    assert post(client, other_tenant, route_payload()).status_code == 403

    mismatch = route_payload(recommended_route={
        **route_payload()["recommended_route"], "vehicle_id": "BK-TEST-B",
    })
    response = post(client, token, mismatch)
    assert response.status_code == 409
    assert db.trips["RIT-A"]["route_version"] == 0
    assert db.trips["RIT-B"]["route_version"] == 0


def test_dispatcher_without_trip_write_permission_is_rejected(operator_client):
    from app.auth.supabase_auth import UserSession, get_optional_user

    client, db, token, _ = operator_client
    app.dependency_overrides[get_optional_user] = lambda: UserSession(
        id="dispatcher-no-fleet-write", email="dispatcher@example.test", role="DISPATCHER",
        company_id="org-test", permissions=["approvals:write"],
    )
    try:
        response = client.post("/api/v1/approvals", json=route_payload(), headers={"Authorization": f"Bearer {token}"})
    finally:
        app.dependency_overrides.pop(get_optional_user, None)
    assert response.status_code == 403
    assert not db.rpc_calls


def test_regulator_cannot_apply_route_change(operator_client):
    client, db, _, _ = operator_client
    token = create_guest_token(role=ROLE_REGULATOR, company_id="org-test")
    response = post(client, token, route_payload())
    assert response.status_code == 403
    assert not db.rpc_calls


def test_stale_decision_and_idempotent_retry_do_not_apply_twice(operator_client):
    client, db, token, _ = operator_client
    payload = route_payload()
    first = post(client, token, payload)
    repeated = post(client, token, payload)
    assert first.status_code == repeated.status_code == 201
    assert repeated.json()["approval_id"] == first.json()["approval_id"]
    assert repeated.json()["idempotent_replay"] is True
    assert db.trips["RIT-A"]["route_version"] == 1

    stale = post(client, token, route_payload(expected_route_version=0))
    assert stale.status_code == 409
    assert db.trips["RIT-A"]["route_version"] == 1


def test_idempotency_key_cannot_be_reused_for_a_different_decision(operator_client):
    client, db, token, _ = operator_client
    payload = route_payload()
    assert post(client, token, payload).status_code == 201

    changed = {**payload, "recommended_route": {**payload["recommended_route"], "route_name": "Different route"}}
    response = post(client, token, changed)

    assert response.status_code == 409
    assert db.trips["RIT-A"]["route_version"] == 1


def test_simulation_and_cloud_failure_never_report_applied(operator_client):
    client, db, token, _ = operator_client
    simulated = post(client, token, route_payload(simulation_mode=True))
    route_marked_simulated = post(client, token, route_payload(recommended_route={
        **route_payload()["recommended_route"], "is_simulated": True,
    }))
    assert simulated.status_code == route_marked_simulated.status_code == 422
    assert not db.rpc_calls

    db.rpc_error = "network unavailable"
    failed = post(client, token, route_payload())
    assert failed.status_code == 503
    assert failed.json()["detail"]
    assert db.trips["RIT-A"]["route_version"] == 0
