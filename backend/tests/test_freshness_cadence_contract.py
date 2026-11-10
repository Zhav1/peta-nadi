"""Freshness/cadence contract — a TTL may never be shorter than its own job.

Production 2026-11-10: ``traffic_flow_segments`` published
``observed_at 06:47:32`` / ``valid_until 06:57:32`` (a 600 s TTL) while the
TomTom job ran every 3600 s, so the section — and ``corridor_context`` with it —
was honestly ``stale`` for 50 minutes of every hour. Nothing failed: the TTL and
the cadence lived in different files and no test compared them.

These tests make that class of mismatch a CI failure:

1. every source that has both a published TTL and a scheduler cadence must have
   ``TTL >= cadence``; a source that legitimately does not is listed explicitly
   with a reason, and the list is itself asserted (a stale exemption fails);
2. the TomTom cadence and TTL come from one constant (``retention``), and the
   adapter's in-process cache cannot outlive the cadence;
3. the adapter really reserves ONE unit per checkpoint per fetch, and the
   resulting units/day fit ``provider_budget_daily_limits["tomtom"]``;
4. ``corridor_context`` is ``ok`` at the worst-case age inside the new window,
   and every checkpoint still resolves to a canonical corridor.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock

import pytest

from app.adapters import tomtom_adapter
from app.adapters.tomtom_adapter import TomTomAdapter
from app.services import job_scheduler, retention
from app.services import public_operational_cache as operational_cache
from app.services.corridor_service import CORRIDOR_NAMES

# Sources whose published TTL is intentionally shorter than a scheduler cadence.
# Keyed by source with the reason, so an exemption can never be silent.
TTL_SHORTER_THAN_CADENCE: dict[str, str] = {
    "observed_disasters": (
        "composed section with two writers (bnpb 3600 s, petabencana 900 s); its "
        "1800 s TTL is a read-model validity window, not one provider's poll window"
    ),
}

TOMTOM_FREE_TIER_REQUESTS_PER_DAY = 2500  # non-tile requests, TomTom free tier


def _iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat()


def _daily_limits() -> dict[str, int]:
    from app.services.provider_budget import _daily_limits as parse

    return parse()


@pytest.fixture(autouse=True)
def _reset_tomtom_class_state():
    """The adapter keeps fetch cache / cycle / latch at class level, process-wide.

    Without this, a fetch performed here would be served from cache by the next
    test that exercises the adapter and silently change its status.
    """
    TomTomAdapter.reset_credit_latch()
    TomTomAdapter.reset_fetch_cache()
    TomTomAdapter.reset_fetch_cycle()
    yield
    TomTomAdapter.reset_credit_latch()
    TomTomAdapter.reset_fetch_cache()
    TomTomAdapter.reset_fetch_cycle()


# ---------------------------------------------------------------------------
# 1. TTL >= cadence for every source that has both
# ---------------------------------------------------------------------------

def test_ttl_covers_cadence_for_every_source():
    cadences = {
        name: spec.cadence_seconds for name, spec in job_scheduler.JOB_SPECS.items()
    }
    compared: list[str] = []

    for source, ttl_seconds in operational_cache.SOURCE_TTL_SECONDS.items():
        cadence = cadences.get(source)
        if cadence is None:
            assert source in TTL_SHORTER_THAN_CADENCE, (
                f"{source} has a TTL but no scheduler cadence and is not listed as "
                "an explicit exception"
            )
            continue
        assert ttl_seconds >= cadence, (
            f"{source}: TTL {ttl_seconds}s < cadence {cadence}s — the section is "
            "stale by construction for "
            f"{cadence - ttl_seconds}s of every {cadence}s"
        )
        compared.append(source)

    # The comparison must actually cover the metered sources, not silently skip.
    assert set(compared) >= {"bmkg", "open_meteo", "firms", "tomtom"}

    # Every exemption must still be a real source with a TTL *and* still lack a
    # cadence — otherwise the entry is stale and hides a real mismatch.
    for source, reason in TTL_SHORTER_THAN_CADENCE.items():
        assert reason, f"{source} exemption needs a reason"
        assert source in operational_cache.SOURCE_TTL_SECONDS
        assert source not in cadences


# ---------------------------------------------------------------------------
# 2. One constant drives the TomTom cadence, TTL and cache guard
# ---------------------------------------------------------------------------

def test_tomtom_cadence_and_ttl_come_from_one_constant(monkeypatch):
    monkeypatch.delenv("TOMTOM_POLL_SECONDS", raising=False)

    assert retention.TOMTOM_VALIDITY_S == retention.TOMTOM_REFRESH_S, (
        "TTL must equal cadence, or the section is stale between refreshes"
    )
    assert job_scheduler.JOB_SPECS["tomtom"].cadence_seconds == retention.TOMTOM_REFRESH_S
    assert operational_cache.SOURCE_TTL_SECONDS["tomtom"] == retention.TOMTOM_VALIDITY_S
    assert tomtom_adapter.tomtom_poll_seconds() == retention.TOMTOM_REFRESH_S
    # The in-process cache must not outlive the cadence: a cache hit still
    # restamps valid_until from the new fetched_at, so a longer cache would
    # publish hour-old speeds as fresh.
    assert TomTomAdapter.FETCH_CACHE_TTL_SECONDS <= retention.TOMTOM_REFRESH_S


# ---------------------------------------------------------------------------
# 3. Real reserve multiplier and the daily budget
# ---------------------------------------------------------------------------

def _tomtom_units_per_day(incidents_enabled: bool, every_n: int) -> tuple[int, int]:
    """(flow_units, incident_units) for one day at the registry cadence."""
    fetches_per_day = 86400 // job_scheduler.JOB_SPECS["tomtom"].cadence_seconds
    flow_units = len(TomTomAdapter.CHECKPOINTS) * fetches_per_day
    if not incidents_enabled:
        return flow_units, 0
    incident_cycles = fetches_per_day // every_n
    return flow_units, len(TomTomAdapter.build_corridor_tiles()) * incident_cycles


def test_tomtom_daily_budget_covers_the_cadence():
    limit = _daily_limits()["tomtom"]
    every_n = tomtom_adapter.tomtom_incidents_every_n()

    flow_units, incident_units = _tomtom_units_per_day(True, every_n)
    total = flow_units + incident_units

    # 48 fetches/day x 20 checkpoints = 960 flow units; every 6th cycle also
    # queries 20 incident tiles = 160. Total 1120 <= 1200.
    assert flow_units == 960, flow_units
    assert total <= limit, (
        f"tomtom needs {total} units/day ({flow_units} flow + {incident_units} "
        f"incident) but the cap is {limit}: the job would be denied and the "
        "section would go stale for the rest of the UTC day"
    )
    # The provider's own free tier is the outer bound, not our cap.
    assert total <= TOMTOM_FREE_TIER_REQUESTS_PER_DAY


@pytest.mark.asyncio
async def test_tomtom_reserves_exactly_one_unit_per_checkpoint_per_fetch(monkeypatch):
    """The budget arithmetic above is only true if the multiplier is 1."""
    TomTomAdapter.reset_credit_latch()
    TomTomAdapter.reset_fetch_cache()
    TomTomAdapter.reset_fetch_cycle()
    monkeypatch.setattr(tomtom_adapter, "tomtom_api_keys", lambda: ["test-key"])
    monkeypatch.setattr(tomtom_adapter.TomTomAdapter, "TILE_REQUEST_SLEEP_SECONDS", 0)

    reservations: list[tuple[str, int]] = []

    async def allow(source, *, units=1, request_id=None):
        reservations.append((source, units))
        return True

    class _Client:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

        async def get(self, url, params=None, **kwargs):
            response = MagicMock()
            response.status_code = 200
            response.json.return_value = {
                "flowSegmentData": {"currentSpeed": 40, "freeFlowSpeed": 60}
            }
            return response

    monkeypatch.setattr(tomtom_adapter.httpx, "AsyncClient", lambda *a, **k: _Client())

    # Flow only: one unit per checkpoint.
    monkeypatch.setenv("TOMTOM_INCIDENTS_ENABLED", "false")
    data = await TomTomAdapter().fetch(reserve_provider_budget=allow)
    assert len(data["flow"]) == len(TomTomAdapter.CHECKPOINTS)
    assert reservations == [("tomtom", 1)] * len(TomTomAdapter.CHECKPOINTS)

    # With incidents due: one more unit per corridor tile, nothing else.
    TomTomAdapter.reset_fetch_cache()
    TomTomAdapter.reset_fetch_cycle()
    reservations.clear()
    monkeypatch.setenv("TOMTOM_INCIDENTS_ENABLED", "true")
    monkeypatch.setenv("TOMTOM_INCIDENTS_EVERY_N", "1")
    await TomTomAdapter().fetch(reserve_provider_budget=allow)
    assert len(reservations) == len(TomTomAdapter.CHECKPOINTS) + len(
        TomTomAdapter.build_corridor_tiles()
    )
    assert {units for _, units in reservations} == {1}
    assert {source for source, _ in reservations} == {"tomtom"}


# ---------------------------------------------------------------------------
# 4. corridor_context at the new cadence
# ---------------------------------------------------------------------------

@pytest.fixture
def isolated_sections(monkeypatch):
    monkeypatch.setattr(
        "app.services.observed_disaster_service.read_observed_disasters",
        lambda: {"status": "unknown", "data": None, "updated_at": None},
    )
    monkeypatch.setattr(
        "app.adapters.tomtom_adapter.get_cached_sumatra_traffic",
        lambda: {"status": "unknown", "data": None},
    )
    return monkeypatch


def _full_traffic_record(*, fetched_at: datetime) -> dict:
    flow = [
        {
            "flowSegmentData": {"currentSpeed": 30, "freeFlowSpeed": 80},
            "_checkpoint_name": cp["name"],
            "_checkpoint_id": cp["id"],
            "_lat": cp["lat"],
            "_lon": cp["lon"],
        }
        for cp in TomTomAdapter.CHECKPOINTS
    ]
    return {
        "source": "tomtom",
        "raw": {
            "flow": flow,
            "incidents": [],
            "status": "ok",
            "degraded_reason": None,
            "expected_checkpoint_count": len(TomTomAdapter.CHECKPOINTS),
            "observed_checkpoint_count": len(flow),
        },
        "events": [],
        "fetched_at": _iso(fetched_at),
        "observed_at": _iso(fetched_at),
        "valid_until": _iso(
            fetched_at + timedelta(seconds=operational_cache.SOURCE_TTL_SECONDS["tomtom"])
        ),
        "status": "ok",
        "error": None,
    }


def test_corridor_context_is_ok_at_the_worst_case_age_inside_the_window(isolated_sections):
    """The tick runs every 300 s, so a 1800 s job can land up to 300 s late."""
    now = datetime.now(timezone.utc)
    fetched_at = now - timedelta(seconds=retention.TOMTOM_REFRESH_S - 60)
    sections = operational_cache._build_sections(
        {"tomtom": _full_traffic_record(fetched_at=fetched_at)}
    )

    traffic = sections["traffic_flow_segments"]
    assert traffic["status"] == "ok"
    assert traffic["data"]["total_segments"] == len(TomTomAdapter.CHECKPOINTS)

    # Every checkpoint still resolves to a canonical corridor: an unmapped id
    # would be dropped here (the Nov 7 bug left every corridor "unknown").
    contexts = sections["corridor_contexts"]["data"]
    assert sections["corridor_contexts"]["status"] == "ok"
    assert set(contexts) == set(CORRIDOR_NAMES)
    assert all(context["traffic"]["status"] == "ok" for context in contexts.values())
    assert sum(len(context["traffic"]["data"]) for context in contexts.values()) == len(
        TomTomAdapter.CHECKPOINTS
    )

    default = sections["corridor_context"]
    assert default["status"] == "ok"
    assert default["data"]["corridor_id"] == "sumatra_belawan_medan"
    assert default["data"]["traffic"]["status"] == "ok"
    assert default["data"]["traffic"]["data"]

    # …and the read path does not flip it to stale while still inside the window.
    snapshot = {"version": 1, "updated_at": _iso(now), "sections": sections}
    isolated_sections.setattr(operational_cache, "_read_json", lambda *a, **k: snapshot)
    served = operational_cache.read_public_operational_cache()
    assert served["traffic_flow_segments"]["status"] == "ok"
    assert served["corridor_context"]["status"] == "ok"
    assert served["traffic_flow_segments"]["valid_until"] > _iso(now)
