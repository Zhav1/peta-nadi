"""Contract tests for `GET /api/v1/dashboard/bootstrap`.

The public read is a persisted-only shared projection; missing data stays
explicitly unknown, and no public request builds or refreshes a snapshot. Tests
adapt the old compatibility reader to a fake public projection and keep tenant
section checks isolated. Tokens are signed locally with the dev HS256 secret.
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
from app.services import public_snapshot_service as public_snapshots

client = TestClient(app)

URL = "/api/v1/dashboard/bootstrap"
ALIAS_URL = "/dashboard/bootstrap"


@pytest.fixture(autouse=True)
def _clean_section_cache(monkeypatch):
    """Keep tests hermetic while modeling the new persisted public projection."""
    svc.reset_section_cache()
    dashboard_bootstrap.reset_inflight()

    async def read_public_snapshot():
        legacy = svc.read_global_snapshot()
        if not isinstance(legacy, dict):
            return None
        freshness = legacy.get("source_freshness") or {}
        sections = legacy.get("payload") or {}
        return {
            "snapshot_key": "sumatra_mainland",
            "schema_version": legacy.get("schema_version", 1),
            "computed_at": legacy.get("computed_at"),
            "stale": any(
                isinstance(value, dict) and value.get("status") != "ok"
                for value in freshness.values()
            ) or (svc.snapshot_age_seconds(legacy) or 0) > svc.STALE_AFTER_SECONDS,
            "sections": sections,
            "source_freshness": freshness,
            "shadow_mode": True,
            "coverage": {"scope": "mainland_sumatra", "expected_province_count": 8},
        }

    monkeypatch.setattr(public_snapshots, "read_public_snapshot", read_public_snapshot)
    yield
    svc.reset_section_cache()
    dashboard_bootstrap.reset_inflight()


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


def _degraded_fresh_snapshot(age_seconds: int = 0) -> dict:
    """Fresh stored row whose fire/weather freshness says degraded/stale.

    The section payloads themselves are healthy-shaped (what a degraded run
    would still have embedded); the verdict lives in ``source_freshness``.
    """
    snapshot = _stored_snapshot(
        fire_hotspots={"status": "ok", "data": {"hotspots": []}},
        weather_summary={
            "status": "ok",
            "data": {"cuaca": {"status": "ok"}, "waspada": {"status": "ok"}},
        },
        age_seconds=age_seconds,
    )
    snapshot["source_freshness"]["fire_hotspots"] = {
        "status": "degraded",
        "ms": 12,
        "error": "upstream degraded",
    }
    snapshot["source_freshness"]["weather_summary"] = {
        "status": "stale",
        "ms": 8,
    }
    return snapshot


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
# 3. Persisted-only read behavior
# ---------------------------------------------------------------------------

def test_missing_snapshot_returns_unknown_without_live_fallback(monkeypatch):
    monkeypatch.setattr(svc, "read_global_snapshot", lambda: None)
    _no_build(monkeypatch)

    res = client.get(URL)

    assert res.status_code == 200
    body = res.json()
    assert body["stale"] is True
    assert body["reason"] == "missing_snapshot"
    assert body["computed_at"] is None
    assert body["sections"]["incidents"]["status"] == "unknown"
    assert body["sections"]["incidents"]["data"] is None


def test_stale_snapshot_is_served_without_refresh(monkeypatch):
    stored = _stored_snapshot(age_seconds=svc.STALE_AFTER_SECONDS + 60)
    monkeypatch.setattr(svc, "read_global_snapshot", lambda: stored)
    _no_build(monkeypatch)

    started = time.perf_counter()
    res = client.get(URL)
    elapsed = time.perf_counter() - started
    body = res.json()

    assert res.status_code == 200
    assert body["stale"] is True
    assert body["reason"] == "snapshot_stale"
    assert body["computed_at"] == stored["computed_at"]
    assert body["sections"]["incidents"]["data"]["total"] == 1
    assert elapsed < 3.0


def test_public_get_does_not_wait_for_or_call_a_live_build(monkeypatch):
    monkeypatch.setattr(svc, "read_global_snapshot", lambda: None)
    monkeypatch.setattr(dashboard_bootstrap, "LIVE_BUILD_TIMEOUT_SECONDS", 0.05)
    _no_build(monkeypatch)

    started = time.perf_counter()
    res = client.get(URL)
    elapsed = time.perf_counter() - started

    assert res.status_code == 200
    assert res.json()["reason"] == "missing_snapshot"
    assert elapsed < 3.0
    assert res.headers["Cache-Control"] == "private, no-store"


def test_failed_background_build_is_irrelevant_to_public_get(monkeypatch):
    stale = _stored_snapshot(age_seconds=svc.STALE_AFTER_SECONDS + 60)
    monkeypatch.setattr(svc, "read_global_snapshot", lambda: stale)
    _no_build(monkeypatch)

    res = client.get(URL)
    body = res.json()

    assert res.status_code == 200
    assert body["stale"] is True
    assert body["reason"] == "snapshot_stale"
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


# ---------------------------------------------------------------------------
# 6. sections=public|tenant|all
# ---------------------------------------------------------------------------

def test_sections_public_is_auth_blind_and_cacheable(monkeypatch):
    monkeypatch.setattr(svc, "read_global_snapshot", lambda: _stored_snapshot())
    _no_build(monkeypatch)

    # Even a valid dispatcher token must not leak tenant data in public mode.
    res = client.get(
        URL,
        params={"sections": "public"},
        headers=_bearer(_token(ROLE_DISPATCHER, "pos_logistik")),
    )
    assert res.status_code == 200
    body = res.json()
    assert body["role"] == ROLE_GUEST
    assert body["company_id"] is None
    assert "fleet" not in body["sections"]
    assert "erp" not in body["sections"]
    assert body["sections"]["incidents"]["data"]["total"] == 1
    assert res.headers["Cache-Control"] == "public, s-maxage=30, stale-while-revalidate=60"


def test_sections_public_ignores_invalid_token(monkeypatch):
    monkeypatch.setattr(svc, "read_global_snapshot", lambda: _stored_snapshot())
    _no_build(monkeypatch)

    res = client.get(URL, params={"sections": "public"}, headers=_bearer("invalid.token.value"))
    assert res.status_code == 200
    assert res.json()["role"] == ROLE_GUEST
    assert res.headers["Cache-Control"].startswith("public,")


def test_sections_tenant_guest_gets_empty_sections(monkeypatch):
    monkeypatch.setattr(svc, "read_global_snapshot", lambda: _stored_snapshot())
    _no_build(monkeypatch)

    res = client.get(URL, params={"sections": "tenant"})
    assert res.status_code == 200
    body = res.json()
    assert body["role"] == ROLE_GUEST
    assert body["sections"] == {}
    assert res.headers["Cache-Control"] == "private, no-store"


def test_sections_tenant_dispatcher_gets_only_tenant_sections(monkeypatch):
    monkeypatch.setattr(svc, "read_global_snapshot", lambda: _stored_snapshot())

    from app.routers import vehicles_router
    from app.services import travel_ledger_service

    async def fake_fleet(**kwargs):
        return {"status": "success", "vehicles": []}

    def fake_erp(**kwargs):
        return {"company_id": kwargs.get("company_id")}

    monkeypatch.setattr(vehicles_router, "get_active_fleet", fake_fleet)
    monkeypatch.setattr(travel_ledger_service, "build_erp_summary", fake_erp)

    res = client.get(
        URL,
        params={"sections": "tenant"},
        headers=_bearer(_token(ROLE_DISPATCHER, "pos_logistik")),
    )
    assert res.status_code == 200
    body = res.json()
    assert set(body["sections"]) == {"fleet", "erp"}
    assert "incidents" not in body["sections"]
    assert body["company_id"] == "pos_logistik"
    assert res.headers["Cache-Control"] == "private, no-store"


def test_sections_invalid_is_400_with_no_store(monkeypatch):
    monkeypatch.setattr(svc, "read_global_snapshot", lambda: _stored_snapshot())

    res = client.get(URL, params={"sections": "everything"})
    assert res.status_code == 400
    assert res.json()["detail"]["error"] == "INVALID_SECTIONS"
    assert res.headers["Cache-Control"] == "private, no-store"


def test_sections_all_preserves_default_behaviour(monkeypatch):
    stored = _stored_snapshot()
    monkeypatch.setattr(svc, "read_global_snapshot", lambda: stored)
    _no_build(monkeypatch)

    default = client.get(URL)
    explicit = client.get(URL, params={"sections": "all"})
    assert default.json() == explicit.json()
    assert explicit.headers["Cache-Control"] == "private, no-store"


# ---------------------------------------------------------------------------
# 7. Persisted-only behavior (direct _resolve_sections, deterministic)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_concurrent_missing_snapshot_reads_never_build(monkeypatch):
    monkeypatch.setattr(svc, "read_global_snapshot", lambda: None)
    _no_build(monkeypatch)

    first, second = await asyncio.gather(
        dashboard_bootstrap._resolve_sections(None),
        dashboard_bootstrap._resolve_sections(None),
    )

    for sections, computed_at, stale, reason, snapshot in (first, second):
        assert stale is True
        assert reason == "missing_snapshot"
        assert computed_at is None
        assert sections["incidents"]["status"] == "unknown"
        assert snapshot["snapshot_key"] == "sumatra_mainland"


@pytest.mark.asyncio
async def test_public_reads_do_not_create_detached_refresh_tasks(monkeypatch):
    calls = []
    monkeypatch.setattr(svc, "read_global_snapshot", lambda: calls.append("read") or None)
    _no_build(monkeypatch)

    first = await dashboard_bootstrap._resolve_sections(None)
    second = await dashboard_bootstrap._resolve_sections(None)

    assert calls == ["read", "read"]
    assert first[3] == second[3] == "missing_snapshot"
    assert first[0]["incidents"]["status"] == "unknown"
    assert second[0]["incidents"]["status"] == "unknown"


@pytest.mark.asyncio
async def test_process_memory_snapshot_is_not_a_public_source_of_truth(monkeypatch):
    dashboard_bootstrap._store_memory_snapshot(None, _live_snapshot())
    monkeypatch.setattr(svc, "read_global_snapshot", lambda: None)
    _no_build(monkeypatch)

    sections, computed_at, stale, reason, snapshot = await dashboard_bootstrap._resolve_sections(None)
    assert stale is True
    assert reason == "missing_snapshot"
    assert computed_at is None
    assert sections["incidents"]["status"] == "unknown"
    assert snapshot["snapshot_key"] == "sumatra_mainland"


# ---------------------------------------------------------------------------
# 8. Degraded/stale fire-weather freshness remains explicit without GET refresh
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_degraded_snapshot_is_served_without_request_path_revalidation(monkeypatch):
    stored = _degraded_fresh_snapshot()
    monkeypatch.setattr(svc, "read_global_snapshot", lambda: stored)
    _no_build(monkeypatch)

    sections, computed_at, stale, reason, snapshot = await dashboard_bootstrap._resolve_sections(None)

    assert stale is True
    assert reason == "snapshot_stale"
    assert computed_at == stored["computed_at"]
    assert sections["fire_hotspots"]["data"]["hotspots"] == []
    assert snapshot["shadow_mode"] is True


@pytest.mark.asyncio
async def test_degraded_snapshot_is_not_served_from_process_memory(monkeypatch):
    dashboard_bootstrap._store_memory_snapshot(None, _degraded_fresh_snapshot())
    monkeypatch.setattr(svc, "read_global_snapshot", lambda: None)
    _no_build(monkeypatch)

    sections, computed_at, stale, reason, snapshot = await dashboard_bootstrap._resolve_sections(None)

    assert stale is True
    assert reason == "missing_snapshot"
    assert computed_at is None
    assert sections["weather_summary"]["status"] == "unknown"
    assert snapshot["snapshot_key"] == "sumatra_mainland"
