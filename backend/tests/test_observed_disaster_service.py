from __future__ import annotations

import asyncio
import json
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.adapters.bmkg_cap_adapter import BMKGCAPAdapter, parse_cap_document, parse_cap_feed
from app.adapters.petabencana_adapter import PetaBencanaAdapter, parse_reports
from app.services import observed_disaster_service as service

NOW = datetime(2026, 11, 5, 12, 0, tzinfo=timezone.utc)

CAP_ACTIVE = """
<alert xmlns="urn:oasis:names:tc:emergency:cap:1.2">
  <identifier>warning-active-1</identifier><info>
    <event>Hujan Lebat</event><effective>2026-11-05T11:00:00Z</effective>
    <expires>2026-11-05T13:00:00Z</expires><senderName>BMKG</senderName>
    <headline>Peringatan dini cuaca Sumatera Utara</headline>
    <description>Hujan lebat pada beberapa kecamatan.</description>
    <web>https://www.bmkg.go.id/</web>
    <area><areaDesc>Sumatera Utara</areaDesc>
      <polygon>3.5,98.5 3.6,98.5 3.6,98.6 3.5,98.5</polygon>
    </area>
  </info>
</alert>
"""
CAP_EXPIRED = CAP_ACTIVE.replace("2026-11-05T13:00:00Z", "2026-11-05T11:59:00Z")
CAP_NO_EXPIRES = CAP_ACTIVE.replace("<expires>2026-11-05T13:00:00Z</expires>", "")


def test_cap_parser_keeps_current_source_polygon_as_warning_not_observed_flood():
    events = parse_cap_document(CAP_ACTIVE, now=NOW)
    assert len(events) == 1
    warning = events[0]
    assert warning["source"] == "bmkg_cap"
    assert warning["status"] == "active_warning"
    assert warning["event"] == "Hujan Lebat"
    assert warning["province"] == "Sumatera Utara"
    assert warning["geometry_role"] == "forecast_warning_area"
    assert warning["affected_area"]["type"] == "Polygon"
    assert "radius_km" not in warning
    assert warning["status"] != "observed_flood"
    assert parse_cap_document(CAP_EXPIRED, now=NOW) == []
    assert parse_cap_document(CAP_NO_EXPIRES, now=NOW) == []


def test_cap_rss_parser_accepts_only_bmkg_alert_details_for_mainland_provinces():
    rss = """<rss><channel>
      <item><title>Sumatera Utara</title>
        <link>https://www.bmkg.go.id/alerts/nowcast/sumut_alert.xml</link></item>
      <item><title>DKI Jakarta</title>
        <link>https://www.bmkg.go.id/alerts/nowcast/jakarta_alert.xml</link></item>
      <item><title>Aceh</title><link>https://example.org/alerts/nowcast/aceh.xml</link></item>
    </channel></rss>"""
    assert parse_cap_feed(rss) == [{
        "url": "https://www.bmkg.go.id/alerts/nowcast/sumut_alert.xml",
        "title": "Sumatera Utara",
        "province": "Sumatera Utara",
    }]


def test_petabencana_parser_requires_fresh_tagged_source_points_and_keeps_reports_unverified():
    payload = {
        "statusCode": 200,
        "result": {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "properties": {
                        "pkey": "p-1", "created_at": "2026-11-05T11:40:00Z",
                        "disaster_type": "flood", "status": "confirmed",
                        "title": "Warga melaporkan genangan", "text": "Laporan warga",
                        "tags": {"instance_region_code": "ID-SU"},
                    },
                    "geometry": {"type": "Point", "coordinates": [98.67, 3.59]},
                },
                {
                    "type": "Feature",
                    "properties": {
                        "pkey": "stale", "created_at": "2026-11-05T09:00:00Z",
                        "disaster_type": "flood", "tags": {"instance_region_code": "ID-SU"},
                    },
                    "geometry": {"type": "Point", "coordinates": [98.7, 3.6]},
                },
                {
                    "type": "Feature",
                    "properties": {
                        "pkey": "missing-date", "disaster_type": "flood",
                        "tags": {"instance_region_code": "ID-SU"},
                    },
                    "geometry": {"type": "Point", "coordinates": [98.7, 3.6]},
                },
                {
                    "type": "Feature",
                    "properties": {
                        "pkey": "outside-scope", "created_at": "2026-11-05T11:45:00Z",
                        "disaster_type": "flood", "tags": {"instance_region_code": "ID-JK"},
                    },
                    "geometry": {"type": "Point", "coordinates": [106.8, -6.2]},
                },
            ],
        },
    }
    reports = parse_reports(payload, now=NOW)
    assert len(reports) == 1
    report = reports[0]
    assert report["province"] == "Sumatera Utara"
    assert report["event_type"] == "flood"
    assert report["verification_status"] == "unverified_crowdsourced_report"
    assert report["geometry_role"] == "source_report_point"
    assert (report["lat"], report["lon"]) == (3.59, 98.67)
    assert "radius_km" not in report


def test_petabencana_parser_applies_topojson_point_transform():
    payload = {
        "statusCode": 200,
        "result": {
            "type": "Topology",
            "transform": {"scale": [0.1, 0.1], "translate": [98.0, 3.0]},
            "objects": {"output": {"geometries": [{
                "type": "Point",
                "coordinates": [6.7, 5.9],
                "properties": {
                    "pkey": "topo-1", "created_at": "2026-11-05T11:40:00Z",
                    "disaster_type": "earthquake", "tags": {"instance_region_code": "ID-SU"},
                },
            }] }},
        },
    }
    reports = parse_reports(payload, now=NOW)
    assert len(reports) == 1
    assert reports[0]["lon"] == pytest.approx(98.67)
    assert reports[0]["lat"] == pytest.approx(3.59)


@pytest.mark.asyncio
async def test_provider_adapters_reserve_budget_before_mock_http_requests():
    callback = AsyncMock(return_value=True)
    feed_response = MagicMock(status_code=200, text="<rss><channel/></rss>")
    feed_response.raise_for_status = MagicMock()
    async_client = MagicMock()
    async_client.__aenter__ = AsyncMock(return_value=async_client)
    async_client.__aexit__ = AsyncMock(return_value=None)
    async_client.get = AsyncMock(return_value=feed_response)
    with patch("app.adapters.bmkg_cap_adapter.httpx.AsyncClient", return_value=async_client):
        result = await BMKGCAPAdapter(callback).fetch("req-1")
    assert result == {"status": "ok", "warnings": []}
    callback.assert_awaited_once()
    assert callback.await_args.args[0] == "bmkg_cap"
    assert callback.await_args.kwargs["units"] == 1

    petabencana_payload = {"statusCode": 200, "result": {"type": "FeatureCollection", "features": []}}
    peta_response = MagicMock(status_code=200)
    peta_response.raise_for_status = MagicMock()
    peta_response.json.return_value = petabencana_payload
    async_client.get = AsyncMock(return_value=peta_response)
    callback.reset_mock()
    with patch("app.adapters.petabencana_adapter.httpx.AsyncClient", return_value=async_client):
        result = await PetaBencanaAdapter(callback).fetch("req-2")
    assert result == {"status": "ok", "reports": []}
    callback.assert_awaited_once()
    assert async_client.get.await_args.kwargs["params"] == {"timeperiod": 3600, "geoformat": "geojson"}
    assert async_client.headers["User-Agent"].startswith("PreHub non-commercial") if hasattr(async_client, "headers") else True


def _memory_cache(monkeypatch):
    cache = {}
    monkeypatch.setattr(service, "_cache_read", lambda key: cache.get(key))
    monkeypatch.setattr(service, "_cache_write", lambda key, value: cache.__setitem__(key, value))
    return cache


@pytest.mark.asyncio
async def test_failed_refresh_preserves_lastgood_and_marks_stale(monkeypatch):
    cache = _memory_cache(monkeypatch)
    source_key = service.OBSERVED_SOURCE_KEY.format(source="bmkg_cap")
    old_item = {"id": "old-warning", "status": "active_warning"}
    cache[source_key] = {
        "source": "bmkg_cap", "status": "ok", "last_success_at": "2026-11-05T10:00:00Z",
        "last_success_status": "ok", "items": [old_item], "item_count": 1, "stale": False,
    }
    monkeypatch.setenv("BMKG_CAP_ENABLED", "true")

    class FailedAdapter:
        def __init__(self, reserve):
            pass

        async def fetch(self, request_id):
            return {"status": "unavailable", "warnings": []}

    monkeypatch.setattr(service, "BMKGCAPAdapter", FailedAdapter)
    result = await service.refresh_observed_disasters("bmkg_cap", lambda *args, **kwargs: True)
    assert result["status"] == "degraded"
    assert result["stale"] is True
    assert result["items"] == [old_item]
    assert result["last_success_at"] == "2026-11-05T10:00:00Z"


@pytest.mark.asyncio
async def test_healthy_empty_petabencana_refresh_clears_lastgood(monkeypatch):
    cache = _memory_cache(monkeypatch)
    source_key = service.OBSERVED_SOURCE_KEY.format(source="petabencana")
    cache[source_key] = {
        "source": "petabencana", "status": "ok", "last_success_at": "before",
        "last_success_status": "ok", "items": [{"id": "old-report"}], "item_count": 1,
    }
    monkeypatch.setenv("PETABENCANA_NONCOMMERCIAL_ENABLED", "true")

    class EmptyAdapter:
        def __init__(self, reserve):
            pass

        async def fetch(self, request_id):
            return {"status": "ok", "reports": []}

    monkeypatch.setattr(service, "PetaBencanaAdapter", EmptyAdapter)
    result = await service.refresh_observed_disasters("petabencana", lambda *args, **kwargs: True)
    assert result["status"] == "ok"
    assert result["stale"] is False
    assert result["items"] == []
    assert result["item_count"] == 0


@pytest.mark.asyncio
async def test_healthy_empty_bnpb_refresh_clears_lastgood(monkeypatch):
    cache = _memory_cache(monkeypatch)
    source_key = service.OBSERVED_SOURCE_KEY.format(source="bnpb")
    cache[source_key] = {
        "source": "bnpb", "status": "ok", "last_success_at": "before",
        "last_success_status": "ckan", "items": [{"id": "old-event"}], "item_count": 1,
    }
    monkeypatch.setenv("BNPB_OBSERVED_ENABLED", "true")

    class EmptyAdapter:
        def __init__(self, reserve):
            pass

        async def fetch(self):
            return {"status": "ckan", "items": []}

        async def parse(self, raw):
            return []

    monkeypatch.setattr(service, "BNPBAdapter", EmptyAdapter)
    result = await service.refresh_observed_disasters("bnpb", lambda *args, **kwargs: True)
    assert result["status"] == "ok"
    assert result["stale"] is False
    assert result["last_success_status"] == "ckan"
    assert result["items"] == []
    assert result["item_count"] == 0


def test_observed_disaster_read_uses_only_shared_cache(monkeypatch):
    snapshot = {
        "status": "ok", "disaster_reports": [{"id": "cached"}],
        "official_warnings": [], "sources": {},
    }
    monkeypatch.setattr(service, "_cache_read", lambda key: snapshot if key == service.OBSERVED_SNAPSHOT_KEY else None)
    monkeypatch.setattr(service, "BMKGCAPAdapter", MagicMock(side_effect=AssertionError("read must not fetch")))
    monkeypatch.setattr(service, "PetaBencanaAdapter", MagicMock(side_effect=AssertionError("read must not fetch")))
    monkeypatch.setattr(service, "BNPBAdapter", MagicMock(side_effect=AssertionError("read must not fetch")))
    assert service.read_observed_disasters() == snapshot


def test_bnpb_router_distinguishes_healthy_empty_from_old_unavailable_cache():
    from app.routers.bnpb_router import get_bnpb_events

    envelope = {
        "status": "ok", "stale": False, "items": [], "item_count": 0,
        "last_success_at": "2026-11-05T12:00:00Z",
    }

    def cache_get(key):
        if key == "lrip:state:observed_disasters:source:bnpb:v1":
            return json.dumps(envelope)
        if key == "lrip:state:source:bnpb":
            return json.dumps([{"id": "old"}])
        return None

    with patch("app.services.redis_client.cache_get", side_effect=cache_get):
        result = asyncio.run(get_bnpb_events())
    assert result["status"] == "ok"
    assert result["events"] == []
    assert result["total"] == 0
    assert result["stale"] is False
    assert result["updated_at"] == "2026-11-05T12:00:00Z"
