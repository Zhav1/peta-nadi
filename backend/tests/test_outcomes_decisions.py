"""
Unit and Integration Tests for Operator Decision Traces and Ground-Truth Outcomes.
Verifies FR-12.1, FR-12.2, FR-12.4, and NFR-8.
"""
import pytest
from datetime import datetime
from fastapi.testclient import TestClient

from app.main import app
from app.schemas.decision_schemas import (
    DecisionAction,
    TacticalManeuver,
    DecisionTraceCreate,
    OutcomeHorizon,
    VerificationSource,
    OutcomeCreate
)
from app.db import local_storage


@pytest.fixture
def client():
    return TestClient(app)


def test_decision_schema_validation():
    """Verify that ACCEPT works without notes, but REJECT and OVERRIDE require mandatory notes."""
    # ACCEPT without notes -> Valid
    valid_accept = DecisionTraceCreate(
        incident_id="INC-001",
        route_id="0",
        action=DecisionAction.ACCEPT,
        tactical_action=TacticalManeuver.REROUTE,
        operator_id="commander-1"
    )
    assert valid_accept.action == DecisionAction.ACCEPT
    assert valid_accept.operator_id == "commander-1"

    # REJECT without notes -> Invalid
    with pytest.raises(ValueError, match="Mandatory explanation notes required"):
        DecisionTraceCreate(
            incident_id="INC-001",
            route_id="0",
            action=DecisionAction.REJECT,
            tactical_action=TacticalManeuver.HOLD,
            operator_id="commander-1",
            notes=""
        )

    # OVERRIDE without notes -> Invalid
    with pytest.raises(ValueError, match="Mandatory explanation notes required"):
        DecisionTraceCreate(
            incident_id="INC-001",
            route_id="0",
            action=DecisionAction.OVERRIDE,
            tactical_action=TacticalManeuver.REROUTE,
            operator_id="commander-1",
            notes="   "
        )

    # OVERRIDE with notes and custom constraints -> Valid
    valid_override = DecisionTraceCreate(
        incident_id="INC-001",
        route_id="1",
        action=DecisionAction.OVERRIDE,
        tactical_action=TacticalManeuver.REROUTE,
        operator_id="commander-1",
        custom_constraints={"speed_limit_kmh": 40, "avoid_nodes": ["NODE-SARIBUDOLOK"]},
        notes="Bridge weight limit degraded to 10 tons; taking bypass via Kabanjahe."
    )
    assert valid_override.notes.startswith("Bridge weight limit")
    assert valid_override.custom_constraints["speed_limit_kmh"] == 40


def test_decision_storage_sqlite(tmp_path):
    """Test direct SQLite persistence and querying for operator decisions."""
    db_file = tmp_path / "test_prehub.db"
    local_storage.init_db(str(db_file))

    # Save a decision
    payload = {
        "incident_id": "INC-TEST-99",
        "route_id": "2",
        "action": "OVERRIDE",
        "tactical_action": "HOLD",
        "operator_id": "test-op",
        "notes": "Weather radar indicates worsening squall line.",
        "custom_constraints": {"max_hold_hours": 4},
        "sync_status": "pending"
    }
    saved = local_storage.save_decision_trace(payload, db_path=str(db_file))
    assert saved["id"] is not None
    assert saved["action"] == "OVERRIDE"

    # Query back
    records = local_storage.list_decision_traces("INC-TEST-99", db_path=str(db_file))
    assert len(records) == 1
    assert records[0]["tactical_action"] == "HOLD"
    assert records[0]["custom_constraints"]["max_hold_hours"] == 4


def test_outcomes_storage_sqlite(tmp_path):
    """Test direct SQLite persistence and querying for field outcomes."""
    db_file = tmp_path / "test_prehub.db"
    local_storage.init_db(str(db_file))

    # Save an outcome
    payload = {
        "incident_id": "INC-TEST-99",
        "horizon": "T+12h",
        "actual_clearance_time": datetime.now().isoformat(),
        "observed_delay_hours": 2.5,
        "actual_price_spike_pct": 14.2,
        "verified_by": "surveyor-medan",
        "verification_source": "FIELD_REPORT",
        "notes": "Water pumped out of arterial culvert at 08:30 WIB."
    }
    saved = local_storage.save_outcome(payload, db_path=str(db_file))
    assert saved["id"] is not None
    assert saved["observed_delay_hours"] == 2.5

    # Query by incident & horizon
    records = local_storage.list_outcomes("INC-TEST-99", horizon="T+12h", db_path=str(db_file))
    assert len(records) == 1
    assert records[0]["actual_price_spike_pct"] == 14.2


def test_approvals_endpoint_multi_action(client):
    """Test FastAPI /api/v1/approvals endpoint with multi-action payloads."""
    # 1. Post ACCEPT
    resp1 = client.post("/api/v1/approvals", json={
        "incident_id": "INC-API-01",
        "route_id": "0",
        "action": "ACCEPT",
        "tactical_action": "REROUTE",
        "operator_id": "op-unit-1"
    })
    assert resp1.status_code == 201
    data1 = resp1.json()
    assert data1["action"] == "ACCEPT"
    assert data1["tactical_action"] == "REROUTE"

    # 2. Post OVERRIDE with notes
    resp2 = client.post("/api/v1/approvals", json={
        "incident_id": "INC-API-01",
        "route_id": "1",
        "action": "OVERRIDE",
        "tactical_action": "HOLD",
        "operator_id": "op-unit-1",
        "notes": "Delaying departure until daylight hours due to landslide risk."
    })
    assert resp2.status_code == 201
    data2 = resp2.json()
    assert data2["action"] == "OVERRIDE"

    # 3. GET approvals list
    get_resp = client.get("/api/v1/approvals?incident_id=INC-API-01")
    assert get_resp.status_code == 200
    list_data = get_resp.json()
    assert list_data["total"] >= 2


def test_outcomes_endpoint(client):
    """Test FastAPI /api/v1/outcomes endpoint (POST and GET)."""
    # 1. Post T+12h outcome
    post_resp = client.post("/api/v1/outcomes", json={
        "incident_id": "INC-API-OUT-01",
        "horizon": "T+12h",
        "observed_delay_hours": 3.0,
        "actual_price_spike_pct": 18.5,
        "verified_by": "polda-sumut",
        "verification_source": "POLDA_TRAFFIC_POLICE",
        "notes": "Lalu lintas Jalinsum Km 42 dibuka satu lajur."
    })
    assert post_resp.status_code == 201
    post_data = post_resp.json()
    assert post_data["incident_id"] == "INC-API-OUT-01"
    assert post_data["horizon"] == "T+12h"

    # 2. Query outcomes
    get_resp = client.get("/api/v1/outcomes?incident_id=INC-API-OUT-01")
    assert get_resp.status_code == 200
    get_data = get_resp.json()
    assert get_data["total"] >= 1
    item = get_data["items"][0]
    assert item["observed_delay_hours"] == 3.0
    assert item["actual_price_spike_pct"] == 18.5
