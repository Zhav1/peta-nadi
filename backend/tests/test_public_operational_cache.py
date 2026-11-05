import json
from datetime import datetime, timedelta, timezone

import httpx
import pytest
from fastapi import FastAPI

from app.adapters import open_meteo_adapter, tomtom_adapter
from app.routers import corridor_router, routing_router
from app.services import public_operational_cache as operational_cache


@pytest.fixture
def cache_store(monkeypatch):
    store = {}
    monkeypatch.setattr(operational_cache, "cache_get", lambda key: store.get(key))
    monkeypatch.setattr(operational_cache, "cache_set", lambda key, value, ex=None: store.__setitem__(key, value))
    monkeypatch.setattr(operational_cache, "_read_durable", lambda key: None)
    monkeypatch.setattr(operational_cache, "_write_durable", lambda key, payload, source: True)
    return store


async def _allow_budget(source, *, units=1, request_id=None):
    return True


class _UnavailableResponse:
    status_code = 503

    def raise_for_status(self):
        raise httpx.HTTPStatusError("503 Service Unavailable", request=None, response=None)


class _UnavailableClient:
    def __init__(self, *args, **kwargs):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return None

    async def get(self, *args, **kwargs):
        return _UnavailableResponse()


@pytest.mark.asyncio
async def test_open_meteo_503_is_degraded_not_synthetic_zones(cache_store, monkeypatch):
    monkeypatch.setattr(open_meteo_adapter, "settings", type("Settings", (), {"demo_offline": False})())
    monkeypatch.setattr(open_meteo_adapter.httpx, "AsyncClient", _UnavailableClient)

    sections = await operational_cache.refresh_public_operational_cache(
        source="open_meteo", reserve_provider_budget=_allow_budget
    )

    assert sections["weather_spatial_polygons"]["status"] == "degraded"
    assert sections["weather_spatial_polygons"]["data"]["features"] == []
    assert sections["weather_spatial_polygons"]["data"]["meta"]["total"] is None
    assert sections["weather_summary"]["data"]["cuaca"]["count"] is None
    assert sections["weather_spatial_polygons"]["data"]["features"] == []


@pytest.mark.asyncio
async def test_all_operational_gets_are_cache_only(cache_store, monkeypatch):
    now = datetime.now(timezone.utc)
    unknown = {"status": "unknown", "data": None, "cached": True}
    polygons = {"type": "FeatureCollection", "features": [], "metadata": {"status": "empty", "total": 0, "count": 0, "capped": False}, "meta": {"status": "empty", "total": 0, "count": 0, "capped": False}}
    cache_store[operational_cache.CACHE_KEY] = json.dumps({
        "sections": {
            "weather_summary": {"status": "empty", "data": {"bbox": [94, -6, 108, 6], "generated_at": now.isoformat(), "cuaca": {"count": 0, "total": 0, "status": "empty"}, "waspada": {"count": 0, "total": 0, "status": "empty"}}, "valid_until": (now + timedelta(hours=1)).isoformat()},
            "weather_spatial_polygons": {"status": "empty", "data": polygons, "valid_until": (now + timedelta(hours=1)).isoformat()},
            "weather_advisory_polygons": {"status": "empty", "data": polygons, "valid_until": (now + timedelta(hours=1)).isoformat()},
            "fire_hotspots": {"status": "empty", "data": {"hotspots": [], "count": 0, "total": 0, "status": "empty"}, "valid_until": (now + timedelta(hours=1)).isoformat()},
            "traffic_flow_segments": {"status": "degraded", "data": {"segments": [], "incidents": [], "total_segments": 0, "status": "degraded"}, "valid_until": (now + timedelta(hours=1)).isoformat()},
            "corridor_context": unknown,
            "corridor_contexts": {"status": "partial", "data": {}, "valid_until": (now + timedelta(hours=1)).isoformat()},
        }
    })

    async def forbidden(*args, **kwargs):
        raise AssertionError("provider request from a read route")

    monkeypatch.setattr(open_meteo_adapter.OpenMeteoAdapter, "fetch", forbidden)
    monkeypatch.setattr(tomtom_adapter.TomTomAdapter, "fetch", forbidden)
    monkeypatch.setattr(routing_router, "read_public_operational_cache", operational_cache.read_public_operational_cache)

    app = FastAPI()
    app.include_router(routing_router.router, prefix="/api/v1")
    app.include_router(corridor_router.router, prefix="/api/v1")
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        for path in (
            "/api/v1/weather/summary",
            "/api/v1/weather/spatial-polygons",
            "/api/v1/fire/hotspots",
            "/api/v1/traffic/flow-segments",
            "/api/v1/corridor/context?corridor_id=sumatra_belawan_medan",
        ):
            response = await client.get(path)
            assert response.status_code == 200, (path, response.text)
        proof = await routing_router._fetch_proof_context()
        assert proof["hazard_evidence_coverage"] == "unknown"


@pytest.mark.asyncio
async def test_expired_readmodel_is_stale_and_last_good_is_retained(cache_store):
    expired = (datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat()
    feature = {"type": "Feature", "geometry": {"type": "Polygon", "coordinates": []}, "properties": {"geometry_role": "risk_zone"}}
    cached_payload = {"type": "FeatureCollection", "features": [feature], "metadata": {"status": "ok", "total": 1, "count": 1, "capped": False}, "meta": {"status": "ok", "total": 1, "count": 1, "capped": False}}
    sections = {name: {"status": "unknown", "data": None} for name in operational_cache.SECTION_NAMES}
    sections["weather_spatial_polygons"] = {"status": "ok", "data": cached_payload, "valid_until": expired}
    cache_store[operational_cache.CACHE_KEY] = json.dumps({"sections": sections})

    result = operational_cache.read_public_operational_cache()
    assert result["weather_spatial_polygons"]["status"] == "stale"
    assert result["weather_spatial_polygons"]["data"]["features"] == [feature]


class _FlowResponse:
    def __init__(self, status, body=None):
        self.status_code = status
        self._body = body or {}

    def json(self):
        return self._body


class _PartialTomTomClient:
    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return None

    async def get(self, url, params=None):
        if params.get("point", "").startswith("3.8"):
            return _FlowResponse(200, {"flowSegmentData": {
                "currentSpeed": 20, "freeFlowSpeed": 60,
                "coordinates": {"type": "LineString", "coordinate": [
                    {"latitude": 3.8, "longitude": 98.6},
                    {"latitude": 3.81, "longitude": 98.61},
                ]},
            }})
        return _FlowResponse(503)


@pytest.mark.asyncio
async def test_tomtom_partial_flow_keeps_line_geometry_and_coverage(cache_store, monkeypatch):
    monkeypatch.setattr(tomtom_adapter.httpx, "AsyncClient", lambda *args, **kwargs: _PartialTomTomClient())
    monkeypatch.setattr(tomtom_adapter.TomTomAdapter, "CHECKPOINTS", [
        {"name": "Belawan Toll Gate", "lat": 3.8, "lon": 98.6},
        {"name": "Tebing Tinggi Toll Gate", "lat": 3.3, "lon": 99.1},
    ])
    monkeypatch.setattr(tomtom_adapter, "tomtom_api_keys", lambda: ["test-key"])
    monkeypatch.setattr(tomtom_adapter.TomTomAdapter, "is_credit_exhausted", classmethod(lambda cls: False))

    sections = await operational_cache.refresh_public_operational_cache(
        source="tomtom", reserve_provider_budget=_allow_budget
    )
    traffic = sections["traffic_flow_segments"]
    data = traffic["data"]
    assert traffic["status"] == "partial"
    assert data["expected_checkpoint_count"] == 2
    assert data["observed_checkpoint_count"] == 1
    assert data["segments"][0]["geometry"] == {
        "type": "LineString", "coordinates": [[98.6, 3.8], [98.61, 3.81]]
    }
