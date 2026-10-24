"""
Unit tests for Phase 103 WP2: Spoilage Hedging Precision with Moving Genset Calculation.
Verifies:
1. COLD_CHAIN reflects active genset fuel consumption across CONTINUE, REROUTE, and HOLD.
2. DRY_BULK incurs Rp 0 reefer genset fuel across all 3 policies.
3. ULTRA_PERISHABLE produce incurs Rp 0 reefer genset fuel while incurring exponential spoilage decay.
4. Explanations correctly include reefer fuel breakdowns for refrigerated cargo.
"""
import pytest
from app.services.spoilage_hedging_service import (
    spoilage_hedging_service,
    PERISHABILITY_TIERS
)
from app.schemas.intermodal import HedgingSolveRequest


def test_cold_chain_moving_genset_all_policies():
    """Verify COLD_CHAIN cargo calculates active reefer genset burn during delay, detour, and hold."""
    delay_hours = 8.0
    detour_time_hours = 3.5
    hold_wait_hours = 5.0
    genset_rate = PERISHABILITY_TIERS["COLD_CHAIN"]["genset_cost_per_hour"]
    assert genset_rate == 45000.0

    req = HedgingSolveRequest(
        vehicle_id="TRK-REEFER-01",
        commodity="ikan_segar",
        cargo_tonnage=10.0,
        origin="Belawan",
        destination="Tebing Tinggi",
        vehicle_golongan="GOL_II",
        fuel_type="biosolar",
        p_disruption=0.85,
        disruption_delay_hours=delay_hours,
        detour_distance_km=110.0,
        detour_time_hours=detour_time_hours,
        toll_segments=["BELMERA", "MEDAN_TEBINGTINGGI"],
        hold_wait_hours=hold_wait_hours
    )

    resp = spoilage_hedging_service.solve_hedging_matrix(req, inflation_shock_factor=0.0)

    assert resp.perishability_tier == "Cold-Chain Controlled Meat & Seafood"

    # Check Policy 1: CONTINUE has reefer genset fuel
    cont_reefer = resp.continue_policy.breakdown.get("reefer_genset_fuel")
    assert cont_reefer is not None
    assert cont_reefer == round(delay_hours * genset_rate, 0)
    assert "genset pendingin" in resp.continue_policy.explanation

    # Check Policy 2: REROUTE has active detour reefer genset fuel
    reroute_reefer = resp.reroute_policy.breakdown.get("reefer_genset_fuel")
    assert reroute_reefer is not None
    assert reroute_reefer == round(detour_time_hours * genset_rate, 0)
    assert "genset pendingin" in resp.reroute_policy.explanation

    # Check Policy 3: HOLD has depot reefer genset fuel
    hold_reefer = resp.hold_policy.breakdown.get("reefer_genset_fuel")
    assert hold_reefer is not None
    assert hold_reefer == round(hold_wait_hours * genset_rate, 0)
    assert "genset" in resp.hold_policy.explanation.lower()

    # All three policies have positive reefer costs for cold-chain
    assert cont_reefer > 0
    assert reroute_reefer > 0
    assert hold_reefer > 0


def test_dry_bulk_zero_genset_all_policies():
    """Verify DRY_BULK incurs exactly Rp 0 reefer genset fuel on all policies."""
    req = HedgingSolveRequest(
        vehicle_id="TRK-DRY-01",
        commodity="beras",
        cargo_tonnage=10.0,
        origin="Lampung",
        destination="Palembang",
        vehicle_golongan="GOL_II",
        fuel_type="biosolar",
        p_disruption=0.5,
        disruption_delay_hours=6.0,
        detour_distance_km=120.0,
        detour_time_hours=3.0,
        toll_segments=["BAKAUHENI_TERBANGGI"],
        hold_wait_hours=4.0
    )

    resp = spoilage_hedging_service.solve_hedging_matrix(req, inflation_shock_factor=0.0)

    assert resp.perishability_tier == "Non-Perishable Dry Bulk & Staples"
    assert resp.continue_policy.breakdown.get("reefer_genset_fuel") == 0.0
    assert resp.reroute_policy.breakdown.get("reefer_genset_fuel") == 0.0
    assert resp.hold_policy.breakdown.get("reefer_genset_fuel") == 0.0
    assert "genset" not in resp.continue_policy.explanation.lower()
    assert "genset" not in resp.reroute_policy.explanation.lower()
    assert "genset" not in resp.hold_policy.explanation.lower()


def test_hortikultura_produce_zero_genset():
    """Verify ULTRA_PERISHABLE produce has Rp 0 reefer genset but high spoilage decay."""
    req = HedgingSolveRequest(
        vehicle_id="TRK-HORTI-01",
        commodity="cabai_merah",
        cargo_tonnage=10.0,
        origin="Tarutung",
        destination="Medan",
        vehicle_golongan="GOL_II",
        fuel_type="biosolar",
        p_disruption=0.75,
        disruption_delay_hours=10.0,
        detour_distance_km=80.0,
        detour_time_hours=2.0,
        toll_segments=[],
        hold_wait_hours=5.0
    )

    resp = spoilage_hedging_service.solve_hedging_matrix(req, inflation_shock_factor=0.0)

    assert resp.perishability_tier == "Ultra-Perishable Fresh Produce"
    assert resp.continue_policy.breakdown.get("reefer_genset_fuel") == 0.0
    assert resp.reroute_policy.breakdown.get("reefer_genset_fuel") == 0.0
    assert resp.hold_policy.breakdown.get("reefer_genset_fuel") == 0.0
    assert "genset" not in resp.hold_policy.explanation.lower()
    assert resp.spoilage_loss_idr > 0
