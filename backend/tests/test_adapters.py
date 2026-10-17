import pytest
import json
import io
import asyncio
from datetime import datetime, timezone
from unittest.mock import MagicMock, AsyncMock, patch

from app.adapters.bmkg_adapter import BMKGAdapter
from app.adapters.tomtom_adapter import TomTomAdapter
from app.adapters.aisstream_adapter import AISstreamAdapter
from app.adapters.nasa_firms_adapter import NASAFIRMSAdapter
from app.adapters.open_meteo_adapter import OpenMeteoAdapter

# ==============================================================================
# BMKG Adapter Tests
# ==============================================================================

@pytest.mark.asyncio
@patch("app.adapters.bmkg_adapter.get_redis")
async def test_bmkg_parse_earthquake(mock_get_redis):
    # Setup mocks
    mock_redis = MagicMock()
    mock_redis.get.return_value = None  # No dedup hit
    mock_get_redis.return_value = mock_redis

    adapter = BMKGAdapter()
    
    # Mock autogempa.json response
    mock_raw_eq = {
        "Infogempa": {
            "gempa": {
                "Tanggal": "06 Jul 2026",
                "Jam": "12:00:00 WIB",
                "Coordinates": "3.80,98.69",
                "Magnitude": "5.4",
                "Kedalaman": "10 km",
                "Wilayah": "Sumatera Utara",
                "Potensi": "Tidak berpotensi tsunami"
            }
        }
    }
    
    raw_data = {"earthquake": mock_raw_eq, "weather": None}
    events = await adapter.parse(raw_data)
    
    assert len(events) == 1
    event = events[0]
    assert event["source"] == "bmkg"
    assert event["event_type"] == "earthquake"
    assert event["severity"] == "medium"  # Mag 5.4 is medium
    assert event["lat"] == "3.8"
    assert event["lon"] == "98.69"
    assert "Sumatera Utara" in event["title"]


@pytest.mark.asyncio
async def test_bmkg_severity_mapping():
    adapter = BMKGAdapter()
    
    # Mag < 5.0 should be ignored (returns empty)
    raw_low = {
        "earthquake": {
            "Infogempa": {
                "gempa": {
                    "Tanggal": "06 Jul 2026",
                    "Jam": "12:00:00 WIB",
                    "Coordinates": "3.80,98.69",
                    "Magnitude": "4.2",  # Under 5.0
                    "Wilayah": "Sumatera Utara"
                }
            }
        }
    }
    events_low = await adapter.parse(raw_low)
    assert len(events_low) == 0

    # Mag 6.5 -> High
    with patch("app.adapters.bmkg_adapter.get_redis") as mock_get_redis:
        mock_redis = MagicMock()
        mock_redis.get.return_value = None
        mock_get_redis.return_value = mock_redis
        
        raw_high = {
            "earthquake": {
                "Infogempa": {
                    "gempa": {
                        "Tanggal": "06 Jul 2026",
                        "Jam": "12:00:00 WIB",
                        "Coordinates": "3.80,98.69",
                        "Magnitude": "6.5",
                        "Wilayah": "Sumatera Utara"
                    }
                }
            }
        }
        events_high = await adapter.parse(raw_high)
        assert len(events_high) == 1
        assert events_high[0]["severity"] == "high"

        # Mag 7.2 -> Critical
        raw_critical = {
            "earthquake": {
                "Infogempa": {
                    "gempa": {
                        "Tanggal": "06 Jul 2026",
                        "Jam": "12:05:00 WIB",
                        "Coordinates": "3.80,98.69",
                        "Magnitude": "7.2",
                        "Wilayah": "Sumatera Utara"
                    }
                }
            }
        }
        events_crit = await adapter.parse(raw_critical)
        assert len(events_crit) == 1
        assert events_crit[0]["severity"] == "critical"


@pytest.mark.asyncio
@patch("app.adapters.bmkg_adapter.get_redis")
async def test_bmkg_dedup(mock_get_redis):
    # Simulating that the earthquake was already seen (Redis returns "1")
    mock_redis = MagicMock()
    mock_redis.get.return_value = "1"
    mock_get_redis.return_value = mock_redis

    adapter = BMKGAdapter()
    
    mock_raw_eq = {
        "Infogempa": {
            "gempa": {
                "Tanggal": "06 Jul 2026",
                "Jam": "12:00:00 WIB",
                "Coordinates": "3.80,98.69",
                "Magnitude": "5.4",
                "Wilayah": "Sumatera Utara"
            }
        }
    }
    
    raw_data = {"earthquake": mock_raw_eq, "weather": None}
    events = await adapter.parse(raw_data)
    
    # Dedup should filter this out, returning 0 events
    assert len(events) == 0


# ==============================================================================
# TomTom Adapter Tests
# ==============================================================================

@pytest.mark.asyncio
@patch("app.adapters.tomtom_adapter.get_redis")
async def test_tomtom_congestion_score(mock_get_redis):
    mock_redis = MagicMock()
    mock_redis.get.return_value = None
    mock_get_redis.return_value = mock_redis

    adapter = TomTomAdapter()
    
    # Mock segment data: Free flow = 90, Current = 12
    # Congestion score = 1 - (12/90) = 0.866 (exceeds 0.7 warning threshold)
    mock_flow = {
        "flow": [{
            "flowSegmentData": {
                "freeFlowSpeed": 90,
                "currentSpeed": 12,
                "currentTravelTime": 420,
                "freeFlowTravelTime": 58,
                "confidence": 0.95,
                "roadClosure": False
            },
            "_checkpoint_name": "Belawan Toll Gate",
            "_lat": 3.8012,
            "_lon": 98.6890
        }]
    }
    
    events = await adapter.parse(mock_flow)
    assert len(events) == 1
    assert events[0]["event_type"] == "congestion"
    assert events[0]["severity"] == "high"  # Score > 0.8 is high
    assert "Belawan Toll Gate" in events[0]["title"]


@pytest.mark.asyncio
@patch("app.adapters.tomtom_adapter.get_redis")
async def test_tomtom_road_closure(mock_get_redis):
    mock_redis = MagicMock()
    mock_redis.get.return_value = None
    mock_get_redis.return_value = mock_redis

    adapter = TomTomAdapter()
    
    # Mock segment data with roadClosure = True
    mock_flow = {
        "flow": [{
            "flowSegmentData": {
                "freeFlowSpeed": 90,
                "currentSpeed": 0,
                "currentTravelTime": 0,
                "freeFlowTravelTime": 58,
                "confidence": 0.95,
                "roadClosure": True
            },
            "_checkpoint_name": "Belawan Toll Gate",
            "_lat": 3.8012,
            "_lon": 98.6890
        }]
    }
    
    events = await adapter.parse(mock_flow)
    assert len(events) == 1
    assert events[0]["event_type"] == "road_closure"
    assert events[0]["severity"] == "critical"
    assert "ROAD CLOSED" in events[0]["title"]


@pytest.mark.asyncio
async def test_tomtom_no_alert_normal():
    adapter = TomTomAdapter()
    
    # Mock normal traffic: Free flow = 90, Current = 80
    # Congestion score = 1 - (80/90) = 0.11
    mock_flow = {
        "flow": [{
            "flowSegmentData": {
                "freeFlowSpeed": 90,
                "currentSpeed": 80,
                "currentTravelTime": 65,
                "freeFlowTravelTime": 58,
                "confidence": 0.95,
                "roadClosure": False
            },
            "_checkpoint_name": "Belawan Toll Gate",
            "_lat": 3.8012,
            "_lon": 98.6890
        }]
    }
    
    events = await adapter.parse(mock_flow)
    assert len(events) == 0


# ==============================================================================
# TomTom S5: Bbox Compliance, Tiling & Credit Fallback Tests
# ==============================================================================

def test_tomtom_corridor_tiles_within_bbox_limit():
    """S5: corridor tiles stay strictly below the 10,000 km2 TomTom bbox ceiling."""
    tiles = TomTomAdapter.build_corridor_tiles()
    assert len(tiles) >= 6
    for tile in tiles:
        assert tile["area_km2"] <= TomTomAdapter.MAX_BBOX_AREA_KM2
        assert TomTomAdapter.bbox_area_km2(tile["bbox"]) <= TomTomAdapter.MAX_BBOX_AREA_KM2


def test_tomtom_corridor_tiles_cover_checkpoints_and_dedupe():
    """S5: every checkpoint is covered by a tile and duplicate tile cells are merged."""
    tiles = TomTomAdapter.build_corridor_tiles()
    bboxes = [tile["bbox"] for tile in tiles]
    assert len(bboxes) == len(set(bboxes))

    def covered(cp):
        for tile in tiles:
            min_lon, min_lat, max_lon, max_lat = (float(v) for v in tile["bbox"].split(","))
            if min_lat <= cp["lat"] <= max_lat and min_lon <= cp["lon"] <= max_lon:
                return True
        return False

    for cp in TomTomAdapter.CHECKPOINTS:
        assert covered(cp), f"{cp['name']} is not covered by any corridor tile"

    anchors = sorted(name for tile in tiles for name in tile["anchors"])
    assert anchors == sorted(cp["name"] for cp in TomTomAdapter.CHECKPOINTS)


def _mock_tomtom_response(status_code, payload):
    response = MagicMock()
    response.status_code = status_code
    response.json.return_value = payload
    return response


@pytest.mark.asyncio
@patch("app.adapters.tomtom_adapter.httpx.AsyncClient")
@patch("app.adapters.tomtom_adapter.settings")
async def test_tomtom_incident_tiles_dedupe_by_id(mock_settings, mock_client_cls, monkeypatch):
    """S5: incidents are queried per tile sequentially with sleeps and deduplicated by ID."""
    mock_settings.tomtom_api_key = "test-key"
    TomTomAdapter.reset_credit_latch()
    monkeypatch.setattr(TomTomAdapter, "TILE_REQUEST_SLEEP_SECONDS", 0)

    shared_incident = {
        "properties": {"id": "INC-42", "iconCategory": 6, "delay": 900},
        "geometry": {"type": "Point", "coordinates": [98.68, 3.8]},
    }
    unique_incident = {
        "properties": {"id": "INC-43", "iconCategory": 7, "delay": 1200},
        "geometry": {"type": "LineString", "coordinates": [[99.16, 3.32], [99.17, 3.33]]},
    }
    requested_bboxes = []

    async def fake_get(url, params=None, **kwargs):
        if "flowSegmentData" in url:
            return _mock_tomtom_response(200, {"flowSegmentData": {"currentSpeed": 40, "freeFlowSpeed": 60}})
        requested_bboxes.append(params["bbox"])
        incidents = [shared_incident, shared_incident]
        if len(requested_bboxes) == 1:
            incidents.append(unique_incident)
        return _mock_tomtom_response(200, {"incidents": incidents})

    mock_client = AsyncMock()
    mock_client.get.side_effect = fake_get
    mock_client_cls.return_value.__aenter__.return_value = mock_client

    adapter = TomTomAdapter()
    data = await adapter.fetch()

    assert data["status"] == "ok"
    assert data["degraded_reason"] is None
    assert len(data["incidents"]) == 2
    ids = {inc["properties"]["id"] for inc in data["incidents"]}
    assert ids == {"INC-42", "INC-43"}

    tiles = TomTomAdapter.build_corridor_tiles()
    assert len(requested_bboxes) == len(tiles)
    for bbox in requested_bboxes:
        assert TomTomAdapter.bbox_area_km2(bbox) <= TomTomAdapter.MAX_BBOX_AREA_KM2

    assert len(data["flow"]) == len(TomTomAdapter.CHECKPOINTS)


@pytest.mark.asyncio
@patch("app.adapters.tomtom_adapter.httpx.AsyncClient")
@patch("app.adapters.tomtom_adapter.settings")
async def test_tomtom_403_sets_credit_latch_and_skips_further_calls(mock_settings, mock_client_cls):
    """S5: a 403 InsufficientFunds latches credit exhaustion, logs once, and halts further TomTom calls."""
    mock_settings.tomtom_api_key = "test-key"
    TomTomAdapter.reset_credit_latch()

    mock_client = AsyncMock()
    mock_client_cls.return_value.__aenter__.return_value = mock_client
    mock_client.get.return_value = _mock_tomtom_response(
        403, {"detailedError": {"code": "InsufficientFunds"}}
    )

    adapter = TomTomAdapter()
    first = await adapter.fetch()
    assert first["status"] == "degraded"
    assert first["credit_exhausted"] is True
    assert TomTomAdapter.is_credit_exhausted() is True
    calls_after_first = mock_client.get.call_count
    assert calls_after_first == 1  # short-circuits on the first 403

    second = await adapter.fetch()
    assert second["status"] == "degraded"
    assert "credit_exhausted" in (second["degraded_reason"] or "")
    assert mock_client.get.call_count == calls_after_first  # latched: no further HTTP calls

    assert await adapter.health_check() is False
    assert mock_client.get.call_count == calls_after_first

    TomTomAdapter.reset_credit_latch()
    assert TomTomAdapter.is_credit_exhausted() is False


@pytest.mark.asyncio
@patch("app.adapters.tomtom_adapter.httpx.AsyncClient")
@patch("app.adapters.tomtom_adapter.settings")
async def test_tomtom_health_check_reflects_endpoint_status(mock_settings, mock_client_cls):
    """S5: health_check reports the real endpoint status instead of a static seeded 'ok'."""
    mock_settings.tomtom_api_key = "test-key"
    TomTomAdapter.reset_credit_latch()

    mock_client = AsyncMock()
    mock_client_cls.return_value.__aenter__.return_value = mock_client

    adapter = TomTomAdapter()
    mock_client.get.return_value = _mock_tomtom_response(200, {"flowSegmentData": {}})
    assert await adapter.health_check() is True

    mock_client.get.return_value = _mock_tomtom_response(500, {})
    assert await adapter.health_check() is False

    mock_client.get.side_effect = RuntimeError("network down")
    assert await adapter.health_check() is False
    TomTomAdapter.reset_credit_latch()


@pytest.mark.asyncio
@patch("app.adapters.tomtom_adapter.httpx.AsyncClient")
@patch("app.adapters.tomtom_adapter.settings")
async def test_tomtom_flow_failures_report_degraded_status(mock_settings, mock_client_cls):
    """S5: non-403 flow failures surface as an explicit degraded status, not silent empty data."""
    mock_settings.tomtom_api_key = "test-key"
    TomTomAdapter.reset_credit_latch()

    async def fake_get(url, params=None, **kwargs):
        if "flowSegmentData" in url:
            return _mock_tomtom_response(500, {})
        return _mock_tomtom_response(200, {"incidents": []})

    mock_client = AsyncMock()
    mock_client.get.side_effect = fake_get
    mock_client_cls.return_value.__aenter__.return_value = mock_client

    adapter = TomTomAdapter()
    data = await adapter.fetch()

    assert data["status"] == "down"
    assert data["flow"] == []
    assert "all_flow_requests_failed" in (data["degraded_reason"] or "")


# ==============================================================================
# AISstream Adapter Tests
# ==============================================================================

@pytest.mark.asyncio
@patch("app.adapters.aisstream_adapter.get_redis")
async def test_aisstream_port_queue(mock_get_redis):
    mock_redis = MagicMock()
    mock_redis.get.return_value = None
    mock_get_redis.return_value = mock_redis

    adapter = AISstreamAdapter()
    
    # Seed the registry with 10 anchored vessels (SOG < 0.5 knots)
    for i in range(10):
        adapter.vessels[1000000 + i] = {
            "name": f"Anchored Ship {i}",
            "lat": 3.78,
            "lon": 98.70,
            "sog": 0.1,  # anchored
            "last_seen": datetime.now(timezone.utc).isoformat()
        }
        
    # Also add 2 moving vessels
    for i in range(2):
        adapter.vessels[2000000 + i] = {
            "name": f"Moving Ship {i}",
            "lat": 3.78,
            "lon": 98.70,
            "sog": 12.5,  # moving
            "last_seen": datetime.now(timezone.utc).isoformat()
        }

    # Manually trigger process queue to verify it emits alert
    with patch.object(adapter, 'publish') as mock_publish:
        await adapter._process_queue()
        
        # Verify publish was called since anchored count (10) >= threshold (8)
        assert mock_publish.called
        published_events = mock_publish.call_args[0][0]
        assert len(published_events) == 1
        event = published_events[0]
        assert event["event_type"] == "port_queue"
        assert event["severity"] == "high"  # 10 anchored is high (under 15)
        assert "10 vessels waiting" in event["title"]


@pytest.mark.asyncio
async def test_aisstream_no_queue():
    adapter = AISstreamAdapter()
    
    # Seed 3 anchored vessels (below threshold of 8)
    for i in range(3):
        adapter.vessels[1000000 + i] = {
            "name": f"Anchored Ship {i}",
            "lat": 3.78,
            "lon": 98.70,
            "sog": 0.1,
            "last_seen": datetime.now(timezone.utc).isoformat()
        }

    with patch.object(adapter, 'publish') as mock_publish:
        # Test it directly by calling _process_queue once
        await adapter._process_queue()
        
        # Should not publish since count is 3 (< 8)
        assert not mock_publish.called


# ==============================================================================
# NASA FIRMS Adapter Tests
# ==============================================================================

@pytest.mark.asyncio
@patch("app.adapters.nasa_firms_adapter.get_redis")
async def test_nasa_firms_parse_csv(mock_get_redis):
    mock_redis = MagicMock()
    mock_redis.get.return_value = None
    mock_get_redis.return_value = mock_redis

    adapter = NASAFIRMSAdapter()
    
    # Mock active fire CSV string near Belawan Port checkpoint (3.80, 98.69)
    csv_data = """latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight
3.81,98.68,345.5,0.4,0.4,2026-07-06,0630,N,VIIRS,nominal,2.0NRT,295.2,15.2,D
"""
    events = await adapter.parse(csv_data)
    assert len(events) == 1
    assert events[0]["event_type"] == "wildfire"
    assert events[0]["severity"] == "high"  # High because distance is under 5km (nominal confidence, frp=15.2)
    assert "Belawan Port Corridor" in events[0]["title"]


@pytest.mark.asyncio
@patch("app.adapters.nasa_firms_adapter.get_redis")
async def test_nasa_firms_proximity_filter(mock_get_redis):
    mock_redis = MagicMock()
    mock_redis.get.return_value = None
    mock_get_redis.return_value = mock_redis

    adapter = NASAFIRMSAdapter()
    
    # Hotspot far away from Pan-Sumatra highway spine checkpoints (e.g. out in central Java or Indian Ocean)
    # Coordinate: -7.50, 110.00 (Central Java) is far outside Pan-Sumatra BBOX or highway corridors.
    csv_data_distant = """latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight
-7.50,110.00,345.5,0.4,0.4,2026-07-06,0630,N,VIIRS,nominal,2.0NRT,295.2,15.2,D
"""
    events = await adapter.parse(csv_data_distant)
    
    # Should be filtered out due to proximity/bbox check
    assert len(events) == 0


# ==============================================================================
# Open-Meteo Adapter Tests
# ==============================================================================

def test_openmeteo_adapter_instantiates():
    """Regression (S1): OpenMeteoAdapter must instantiate with the base signature and implement health_check."""
    adapter = OpenMeteoAdapter()
    assert adapter.source_name == "open_meteo"
    assert adapter.stream_key == "lrip:events:open_meteo"


@pytest.mark.asyncio
@patch("app.adapters.open_meteo_adapter.httpx.AsyncClient")
async def test_openmeteo_health_check_reflects_endpoint_status(mock_client_cls):
    mock_client = AsyncMock()
    mock_client_cls.return_value.__aenter__.return_value = mock_client

    adapter = OpenMeteoAdapter()

    mock_client.get.return_value = MagicMock(status_code=200)
    assert await adapter.health_check() is True

    mock_client.get.side_effect = RuntimeError("network down")
    assert await adapter.health_check() is False


# ==============================================================================
# Base Adapter Tests
# ==============================================================================

@pytest.mark.asyncio
@patch("app.adapters.base.get_write_client")
@patch("app.adapters.base.get_redis")
async def test_base_adapter_health_update(mock_get_redis, mock_get_write_client):
    # Mock Redis client
    mock_redis = MagicMock()
    mock_get_redis.return_value = mock_redis
    
    # Mock Supabase write client (service role preferred for RLS-restricted writes)
    mock_supabase = MagicMock()
    mock_get_write_client.return_value = mock_supabase
    
    # Instantiate an adapter and call health update
    adapter = BMKGAdapter()
    adapter.update_source_health("degraded")
    
    # Verify Redis health key was updated
    assert mock_redis.hset.called
    assert mock_redis.hset.call_args[0][0] == "lrip:health:source:bmkg"
    
    # Verify Supabase table was updated
    assert mock_supabase.table.called
    assert mock_supabase.table.call_args[0][0] == "data_sources"
