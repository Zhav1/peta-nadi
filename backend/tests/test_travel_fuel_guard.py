"""
Plausibility guard for actual_fuel_liters (demo-typo protection).

120L / 73km = 0.61 km/L is rejected (422) with a clear ID message;
25L / 73km (~2.9 km/L) is accepted.
"""
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.auth.supabase_auth import create_guest_token, ROLE_DISPATCHER
from app.db import local_storage

client = TestClient(app)

COMPANY = "test_fuel_guard_tenant"
TRUCK_ID = "TEST-FUEL-GUARD-01"

DISPATCHER = {"Authorization": f"Bearer {create_guest_token(role=ROLE_DISPATCHER)}"}


@pytest.fixture(autouse=True)
def cleanup():
    def _purge():
        for travel in local_storage.list_travels(limit=5000):
            if travel.get("truck_id") == TRUCK_ID or travel.get("company_id") == COMPANY:
                local_storage.delete_travel(travel["id"])
        local_storage.delete_truck_asset(TRUCK_ID)
        try:
            from app.db import travel_supabase

            if travel_supabase.is_configured():
                for travel in travel_supabase.list_travels(limit=5000):
                    if travel.get("truck_id") == TRUCK_ID or travel.get("company_id") == COMPANY:
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


def _register_truck():
    res = client.post(
        "/api/v1/fleet/trucks",
        headers=DISPATCHER,
        json={
            "truck_id": TRUCK_ID,
            "name": "Truk Fuel Guard",
            "vehicle_golongan": "GOL_II",
            "company_id": COMPANY,
            "gross_weight_ton": 14.0,
            "fuel_type": "biosolar",
        },
    )
    assert res.status_code == 201, res.text


def _create_planned_73km():
    res = client.post(
        "/api/v1/fleet/travels",
        headers=DISPATCHER,
        json={
            "truck_id": TRUCK_ID,
            "origin_name": "Belawan",
            "origin_coords": [98.6776, 3.7922],
            "destination_name": "Tebing Tinggi",
            "destination_ref": "HUB_TEBING_TINGGI",
            "dest_coords": [99.1625, 3.3285],
            "commodity_key": "beras",
            "cargo_tonnage": 10.0,
            "sla_deadline_hours": 12.0,
            "baseline_distance_km": 73.0,
            "baseline_time_hours": 2.0,
            "status": "planned",
        },
    )
    assert res.status_code == 201, res.text
    return res.json()


def test_patch_120L_for_73km_rejected_422():
    _register_truck()
    created = _create_planned_73km()
    res = client.patch(
        f"/api/v1/fleet/travels/{created['id']}",
        headers=DISPATCHER,
        json={"actual_time_hours": 2.5, "actual_fuel_liters": 120.0, "status": "delivered"},
    )
    assert res.status_code == 422, res.text
    body = res.json()
    detail = body.get("detail", "")
    assert "tidak wajar" in detail
    assert "1.5–25" in detail
    assert "120" in detail and "73" in detail


def test_patch_25L_for_73km_accepted():
    _register_truck()
    created = _create_planned_73km()
    res = client.patch(
        f"/api/v1/fleet/travels/{created['id']}",
        headers=DISPATCHER,
        json={"actual_time_hours": 2.5, "actual_fuel_liters": 25.0, "status": "delivered"},
    )
    assert res.status_code == 200, res.text
    assert res.json()["actual_fuel_liters"] == pytest.approx(25.0)


def test_patch_1L_for_73km_rejected_too_efficient():
    _register_truck()
    created = _create_planned_73km()
    res = client.patch(
        f"/api/v1/fleet/travels/{created['id']}",
        headers=DISPATCHER,
        json={"actual_time_hours": 2.5, "actual_fuel_liters": 1.0, "status": "delivered"},
    )
    assert res.status_code == 422, res.text
    assert "tidak wajar" in res.json().get("detail", "")
