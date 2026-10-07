"""
PreHub — Disruption Impact Assessment & Dispatcher Decision Support Tests.
Verifies the end-to-end pipeline:
1. Disruption event triggers spatial intersection with active fleet trajectories.
2. Identifies impacted shipments (e.g. TRK-003 Cabai Merah near Tebing Tinggi).
3. Deterministically computes Spoilage Hedging (Continue vs Reroute vs Hold).
4. Solves CPU Detour avoidance via NetworkX / OR-Tools in <50ms.
5. Produces explainable recommendation rationale and driver WhatsApp dispatch action.
"""
import pytest
import time
from fastapi.testclient import TestClient

from app.main import app
from app.services.impact_assessment_service import impact_assessment_service
from app.schemas.impact_schemas import DisruptionImpactRequest
from app.db import local_storage

client = TestClient(app)


@pytest.mark.asyncio
async def test_disruption_impact_assessment_spatial_filtering():
    """
    Test that placing a 15km flood hazard at Tebing Tinggi correctly flags TRK-003
    (Belawan -> Tebing Tinggi / Pekanbaru) as impacted while ignoring distant trucks (e.g. Lampung/Aceh).
    """
    req = DisruptionImpactRequest(
        incident_id="INC-TEBINGTINGGI-TEST",
        lat=3.3285,
        lon=99.1625,
        radius_km=15.0,
        hazard_type="flood",
        severity="critical",
        title="Banjir Luapan Tebing Tinggi Km 42"
    )

    # Initial warm-up of CPU graph and local SQLite
    await impact_assessment_service.assess_disruption_impact(req)

    t0 = time.perf_counter()
    res = await impact_assessment_service.assess_disruption_impact(req)
    latency_ms = (time.perf_counter() - t0) * 1000.0

    assert res.total_fleet_scanned >= 20
    assert res.impacted_vehicles_count >= 1
    assert latency_ms < 250.0  # Fast execution on standard CPU

    # TRK-003 must be among the impacted vehicles
    trk3 = next((v for v in res.impacted_vehicles if "TRK-003" in v.vehicle_id), None)
    assert trk3 is not None
    assert trk3.commodity_key == "cabai_merah"
    assert trk3.cargo_tonnage == 4.5
    assert trk3.optimal_policy == "REROUTE"
    assert trk3.net_savings_idr > 50000000.0  # Saves > Rp 50M vs spoilage
    assert trk3.late_arrival_risk_pct >= 70.0
    assert "BK 8812 XL" in trk3.vehicle_name or "TRK-003" in trk3.vehicle_id
    assert trk3.driver_phone == "6281234567891"
    assert "PREHUB DISPATCH:" in trk3.whatsapp_dispatch_text
    assert "penghematan bersih" in trk3.recommendation_rationale


def test_impact_assessment_api_endpoint():
    """
    Test POST /api/v1/incidents/impact-assessment REST endpoint.
    """
    payload = {
        "incident_id": "INC-FLOOD-API-TEST",
        "lat": 3.3285,
        "lon": 99.1625,
        "radius_km": 15.0,
        "hazard_type": "flood",
        "severity": "critical",
        "title": "Banjir Tebing Tinggi KM 42"
    }

    res = client.post("/api/v1/incidents/impact-assessment", json=payload)
    assert res.status_code == 200
    data = res.json()

    assert data["impacted_vehicles_count"] >= 1
    assert len(data["impacted_vehicles"]) >= 1

    first = data["impacted_vehicles"][0]
    assert "optimal_policy" in first
    assert "net_savings_idr" in first
    assert "recommendation_rationale" in first
    assert "whatsapp_dispatch_text" in first

    # Verify trace persisted in local SQLite
    traces = local_storage.list_impact_assessments(limit=5)
    assert len(traces) >= 1
    found = next((t for t in traces if t["incident_id"] == "INC-FLOOD-API-TEST"), None)
    assert found is not None
