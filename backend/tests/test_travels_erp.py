"""
PreHub : Truck Asset Master + Travel/Rit Ledger + ERP Savings Tests.

Covers the Phase 44 split (asset vs transactional rit), the real BPJT/Pertamina/
spoilage savings math, persisted hedging decisions, RBAC, and the regulator
aggregate view. Legacy `custom_fleet_vehicles` compatibility is asserted too.
"""
import math
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.auth.supabase_auth import create_guest_token, ROLE_DISPATCHER, ROLE_REGULATOR
from app.db import local_storage

client = TestClient(app)

COMPANY = "test_erp_tenant"
TRUCK_ID = "TEST-RIT-TRK-01"
LEGACY_ID = "TEST-RIT-LEGACY-01"

DISPATCHER = {"Authorization": f"Bearer {create_guest_token(role=ROLE_DISPATCHER)}"}
REGULATOR = {"Authorization": f"Bearer {create_guest_token(role=ROLE_REGULATOR)}"}


@pytest.fixture(autouse=True)
def cleanup():
    def _purge():
        for travel in local_storage.list_travels(limit=5000):
            if travel.get("truck_id") in (TRUCK_ID, LEGACY_ID) or travel.get("company_id") == COMPANY:
                local_storage.delete_travel(travel["id"])
        local_storage.delete_truck_asset(TRUCK_ID)
        local_storage.delete_custom_vehicle(LEGACY_ID)
        # Phase 4: the same tenant ids must not leak across runs on the shared
        # remote Supabase either — purge both stores (best-effort, hermetic).
        try:
            from app.db import travel_supabase

            if travel_supabase.is_configured():
                for travel in travel_supabase.list_travels(limit=5000):
                    if travel.get("truck_id") in (TRUCK_ID, LEGACY_ID) or travel.get("company_id") == COMPANY:
                        try:
                            travel_supabase.delete_travel(travel["id"])
                        except Exception:
                            pass
                try:
                    travel_supabase.delete_truck_asset(TRUCK_ID)
                except Exception:
                    pass
        except Exception:
            pass

    _purge()
    yield
    _purge()


def _register_truck(truck_id: str = TRUCK_ID):
    res = client.post(
        "/api/v1/fleet/trucks",
        headers=DISPATCHER,
        json={
            "truck_id": truck_id,
            "name": "Truk Uji Ledger ERP",
            "vin": "MHF12TESTRIT001",
            "vehicle_golongan": "GOL_II",
            "driver_name": "Sopir Uji",
            "driver_phone": "+6281200000001",
            "company_id": COMPANY,
            "company_name": "PT Uji ERP",
            "gross_weight_ton": 14.0,
            "fuel_type": "biosolar",
        },
    )
    assert res.status_code == 201, res.text
    return res.json()


def _travel_payload(truck_id: str = TRUCK_ID, **overrides):
    payload = {
        "truck_id": truck_id,
        "origin_name": "Pelabuhan Belawan",
        "origin_ref": "PORT_BELAWAN",
        "origin_coords": [98.6776, 3.7922],
        "destination_name": "Tebing Tinggi",
        "destination_ref": "HUB_TEBING_TINGGI",
        "dest_coords": [99.1625, 3.3285],
        "commodity_key": "cabai_merah",
        "cargo_tonnage": 10.0,
        "cargo_value_idr": 500_000_000.0,
        "sla_deadline_hours": 12.0,
        "baseline_time_hours": 2.0,
        "blocked_delay_hours": 8.0,
        "baseline_fuel_liters": 20.0,
        "baseline_toll_segments": ["MEDAN_TEBINGTINGGI"],
        "actual_time_hours": 3.0,
        "actual_fuel_liters": 22.0,
        "actual_toll_segments": ["MEDAN_TEBINGTINGGI"],
        "rerouted": True,
        "disruption_id": "INC-TEST-ERP-01",
        "status": "rerouted",
    }
    payload.update(overrides)
    return payload


# ==========================================
# STEP 1 — asset master
# ==========================================

def test_register_truck_asset_and_list():
    _register_truck()
    listed = client.get("/api/v1/fleet/trucks", params={"company_id": COMPANY})
    assert listed.status_code == 200
    ids = [row["truck_id"] for row in listed.json()]
    assert TRUCK_ID in ids


def test_regulator_cannot_create_truck():
    res = client.post(
        "/api/v1/fleet/trucks",
        headers=REGULATOR,
        json={"truck_id": "TEST-RIT-REG-01", "name": "Truk Regulator"},
    )
    assert res.status_code == 403
    detail = res.json()["detail"]
    assert detail["required_permissions"] == ["fleet:write"]


def test_legacy_custom_fleet_remains_readable_as_asset():
    local_storage.save_custom_vehicle({
        "vehicle_id": LEGACY_ID,
        "name": "Truk Legacy Sebelum Split",
        "modality": "truck",
        "vehicle_golongan": "GOL_III",
        "organization_id": COMPANY,
    })
    res = client.get(f"/api/v1/fleet/trucks/{LEGACY_ID}")
    assert res.status_code == 200
    body = res.json()
    assert body["truck_id"] == LEGACY_ID
    assert body["source"] == "legacy_custom_fleet"
    assert body["vehicle_golongan"] == "GOL_III"


# ==========================================
# STEP 2 — rit ledger math
# ==========================================

def test_create_travel_requires_registered_truck():
    res = client.post(
        "/api/v1/fleet/travels",
        headers=DISPATCHER,
        json=_travel_payload(truck_id="TEST-RIT-MISSING"),
    )
    assert res.status_code == 404
    assert "tidak terdaftar" in res.json()["detail"]


def test_travel_ledger_uses_real_bpjt_fuel_and_spoilage():
    _register_truck()
    res = client.post("/api/v1/fleet/travels", headers=DISPATCHER, json=_travel_payload())
    assert res.status_code == 201, res.text
    body = res.json()

    # BPJT Medan–Tebing Tinggi GOL_II = Rp 85.000 (single source of truth)
    assert body["baseline_toll_cost_idr"] == 85000
    assert body["actual_toll_cost_idr"] == 85000

    # Pertamina biosolar base rate 6.800/L, no inflation shock
    assert body["baseline_fuel_cost_idr"] == pytest.approx(20.0 * 6800.0, abs=1)
    assert body["actual_fuel_cost_idr"] == pytest.approx(22.0 * 6800.0, abs=1)

    # 4-tier cabai decay delta = 0.025/hour
    expected_baseline_spoilage = 500_000_000.0 * (1.0 - math.exp(-0.025 * 8.0))
    assert body["baseline_spoilage_idr"] == pytest.approx(expected_baseline_spoilage, abs=1)
    assert body["actual_spoilage_idr"] == pytest.approx(500_000_000.0 * (1.0 - math.exp(-0.025 * 1.0)), abs=1)

    # Driver time cost = hours x Rp 50.000
    assert body["baseline_labor_idr"] == pytest.approx((2.0 + 8.0) * 50000.0, abs=1)
    assert body["actual_labor_idr"] == pytest.approx(3.0 * 50000.0, abs=1)

    assert body["saved_time_hours"] == pytest.approx(7.0, abs=0.01)
    assert body["saved_fuel_liters"] == pytest.approx(-2.0, abs=0.01)

    # Components must sum exactly to the reported total (no hidden percentage).
    split = (
        body["saved_fuel_cost_idr"]
        + body["saved_toll_idr"]
        + body["saved_spoilage_idr"]
        + body["saved_labor_idr"]
    )
    assert split == pytest.approx(body["saved_cost_idr"], abs=0.5)
    assert body["saved_cost_idr"] == pytest.approx(
        body["baseline_cost_idr"] - body["actual_cost_idr"], abs=1
    )
    assert body["efficiency_pct"] > 0


def test_planned_travel_claims_no_savings_before_execution():
    _register_truck()
    payload = _travel_payload(
        actual_time_hours=None,
        actual_fuel_liters=None,
        actual_toll_segments=None,
        rerouted=False,
        status="planned",
        disruption_id=None,
    )
    res = client.post("/api/v1/fleet/travels", headers=DISPATCHER, json=payload)
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["actual_recorded"] is False
    assert body["saved_cost_idr"] == 0
    assert body["saved_time_hours"] == 0
    assert body["actual_cost_idr"] == pytest.approx(body["baseline_cost_idr"], abs=1)


def test_patch_travel_recomputes_ledger_and_status():
    _register_truck()
    created = client.post("/api/v1/fleet/travels", headers=DISPATCHER, json=_travel_payload()).json()
    res = client.patch(
        f"/api/v1/fleet/travels/{created['id']}",
        headers=DISPATCHER,
        json={
            "status": "delivered",
            "actual_time_hours": 2.5,
            "actual_fuel_liters": 21.0,
        },
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["status"] == "delivered"
    assert body["delivered_at"] is not None
    assert body["actual_time_hours"] == pytest.approx(2.5)
    assert body["saved_time_hours"] == pytest.approx(7.5)


def test_hedging_decision_is_persisted_per_rit():
    _register_truck()
    created = client.post("/api/v1/fleet/travels", headers=DISPATCHER, json=_travel_payload()).json()
    res = client.post(
        f"/api/v1/fleet/travels/{created['id']}/hedging",
        headers=DISPATCHER,
        json={
            "p_disruption": 0.85,
            "detour_distance_km": 18.0,
            "detour_time_hours": 1.0,
            "hold_wait_hours": 6.0,
        },
    )
    assert res.status_code == 200, res.text
    solved = res.json()["hedging"]
    assert solved["optimal_policy"] in ("CONTINUE", "REROUTE", "HOLD")
    assert solved["net_savings_idr"] >= 0

    stored = client.get(f"/api/v1/fleet/travels/{created['id']}").json()
    assert stored["hedging_policy"] == solved["optimal_policy"]
    assert stored["hedging"] is not None
    assert stored["hedging_net_savings_idr"] == pytest.approx(solved["net_savings_idr"], abs=1)
    assert stored["hedging_solved_at"] is not None


# ==========================================
# ERP SUMMARY
# ==========================================

def test_erp_summary_dispatcher_vs_regulator():
    _register_truck()
    client.post("/api/v1/fleet/travels", headers=DISPATCHER, json=_travel_payload())
    client.post(
        "/api/v1/fleet/travels",
        headers=DISPATCHER,
        json=_travel_payload(
            origin_name="Medan",
            destination_name="Binjai",
            baseline_time_hours=1.0,
            blocked_delay_hours=4.0,
            actual_time_hours=1.5,
            status="delivered",
        ),
    )

    disp = client.get(
        "/api/v1/erp/summary",
        headers=DISPATCHER,
        params={"company_id": COMPANY},
    )
    assert disp.status_code == 200, disp.text
    body = disp.json()
    assert body["scope"] == "DISPATCHER_DETAIL"
    assert len(body["trips"]) == 2
    assert body["totals"]["total_trips"] == 2
    assert body["totals"]["cost_saved_idr"] > 0
    assert body["totals"]["time_saved_hours"] > 0
    assert body["totals"]["fuel_saved_liters"] != 0
    assert len(body["per_company"]) == 1
    assert body["per_company"][0]["company_id"] == COMPANY

    reg = client.get(
        "/api/v1/erp/summary",
        headers=REGULATOR,
        params={"company_id": COMPANY},
    )
    assert reg.status_code == 200, reg.text
    reg_body = reg.json()
    assert reg_body["scope"] == "REGULATOR_AGGREGATE"
    assert reg_body["trips"] == []
    assert reg_body["totals"]["total_trips"] == 2


def test_two_step_onboarding_flow_end_to_end():
    """
    Walks the exact call sequence of the FleetOnboardingModal wizard:
    Step 1 saves the truck asset, Step 2 opens with that asset preselected,
    the rit is created without actuals (no savings yet), the actuals are
    entered later, and the ERP summary reports the same rit.
    """
    # --- Step 1: master truck asset -------------------------------------
    step1 = client.post(
        "/api/v1/fleet/trucks",
        headers=DISPATCHER,
        json={
            "truck_id": TRUCK_ID.lower(),  # wizard upper-cases the plate
            "name": "Truk Uji Ledger ERP",
            "vin": "MHF12TESTRIT001",
            "vehicle_golongan": "GOL_II",
            "driver_name": "Sopir Uji",
            "driver_phone": "+6281200000001",
            "company_id": COMPANY,
            "company_name": "PT Uji ERP",
            "gross_weight_ton": 14.0,
            "fuel_type": "biosolar",
        },
    )
    assert step1.status_code == 201, step1.text
    assert step1.json()["truck_id"] == TRUCK_ID

    # --- Step 2 opens with the fresh asset available for selection ------
    listed = client.get("/api/v1/fleet/trucks", params={"company_id": COMPANY})
    assert listed.status_code == 200
    assert TRUCK_ID in [row["truck_id"] for row in listed.json()]

    # --- Step 2: create the rit, declared before execution -------------
    created_res = client.post(
        "/api/v1/fleet/travels",
        headers=DISPATCHER,
        json=_travel_payload(
            actual_time_hours=None,
            actual_fuel_liters=None,
            actual_toll_segments=None,
            rerouted=False,
            disruption_id=None,
            status="planned",
        ),
    )
    assert created_res.status_code == 201, created_res.text
    planned = created_res.json()
    assert planned["actual_recorded"] is False
    assert planned["saved_cost_idr"] == 0
    assert planned["baseline_cost_idr"] > 0

    # --- Dispatcher later records the realised outcome ------------------
    realised = client.patch(
        f"/api/v1/fleet/travels/{planned['id']}",
        headers=DISPATCHER,
        json={
            "status": "delivered",
            "rerouted": True,
            "disruption_id": "INC-TEST-ERP-01",
            "actual_time_hours": 3.0,
            "actual_fuel_liters": 22.0,
            "actual_toll_segments": ["MEDAN_TEBINGTINGGI"],
        },
    )
    assert realised.status_code == 200, realised.text
    ledger = realised.json()
    assert ledger["actual_recorded"] is True
    assert ledger["saved_time_hours"] == pytest.approx(7.0, abs=0.01)

    # --- ERP tab now shows this single rit ------------------------------
    summary = client.get(
        "/api/v1/erp/summary",
        headers=DISPATCHER,
        params={"company_id": COMPANY},
    ).json()
    assert summary["totals"]["total_trips"] == 1
    assert summary["totals"]["delivered_trips"] == 1
    assert summary["totals"]["cost_saved_idr"] == pytest.approx(ledger["saved_cost_idr"], abs=1)
    assert summary["totals"]["time_saved_hours"] == pytest.approx(7.0, abs=0.01)

    row = summary["trips"][0]
    assert row["id"] == planned["id"]
    assert row["truck_id"] == TRUCK_ID
    assert row["status"] == "delivered"
    assert row["saved_cost_idr"] == pytest.approx(ledger["saved_cost_idr"], abs=1)

    # Split components always reconcile with the reported total.
    split = (
        row["savings_breakdown"]["fuel_idr"]
        + row["savings_breakdown"]["toll_idr"]
        + row["savings_breakdown"]["spoilage_idr"]
        + row["savings_breakdown"]["labor_idr"]
    )
    assert split == pytest.approx(row["saved_cost_idr"], abs=0.5)


def test_erp_summary_is_empty_not_fabricated():
    res = client.get(
        "/api/v1/erp/summary",
        headers=DISPATCHER,
        params={"company_id": "tenant-yang-belum-ada"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["totals"]["total_trips"] == 0
    assert body["totals"]["cost_saved_idr"] == 0
    assert body["trips"] == []


# ==========================================
# PHASE 4 — fuel-provenance exposure on ERPTripRow
# ==========================================

def _erp_trips(company: str = COMPANY):
    res = client.get("/api/v1/erp/summary", headers=DISPATCHER, params={"company_id": company})
    assert res.status_code == 200, res.text
    return res.json()


def test_erp_trip_row_exposes_fuel_provenance():
    """Ledger SK/eff provenance must reach the dispatcher trip row (Phase 3 UI reads it)."""
    _register_truck()
    created = client.post("/api/v1/fleet/travels", headers=DISPATCHER, json=_travel_payload()).json()
    row = _erp_trips()["trips"][0]
    assert row["id"] == created["id"]
    # Biosolar 6.800/L. Hermetic SQLite has no fuel_prices rows (sk None,
    # PERTAMINA_FALLBACK); remote Supabase carries the 018 real SK rows
    # (SK 218.K/MG.01/MEM.M/2022, ESDM_SK, same 6800 rate). Both modes must
    # agree on rate; provenance assertions branch on which seed is present.
    assert row["fuel_rate_used_idr"] == pytest.approx(6800.0, abs=1)
    assert row["fuel_sk_id"] is None or str(row["fuel_sk_id"]).startswith("FP-")
    assert row["fuel_sk_number"] in (None, "218.K/MG.01/MEM.M/2022")
    if row["fuel_sk_number"] is None:
        assert row["fuel_source"] == "PERTAMINA_FALLBACK"
        assert row["fuel_is_fallback"] is True
    else:
        assert row["fuel_source"] == "ESDM_SK"
        assert row["fuel_is_fallback"] is False
    # GOL_II default 3.5 km/L with payload penalty: 10t / 14t gross
    assert row["fuel_efficiency_source"] == "golongan_default"
    assert row["fuel_efficiency_used_kmpl"] == pytest.approx(3.5 * (1 - 0.15 * (10.0 / 14.0)), abs=0.01)
    assert row["fuel_load_factor"] == pytest.approx(10.0 / 14.0, abs=0.001)
    # Non-reefer commodity (cabai) on a non-reefer truck: no reefer burn
    assert row["reefer_fuel_lph_used"] == pytest.approx(0.0, abs=1e-9)
    # Economy = measured distance / measured actual fuel; L/100km is its inverse
    assert row["actual_recorded"] is True
    assert row["baseline_distance_km"] and row["baseline_distance_km"] > 0
    assert row["actual_fuel_liters"] == pytest.approx(22.0, abs=1e-9)
    assert row["economy_kmpl"] == pytest.approx(row["baseline_distance_km"] / 22.0, abs=0.01)
    assert row["l_per_100km"] == pytest.approx(100.0 / row["economy_kmpl"], abs=0.05)


def test_erp_trip_row_null_actual_excluded_from_economy():
    """Planned rits (aktual belum diinput) carry no economy — excluded, not zero."""
    _register_truck()
    client.post(
        "/api/v1/fleet/travels",
        headers=DISPATCHER,
        json=_travel_payload(
            actual_time_hours=None,
            actual_fuel_liters=None,
            actual_toll_segments=None,
            rerouted=False,
            status="planned",
            disruption_id=None,
        ),
    )
    row = _erp_trips()["trips"][0]
    assert row["actual_recorded"] is False
    assert row["economy_kmpl"] is None
    assert row["l_per_100km"] is None


def test_erp_trip_row_asset_override_efficiency_and_reefer():
    """Per-truck efficiency override + reefer L/h flow into the trip row."""
    client.post(
        "/api/v1/fleet/trucks",
        headers=DISPATCHER,
        json={
            "truck_id": TRUCK_ID,
            "name": "Truk Reefer Uji",
            "vehicle_golongan": "GOL_II",
            "company_id": COMPANY,
            "gross_weight_ton": 20.0,
            "fuel_type": "biosolar",
            "fuel_efficiency_kmpl": 4.2,
            "is_reefer": True,
            "reefer_fuel_lph": 2.5,
        },
    )
    assert client.post(
        "/api/v1/fleet/travels", headers=DISPATCHER, json=_travel_payload(commodity_key="ikan_segar")
    ).status_code == 201
    row = _erp_trips()["trips"][0]
    assert row["fuel_efficiency_source"] == "asset_override"
    assert row["fuel_efficiency_used_kmpl"] == pytest.approx(4.2 * (1 - 0.15 * (10.0 / 20.0)), abs=0.01)
    assert row["reefer_fuel_lph_used"] == pytest.approx(2.5, abs=1e-9)


def test_erp_trip_row_golongan_default_efficiency():
    """GOL_V without override resolves via GOLONGAN_DEFAULT_KMPL, never flat 3.5."""
    client.post(
        "/api/v1/fleet/trucks",
        headers=DISPATCHER,
        json={
            "truck_id": TRUCK_ID,
            "name": "Truk Gol V Uji",
            "vehicle_golongan": "GOL_V",
            "company_id": COMPANY,
            "gross_weight_ton": 20.0,
            "fuel_type": "biosolar",
        },
    )
    assert client.post(
        "/api/v1/fleet/travels", headers=DISPATCHER, json=_travel_payload()
    ).status_code == 201
    row = _erp_trips()["trips"][0]
    assert row["fuel_efficiency_source"] == "golongan_default"
    assert row["fuel_efficiency_used_kmpl"] == pytest.approx(2.5 * (1 - 0.15 * (10.0 / 20.0)), abs=0.01)


def test_erp_negative_savings_surfaced_as_kerugian():
    """Loss-making rits stay visible with negative savings (never hidden)."""
    _register_truck()
    client.post(
        "/api/v1/fleet/travels",
        headers=DISPATCHER,
        json=_travel_payload(
            actual_time_hours=20.0,
            actual_fuel_liters=60.0,
            status="delivered",
        ),
    )
    body = _erp_trips()
    row = body["trips"][0]
    assert row["saved_cost_idr"] < 0
    assert body["totals"]["cost_saved_idr"] < 0
    # Economy still resolves from measured actuals even on a loss
    assert row["economy_kmpl"] == pytest.approx(row["baseline_distance_km"] / 60.0, abs=0.01)


def test_regulator_aggregate_hides_per_rit_provenance():
    """REGULATOR_AGGREGATE carries totals only — no per-rit fuel/SK detail."""
    _register_truck()
    client.post("/api/v1/fleet/travels", headers=DISPATCHER, json=_travel_payload())
    reg = client.get("/api/v1/erp/summary", headers=REGULATOR, params={"company_id": COMPANY})
    assert reg.status_code == 200
    reg_body = reg.json()
    assert reg_body["scope"] == "REGULATOR_AGGREGATE"
    assert reg_body["trips"] == []
    assert reg_body["totals"]["total_trips"] == 1
    assert reg_body["totals"]["baseline_cost_idr"] > 0
