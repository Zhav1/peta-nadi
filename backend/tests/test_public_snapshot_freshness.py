"""Regression tests for the data-freshness bugs found in production.

Two independent defects produced sections that looked current while serving
days-old evidence:

* ``weather_summary`` was stamped with ``observed_at = max(fetched_at)`` but
  ``valid_until = min(valid_until)``, so a dead Open-Meteo record (4 days old)
  pinned the validity window while a fresh BMKG fetch made the section look
  9 minutes old. The expired source was also still fused into the published
  polygons.
* ``traffic_flow_segments`` / ``corridor_context`` were frozen at their last
  fully-ok durable row: a degraded-but-fresh refresh was discarded by
  ``_merge_last_good``, and the corridor checkpoint map used legacy names that
  match no live checkpoint, so no corridor ever received traffic at all.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from app.adapters.tomtom_adapter import TomTomAdapter
from app.services import public_operational_cache as operational_cache
from app.services import public_snapshot_service as snapshots
from app.services import weather_fusion_service as fusion


def _iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat()


def _parse(value: str) -> datetime:
    return datetime.fromisoformat(str(value).replace("Z", "+00:00"))


def _bmkg_event(lat: float = 3.58, lon: float = 98.67) -> dict:
    return {
        "event_type": "weather_warning",
        "source": "bmkg",
        "severity": "high",
        "lat": lat,
        "lon": lon,
        "title": "Peringatan Cuaca Ekstrem",
        "region": "Sumatera Utara",
        "raw": "{}",
    }


def _open_meteo_event(lat: float = -2.98, lon: float = 104.77) -> dict:
    return {
        "event_type": "weather_prediction",
        "source": "open_meteo",
        "severity": "high",
        "lat": lat,
        "lon": lon,
        "title": "Grid high",
        "region": "grid",
        "raw_payload": {"predictions": {"precipitation_mm_70": 70.0, "precipitation_mm_24h": 70.0, "flood_risk_pct": 88.0}},
    }


def _weather_record(*, source: str, events: list, fetched_at: datetime, ttl_seconds: int, error=None, status="ok") -> dict:
    return {
        "source": source,
        "raw": {},
        "events": list(events),
        "fetched_at": _iso(fetched_at),
        "observed_at": _iso(fetched_at),
        "valid_until": _iso(fetched_at + timedelta(seconds=ttl_seconds)),
        "status": status,
        "error": error,
    }


@pytest.fixture
def isolated_sections(monkeypatch):
    """Keep ``_build_sections`` off Redis/Supabase and out of the network."""

    def fake_observed():
        return {"status": "unknown", "data": None, "updated_at": None}

    def fake_traffic():
        return {"status": "unknown", "data": None}

    monkeypatch.setattr(
        "app.services.observed_disaster_service.read_observed_disasters", fake_observed
    )
    monkeypatch.setattr(
        "app.adapters.tomtom_adapter.get_cached_sumatra_traffic", fake_traffic
    )
    return monkeypatch


# ---------------------------------------------------------------------------
# Q1 — weather: an expired source must not pin valid_until or be fused
# ---------------------------------------------------------------------------

def test_expired_weather_source_is_excluded_from_the_fusion():
    now = datetime.now(timezone.utc)
    records = {
        "bmkg": _weather_record(source="bmkg", events=[_bmkg_event()], fetched_at=now - timedelta(minutes=1), ttl_seconds=300),
        # Open-Meteo last succeeded four days ago (the production record).
        "open_meteo": _weather_record(
            source="open_meteo", events=[_open_meteo_event()], fetched_at=now - timedelta(days=4), ttl_seconds=6 * 3600
        ),
    }

    snapshot = fusion.get_cached_fusion_snapshot(records=records)

    assert snapshot is not None
    assert snapshot["upstream"]["expired_sources"] == ["open_meteo"]
    assert snapshot["upstream"]["incomplete"] is True
    # The four-day-old prediction is not published as current weather.
    assert len(snapshot["candidates"]) == 1
    assert "BMKG" in snapshot["candidates"][0]["feature"]["properties"]["source"]
    # Validity is derived from the contributing evidence, not the dead record.
    assert _parse(snapshot["valid_until"]) >= now
    assert _parse(snapshot["generated_at"]) == _parse(records["bmkg"]["fetched_at"])


def test_weather_section_observed_at_and_valid_until_describe_the_same_evidence(isolated_sections):
    now = datetime.now(timezone.utc)
    records = {
        "bmkg": _weather_record(source="bmkg", events=[_bmkg_event()], fetched_at=now - timedelta(minutes=1), ttl_seconds=300),
        "open_meteo": _weather_record(
            source="open_meteo", events=[], fetched_at=now - timedelta(days=4), ttl_seconds=6 * 3600
        ),
    }

    sections = operational_cache._build_sections(records)
    weather = sections["weather_summary"]

    observed, valid = _parse(weather["observed_at"]), _parse(weather["valid_until"])
    # No more "observed 9 minutes ago / valid until 4 days ago".
    assert valid >= observed
    assert valid >= now, "a fresh BMKG record must not inherit the dead source's expiry"
    assert observed >= now - timedelta(minutes=10)
    assert weather["status"] != "ok", "an unverifiable second source is not a clean ok"
    assert "open_meteo" in (weather["error"] or "")


def test_source_past_poll_ttl_but_within_stale_ceiling_is_still_fused(isolated_sections):
    """A slow poller must not drop fresh-ish evidence — only days-old evidence."""
    now = datetime.now(timezone.utc)
    records = {
        "bmkg": _weather_record(source="bmkg", events=[_bmkg_event()], fetched_at=now - timedelta(minutes=9), ttl_seconds=300),
        "open_meteo": _weather_record(
            source="open_meteo", events=[], fetched_at=now - timedelta(hours=5), ttl_seconds=6 * 3600
        ),
    }

    snapshot = fusion.get_cached_fusion_snapshot(records=records)

    assert snapshot is not None
    assert snapshot["upstream"]["expired_sources"] == []
    # The published age is the OLDEST input, not the newest one.
    assert _parse(snapshot["generated_at"]) == _parse(records["open_meteo"]["fetched_at"])
    assert _parse(snapshot["valid_until"]) == _parse(records["bmkg"]["valid_until"])

    weather = operational_cache._build_sections(records)["weather_summary"]
    assert weather["data"] is not None, "9-minute-old BMKG warnings are still evidence"
    assert _parse(weather["observed_at"]) == _parse(snapshot["generated_at"])
    # …and the section is honest that the poll window has lapsed.
    assert _parse(weather["valid_until"]) < now
    assert weather["status"] == "partial"


def test_all_weather_sources_expired_publishes_no_fusion(isolated_sections):
    now = datetime.now(timezone.utc)
    records = {
        "bmkg": _weather_record(source="bmkg", events=[_bmkg_event()], fetched_at=now - timedelta(days=2), ttl_seconds=300),
        "open_meteo": _weather_record(
            source="open_meteo", events=[_open_meteo_event()], fetched_at=now - timedelta(days=4), ttl_seconds=6 * 3600
        ),
    }

    assert fusion.get_cached_fusion_snapshot(records=records) is None

    weather = operational_cache._build_sections(records)["weather_summary"]
    assert weather["status"] == "stale"
    assert weather["data"] is None, "days-old weather must not be published as a summary"
    assert _parse(weather["valid_until"]) < now


def test_expired_source_cannot_publish_a_verified_zero(isolated_sections):
    now = datetime.now(timezone.utc)
    records = {
        # BMKG answered cleanly with no warnings…
        "bmkg": _weather_record(source="bmkg", events=[], fetched_at=now - timedelta(minutes=1), ttl_seconds=300),
        # …but Open-Meteo is four days past validity, so the true count is unknown.
        "open_meteo": _weather_record(
            source="open_meteo", events=[], fetched_at=now - timedelta(days=4), ttl_seconds=6 * 3600
        ),
    }

    sections = operational_cache._build_sections(records)

    summary = sections["weather_summary"]["data"]
    assert summary["cuaca"]["count"] is None
    assert summary["cuaca"]["status"] == "degraded"
    polygons = sections["weather_spatial_polygons"]["data"]
    assert polygons["meta"]["count"] is None
    assert polygons["meta"]["status"] == "degraded"


# ---------------------------------------------------------------------------
# Q2a — traffic: a fresh partial refresh must beat the durable last-good row
# ---------------------------------------------------------------------------

def _flow_item(checkpoint_id: str) -> dict:
    checkpoint = next(cp for cp in TomTomAdapter.CHECKPOINTS if cp["id"] == checkpoint_id)
    return {
        "flowSegmentData": {"currentSpeed": 30, "freeFlowSpeed": 80},
        "_checkpoint_name": checkpoint["name"],
        "_checkpoint_id": checkpoint["id"],
        "_lat": checkpoint["lat"],
        "_lon": checkpoint["lon"],
    }


def _traffic_record(*, fetched_at: datetime, checkpoints=("belawan_port_gate", "belmera_tanjung_mulia")) -> dict:
    return {
        "source": "tomtom",
        "raw": {
            "flow": [_flow_item(cp) for cp in checkpoints],
            "incidents": [],
            "status": "degraded",
            "degraded_reason": "1/20 flow requests failed; partial_flow_coverage:19/20",
            "expected_checkpoint_count": len(TomTomAdapter.CHECKPOINTS),
            "observed_checkpoint_count": len(checkpoints),
        },
        "events": [],
        "fetched_at": _iso(fetched_at),
        "observed_at": _iso(fetched_at),
        "valid_until": _iso(fetched_at + timedelta(seconds=operational_cache.SOURCE_TTL_SECONDS["tomtom"])),
        "status": "partial",
        "error": "1/20 flow requests failed; partial_flow_coverage:19/20",
    }


def test_corridor_context_maps_live_checkpoint_ids(isolated_sections):
    now = datetime.now(timezone.utc)
    records = {
        "tomtom": _traffic_record(
            fetched_at=now,
            checkpoints=("belawan_port_gate", "belmera_tanjung_mulia", "banda_aceh_sigli"),
        )
    }

    sections = operational_cache._build_sections(records)

    context = sections["corridor_context"]
    assert context["status"] == "ok"
    assert context["data"]["traffic"]["status"] == "ok"
    assert [item["_checkpoint_name"] for item in context["data"]["traffic"]["data"]] == [
        "Belawan Port Gate",
        "Tol Belmera Tanjung Mulia",
    ]
    contexts = sections["corridor_contexts"]["data"]
    # The adapter's legacy Aceh corridor id is folded onto the canonical corridor.
    assert contexts["sumatra_aceh_malahayati"]["traffic"]["status"] == "ok"
    assert sections["corridor_contexts"]["status"] == "partial"


def test_traffic_section_is_not_frozen_at_the_durable_last_good_row(isolated_sections):
    now = datetime.now(timezone.utc)
    operational = operational_cache._build_sections({"tomtom": _traffic_record(fetched_at=now)})
    current = snapshots._entry_from_source(operational, None, "traffic_flow_segments")
    assert current["status"] == "degraded"  # partial coverage is honest, but data is fresh
    assert current["data"]["segments"]

    # The durable row the Nov 7 freeze lived in.
    previous = {
        "traffic_flow_segments": {
            "status": "stale",
            "data": {"segments": [{"checkpoint": "old"}]},
            "observed_at": "2026-11-07T01:22:17+00:00",
            "valid_until": "2026-11-07T01:32:17+00:00",
        }
    }

    merged = snapshots._merge_last_good("traffic_flow_segments", current, previous)

    assert merged["observed_at"] == current["observed_at"]
    assert merged["valid_until"] == current["valid_until"]
    assert merged["data"]["segments"][0]["checkpoint"] == "Belawan Port Gate"
    assert "retaining durable last-good" not in (merged.get("error") or "")


def test_corridor_context_is_not_frozen_at_the_durable_last_good_row(isolated_sections):
    now = datetime.now(timezone.utc)
    operational = operational_cache._build_sections({"tomtom": _traffic_record(fetched_at=now)})
    current = snapshots._entry_from_source(operational, None, "corridor_context")
    assert current["status"] == "ok"

    previous = {
        "corridor_context": {
            "status": "stale",
            "data": {"corridor_id": "sumatra_belawan_medan", "traffic": {"status": "unknown", "data": None}},
            "observed_at": "2026-11-07T02:05:23+00:00",
            "valid_until": "2026-11-07T02:15:23+00:00",
        }
    }

    merged = snapshots._merge_last_good("corridor_context", current, previous)

    assert merged["observed_at"] == current["observed_at"]
    assert merged["data"]["traffic"]["status"] == "ok"
    # The curated public payload keeps the corridor's traffic evidence.
    assert merged["data"]["traffic"]["data"]


def test_merge_last_good_still_retains_the_durable_row_when_nothing_is_fresh():
    current = {"status": "unavailable", "data": None, "error": "provider down"}
    previous = {
        "fire_hotspots": {
            "status": "ok",
            "data": {"hotspots": [{"lat": -2.0}]},
            "observed_at": "2026-11-04T08:00:00+00:00",
            "valid_until": "2026-11-04T11:00:00+00:00",
        }
    }

    merged = snapshots._merge_last_good("fire_hotspots", current, previous)

    assert merged["status"] == "stale"
    assert merged["observed_at"] == "2026-11-04T08:00:00+00:00"
    assert merged["valid_until"] == "2026-11-04T11:00:00+00:00"
    assert merged["error"] == "provider down"


# ---------------------------------------------------------------------------
# Never fabricate: a weather summary without evidence publishes null counts
# ---------------------------------------------------------------------------

async def _get_weather_summary(monkeypatch, section: dict) -> dict:
    from fastapi import FastAPI

    import httpx

    from app.routers import routing_router

    monkeypatch.setattr(routing_router, "read_public_operational_cache", lambda: {"weather_summary": section})
    monkeypatch.setattr(routing_router, "coalesce_background_refresh", lambda *args, **kwargs: None)

    app = FastAPI()
    app.include_router(routing_router.router, prefix="/api/v1")
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/v1/weather/summary")
    assert response.status_code == 200, response.text
    return response.json()


@pytest.mark.asyncio
async def test_weather_summary_without_evidence_never_invents_a_zone(monkeypatch):
    body = await _get_weather_summary(
        monkeypatch, {"status": "unknown", "data": None, "error": "No cached source data"}
    )

    for key in ("cuaca", "waspada"):
        assert body[key]["count"] is None
        assert body[key]["total"] is None
        assert body[key]["status"] == "unknown"
        assert body[key]["reason"] == "No cached source data"


@pytest.mark.asyncio
async def test_weather_summary_degraded_null_counts_are_not_rewritten_to_zero(monkeypatch):
    bucket = {
        "count": None, "total": None, "status": "degraded", "reason": "Sebagian sumber cuaca tidak dapat diverifikasi",
        "source": fusion.WEATHER_SUMMARY_SOURCE, "valid_until": None, "window_hours": 24,
    }
    body = await _get_weather_summary(
        monkeypatch,
        {"status": "degraded", "data": {"bbox": [94.0, -6.0, 108.0, 6.0], "cuaca": dict(bucket), "waspada": dict(bucket)}},
    )

    for key in ("cuaca", "waspada"):
        assert body[key]["count"] is None, "a null count must stay null, never become a verified 0"
        assert body[key]["status"] == "degraded"
