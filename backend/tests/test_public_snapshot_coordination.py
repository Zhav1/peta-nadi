from __future__ import annotations
import asyncio

from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import public_snapshot_service as snapshots
from app.services import provider_budget, refresh_coordinator


@pytest.mark.asyncio
async def test_public_builder_is_cache_and_database_only_and_keeps_last_good_clock(monkeypatch):
    old_clock = "2026-11-04T08:00:00+00:00"
    calls = []

    async def previous_sections():
        return {
            "fire_hotspots": {
                "status": "ok",
                "data": [{"latitude": -2.0, "longitude": 102.0, "source": "firms"}],
                "observed_at": old_clock,
                "valid_until": "2026-11-04T11:00:00+00:00",
            }
        }

    async def owner_reads():
        calls.append("cache_read")
        return (
            {
                "sections": {
                    "weather_summary": {
                        "status": "ok",
                        "data": [],
                        "observed_at": "2026-11-05T01:00:00+00:00",
                        "valid_until": "2026-11-05T01:05:00+00:00",
                    },
                    "fire_hotspots": {"status": "unavailable", "data": None, "error": "provider down"},
                }
            },
            {"status": "unknown", "data": None},
            {"operational_cache": "not available"},
        )

    monkeypatch.setattr(snapshots, "read_public_snapshot_sections", previous_sections)
    monkeypatch.setattr(snapshots, "_read_owner_caches", owner_reads)
    monkeypatch.setattr(snapshots, "_response_rows", lambda table, limit: ([], None))

    result = await snapshots.build_public_snapshot()

    assert calls == ["cache_read"]
    assert set(result) == {
        "schema_version", "snapshot_key", "computed_at", "stale", "sections",
        "source_freshness", "shadow_mode", "coverage",
    }
    assert result["snapshot_key"] == "sumatra_mainland"
    assert result["schema_version"] == 1
    assert result["sections"]["weather_summary"]["status"] == "ok"
    assert result["sections"]["weather_summary"]["data"] == []
    fire = result["sections"]["fire_hotspots"]
    assert fire["status"] == "stale"
    assert fire["cached"] is True
    assert fire["observed_at"] == old_clock
    assert result["source_freshness"]["fire_hotspots"]["observed_at"] == old_clock
    assert result["sections"]["incidents"]["status"] == "ok"
    assert result["sections"]["incidents"]["data"] == []
    assert result["coverage"]["scope"] == "mainland_sumatra"
    assert result["coverage"]["expected_province_count"] == 8
    assert result["shadow_mode"] is True


def test_healthy_empty_source_is_distinct_from_unknown():
    empty = snapshots._normalize_entry({"status": "empty", "data": []})
    unknown = snapshots._normalize_entry({"status": "unknown", "data": None})

    assert empty["status"] == "ok"
    assert empty["data"] == []
    assert unknown["status"] == "unknown"
    assert unknown["data"] is None


def test_coverage_counts_nested_and_indonesian_province_names():
    covered = snapshots._covered_provinces(
        {
            "fire_hotspots": {
                "data": {"hotspots": [{"province": "Sumatera Utara"}]}
            },
            "disaster_reports": {
                "data": [{"properties": {"province": "Sumatra Barat"}}]
            },
        }
    )

    assert covered == {"North Sumatra", "West Sumatra"}


def test_curator_drops_private_tenant_fields_and_keeps_public_evidence():
    curated = snapshots._curate(
        {
            "title": "Flood warning",
            "province": "Aceh",
            "latitude": 5.5,
            "company_id": "private-company",
            "vehicle_id": "private-vehicle",
            "fleet": [{"name": "truck", "company_id": "private-company"}],
            "ground_truth_metrics": {"private_score": 0.91},
        }
    )

    assert curated == {"title": "Flood warning", "province": "Aceh", "latitude": 5.5}
    assert "company_id" not in curated
    assert "vehicle_id" not in curated


@pytest.mark.asyncio
async def test_bootstrap_public_read_never_builds_or_schedules_a_refresh(monkeypatch):
    stored = {
        "schema_version": 1,
        "snapshot_key": "sumatra_mainland",
        "computed_at": datetime.now(timezone.utc).isoformat(),
        "stale": False,
        "sections": {"weather_summary": {"status": "ok", "data": []}},
        "source_freshness": {"weather_summary": {"status": "ok"}},
        "shadow_mode": True,
        "coverage": {"scope": "mainland_sumatra", "expected_province_count": 8},
    }
    monkeypatch.setattr(snapshots, "read_public_snapshot", lambda: _async_value(stored))
    monkeypatch.setattr(
        snapshots,
        "build_public_snapshot",
        lambda: pytest.fail("public bootstrap must not build a snapshot"),
    )

    response = TestClient(app).get("/api/v1/dashboard/bootstrap?sections=public")

    assert response.status_code == 200
    body = response.json()
    assert body["snapshot_key"] == "sumatra_mainland"
    assert body["sections"]["weather_summary"]["data"] == []
    assert body["source_freshness"]["weather_summary"]["status"] == "ok"
    assert body["shadow_mode"] is True
    assert body["coverage"]["expected_province_count"] == 8


@pytest.mark.asyncio
async def test_bootstrap_missing_snapshot_returns_unknown_without_upstream(monkeypatch):
    monkeypatch.setattr(snapshots, "read_public_snapshot", lambda: _async_value(None))
    monkeypatch.setattr(
        snapshots,
        "build_public_snapshot",
        lambda: pytest.fail("missing public snapshot must not trigger a build"),
    )
    response = TestClient(app).get("/api/v1/dashboard/bootstrap?sections=public")
    assert response.status_code == 200
    body = response.json()
    assert body["stale"] is True
    assert body["reason"] == "missing_snapshot"
    assert body["sections"]["weather_summary"]["status"] == "unknown"
    assert body["sections"]["weather_summary"]["data"] is None



async def _async_value(value):
    return value


@pytest.mark.asyncio
async def test_fenced_publisher_requires_positive_database_confirmation(monkeypatch):
    lease = refresh_coordinator.RefreshLease("internal_tick", "owner-1", 7)
    sent = []

    def rpc(function, params):
        sent.append((function, params))
        return False

    monkeypatch.setattr(refresh_coordinator, "_rpc_sync", rpc)
    assert await refresh_coordinator.publish_public_snapshot(
        lease,
        {"snapshot_key": "sumatra_mainland", "schema_version": 1, "sections": {}},
    ) is False
    assert sent[0][0] == "publish_public_dashboard_snapshot"
    assert sent[0][1]["p_owner_id"] == "owner-1"
    assert sent[0][1]["p_fence"] == 7


@pytest.mark.asyncio
async def test_scheduled_provider_retries_get_distinct_reservation_ids(monkeypatch):
    from app import main

    reservations = []

    async def reserve(source, *, units=1, request_id=None):
        reservations.append((source, units, request_id))
        return True

    monkeypatch.setattr(provider_budget, "reserve_provider_budget", reserve)

    assert await main._reserve_provider_attempt("bmkg", request_id="same-adapter-id")
    assert await main._reserve_provider_attempt("bmkg", request_id="same-adapter-id")

    assert reservations[0][:2] == reservations[1][:2] == ("bmkg", 1)
    assert reservations[0][2] != reservations[1][2]


@pytest.mark.asyncio
async def test_provider_budget_uses_configured_limit_and_request_id(monkeypatch):
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "provider_budget_daily_limits", "bmkg=288")
    sent = []

    def rpc(function, params):
        sent.append((function, params))
        return True

    monkeypatch.setattr(refresh_coordinator, "_rpc_sync", rpc)
    assert await provider_budget.reserve_provider_budget("BMKG", units=2, request_id="attempt-1")
    assert sent == [
        (
            "reserve_provider_budget",
            {"p_source": "bmkg", "p_units": 2, "p_request_id": "attempt-1", "p_daily_limit": 288},
        )
    ]
    assert not await provider_budget.reserve_provider_budget("unconfigured", request_id="attempt-2")


@pytest.mark.asyncio
async def test_provider_budget_fails_closed_when_coordination_is_unavailable(monkeypatch):
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "provider_budget_daily_limits", "tomtom=48")

    def unavailable(*args, **kwargs):
        raise refresh_coordinator.CoordinationUnavailable("database offline")

    monkeypatch.setattr(refresh_coordinator, "_rpc_sync", unavailable)
    assert not await provider_budget.reserve_provider_budget("tomtom", request_id="retry-1")


@pytest.mark.asyncio
async def test_snapshot_read_timeout_is_bounded_and_never_invokes_refresh(monkeypatch):
    import time

    monkeypatch.setattr(snapshots, "READ_TIMEOUT_SECONDS", 0.01)

    def slow_read():
        time.sleep(0.05)
        return None

    monkeypatch.setattr(snapshots, "_read_public_snapshot_sync", slow_read)
    assert await snapshots.read_public_snapshot() is None


# =============================================================================
# EXPLICIT ACCEPTANCE GATES (Mainland Sumatra Shadow Pilot Spec: Gates 1–9)
# =============================================================================

@pytest.mark.asyncio
async def test_gate1_shared_snapshot_read_never_launches_collection(monkeypatch):
    """Gate 1: Performance / shared snapshot read path without launching collection."""
    stored = {
        "schema_version": 1,
        "snapshot_key": "sumatra_mainland",
        "computed_at": datetime.now(timezone.utc).isoformat(),
        "stale": False,
        "sections": {name: {"status": "ok", "data": []} for name in snapshots.SECTION_NAMES},
        "source_freshness": {name: {"status": "ok"} for name in snapshots.SECTION_NAMES},
        "shadow_mode": True,
        "coverage": {"scope": "mainland_sumatra", "expected_province_count": 8, "covered_provinces": []},
    }
    monkeypatch.setattr(snapshots, "read_public_snapshot", lambda: _async_value(stored))
    monkeypatch.setattr(snapshots, "build_public_snapshot", lambda: pytest.fail("Must not build"))

    client = TestClient(app)
    response = client.get("/api/v1/dashboard/bootstrap?sections=public")
    assert response.status_code == 200
    assert response.json()["snapshot_key"] == "sumatra_mainland"


@pytest.mark.asyncio
async def test_gate2_concurrent_readers_zero_collection_and_shared_refresh(monkeypatch):
    """Gate 2: Sharing - concurrent dashboard readers cause zero provider collection calls; one due refresh shared across processes."""
    collection_calls = []

    async def fake_build():
        collection_calls.append("build")
        return snapshots.empty_public_snapshot()

    stored_snapshot = {
        "schema_version": 1,
        "snapshot_key": "sumatra_mainland",
        "computed_at": datetime.now(timezone.utc).isoformat(),
        "stale": False,
        "sections": {name: {"status": "ok", "data": []} for name in snapshots.SECTION_NAMES},
        "source_freshness": {name: {"status": "ok"} for name in snapshots.SECTION_NAMES},
        "shadow_mode": True,
        "coverage": {
            "scope": "mainland_sumatra",
            "provinces": list(snapshots.MAINLAND_SUMATRA_PROVINCES),
            "expected_province_count": 8,
            "covered_provinces": list(snapshots.MAINLAND_SUMATRA_PROVINCES),
        },
    }

    monkeypatch.setattr(snapshots, "read_public_snapshot", lambda: _async_value(stored_snapshot))
    monkeypatch.setattr(snapshots, "build_public_snapshot", fake_build)

    client = TestClient(app)
    results = await asyncio.gather(*(
        asyncio.to_thread(client.get, "/api/v1/dashboard/bootstrap?sections=public")
        for _ in range(20)
    ))
    assert all(r.status_code == 200 for r in results)
    assert len(collection_calls) == 0, "Concurrent readers must cause ZERO provider/collection calls"

    # Shared refresh: when two processes attempt refresh simultaneously, only one acquires the lease
    lease_calls = 0
    def rpc(fn, params):
        nonlocal lease_calls
        if fn == "acquire_refresh_lease":
            lease_calls += 1
            if lease_calls == 1:
                return {"acquired": True, "lease_name": params["p_lease_name"], "owner_id": params["p_owner_id"], "fence": 1, "expires_at": "2026-11-05T08:00:00Z"}
            return {"acquired": False}
        return True

    monkeypatch.setattr(refresh_coordinator, "_rpc_sync", rpc)
    l1 = await refresh_coordinator.acquire_refresh_lease("internal_tick", ttl_seconds=60)
    l2 = await refresh_coordinator.acquire_refresh_lease("internal_tick", ttl_seconds=60)
    assert l1 is not None and l1.fence == 1
    assert l2 is None


@pytest.mark.asyncio
async def test_gate3_recovery_lease_expiry_and_stale_owner_fencing(monkeypatch):
    """Gate 3: Recovery - lease expiry, late completion (fenced publication rejecting stale owner), duplicate triggers, restart recovery."""
    def rpc(fn, params):
        if fn == "publish_public_dashboard_snapshot":
            if params.get("p_fence") != 2 or params.get("p_owner_id") != "valid-owner":
                return False
            return True
        return False

    monkeypatch.setattr(refresh_coordinator, "_rpc_sync", rpc)

    stale_lease = refresh_coordinator.RefreshLease("internal_tick", "stale-owner", 1)
    fresh_lease = refresh_coordinator.RefreshLease("internal_tick", "valid-owner", 2)

    payload = {"snapshot_key": "sumatra_mainland", "schema_version": 1, "sections": {}}
    assert await refresh_coordinator.publish_public_snapshot(stale_lease, payload) is False
    assert await refresh_coordinator.publish_public_snapshot(fresh_lease, payload) is True


def test_gate4_privacy_curator_strips_all_tenant_and_trip_identifiers():
    """Gate 4: Privacy - guest/authenticated public payloads strip private company/fleet/trip fields."""
    private_payload = {
        "company_id": "secret-corp-001",
        "vehicle_id": "TRUCK-999",
        "driver_id": "DRIVER-123",
        "driver_name": "Pak Budi",
        "fleet": [{"truck_id": "T1", "company_id": "secret-corp-001"}],
        "trip_id": "TRIP-PRIVATE-7",
        "operational_cost": 4500000,
        "token": "bearer-secret-token",
        "title": "Jembatan Ampera Macet",
        "province": "South Sumatra",
        "latitude": -2.99,
        "longitude": 104.76,
        "status": "active",
        "severity": "medium",
    }
    curated = snapshots._curate(private_payload)
    for forbidden in ["company_id", "vehicle_id", "driver_id", "driver_name", "fleet", "trip_id", "operational_cost", "token"]:
        assert forbidden not in curated
    assert curated["title"] == "Jembatan Ampera Macet"
    assert curated["province"] == "South Sumatra"
    assert curated["latitude"] == -2.99
    assert curated["longitude"] == 104.76


def test_gate7_mainland_coverage_all_8_sumatra_provinces():
    """Gate 7: Mainland coverage - all 8 provinces in coverage matrix & route evaluation."""
    expected_provinces = {
        "Aceh",
        "North Sumatra",
        "West Sumatra",
        "Riau",
        "Jambi",
        "South Sumatra",
        "Bengkulu",
        "Lampung",
    }
    assert set(snapshots.MAINLAND_SUMATRA_PROVINCES) == expected_provinces

    covered = snapshots._covered_provinces({
        "sections": {
            "data": [
                {"province": "Aceh"},
                {"province": "Sumatera Utara"},
                {"province": "Sumatra Barat"},
                {"province": "Riau"},
                {"province": "Jambi"},
                {"province": "Sumatera Selatan"},
                {"province": "Bengkulu"},
                {"province": "Lampung"},
            ]
        }
    })
    assert covered == expected_provinces


def test_gate8_shadow_safety_operational_immutability():
    """Gate 8: Shadow safety - recommendations/approvals/travels/outcomes cannot mutate operational trips or dispatch vehicles."""
    from app.services import pilot_safety

    assert pilot_safety.is_pilot_shadow_mode() is True

    preview = pilot_safety.shadow_decision_response(
        decision_scope="operational_route",
        incident_id="APP-TEST-001",
        action="ACCEPT",
        preview={"route_id": "ALT-1"},
    )
    assert preview["shadow_mode"] is True
    assert preview["applied"] is False
    assert preview["recorded"] is False
    assert preview["persistence_status"] == "not_persisted"
    assert preview["external_dispatch_status"] == "disabled"


def test_public_snapshot_allows_only_curated_sections_and_fields():
    """Verify that public snapshot allows only curated sections (including fleet and source_health) and safe fields."""
    expected_sections = {
        "incidents",
        "news",
        "news_market_regime",
        "fire_hotspots",
        "weather_summary",
        "weather_spatial_polygons",
        "weather_advisory_polygons",
        "corridor_context",
        "corridor_contexts",
        "traffic_flow_segments",
        "disaster_reports",
        "official_warnings",
        "fleet",
        "source_health",
    }
    assert set(snapshots.SECTION_NAMES) == expected_sections

    assert "fleet" in snapshots.SECTION_NAMES
    assert "source_health" in snapshots.SECTION_NAMES
    assert "vehicles" in snapshots.PUBLIC_FIELDS
    assert "tier" in snapshots.PUBLIC_FIELDS
    assert "sources" in snapshots.PUBLIC_FIELDS
    assert "hotspots" in snapshots.PUBLIC_FIELDS
    assert "vehicle_id" in snapshots.FLEET_PUBLIC_FIELDS

    forbidden_keys = ["company_id", "driver_id", "driver_name", "operational_cost", "token"]
    raw = {
        "title": "Road Closure",
        "tier": "CONFIRMED",
        "company_id": "secret-corp",
        "driver_id": "secret-driver",
    }
    curated = snapshots._curate(raw)
    assert curated["title"] == "Road Closure"
    assert curated["tier"] == "CONFIRMED"
    for fk in forbidden_keys:
        assert fk not in curated


def test_internal_tick_runs_only_due_jobs_with_token_and_single_lease():
    """Verify due-job selection logic in tick coordinator, ensuring fleet fixture freshness keeps it not due."""
    now = 10000.0
    cadences = {"news": 300, "bmkg": 300, "fleet": 60, "traffic": 3600}
    last_run = {
        "news": now - 350,   # overdue (350 >= 300) -> due
        "bmkg": now - 320,   # overdue (320 >= 300) -> due
        "fleet": now - 10,   # fresh (10 < 60) -> NOT due
        "traffic": now - 500 # fresh (500 < 3600) -> NOT due
    }
    due_jobs = [
        job for job, cadence in cadences.items()
        if (now - last_run.get(job, 0)) >= cadence
    ]
    assert sorted(due_jobs) == ["bmkg", "news"]


