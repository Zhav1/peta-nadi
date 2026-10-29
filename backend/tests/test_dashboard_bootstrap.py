"""Phase 163a — `GET /api/v1/dashboard/bootstrap`.

Hermetic: the read model (`read_global_snapshot` / `build_global_snapshot`) and
the tenant sections are monkeypatched, so no Supabase/Redis/upstream call is
made. Tokens are signed locally with the dev HS256 secret (phase 161 pattern).

Contract pinned here:

* guest + fresh stored snapshot -> 200, `stale=false`, no tenant sections;
* a *fresh* stored (or 60 s memory) row whose `source_freshness` marks
  fire/weather degraded/stale still schedules exactly one background build
  (single-flight) while the stored row is served immediately;
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
    dashboard_bootstrap.reset_inflight()
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
    """Stale-first: a stale row is served immediately, refresh runs in backgnd.

    The live build is deliberately hung: the response must still answer fast
    with the stored payload (stale=true / snapshot_stale), proving the caller
    was not blocked.
    """
    stored = _stored_snapshot(age_seconds=svc.STALE_AFTER_SECONDS + 60)
    monkeypatch.setattr(svc, "read_global_snapshot", lambda: stored)

    async def hang(**kwargs):
        await asyncio.sleep(30)
        return _live_snapshot()

    monkeypatch.setattr(svc, "build_global_snapshot", hang)

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
    """A failing background refresh keeps serving the stored row (stale-first).

    The caller never blocks on the build, so the reason stays
    ``snapshot_stale``; the background failure is only logged.
    """
    stale = _stored_snapshot(age_seconds=svc.STALE_AFTER_SECONDS + 60)
    monkeypatch.setattr(svc, "read_global_snapshot", lambda: stale)

    async def boom(**kwargs):
        raise RuntimeError("weather upstream down")

    monkeypatch.setattr(svc, "build_global_snapshot", boom)

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
# 7. Single-flight + memory cache (direct _resolve_sections, deterministic)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_concurrent_missing_snapshots_trigger_one_build(monkeypatch):
    monkeypatch.setattr(svc, "read_global_snapshot", lambda: None)
    dashboard_bootstrap.reset_inflight()

    calls: list[int] = []
    release = asyncio.Event()

    async def fake_build(**kwargs):
        calls.append(1)
        await release.wait()
        return _live_snapshot()

    monkeypatch.setattr(svc, "build_global_snapshot", fake_build)

    async def caller():
        return await dashboard_bootstrap._resolve_sections(None)

    t1 = asyncio.create_task(caller())
    t2 = asyncio.create_task(caller())
    await asyncio.sleep(0.05)
    assert len(calls) == 1
    release.set()
    r1, r2 = await asyncio.gather(t1, t2)

    assert len(calls) == 1
    for sections, computed_at, stale, reason in (r1, r2):
        assert stale is True
        assert reason == "missing_snapshot"
        assert sections["incidents"]["status"] == "ok"
    dashboard_bootstrap.reset_inflight()


@pytest.mark.asyncio
async def test_client_abort_does_not_cancel_shared_build(monkeypatch):
    monkeypatch.setattr(svc, "read_global_snapshot", lambda: None)
    dashboard_bootstrap.reset_inflight()

    release = asyncio.Event()

    async def fake_build(**kwargs):
        await release.wait()
        return _live_snapshot()

    monkeypatch.setattr(svc, "build_global_snapshot", fake_build)

    first = asyncio.create_task(dashboard_bootstrap._resolve_sections(None))
    await asyncio.sleep(0.05)
    first.cancel()
    try:
        await first
    except asyncio.CancelledError:
        pass

    release.set()
    sections, computed_at, stale, reason = await dashboard_bootstrap._resolve_sections(None)
    assert stale is True
    assert reason == "missing_snapshot"
    assert sections["incidents"]["status"] == "ok"
    dashboard_bootstrap.reset_inflight()


@pytest.mark.asyncio
async def test_memory_cache_serves_fresh_without_rebuild(monkeypatch):
    live = _live_snapshot()
    dashboard_bootstrap.reset_inflight()
    dashboard_bootstrap._store_memory_snapshot(None, live)

    def must_not_read():
        raise AssertionError("memory hit must not touch the DB")

    def must_not_build(**kwargs):
        raise AssertionError("memory hit must not rebuild")

    monkeypatch.setattr(svc, "read_global_snapshot", must_not_read)
    monkeypatch.setattr(svc, "build_global_snapshot", must_not_build)

    sections, computed_at, stale, reason = await dashboard_bootstrap._resolve_sections(None)
    assert stale is False
    assert reason is None
    assert computed_at == live["computed_at"]
    dashboard_bootstrap.reset_inflight()


# ---------------------------------------------------------------------------
# 8. Degraded/stale fire-weather freshness is revalidated even when the row
#    is fresh (in DB or in memory) — the caller still gets the row at once
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_fresh_degraded_sections_schedule_one_background_refresh(monkeypatch):
    dashboard_bootstrap.reset_inflight()
    stored = _degraded_fresh_snapshot()
    monkeypatch.setattr(svc, "read_global_snapshot", lambda: stored)

    calls: list[dict] = []

    async def fake_build(**kwargs):
        calls.append(kwargs)
        await asyncio.sleep(30)
        return _live_snapshot()

    monkeypatch.setattr(svc, "build_global_snapshot", fake_build)

    sections, computed_at, stale, reason = await dashboard_bootstrap._resolve_sections(None)

    # The stored row is served immediately: fresh row, no reason, real data.
    assert stale is False
    assert reason is None
    assert computed_at == stored["computed_at"]
    assert sections["fire_hotspots"]["data"]["hotspots"] == []

    await asyncio.sleep(0.05)  # let the detached build start once
    assert len(calls) == 1

    # A concurrent caller shares the same in-flight rebuild (single-flight):
    # still exactly one build, and the fresh row is still served as fresh.
    sections2, _at2, stale2, reason2 = await dashboard_bootstrap._resolve_sections(None)
    assert stale2 is False
    assert reason2 is None
    assert len(calls) == 1
    dashboard_bootstrap.reset_inflight()


@pytest.mark.asyncio
async def test_memory_cached_degraded_snapshot_still_schedules_refresh(monkeypatch):
    """A 60 s memory hit does not swallow the revalidation of a degraded row."""
    dashboard_bootstrap.reset_inflight()
    dashboard_bootstrap._store_memory_snapshot(None, _degraded_fresh_snapshot())

    def must_not_read():
        raise AssertionError("memory hit must not touch the DB")

    calls: list[dict] = []

    async def fake_build(**kwargs):
        calls.append(kwargs)
        await asyncio.sleep(30)
        return _live_snapshot()

    monkeypatch.setattr(svc, "read_global_snapshot", must_not_read)
    monkeypatch.setattr(svc, "build_global_snapshot", fake_build)

    sections, computed_at, stale, reason = await dashboard_bootstrap._resolve_sections(None)

    assert stale is False
    assert reason is None
    assert sections["weather_summary"]["data"]["cuaca"]["status"] == "ok"

    await asyncio.sleep(0.05)
    assert len(calls) == 1  # the memory cache did not suppress the refresh
    dashboard_bootstrap.reset_inflight()
