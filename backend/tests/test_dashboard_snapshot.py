"""Compatibility facade for the fenced public dashboard projection."""

from __future__ import annotations

import pytest

from app.services import dashboard_snapshot_service as snapshots
from app.services import public_snapshot_service
from app.services.refresh_coordinator import RefreshLease


def test_legacy_section_plan_cannot_start_live_reads():
    assert snapshots.section_plan() == {}


@pytest.mark.asyncio
async def test_compatibility_builder_returns_the_public_projection(monkeypatch):
    public = {
        "snapshot_key": "sumatra_mainland",
        "schema_version": 1,
        "computed_at": "2026-11-05T00:00:00+00:00",
        "source_freshness": {"weather_summary": {"status": "ok"}},
        "sections": {"weather_summary": {"status": "ok", "data": []}},
        "coverage": {"scope": "mainland_sumatra", "expected_province_count": 8},
        "stale": False,
    }
    calls = []

    async def build_public_snapshot():
        calls.append(True)
        return public

    monkeypatch.setattr(public_snapshot_service, "build_public_snapshot", build_public_snapshot)

    result = await snapshots.build_global_snapshot()

    assert calls == [True]
    assert result["snapshot_key"] == "sumatra_mainland"
    assert result["schema_version"] == 1
    assert result["payload"] == public["sections"]
    assert result["coverage"] == public["coverage"]
    assert result["shadow_mode"] is True


def test_legacy_writer_is_disabled():
    with pytest.raises(RuntimeError, match="fenced public projection"):
        snapshots.store_global_snapshot({"snapshot_key": "global"})


def test_compatibility_reader_uses_only_the_public_singleton(monkeypatch):
    public = {
        "snapshot_key": "sumatra_mainland",
        "schema_version": 1,
        "computed_at": "2026-11-05T00:00:00+00:00",
        "source_freshness": {"incidents": {"status": "ok"}},
        "sections": {"incidents": {"status": "ok", "data": []}},
    }
    monkeypatch.setattr(snapshots, "_client", lambda: pytest.fail("legacy table must not be read"))
    monkeypatch.setattr(public_snapshot_service, "_read_public_snapshot_sync", lambda: public)

    result = snapshots.read_global_snapshot()

    assert result is not None
    assert result["snapshot_key"] == "sumatra_mainland"
    assert result["payload"] == public["sections"]


@pytest.mark.asyncio
async def test_tick_refresh_requires_and_uses_a_fenced_lease(monkeypatch):
    lease = RefreshLease("internal_tick", "owner-1", 3)
    called = []

    async def refresh_public_snapshot(*, lease):
        called.append(lease)
        return {"status": "ok", "snapshot_key": "sumatra_mainland"}

    monkeypatch.setattr(public_snapshot_service, "refresh_public_snapshot", refresh_public_snapshot)

    assert await snapshots.build_and_store_global_snapshot() == {
        "status": "error",
        "error": "active fenced lease required",
    }
    result = await snapshots.build_and_store_global_snapshot(lease=lease)

    assert called == [lease]
    assert result["status"] == "ok"
