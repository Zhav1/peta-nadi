"""
PreHub : Anonymous fleet-read PII redaction tests (P2 audit fix).

GET /api/v1/fleet/trucks and GET /api/v1/fleet/trucks/{truck_id} must not leak
driver names / WhatsApp contacts to callers without an Authorization header.
Authenticated dispatcher/tenant callers keep the full row. Write-path RBAC is
unchanged: an anonymous POST /fleet/trucks is still 403.
"""
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.auth.supabase_auth import create_guest_token, ROLE_DISPATCHER
from app.services import travel_ledger_service

client = TestClient(app)

TENANT = "test_anon_redact_tenant"
TRUCK_ID = "TEST-ANON-REDACT-TRK-01"
DRIVER_NAME = "Sopir Rahasia"
DRIVER_PHONE = "+6281200000099"

DISPATCHER = {
    "Authorization": f"Bearer {create_guest_token(role=ROLE_DISPATCHER, company_id=TENANT)}"
}


@pytest.fixture
def seeded_asset(monkeypatch):
    """Hermetic single-asset store: no Supabase, no SQLite state."""
    asset = {
        "id": TRUCK_ID,
        "truck_id": TRUCK_ID,
        "name": "Truk Uji Redaksi Anon",
        "modality": "truck",
        "vehicle_golongan": "GOL_II",
        "driver_name": DRIVER_NAME,
        "driver_phone": DRIVER_PHONE,
        "company_id": TENANT,
        "company_name": "PT Uji Redaksi",
        "source": "master",
    }
    monkeypatch.setattr(
        travel_ledger_service,
        "list_truck_assets_with_legacy",
        lambda company_id=None: [dict(asset)],
    )
    monkeypatch.setattr(
        travel_ledger_service,
        "resolve_truck_asset",
        lambda truck_id: dict(asset) if truck_id == TRUCK_ID else None,
    )
    return asset


def test_anon_list_redacts_driver_pii(seeded_asset):
    """No Authorization header -> driver_name/driver_phone are null on every row."""
    res = client.get("/api/v1/fleet/trucks", params={"company_id": TENANT})
    assert res.status_code == 200
    rows = res.json()
    assert rows, "expected the seeded asset in the anonymous list"
    for row in rows:
        assert row["driver_name"] is None
        assert row["driver_phone"] is None


def test_anon_detail_redacts_driver_pii(seeded_asset):
    res = client.get(f"/api/v1/fleet/trucks/{TRUCK_ID}")
    assert res.status_code == 200
    body = res.json()
    assert body["truck_id"] == TRUCK_ID
    assert body["driver_name"] is None
    assert body["driver_phone"] is None


def test_dispatcher_read_keeps_driver_pii(seeded_asset):
    """Authenticated dispatcher/tenant callers still get the operational row."""
    res = client.get(
        "/api/v1/fleet/trucks", params={"company_id": TENANT}, headers=DISPATCHER
    )
    assert res.status_code == 200
    row = next(r for r in res.json() if r["truck_id"] == TRUCK_ID)
    assert row["driver_name"] == DRIVER_NAME
    assert row["driver_phone"] == DRIVER_PHONE

    detail = client.get(f"/api/v1/fleet/trucks/{TRUCK_ID}", headers=DISPATCHER)
    assert detail.status_code == 200
    assert detail.json()["driver_name"] == DRIVER_NAME
    assert detail.json()["driver_phone"] == DRIVER_PHONE


def test_anon_write_still_forbidden(seeded_asset):
    """Redaction is read-only hardening; the write path still fails closed."""
    res = client.post(
        "/api/v1/fleet/trucks",
        json={"truck_id": "TEST-ANON-REDACT-02", "name": "Truk Anon"},
    )
    assert res.status_code == 403
    assert res.json()["detail"]["required_permissions"] == ["fleet:write"]
