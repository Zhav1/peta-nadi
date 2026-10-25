"""BNPB CKAN Action API tier tests (Tier-0 datastore rows -> aggregate events).

- Aceh prov sample row -> flood event with correct lat/lon + dedup key.
- Kab-level row -> event with kab radius (10 km).
- Non-Sumatra / missing-geo / all-zero rows are dropped.
- Honest unavailable when the network is down (fetch -> unavailable, parse -> []).
"""
import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.adapters import bnpb_adapter
from app.adapters.bnpb_adapter import BNPBAdapter

ACEH_ROW = {
    "_id": 1,
    "Provinsi": "ACEH",
    "Latitude": 4.6951,
    "Longitude": 96.9103,
    "BANJIR": 48,
    "KARHUTLA": 94,
    "TANAH LONGSOR": 0,
    "GEMPABUMI": 0,
    "_ckan_resource_id": "df39e8c3-117e-40fa-b518-ff1037743955",
    "_ckan_level": "prov",
    "_ckan_dataset": "kompilasi-data-kejadian-dan-dampak-bencana-2025",
    "_ckan_updated_at": "2026-07-01T00:00:00",
}

KAB_ROW = {
    "_id": 7,
    "Provinsi": "SUMATERA UTARA",
    "Kabupaten": "DELI SERDANG",
    "Latitude": 3.6,
    "Longitude": 98.7,
    "BANJIR": 5,
    "KEBAKARAN": 0,
    "_ckan_resource_id": "a4daec53-kab-bootstrap",
    "_ckan_level": "kab",
    "_ckan_dataset": "data-bencana-indonesia",
    "_ckan_updated_at": "2024-12-31T00:00:00",
}


def _fresh_redis():
    mock_redis = MagicMock()
    mock_redis.get.return_value = None  # no dedup hit
    return mock_redis


@pytest.mark.asyncio
@patch("app.adapters.bnpb_adapter.get_redis")
async def test_ckan_mapper_aceh_row_yields_flood_event(mock_get_redis):
    mock_get_redis.return_value = _fresh_redis()
    adapter = BNPBAdapter()
    events = await adapter.parse({"status": "ckan", "items": [dict(ACEH_ROW)]})

    floods = [e for e in events if e["event_type"] == "flood"]
    assert len(floods) == 1
    flood = floods[0]
    assert flood["source"] == "bnpb"
    assert flood["lat"] == "4.6951"
    assert flood["lon"] == "96.9103"
    assert flood["severity"] == "low"  # aggregates are never live alerts
    assert flood["status"] == "stats"
    assert flood["radius_km"] == 25.0  # province-level radius
    assert flood["dedup_key"] == (
        "bnpb:ckan:df39e8c3-117e-40fa-b518-ff1037743955:1:flood"
    )
    assert "ACEH" in flood["title"]
    # KARHUTLA cell maps to wildfire on the same row
    wildfires = [e for e in events if e["event_type"] == "wildfire"]
    assert len(wildfires) == 1


@pytest.mark.asyncio
@patch("app.adapters.bnpb_adapter.get_redis")
async def test_ckan_mapper_kab_row_uses_kab_radius(mock_get_redis):
    mock_get_redis.return_value = _fresh_redis()
    adapter = BNPBAdapter()
    events = await adapter.parse({"status": "ckan", "items": [dict(KAB_ROW)]})

    assert len(events) == 1
    event = events[0]
    assert event["event_type"] == "flood"
    assert event["radius_km"] == 10.0  # kabupaten/kota-level radius
    assert event["dedup_key"].startswith("bnpb:ckan:a4daec53-kab-bootstrap:7:")
    assert "DELI SERDANG" in event["title"] or "SUMATERA UTARA" in event["title"]


@pytest.mark.asyncio
@patch("app.adapters.bnpb_adapter.get_redis")
async def test_ckan_mapper_drops_non_sumatra_no_geo_zero_rows(mock_get_redis):
    mock_get_redis.return_value = _fresh_redis()
    adapter = BNPBAdapter()
    jakarta_row = {
        "_id": 2, "Provinsi": "DKI JAKARTA", "Latitude": -6.2,
        "Longitude": 106.8, "BANJIR": 99,
        "_ckan_resource_id": "r", "_ckan_level": "prov",
    }
    no_geo_row = {"_id": 3, "Provinsi": "ACEH", "BANJIR": 10,
                  "_ckan_resource_id": "r", "_ckan_level": "prov"}
    zero_row = {"_id": 4, "Provinsi": "ACEH", "Latitude": 4.7,
                "Longitude": 96.9, "BANJIR": 0,
                "_ckan_resource_id": "r", "_ckan_level": "prov"}
    events = await adapter.parse(
        {"status": "ckan", "items": [jakarta_row, no_geo_row, zero_row]}
    )
    assert events == []


@pytest.mark.asyncio
async def test_ckan_fetch_unavailable_when_network_down():
    """All tiers unreachable -> honest unavailable (never fabricated)."""
    adapter = BNPBAdapter()
    with patch("app.adapters.bnpb_adapter.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.get.side_effect = RuntimeError("network down")
        mock_client.head.side_effect = RuntimeError("network down")
        mock_client_cls.return_value.__aenter__.return_value = mock_client
        raw = await adapter.fetch()
    assert raw["status"] == "unavailable"
    assert raw["items"] == []
    with patch("app.adapters.bnpb_adapter.get_redis") as mock_get_redis:
        mock_get_redis.return_value = _fresh_redis()
        assert await adapter.parse(raw) == []


@pytest.mark.asyncio
async def test_ckan_fetch_paging_uses_limit_offset(monkeypatch):
    """package_show resolves resources dynamically; datastore_search pages."""
    monkeypatch.setattr(bnpb_adapter, "CKAN_POLITE_DELAY_SECONDS", 0)
    adapter = BNPBAdapter()

    package_payload = {
        "success": True,
        "result": {
            "metadata_modified": "2026-07-01T00:00:00",
            "resources": [
                {"id": "res-prov-1", "name": "prov-2025-by-hazard",
                 "datastore_active": True, "last_modified": "2026-07-01T00:00:00"},
                {"id": "res-dead", "name": "laporan.pdf", "datastore_active": False},
            ],
        },
    }
    search_payload = {
        "success": True,
        "result": {"total": 1, "records": [dict(ACEH_ROW)]},
    }

    def fake_json(payload):
        resp = MagicMock()
        resp.status_code = 200
        resp.json.return_value = payload
        return resp

    calls = []

    async def fake_get(url, params=None, **kwargs):
        calls.append((url, dict(params or {})))
        if url.endswith("/package_show"):
            return fake_json(package_payload)
        if url.endswith("/datastore_search"):
            assert params["limit"] == 500
            assert params["offset"] == 0
            assert params["resource_id"] == "res-prov-1"
            return fake_json(search_payload)
        raise AssertionError(f"unexpected CKAN url {url}")

    mock_client = AsyncMock()
    mock_client.get.side_effect = fake_get
    with patch("app.adapters.bnpb_adapter.httpx.AsyncClient") as mock_client_cls:
        mock_client_cls.return_value.__aenter__.return_value = mock_client
        raw = await adapter.fetch()

    assert raw["status"] == "ckan"
    assert len(raw["items"]) == 1
    assert raw["items"][0]["_ckan_resource_id"] == "res-prov-1"
    assert raw["items"][0]["_ckan_level"] == "prov"
    # Inactive (non-datastore) resources are never queried
    assert all(c[1].get("resource_id") != "res-dead" for c in calls
               if c[0].endswith("/datastore_search"))


def test_bnpb_events_router_serves_cached_ckan_events():
    """GET /api/v1/bnpb/events returns 200 ok with mocked CKAN sample cached."""
    from fastapi.testclient import TestClient

    from app.main import app

    cached = [{
        "source": "bnpb",
        "event_type": "flood",
        "severity": "low",
        "status": "stats",
        "lat": "4.6951",
        "lon": "96.9103",
        "radius_km": 25.0,
        "title": "[BNPB aggregate stats] flood provinsi ACEH: 48 kejadian",
        "ts": "2026-07-01T00:00:00",
        "dedup_key": "bnpb:ckan:df39e8c3-117e-40fa-b518-ff1037743955:1:flood",
    }]
    mock_redis = MagicMock()
    mock_redis.get.return_value = json.dumps(cached)
    with patch("app.services.redis_client.get_redis", return_value=mock_redis):
        client = TestClient(app)
        res = client.get("/api/v1/bnpb/events")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert body["total"] == 1
    assert body["events"][0]["event_type"] == "flood"
    assert set(body) >= {"events", "total", "status", "source", "updated_at"}
