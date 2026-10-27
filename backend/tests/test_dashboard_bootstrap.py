"""Phase 163a — `GET /api/v1/dashboard/bootstrap`.

Hermetic: the read model (`read_global_snapshot` / `build_global_snapshot`) and
the tenant sections are monkeypatched, so no Supabase/Redis/upstream call is
made. Tokens are signed locally with the dev HS256 secret (phase 161 pattern).

Contract pinned here:

* guest + fresh stored snapshot -> 200, `stale=false`, no tenant sections;
* dispatcher -> `fleet`/`erp` included, scoped to the JWT `company_id`; a
  `?company_id=` query never widens or overrides the claim;
* missing/stale snapshot -> bounded live fallback, `stale=true` + `reason`,
  and a hung build still answers (it does not hang the request);
* invalid token -> 401;
* `Cache-Control: private, no-store` on every response (200 and 401);
* a failing fleet/erp section is `degraded` and still 200.
"""

import asyncio
import time
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient

from app.auth.supabase_auth import ROLE_DISPATCHER, ROLE_GUEST, ROLE_REGULATOR, create_guest_token
from app.main import app
from app.routers import dashboard_bootstrap
from app.services import dashboard_snapshot_service as svc

client = TestClient(app)

URL = "/api/v1/dashboard/bootstrap"
ALIAS_URL = "/dashboard/bootstrap"


@pytest.fixture(autouse=True)
def _clean_section_cache():
    """Keep the service's last-good cache from leaking between tests."""
    svc.reset_section_cache()
    yield
    svc.reset_section_cache()


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

def _bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _token(role: str, company_id: str | None = None) -> str:
    return create_guest_token(role=role, company_id=company_id)


def _stored_snapshot(*, age_seconds: int = 0, **payload_sections) -> dict:
    payload = payload_sections or {
        "incidents": {"status": "ok", "data": {"items": [{"id": "INC-1"}], "total": 1}},
        "news": {"status": "ok", "data": {"count": 2}},
    }
    return {
        "snapshot_key": "global",
        "schema_version": 1,
        "computed_at": (svc.utcnow() - timedelta(seconds=age_seconds)).isoformat(),
        "source_freshness": {name: {"status": "ok", "ms": 4} for name in payload},
        "payload": payload,
    }


def _live_snapshot() -> dict:
    return {
        "snapshot_key": "global",
        "schema_version": 1,
        "computed_at": svc.utcnow().isoformat(),
        "source_freshness": {"incidents": {"status": "ok", "ms": 7}},
        "payload": {"incidents": {"status": "ok", "data": {"items": [], "total": 0}}},
    }


def _no_build(monkeypatch):
    async def must_not_build(**kwargs):
        raise AssertionError("a fresh stored snapshot must not trigger a live build")

    monkeypatch.setattr(svc, "build_global_snapshot", must_not_build)


# ---------------------------------------------------------------------------
# 1. Guest + fresh snapshot
# ---------------------------------------------------------------------------

def test_guest_with_fresh_snapshot_returns_public_sections(monkeypatch):
    monkeypatch.setattr(svc, "read_global_snapshot", lambda: _stored_snapshot())
    _no_build(monkeypatch)

    res = client.get(URL)

    assert res.status_code == 200
    body = res.json()
    assert body["schema_version"] == 1
    assert body["stale"] is False
    assert body["role"] == ROLE_GUEST
    assert body["company_id"] is None
    assert body["modality"] == "truck"
    assert body["computed_at"]
    assert "reason" not in body
    assert body["sections"]["incidents"]["data"]["total"] == 1
    assert "fleet" not in body["sections"]
    assert "erp" not in body["sections"]
    assert res.headers["Cache-Control"] == "private, no-store"


def test_root_alias_serves_the_same_shape(monkeypatch):
    monkeypatch.setattr(svc, "read_global_snapshot", lambda: _stored_snapshot())
    _no_build(monkeypatch)

    res = client.get(ALIAS_URL)
    assert res.status_code == 200
    assert res.json()["role"] == ROLE_GUEST


def test_modality_vessel_is_echoed(monkeypatch):
    monkeypatch.setattr(svc, "read_global_snapshot", lambda: _stored_snapshot())
    _no_build(monkeypatch)

    res = client.get(URL, params={"modality": "vessel"})
    assert res.status_code == 200
    assert res.json()["modality"] == "vessel"


def test_unknown_modality_is_400_with_no_store(monkeypatch):
    monkeypatch.setattr(svc, "read_global_snapshot", lambda: _stored_snapshot())

    res = client.get(URL, params={"modality": "submarine"})
    assert res.status_code == 400
    assert res.json()["detail"]["error"] == "INVALID_MODALITY"
    assert res.headers["Cache-Control"] == "private, no-store"


# ---------------------------------------------------------------------------
# 2. Dispatcher tenant sections
# ---------------------------------------------------------------------------

def test_dispatcher_includes_tenant_sections_scoped_to_claim(monkeypatch):
    monkeypatch.setattr(svc, "read_global_snapshot", lambda: _stored_snapshot())
    _no_build(monkeypatch)

    from app.routers import vehicles_router
    from app.services import travel_ledger_service

    fleet_calls: list[dict] = []
    erp_calls: list[dict] = []

    async def fake_fleet(**kwargs):
        fleet_calls.append(kwargs)
        return {"status": "success", "total_vehicles": 1, "vehicles": [{"vehicle_id": "T-1"}]}

    def fake_erp(**kwargs):
        erp_calls.append(kwargs)
        return {"company_id": kwargs.get("company_id"), "totals": {"n": 1}}

    monkeypatch.setattr(vehicles_router, "get_active_fleet", fake_fleet)
    monkeypatch.setattr(travel_ledger_service, "build_erp_summary", fake_erp)

    res = client.get(
        URL,
        params={"modality": "vessel", "company_id": "pelindo_belawan"},
        headers=_bearer(_token(ROLE_DISPATCHER, "pos_logistik")),
    )

    assert res.status_code == 200
    body = res.json()
    assert body["role"] == ROLE_DISPATCHER
    assert body["company_id"] == "pos_logistik"
    assert body["modality"] == "vessel"

    # Fleet: geometry excluded, tenant from the claim (never the query string),
    # and "vessel" mapped to the fleet endpoint's "maritime".
    assert len(fleet_calls) == 1
    assert fleet_calls[0]["company_id"] is None
    assert fleet_calls[0]["include_geometry"] is False
    assert fleet_calls[0]["modality"] == "maritime"
    assert fleet_calls[0]["user"].company_id == "pos_logistik"

    # ERP: same role policy as /api/v1/erp/summary, tenant from the claim.
    assert len(erp_calls) == 1
    assert erp_calls[0]["company_id"] == "pos_logistik"
    assert erp_calls[0]["include_trips"] is True
    assert "pelindo_belawan" not in str(erp_calls[0])

    assert body["sections"]["fleet"]["status"] == "ok"
    assert body["sections"]["fleet"]["data"]["vehicles"][0]["vehicle_id"] == "T-1"
    assert body["sections"]["erp"]["status"] == "ok"
    assert body["sections"]["erp"]["data"]["company_id"] == "pos_logistik"


def test_regulator_gets_aggregate_erp_and_public_fleet(monkeypatch):
    monkeypatch.setattr(svc, "read_global_snapshot", lambda: _stored_snapshot())
    _no_build(monkeypatch)

    from app.routers import vehicles_router
    from app.services import travel_ledger_service

    erp_calls: list[dict] = []

    async def fake_fleet(**kwargs):
        return {"status": "success", "total_vehicles": 3, "vehicles": []}

    def fake_erp(**kwargs):
        erp_calls.append(kwargs)
        return {"company_id": kwargs.get("company_id"), "totals": {}}

    monkeypatch.setattr(vehicles_router, "get_active_fleet", fake_fleet)
    monkeypatch.setattr(travel_ledger_service, "build_erp_summary", fake_erp)

    res = client.get(URL, headers=_bearer(_token(ROLE_REGULATOR, "bapanas")))

    assert res.status_code == 200
    body = res.json()
    assert body["role"] == ROLE_REGULATOR
    assert body["company_id"] == "bapanas"
    # REGULATOR keeps the macro aggregate and no per-rit detail.
    assert erp_calls[0]["company_id"] is None
    assert erp_calls[0]["include_trips"] is False
    assert body["sections"]["fleet"]["status"] == "ok"
    assert body["sections"]["erp"]["status"] == "ok"


# ---------------------------------------------------------------------------
# 3. Live fallback (missing / stale) — bounded
# ---------------------------------------------------------------------------

def test_missing_snapshot_triggers_bounded_live_fallback(monkeypatch):
    monkeypatch.setattr(svc, "read_global_snapshot", lambda: None)

    live = _live_snapshot()
    calls: list[dict] = []

    async def fake_build(**kwargs):
        calls.append(kwargs)
        return live

    monkeypatch.setattr(svc, "build_global_snapshot", fake_build)

    res = client.get(URL)

    assert res.status_code == 200
    body = res.json()
    assert body["stale"] is True
    assert body["reason"] == "missing_snapshot"
    assert body["computed_at"] == live["computed_at"]
    assert body["sections"]["incidents"]["status"] == "ok"
    assert len(calls) == 1


def test_stale_snapshot_triggers_live_fallback_and_reports_reason(monkeypatch):
    monkeypatch.setattr(
        svc, "read_global_snapshot", lambda: _stored_snapshot(age_seconds=svc.STALE_AFTER_SECONDS + 60)
    )

    live = _live_snapshot()

    async def fake_build(**kwargs):
        return live

    monkeypatch.setattr(svc, "build_global_snapshot", fake_build)

    res = client.get(URL)
    body = res.json()

    assert res.status_code == 200
    assert body["stale"] is True
    assert body["reason"] == "snapshot_stale"
    assert body["computed_at"] == live["computed_at"]


def test_hung_live_build_does_not_hang_the_request(monkeypatch):
    monkeypatch.setattr(svc, "read_global_snapshot", lambda: None)
    monkeypatch.setattr(dashboard_bootstrap, "LIVE_BUILD_TIMEOUT_SECONDS", 0.05)

    async def hang(**kwargs):
        await asyncio.sleep(30)

    monkeypatch.setattr(svc, "build_global_snapshot", hang)

    started = time.perf_counter()
    res = client.get(URL)
    elapsed = time.perf_counter() - started

    assert res.status_code == 200
    body = res.json()
    assert body["stale"] is True
    assert body["reason"] == "live_build_timeout"
    assert body["sections"] == {}
    assert elapsed < 3.0
    assert res.headers["Cache-Control"] == "private, no-store"


def test_failed_live_build_falls_back_to_the_stored_snapshot(monkeypatch):
    stale = _stored_snapshot(age_seconds=svc.STALE_AFTER_SECONDS + 60)
    monkeypatch.setattr(svc, "read_global_snapshot", lambda: stale)

    async def boom(**kwargs):
        raise RuntimeError("weather upstream down")

    monkeypatch.setattr(svc, "build_global_snapshot", boom)

    res = client.get(URL)
    body = res.json()

    assert res.status_code == 200
    assert body["stale"] is True
    assert body["reason"] == "live_build_failed"
    assert body["sections"]["incidents"]["data"]["total"] == 1
    assert body["computed_at"] == stale["computed_at"]


# ---------------------------------------------------------------------------
# 4. Auth + cache headers
# ---------------------------------------------------------------------------

def test_invalid_token_returns_401_with_no_store(monkeypatch):
    monkeypatch.setattr(svc, "read_global_snapshot", lambda: _stored_snapshot())

    res = client.get(URL, headers=_bearer("invalid.token.value"))

    assert res.status_code == 401
    assert res.headers.get("WWW-Authenticate") == "Bearer"
    assert res.headers["Cache-Control"] == "private, no-store"


def test_success_response_is_private_no_store(monkeypatch):
    monkeypatch.setattr(svc, "read_global_snapshot", lambda: _stored_snapshot())
    _no_build(monkeypatch)

    res = client.get(URL)
    assert res.status_code == 200
    assert res.headers["Cache-Control"] == "private, no-store"
    # Never the proxy-cacheable shape that caused cross-user leakage.
    assert "public" not in res.headers["Cache-Control"]


# ---------------------------------------------------------------------------
# 5. Tenant section degradation
# ---------------------------------------------------------------------------

def test_failing_tenant_sections_are_degraded_and_still_200(monkeypatch):
    monkeypatch.setattr(svc, "read_global_snapshot", lambda: _stored_snapshot())
    _no_build(monkeypatch)

    async def boom_fleet(*args, **kwargs):
        raise RuntimeError("fleet cache unavailable")

    async def boom_erp(*args, **kwargs):
        raise RuntimeError("ledger unavailable")

    monkeypatch.setattr(dashboard_bootstrap, "_fleet_section", boom_fleet)
    monkeypatch.setattr(dashboard_bootstrap, "_erp_section", boom_erp)

    res = client.get(URL, headers=_bearer(_token(ROLE_DISPATCHER, "pos_logistik")))

    assert res.status_code == 200
    body = res.json()
    assert body["stale"] is False
    assert body["sections"]["incidents"]["status"] == "ok"
    assert body["sections"]["fleet"]["status"] == "degraded"
    assert body["sections"]["fleet"]["data"] is None
    assert "fleet cache unavailable" in body["sections"]["fleet"]["error"]
    assert body["sections"]["erp"]["status"] == "degraded"
    assert body["sections"]["erp"]["error"]
    assert res.headers["Cache-Control"] == "private, no-store"
