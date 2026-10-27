"""
Phase 173 (M9) — tenant isolation regression pins for the fleet roster.

The roster (and its per-vehicle detail) may only ever read the authenticated
dispatcher's `company_id` claim. A `?company_id=` query parameter is a view
hint for regulator/guest sessions, never a way for a dispatcher to widen the
tenant boundary.
"""
from fastapi.testclient import TestClient

from app.main import app
from app.auth.supabase_auth import (
    ROLE_DISPATCHER,
    ROLE_REGULATOR,
    UserSession,
    create_guest_token,
)
from app.routers.vehicles_router import clear_fleet_cache
from app.routers.travels_router import _effective_company_filter

client = TestClient(app)


def _headers(role: str, company_id: str | None = None) -> dict[str, str]:
    token = create_guest_token(role=role, company_id=company_id)
    return {"Authorization": f"Bearer {token}"}


def _truck_ids(payload: dict) -> list[str]:
    return sorted(
        v["vehicle_id"] for v in payload["vehicles"] if v["modality"] == "truck"
    )


def test_dispatcher_query_param_cannot_widen_vehicle_scope():
    """`?company_id=pelindo_belawan` must not widen a pos_logistik dispatcher."""
    clear_fleet_cache()
    headers = _headers(ROLE_DISPATCHER, "pos_logistik")

    baseline = client.get("/api/v1/fleet/vehicles", headers=headers)
    widened = client.get(
        "/api/v1/fleet/vehicles",
        params={"company_id": "pelindo_belawan"},
        headers=headers,
    )
    assert baseline.status_code == 200
    assert widened.status_code == 200

    trucks = [v for v in widened.json()["vehicles"] if v["modality"] == "truck"]
    assert trucks, "pos_logistik must still return its own trucks"
    assert all(v["company_id"] == "pos_logistik" for v in trucks)
    assert all(v.get("is_tenant_asset") is True for v in trucks)
    # The widened request is byte-for-byte the claim-scoped result set.
    assert _truck_ids(widened.json()) == _truck_ids(baseline.json())


def test_dispatcher_without_claim_gets_honest_empty_vehicle_fleet():
    """No company_id claim => empty fleet, never the macro corridor view."""
    from app.auth.supabase_auth import get_optional_user

    clear_fleet_cache()
    app.dependency_overrides[get_optional_user] = lambda: UserSession(
        id="tenant-scope-claimless",
        email="claimless@e2e.test",
        role=ROLE_DISPATCHER,
        company_id=None,
    )
    try:
        res = client.get("/api/v1/fleet/vehicles")
    finally:
        app.dependency_overrides.pop(get_optional_user, None)
    assert res.status_code == 200
    assert res.json()["vehicles"] == []


def test_regulator_company_filter_still_narrows_voluntarily():
    """The widening guard must not break regulator/guest macro filtering."""
    clear_fleet_cache()
    res = client.get(
        "/api/v1/fleet/vehicles",
        params={"company_id": "pos_logistik"},
        headers=_headers(ROLE_REGULATOR),
    )
    assert res.status_code == 200
    trucks = [v for v in res.json()["vehicles"] if v["modality"] == "truck"]
    assert trucks
    assert all(v["company_id"] == "pos_logistik" for v in trucks)


def test_travels_company_filter_never_overrides_dispatcher_claim():
    """The drawer's rit read reuses /fleet/travels: same claim-only rule."""
    dispatcher = UserSession(
        id="tenant-scope-1",
        email="dispatcher@e2e.test",
        role=ROLE_DISPATCHER,
        company_id="pos_logistik",
    )
    assert _effective_company_filter(dispatcher, "pelindo_belawan") == "pos_logistik"
    assert _effective_company_filter(dispatcher, None) == "pos_logistik"

    claimless = UserSession(
        id="tenant-scope-2",
        email="claimless@e2e.test",
        role=ROLE_DISPATCHER,
        company_id=None,
    )
    assert _effective_company_filter(claimless, "pelindo_belawan") is None

    regulator = UserSession(
        id="tenant-scope-3",
        email="regulator@e2e.test",
        role=ROLE_REGULATOR,
    )
    assert _effective_company_filter(regulator, "pos_logistik") == "pos_logistik"
