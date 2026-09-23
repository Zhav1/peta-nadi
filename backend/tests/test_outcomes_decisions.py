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


def test_variance_recalibration():
    """Test mathematical computation of prediction error variances and sensor weight recalibration."""
    from app.services.outcome_evaluation_service import compute_variance, compute_recalibration_advisory

    # Test 1: Exact prediction
    var_exact = compute_variance(pred_delay=4.0, actual_delay=4.0, pred_price=10.0, actual_price=10.0)
    assert var_exact.delay_error_hours == 0.0
    assert var_exact.price_variance_pct == 0.0
    assert var_exact.accuracy_score == 1.0

    # Test 2: Inexact prediction with error
    var_err = compute_variance(pred_delay=6.0, actual_delay=3.0, pred_price=25.0, actual_price=15.0)
    assert var_err.delay_error_hours == 3.0
    assert var_err.price_variance_pct == 10.0
    assert 0.0 < var_err.accuracy_score < 1.0

    # Test 3: Recalibration advisory sums to 1.0 with learning rate eta=0.05
    advisory = compute_recalibration_advisory(var_err, learning_rate=0.05)
    assert abs(sum(advisory.recommended_weights.values()) - 1.0) < 0.001
    assert advisory.learning_rate == 0.05
    assert len(advisory.channel_adjustments) == 3


def test_benchmark_linking():
    """Test linking outcomes evaluation across the N=60 benchmark dataset."""
    from app.services.outcome_evaluation_service import evaluate_benchmark_outcomes

    summary = evaluate_benchmark_outcomes()
    assert summary["total_scenarios"] == 60
    assert summary["evaluated_positive_scenarios"] == 35
    assert summary["mean_absolute_delay_error"] >= 0.0
    assert summary["mean_absolute_price_error"] >= 0.0
    assert 0.0 < summary["average_accuracy_score"] <= 1.0
    assert len(summary["reports"]) == 35


def test_evaluation_endpoints(client):
    """Test /api/v1/outcomes/evaluation/{id} and /benchmark/summary endpoints."""
    # 1. Benchmark summary endpoint
    resp1 = client.get("/api/v1/outcomes/benchmark/summary")
    assert resp1.status_code == 200
    data1 = resp1.json()
    assert data1["total_scenarios"] == 60
    assert data1["evaluated_positive_scenarios"] == 35

    # 2. Specific incident evaluation endpoint
    resp2 = client.get("/api/v1/outcomes/evaluation/SUMATRA-SCN-001")
    assert resp2.status_code == 200
    data2 = resp2.json()
    assert "variance" in data2
    assert "recalibration" in data2
    assert "recommended_weights" in data2["recalibration"]
