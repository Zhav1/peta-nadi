"""Hermetic checks that pilot shadow mode cannot mutate operational ledgers."""
from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from fastapi.testclient import TestClient

from app.auth.supabase_auth import ROLE_DISPATCHER, ROLE_REGULATOR, create_guest_token
from app.main import app


@pytest.fixture

def shadow(monkeypatch):
    from app.services import pilot_safety

    monkeypatch.setattr(pilot_safety, "get_settings", lambda: SimpleNamespace(pilot_shadow_mode=True))
    return pilot_safety


@pytest.fixture

def client():
    return TestClient(app)


def dispatcher_headers(company_id: str = "pos_logistik"):
    token = create_guest_token(role=ROLE_DISPATCHER, company_id=company_id)
    return {"Authorization": f"Bearer {token}"}


def trip_record(company_id: str = "pos_logistik"):
    return {
        "id": "TRIP-SHADOW-1",
        "truck_id": "BK-SHADOW-1",
        "company_id": company_id,
        "status": "moving",
        "route_version": 3,
        "disruption_id": None,
    }


def test_approval_shadow_never_calls_rpc_or_writes_even_for_unsafe_payload(client, shadow, monkeypatch):
    from app.services import travel_ledger_service
    from app.db import supabase_client

    fake = SimpleNamespace(rpc=Mock(side_effect=AssertionError("RPC must not run")), table=Mock(side_effect=AssertionError("DB write/read must not run")))
    monkeypatch.setattr(supabase_client, "get_write_client", lambda: fake)
    monkeypatch.setattr(travel_ledger_service, "get_travel", lambda _travel_id: trip_record())

    response = client.post(
        "/api/v1/approvals",
        headers=dispatcher_headers(),
        json={
            "incident_id": "INC-SHADOW-1",
            "route_id": "ALT-1",
            "action": "ACCEPT",
            "tactical_action": "REROUTE",
            "notes": "Research evaluation only",
            "travel_id": "TRIP-SHADOW-1",
            "expected_route_version": 3,
            "idempotency_key": "5ca7a58b-49e5-441f-84f4-900ce5033201",
            "decision_scope": "operational_route",
            "simulation_mode": True,
            "recommended_route": {
                "safety_status": "SAFE_DETOUR",
                "is_compromised": True,
                "passability": "BLOCKED",
                "viable": False,
                "proof": "forged client proof",
                "waypoints": [{"lat": 3.5, "lon": 98.6}],
            },
        },
    )

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["status"] == body["application_status"] == "shadow_preview"
    assert body["shadow_mode"] is True
    assert body["applied"] is False
    assert body["recorded"] is False
    assert body["persistence_status"] == "not_persisted"
    assert body["external_dispatch_status"] == "disabled"
    assert body["preview"]["client_safety_claims_unverified"] is True
    fake.rpc.assert_not_called()
    fake.table.assert_not_called()


def test_shadow_approval_preserves_tenant_and_role_authorization(client, shadow, monkeypatch):
    from app.services import travel_ledger_service

    monkeypatch.setattr(travel_ledger_service, "get_travel", lambda _travel_id: trip_record("tenant-a"))
    payload = {
        "incident_id": "INC-SHADOW-1",
        "route_id": "ALT-1",
        "action": "ACCEPT",
        "tactical_action": "REROUTE",
        "notes": "Research evaluation only",
        "travel_id": "TRIP-SHADOW-1",
        "expected_route_version": 3,
        "idempotency_key": "5ca7a58b-49e5-441f-84f4-900ce5033201",
        "decision_scope": "operational_route",
        "recommended_route": {"safety_status": "SAFE_DETOUR", "proof": "proof"},
    }

    wrong_tenant = client.post("/api/v1/approvals", headers=dispatcher_headers("tenant-b"), json=payload)
    regulator = client.post(
        "/api/v1/approvals",
        headers={"Authorization": f"Bearer {create_guest_token(role=ROLE_REGULATOR, company_id='tenant-a')}"},
        json=payload,
    )
    assert wrong_tenant.status_code == 403
    assert regulator.status_code == 403


def test_shadow_travel_and_outcome_mutations_return_non_durable_previews(client, shadow, monkeypatch):
    from app.db import local_storage
    from app.services import travel_ledger_service

    trip = trip_record()
    writes = Mock(side_effect=AssertionError("shadow mode must not persist"))
    monkeypatch.setattr(travel_ledger_service, "resolve_truck_asset", lambda _truck_id: {
        "truck_id": "BK-SHADOW-1", "company_id": "pos_logistik", "name": "Research fixture"
    })
    monkeypatch.setattr(travel_ledger_service, "get_travel", lambda _travel_id: trip)
    monkeypatch.setattr(travel_ledger_service, "create_travel", writes)
    monkeypatch.setattr(travel_ledger_service, "update_travel", writes)
    monkeypatch.setattr(travel_ledger_service, "solve_and_persist_hedging", writes)
    monkeypatch.setattr(local_storage, "save_outcome", writes)

    headers = dispatcher_headers()
    asset = client.post(
        "/api/v1/fleet/trucks",
        headers=headers,
        json={"truck_id": "BK-SHADOW-1", "name": "Research fixture"},
    )
    travel = client.post(
        "/api/v1/fleet/travels",
        headers=headers,
        json={
            "truck_id": "BK-SHADOW-1",
            "origin_name": "Medan",
            "origin_coords": [98.67, 3.59],
            "destination_name": "Binjai",
            "dest_coords": [98.48, 3.60],
            "commodity_key": "beras",
            "cargo_tonnage": 1,
            "sla_deadline_hours": 4,
            "baseline_time_hours": 1,
        },
    )
    patch = client.patch(
        "/api/v1/fleet/travels/TRIP-SHADOW-1",
        headers=headers,
        json={"actual_time_hours": 2, "actual_fuel_liters": 10, "status": "delivered"},
    )
    hedge = client.post("/api/v1/fleet/travels/TRIP-SHADOW-1/hedging", headers=headers, json={})
    outcome = client.post(
        "/api/v1/outcomes",
        headers=headers,
        json={
            "incident_id": "TRIP-SHADOW-1",
            "horizon": "T+12h",
            "observed_delay_hours": 1,
            "actual_price_spike_pct": 2,
        },
    )

    for response, expected_status in (
        (asset, 201),
        (travel, 201),
        (patch, 200),
        (hedge, 200),
        (outcome, 201),
    ):
        assert response.status_code == expected_status, response.text
        body = response.json()
        assert body["shadow_mode"] is True
        assert body["applied"] is False
        assert body["recorded"] is False
        assert body["persistence_status"] == "not_persisted"
        assert body["external_dispatch_status"] == "disabled"
    writes.assert_not_called()


def test_outcome_shadow_still_requires_dispatcher_authorization(client, shadow, monkeypatch):
    from app.db import local_storage

    save = Mock(side_effect=AssertionError("unauthorized outcome must not persist"))
    monkeypatch.setattr(local_storage, "save_outcome", save)
    response = client.post(
        "/api/v1/outcomes",
        json={
            "incident_id": "INC-SHADOW-UNAUTH",
            "horizon": "T+12h",
            "observed_delay_hours": 1,
            "actual_price_spike_pct": 2,
        },
    )
    assert response.status_code == 403
    save.assert_not_called()


def test_default_is_shadow_when_shared_setting_is_absent(monkeypatch):
    from app.services import pilot_safety

    monkeypatch.setattr(pilot_safety, "get_settings", lambda: SimpleNamespace())
    assert pilot_safety.is_pilot_shadow_mode() is True
