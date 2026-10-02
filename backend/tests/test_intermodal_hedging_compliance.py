"""
PreHub — Test Suite for Intermodal Choke-Points, Spoilage Hedging, and Compliance.
Tests 18+ Pan-Sumatra transport gateways, delay multipliers, BPJT toll tables,
4-tier perishability decay, hedging cost solver optimality, BKHIT quarantine hard blocks,
and MST axle-load compliance rules.
"""
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.intermodal_sync_service import (
    intermodal_sync_service,
    SUMATRA_CHOKE_POINTS,
    haversine_distance_km
)
from app.services.spoilage_hedging_service import (
    spoilage_hedging_service,
    BPJT_SUMATRA_TOLL_SEGMENTS,
    PERTAMINA_FUEL_BASE_RATES,
    PERISHABILITY_TIERS
)
from app.services.compliance_service import compliance_service
from app.schemas.intermodal import (
    HedgingSolveRequest,
    ComplianceVerifyRequest
)

client = TestClient(app)


def test_chokepoints_registry_integrity():
    """Verify registry has at least 18 choke-points with valid fields and multiplier in [1.0, 3.5]."""
    points = intermodal_sync_service.get_all_chokepoints()
    assert len(points) >= 18

    seaports = [p for p in points if p["type"] in ("SEAPORT", "FERRY_TERMINAL")]
    mountain_passes = [p for p in points if p["type"] in ("MOUNTAIN_PASS", "TOLL_HIGHWAY_JUNCTION", "FREIGHT_CORRIDOR", "HIGHWAY_BOTTLENECK")]

    assert len(seaports) >= 7
    assert len(mountain_passes) >= 11

    for p in points:
        assert "id" in p and p["id"]
        assert "name" in p and p["name"]
        assert len(p["coords"]) == 2
        assert 95.0 <= p["coords"][0] <= 109.0  # Sumatra longitude range
        assert -6.5 <= p["coords"][1] <= 6.0    # Sumatra latitude range
        assert p["status"] in ("NORMAL", "CONGESTED", "RESTRICTED", "BLOCKED")
        assert 1.0 <= p["intermodal_delay_multiplier"] <= 3.5


def test_intermodal_delay_multiplier_clamping():
    """Test delay multiplier computation and strict clamping between 1.0 and 3.5."""
    compute = intermodal_sync_service._compute_delay_multiplier

    # Normal conditions, zero queue
    assert compute(0, "NORMAL") == 1.0

    # Moderate congestion
    m_med = compute(15, "CONGESTED")
    assert 1.0 < m_med < 3.5

    # Extreme catastrophe / queue: must cap strictly at 3.5
    m_extreme = compute(200, "BLOCKED")
    assert m_extreme == 3.5


def test_haversine_and_route_intermodal_delay():
    """Test spherical distance calculation and route proximity multiplier."""
    # Distance between Belawan (98.6776, 3.7922) and Tebing Tinggi (99.1625, 3.3285)
    dist = haversine_distance_km([98.6776, 3.7922], [99.1625, 3.3285])
    assert 60.0 < dist < 90.0

    # Route passing near Sitinjau Lauik
    sitinjau_coords = [100.5186, -0.9458]
    waypoints = [
        [100.35, -0.95],
        [100.51, -0.94],  # Very close to Sitinjau Lauik
        [100.65, -0.93]
    ]
    multiplier = intermodal_sync_service.calculate_route_intermodal_delay(waypoints, proximity_threshold_km=20.0)
    assert multiplier > 1.0

    # Route far in ocean or empty route
    empty_mult = intermodal_sync_service.calculate_route_intermodal_delay([])
    assert empty_mult == 1.0


def test_bpjt_toll_segment_tariffs():
    """Verify official BPJT toll segments and Golongan tariffs."""
    assert "MEDAN_TEBINGTINGGI" in BPJT_SUMATRA_TOLL_SEGMENTS
    assert "BAKAUHENI_TERBANGGI" in BPJT_SUMATRA_TOLL_SEGMENTS

    # Golongan V should be higher than Golongan I
    cost_gol1 = spoilage_hedging_service.get_bpjt_toll_cost(["BAKAUHENI_TERBANGGI"], "GOL_I")
    cost_gol2 = spoilage_hedging_service.get_bpjt_toll_cost(["BAKAUHENI_TERBANGGI"], "GOL_II")
    cost_gol5 = spoilage_hedging_service.get_bpjt_toll_cost(["BAKAUHENI_TERBANGGI"], "GOL_V")

    assert cost_gol1 == 118500
    assert cost_gol2 == 177500
    assert cost_gol5 == 237000
    assert cost_gol5 > cost_gol2 >= cost_gol1


def test_4_tier_perishability_decay():
    """Test 4-tier commodity decay classification and exponential loss monotonicity."""
    tier_cabai, info_cabai = spoilage_hedging_service.classify_commodity("Cabai Merah Keriting")
    tier_daging, info_daging = spoilage_hedging_service.classify_commodity("Daging Sapi Segar")
    tier_bawang, info_bawang = spoilage_hedging_service.classify_commodity("Bawang Merah")
    tier_beras, info_beras = spoilage_hedging_service.classify_commodity("Beras Medium")

    assert tier_cabai == "ULTRA_PERISHABLE"
    assert info_cabai["delta"] == 0.025

    assert tier_daging == "COLD_CHAIN"
    assert info_daging["requires_reefer"] is True
    assert info_daging["genset_cost_per_hour"] > 0

    assert tier_bawang == "SEMI_PERISHABLE"
    assert info_bawang["delta"] == 0.008

    assert tier_beras == "DRY_BULK"
    assert info_beras["delta"] == 0.0005

    # Over 12 hours, delta ordering ensures higher relative value loss
    delay_hours = 12.0
    loss_cabai_pct = 1.0 - (2.71828 ** (-info_cabai["delta"] * delay_hours))
    loss_bawang_pct = 1.0 - (2.71828 ** (-info_bawang["delta"] * delay_hours))
    loss_beras_pct = 1.0 - (2.71828 ** (-info_beras["delta"] * delay_hours))

    assert loss_cabai_pct > loss_bawang_pct > loss_beras_pct


def test_spoilage_hedging_solve_perishable_high_risk():
    """Test solver recommends REROUTE or HOLD when transporting highly perishable produce under high risk."""
    req = HedgingSolveRequest(
        vehicle_id="TRK-HEDGE-01",
        commodity="cabai_merah",
        cargo_tonnage=12.0,
        origin="Bukittinggi",
        destination="Pekanbaru",
        vehicle_golongan="GOL_II",
        fuel_type="biosolar",
        p_disruption=0.90,
        disruption_delay_hours=18.0,
        detour_distance_km=90.0,
        detour_time_hours=2.5,
        toll_segments=["PEKANBARU_DUMAI"],
        hold_wait_hours=6.0
    )

    resp = spoilage_hedging_service.solve_hedging_matrix(req, inflation_shock_factor=0.08)

    assert resp.vehicle_id == "TRK-HEDGE-01"
    assert resp.perishability_tier == "Ultra-Perishable Fresh Produce"
    assert resp.cargo_value_idr > 500_000_000  # 12 ton * 55,000/kg = 660M
    assert resp.optimal_policy in ("REROUTE", "HOLD")
    assert resp.net_savings_idr > 0
    assert resp.reroute_policy.cost_idr < resp.continue_policy.cost_idr


def test_spoilage_hedging_solve_dry_bulk_low_risk():
    """Test solver recommends CONTINUE for non-perishable dry bulk with minimal risk."""
    req = HedgingSolveRequest(
        vehicle_id="TRK-HEDGE-02",
        commodity="beras",
        cargo_tonnage=10.0,
        origin="Lampung",
        destination="Palembang",
        vehicle_golongan="GOL_II",
        fuel_type="biosolar",
        p_disruption=0.05,
        disruption_delay_hours=2.0,
        detour_distance_km=150.0,
        detour_time_hours=4.0,
        toll_segments=["BAKAUHENI_TERBANGGI", "TERBANGGI_KAYUAGUNG"],
        hold_wait_hours=8.0
    )

    resp = spoilage_hedging_service.solve_hedging_matrix(req, inflation_shock_factor=0.0)

    assert resp.optimal_policy == "CONTINUE"
    assert resp.continue_policy.cost_idr < resp.reroute_policy.cost_idr


def test_compliance_bkhit_inter_island_hard_block():
    """Verify missing BKHIT certificate triggers HARD_BLOCK for inter-island journeys."""
    req = ComplianceVerifyRequest(
        vehicle_id="TRK-COMP-01",
        origin="Lampung (Pelabuhan Bakauheni)",
        destination="DKI Jakarta (Pasar Induk Kramat Jati)",
        traversed_roads=["Lintas Timur", "Feri Bakauheni - Merak", "Tol Tangerang - Jakarta"],
        vehicle_gross_weight_ton=7.5,
        commodity="Cabai Merah",
        has_bkhit_cert=False,
        manifest_hash="abc123sha256",
        driver_phone="+628123456789"
    )

    resp = compliance_service.verify_compliance(req)

    assert resp.overall_status == "HARD_BLOCK"
    assert resp.can_dispatch is False
    assert resp.requires_override is False

    bkhit_check = next(c for c in resp.checks if c.category == "QUARANTINE_BKHIT")
    assert bkhit_check.status == "HARD_BLOCK"
    assert "Sertifikat Karantina" in bkhit_check.remedy_action


def test_compliance_bkhit_inter_island_passed():
    """Verify BKHIT certificate clears inter-island journey."""
    req = ComplianceVerifyRequest(
        vehicle_id="TRK-COMP-02",
        origin="Lampung (Pelabuhan Bakauheni)",
        destination="DKI Jakarta",
        traversed_roads=["Feri Bakauheni - Merak"],
        vehicle_gross_weight_ton=7.5,
        commodity="Daging Ayam",
        has_bkhit_cert=True,
        bkhit_cert_id="BKHIT-KT12-99882",
        manifest_hash="abc123sha256",
        driver_phone="+628123456789"
    )

    resp = compliance_service.verify_compliance(req)
    bkhit_check = next(c for c in resp.checks if c.category == "QUARANTINE_BKHIT")
    assert bkhit_check.status == "PASSED"
    assert resp.can_dispatch is True


def test_compliance_mst_axle_load_warning():
    """Verify heavy vehicle (>8 ton) traversing Class III road gets WARNING and requires override."""
    req = ComplianceVerifyRequest(
        vehicle_id="TRK-COMP-03",
        origin="Padang",
        destination="Bukittinggi",
        traversed_roads=["Jalur Lingkar Malalak (Kelas III)"],
        vehicle_gross_weight_ton=14.5,
        commodity="Beras",
        has_bkhit_cert=False,  # Intra-island, so BKHIT should not hard-block
        manifest_hash="def456sha256",
        driver_phone="+628123456789"
    )

    resp = compliance_service.verify_compliance(req)

    assert resp.overall_status == "WARNING"
    assert resp.can_dispatch is True
    assert resp.requires_override is True

    mst_check = next(c for c in resp.checks if c.category == "AXLE_LOAD_MST")
    assert mst_check.status == "WARNING"
    assert "MST Axle-Load Limit Exceeded" in mst_check.title


def test_compliance_surat_jalan_manifest_warning():
    """Verify missing manifest hash or driver phone produces warning."""
    req = ComplianceVerifyRequest(
        vehicle_id="TRK-COMP-04",
        origin="Medan",
        destination="Tebing Tinggi",
        traversed_roads=["Jalan Tol Medan - Tebing Tinggi"],
        vehicle_gross_weight_ton=6.0,
        commodity="Bawang Merah",
        has_bkhit_cert=False,
        manifest_hash=None,      # Missing hash
        driver_phone=None         # Missing phone
    )

    resp = compliance_service.verify_compliance(req)
    manifest_check = next(c for c in resp.checks if c.category == "SURAT_JALAN_MANIFEST")
    assert manifest_check.status == "WARNING"


# -------------------------------------------------------------------------
# FastAPI Endpoints Integration Tests
# -------------------------------------------------------------------------

def test_api_chokepoints_list():
    """Test GET /api/v1/intermodal/chokepoints."""
    res = client.get("/api/v1/intermodal/chokepoints")
    assert res.status_code == 200
    data = res.json()
    assert "items" in data
    assert data["total"] >= 18
    assert "congested_count" in data


def test_api_chokepoints_detail_and_404():
    """Test GET /api/v1/intermodal/chokepoints/{id} and not found case."""
    res = client.get("/api/v1/intermodal/chokepoints/PORT_BELAWAN")
    assert res.status_code == 200
    data = res.json()
    assert data["id"] == "PORT_BELAWAN"
    assert data["type"] == "SEAPORT"

    # Non-existent
    res_404 = client.get("/api/v1/intermodal/chokepoints/NON_EXISTENT_HUB")
    assert res_404.status_code == 404


def test_api_hedging_solve():
    """Test POST /api/v1/intermodal/hedging/solve."""
    payload = {
        "vehicle_id": "API-TRK-01",
        "commodity": "cabai_merah",
        "cargo_tonnage": 8.0,
        "origin": "Medan",
        "destination": "Pekanbaru",
        "vehicle_golongan": "GOL_II",
        "fuel_type": "biosolar",
        "p_disruption": 0.85,
        "disruption_delay_hours": 12.0,
        "detour_distance_km": 75.0,
        "detour_time_hours": 2.0,
        "toll_segments": ["MEDAN_TEBINGTINGGI"],
        "hold_wait_hours": 4.0
    }
    res = client.post("/api/v1/intermodal/hedging/solve", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["vehicle_id"] == "API-TRK-01"
    assert data["optimal_policy"] in ("CONTINUE", "REROUTE", "HOLD")
    assert "continue_policy" in data
    assert "reroute_policy" in data
    assert "hold_policy" in data


def test_api_compliance_verify():
    """Test POST /api/v1/intermodal/compliance/verify."""
    payload = {
        "vehicle_id": "API-TRK-02",
        "origin": "Lampung",
        "destination": "Jakarta",
        "traversed_roads": ["Feri Penyeberangan"],
        "vehicle_gross_weight_ton": 6.5,
        "commodity": "Sayur Segar",
        "has_bkhit_cert": False
    }
    res = client.post("/api/v1/intermodal/compliance/verify", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["overall_status"] == "HARD_BLOCK"
    assert data["can_dispatch"] is False


def test_api_toll_tariffs():
    """Test GET /api/v1/intermodal/toll-tariffs."""
    res = client.get("/api/v1/intermodal/toll-tariffs")
    assert res.status_code == 200
    data = res.json()
    assert "bpjt_segments" in data
    assert "pertamina_fuel_base_rates" in data
    assert "perishability_tiers" in data
