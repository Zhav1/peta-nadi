"""Phase 169 — weather retention + whole-Sumatra coverage contract.

Pins the two regressions this phase fixes:

* **Coverage.** Nothing is dropped for being far from ``_CORRIDOR_SPINE``. The
  spine is ordering only; a zone in the Bengkulu/Jambi interior (or anywhere
  inside the full 94,-6,108,6 bbox) still renders. The Open-Meteo grid carries
  at least 4 sample points per one of the 10 Sumatra provinces.
* **Retention.** ``MAX_WEATHER_FEATURES`` is a RENDER cap and publishes
  ``total`` (pre-cap) / ``count`` (returned) / ``capped``. On upstream failure
  the endpoint serves last-known-good polygons as ``status="stale"`` with the
  age in ``reason``; only a cold cache is ``degraded`` (count ``None``, never a
  bare 0).

The fusion path itself runs for real; only the two upstream adapters and the
Redis cache are faked, so these assertions exercise the production code path.
"""
import json
from datetime import datetime, timedelta, timezone

import httpx
import pytest
from fastapi import FastAPI

from app.adapters.open_meteo_adapter import SUMATRA_GRID, _grid_points
from app.routers import routing_router
from app.services import weather_fusion_service as fusion
from app.services.weather_fusion_service import (
    MAX_WEATHER_FEATURES,
    get_fused_spatial_weather,
)

SUMATRA_BBOX = [94.0, -6.0, 108.0, 6.0]

# Far from every _CORRIDOR_SPINE node/segment (>300 km): Bangka Belitung.
_FAR_ZONE = {"name": "Bangka Tengah (far from corridor)", "lat": -2.13, "lon": 106.10}
# Bengkulu/Jambi interior (inland, ~120 km east of the Jalinbar spine).
_INTERIOR_ZONE = {"name": "Bengkulu interior", "lat": -3.00, "lon": 102.00}
# Literal bbox sample from the phase brief (inside 94,-6,108,6).
_BBOX_SAMPLE = {"name": "bbox sample", "lat": -3.00, "lon": 100.50}

TEN_PROVINCES = {
    "Aceh",
    "Sumatera Utara",
    "Sumatera Barat",
    "Riau",
    "Jambi",
    "Bengkulu",
    "Sumatera Selatan",
    "Lampung",
    "Kepulauan Bangka Belitung",
    "Kepulauan Riau",
}


def _om_event(idx: int, severity: str, lat: float, lon: float) -> dict:
    """Open-Meteo shaped prediction inside the Sumatra bbox."""
    return {
        "event_type": "weather_prediction",
        "source": "open_meteo",
        "severity": severity,
        "lat": lat,
        "lon": lon,
        "title": f"Grid {severity} #{idx}",
        "region": f"grid-{idx}",
        "raw_payload": {
            "predictions": {
                "precipitation_mm_24h": 70.0,
                "flood_risk_pct": 88.0,
                "wind_speed_kmh": 22.0,
            }
        },
    }


def _spread_events(count: int, severity: str = "high") -> list:
    """``count`` qualifying zones spread over the full island."""
    return [
        _om_event(
            i,
            severity,
            lat=-5.5 + (i % 16) * 0.7,
            lon=95.0 + (i % 15) * 0.85,
        )
        for i in range(count)
    ]


class _FakeBMKG:
    def __init__(self, events=None, error: Exception | None = None):
        self._events = events or []
        self._error = error

    async def fetch(self):
        return {}

    async def parse(self, raw):
        if self._error:
            raise self._error
        return list(self._events)


class _FakeOpenMeteo:
    def __init__(self, events=None, error: Exception | None = None):
        self._events = events or []
        self._error = error

    async def fetch(self):
        return {}

    async def parse(self, raw):
        if self._error:
            raise self._error
        return list(self._events)


@pytest.fixture
def weather_env(monkeypatch):
    """Isolate the endpoints from Redis and let each test choose the upstream."""
    store: dict[str, str] = {}

    def fake_get(key):
        return store.get(key)

    def fake_set(key, value, ex=None):
        store[key] = value

    monkeypatch.setattr(routing_router, "cache_get", fake_get)
    monkeypatch.setattr(routing_router, "cache_set", fake_set)

    def install(bmkg_events=None, om_events=None, bmkg_error=None, om_error=None):
        monkeypatch.setattr(
            fusion, "BMKGAdapter", lambda: _FakeBMKG(bmkg_events, bmkg_error)
        )
        monkeypatch.setattr(
            fusion, "OpenMeteoAdapter", lambda: _FakeOpenMeteo(om_events, om_error)
        )

    return {"store": store, "install": install, "monkeypatch": monkeypatch}


async def _get_polygons(query: str = "") -> dict:
    app = FastAPI()
    app.include_router(routing_router.router, prefix="/api/v1")
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get(f"/api/v1/weather/spatial-polygons{query}")
    assert res.status_code == 200, res.text
    return res.json()


def _default_polygon_cache_key() -> str:
    sev, precip, flood = routing_router._effective_polygon_filters("high", 50.0, 80.0)
    return routing_router._polygon_cache_key(sev, precip, flood)


def _coords(payload: dict) -> list:
    coords = []
    for feature in payload.get("features") or []:
        props = feature.get("properties") or {}
        coords.append((round(float(props.get("lat")), 2), round(float(props.get("lon")), 2)))
    return coords


# ---------------------------------------------------------------------------
# 1. Corridor spine is ordering only — a far zone survives
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_zone_far_outside_corridor_spine_still_renders(weather_env):
    weather_env["install"](
        om_events=[_om_event(0, "high", _FAR_ZONE["lat"], _FAR_ZONE["lon"])]
    )

    payload = await get_fused_spatial_weather(min_severity="medium")

    assert len(payload["features"]) == 1
    props = payload["features"][0]["properties"]
    assert (round(float(props["lat"]), 2), round(float(props["lon"]), 2)) == (
        _FAR_ZONE["lat"],
        _FAR_ZONE["lon"],
    )
    # The corridor is still reported (ordering/provenance), just never a filter.
    assert props["dist_to_corridor_km"] > 100, "fixture must sit far from the spine"
    assert payload["meta"]["total"] == 1
    assert payload["meta"]["capped"] is False


# ---------------------------------------------------------------------------
# 2. MAX_WEATHER_FEATURES is a render cap, not a truth cap
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_thirty_zones_publish_pre_cap_total_and_capped_flag(weather_env):
    weather_env["install"](om_events=_spread_events(30))

    payload = await get_fused_spatial_weather(min_severity="high")

    meta = payload["meta"]
    assert meta["total"] == 30
    assert meta["count"] == MAX_WEATHER_FEATURES
    assert meta["capped"] is True
    assert len(payload["features"]) == MAX_WEATHER_FEATURES
    # Legacy metadata block carries the same additive numbers.
    assert payload["metadata"]["total"] == 30
    assert payload["metadata"]["count"] == MAX_WEATHER_FEATURES
    assert payload["metadata"]["capped"] is True
    assert payload["metadata"]["total_regions"] == MAX_WEATHER_FEATURES


# ---------------------------------------------------------------------------
# 3. Upstream failure with a cached payload -> stale + age, polygons kept
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_upstream_failure_with_cache_serves_stale_polygons(weather_env):
    stale_features = [
        {
            "type": "Feature",
            "geometry": {"type": "Polygon", "coordinates": [[[102.0, -3.0], [102.1, -3.0], [102.1, -3.1], [102.0, -3.0]]]},
            "properties": {"lat": -3.0, "lon": 102.0, "severity": "high"},
        }
    ]
    older = (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()
    cached_payload = {
        "type": "FeatureCollection",
        "features": stale_features,
        "metadata": {
            "status": "ok",
            "reason": None,
            "total": 5,
            "count": 1,
            "capped": True,
            "updated_at": older,
            "validity_hours": 6,
            "stale_ceiling_hours": 24,
            "max_features": MAX_WEATHER_FEATURES,
        },
    }
    weather_env["store"][_default_polygon_cache_key()] = json.dumps(
        {"payload": cached_payload, "fetched_at": older}
    )
    weather_env["install"](
        bmkg_error=RuntimeError("bmkg unreachable"),
        om_error=RuntimeError("open-meteo unreachable"),
    )

    payload = await _get_polygons()

    assert payload["meta"]["status"] == "stale"
    assert len(payload["features"]) == 1, "last-known-good polygons must survive"
    reason = payload["meta"]["reason"] or ""
    assert "jam" in reason, f"stale reason must carry the age, got {reason!r}"
    assert "open-meteo unreachable" in reason
    # Pre-cap truth is preserved, not recomputed from the retained slice.
    assert payload["meta"]["total"] == 5
    assert payload["meta"]["count"] == 1
    assert payload["meta"]["capped"] is True


# ---------------------------------------------------------------------------
# 4. Upstream failure with nothing cached -> degraded, count None
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_upstream_failure_without_cache_is_degraded_not_zero(weather_env):
    weather_env["install"](
        bmkg_error=RuntimeError("bmkg unreachable"),
        om_error=RuntimeError("open-meteo unreachable"),
    )

    payload = await _get_polygons()

    assert payload["meta"]["status"] == "degraded"
    assert payload["meta"]["count"] is None
    assert payload["meta"]["total"] is None
    assert payload["features"] == []
    assert payload["meta"]["reason"]


# ---------------------------------------------------------------------------
# 5. Whole-island bbox coverage (no corridor, no land narrowing)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_whole_island_bbox_zones_are_returned(weather_env):
    weather_env["install"](
        om_events=[
            _om_event(0, "high", _INTERIOR_ZONE["lat"], _INTERIOR_ZONE["lon"]),
            _om_event(1, "high", _BBOX_SAMPLE["lat"], _BBOX_SAMPLE["lon"]),
        ]
    )

    payload = await _get_polygons()
    coords = _coords(payload)

    assert (-3.0, 102.0) in coords, "Bengkulu/Jambi interior must render"
    assert (-3.0, 100.5) in coords, "every point inside 94,-6,108,6 must render"
    assert payload["metadata"]["bbox"] == SUMATRA_BBOX
    for lat, lon in coords:
        assert SUMATRA_BBOX[1] <= lat <= SUMATRA_BBOX[3]
        assert SUMATRA_BBOX[0] <= lon <= SUMATRA_BBOX[2]


# ---------------------------------------------------------------------------
# 6. Grid coverage guard — 10 provinces, >= 4 points each
# ---------------------------------------------------------------------------

def test_open_meteo_grid_covers_every_sumatra_province():
    points = _grid_points()
    assert points == SUMATRA_GRID, "no point may be filtered out after fetch"

    by_province: dict = {}
    for point in points:
        assert SUMATRA_BBOX[0] <= point["lon"] <= SUMATRA_BBOX[2]
        assert SUMATRA_BBOX[1] <= point["lat"] <= SUMATRA_BBOX[3]
        by_province.setdefault(point["province"], []).append(point)

    assert set(by_province) == TEN_PROVINCES
    for province, province_points in by_province.items():
        assert len(province_points) >= 4, f"{province} has only {len(province_points)} grid points"

    # 58 points => exactly one bulk HTTP call per poll (all locations in one GET).
    assert len(points) == 58
