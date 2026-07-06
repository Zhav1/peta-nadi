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
    
    # Hotspot far away from highway spine checkpoints (e.g. out in the ocean or distant forest)
    # Medvedev/Medan region coordinate is ~3.5, 98.6. Let's put a hotspot at lat 5.0, lon 98.0
    # Nearest segment would be Belawan Toll Gate (~3.80, 98.69) or Binjai (~3.68, 98.51).
    # Distance from 5.0, 98.0 to 3.80, 98.69 is > 100km, which is > 20km threshold.
    csv_data_distant = """latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight
5.00,98.00,345.5,0.4,0.4,2026-07-06,0630,N,VIIRS,nominal,2.0NRT,295.2,15.2,D
"""
    events = await adapter.parse(csv_data_distant)
    
    # Should be filtered out due to proximity check
    assert len(events) == 0


# ==============================================================================
# Base Adapter Tests
# ==============================================================================

@pytest.mark.asyncio
@patch("app.adapters.base.get_client")
@patch("app.adapters.base.get_redis")
async def test_base_adapter_health_update(mock_get_redis, mock_get_client):
    # Mock Redis client
    mock_redis = MagicMock()
    mock_get_redis.return_value = mock_redis
    
    # Mock Supabase client
    mock_supabase = MagicMock()
    mock_get_client.return_value = mock_supabase
    
    # Instantiate an adapter and call health update
    adapter = BMKGAdapter()
    adapter.update_source_health("degraded")
    
    # Verify Redis health key was updated
    assert mock_redis.hset.called
    assert mock_redis.hset.call_args[0][0] == "lrip:health:source:bmkg"
    
    # Verify Supabase table was updated
    assert mock_supabase.table.called
    assert mock_supabase.table.call_args[0][0] == "data_sources"
