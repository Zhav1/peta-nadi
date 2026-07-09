import json
import pytest
from unittest.mock import MagicMock, AsyncMock, patch
from datetime import datetime, timezone

from app.scrapers.pihps_scraper import PIHPSScraper
from app.scrapers.marketplace_scraper import MarketplaceScraper
from app.scrapers.social_scraper import SocialScraper
from app.nlp.ner_pipeline import extract_locations, extract_locations_gazetteer
from app.nlp.geocoding_service import geocode, KNOWN_POIS

# ==============================================================================
# PIHPS Scraper Tests
# ==============================================================================

@pytest.mark.asyncio
@patch("app.scrapers.pihps_scraper.get_redis")
async def test_pihps_no_spike(mock_get_redis):
    # Setup mock Redis
    mock_redis = MagicMock()
    mock_redis.get.side_effect = [
        json.dumps([13000, 13100, 13200, 13150, 13100, 13200, 13300]),  # history cache
        None  # dedup check (None = not processed yet)
    ]
    mock_get_redis.return_value = mock_redis

    scraper = PIHPSScraper()
    
    # Mock data for "beras" (com_3)
    raw_data = {
        "beras": {
            "data": [
                {
                    "level": 2,
                    "Jan 2026 (I)": "13,400"
                }
            ]
        }
    }
    
    events = await scraper.parse(raw_data)
    assert len(events) == 1
    event = events[0]
    assert event["event_type"] == "price_baseline"
    assert event["severity"] == "low"
    assert "beras" in event["title"]
    assert "13,400" in event["title"]


@pytest.mark.asyncio
@patch("app.scrapers.pihps_scraper.get_redis")
async def test_pihps_spike_detection_high(mock_get_redis):
    mock_redis = MagicMock()
    # 7-day mean of these is 15000.
    # New price of 16200 is +8% (>= 5%, so "high" spike)
    mock_redis.get.side_effect = [
        json.dumps([15000, 15000, 15000, 15000, 15000, 15000, 15000]),
        None
    ]
    mock_get_redis.return_value = mock_redis

    scraper = PIHPSScraper()
    raw_data = {
        "cabai_merah": {
            "data": [
                {
                    "level": 2,
                    "Jan 2026 (I)": "16,200"
                }
            ]
        }
    }
    events = await scraper.parse(raw_data)
    assert len(events) == 1
    assert events[0]["event_type"] == "price_spike"
    assert events[0]["severity"] == "high"


@pytest.mark.asyncio
@patch("app.scrapers.pihps_scraper.get_redis")
async def test_pihps_spike_detection_critical(mock_get_redis):
    mock_redis = MagicMock()
    # 7-day mean of these is 15000.
    # New price of 18000 is +20% (>= 15%, so "critical" spike)
    mock_redis.get.side_effect = [
        json.dumps([15000, 15000, 15000, 15000, 15000, 15000, 15000]),
        None
    ]
    mock_get_redis.return_value = mock_redis

    scraper = PIHPSScraper()
    raw_data = {
        "minyak_goreng": {
            "data": [
                {
                    "level": 2,
                    "Jan 2026 (I)": "18,000"
                }
            ]
        }
    }
    events = await scraper.parse(raw_data)
    assert len(events) == 1
    assert events[0]["event_type"] == "price_spike"
    assert events[0]["severity"] == "critical"


# ==============================================================================
# NER Pipeline Tests
# ==============================================================================

def test_ner_gazetteer_finds_belawan():
    text = "Kemacetan parah terjadi di Pelabuhan Belawan sejak pagi tadi."
    locs = extract_locations_gazetteer(text)
    assert "Belawan" in locs or "Pelabuhan Belawan" in locs


def test_ner_gazetteer_finds_nothing():
    text = "Ada pertemuan koordinasi di kantor pusat Jakarta Selatan."
    locs = extract_locations_gazetteer(text)
    # Jakarta is not in our North Sumatra corridor gazetteer
    assert len(locs) == 0


@pytest.mark.asyncio
@patch("app.nlp.ner_pipeline.extract_locations_llm")
async def test_ner_llm_fallback_called(mock_llm):
    mock_llm.return_value = ["Kuala Namu"]
    
    # This text contains no gazetteer terms
    text = "Jalan terputus di sekitar Kuala Namu setelah hujan deras semalaman."
    locs = await extract_locations(text)
    
    assert locs == ["Kuala Namu"]
    mock_llm.assert_called_once_with(text)



# ==============================================================================
# Geocoding Service Tests
# ==============================================================================

@pytest.mark.asyncio
@patch("app.nlp.geocoding_service.get_redis")
async def test_geocode_known_poi_no_api_call(mock_get_redis):
    mock_redis = MagicMock()
    mock_redis.get.return_value = None  # Cache miss
    mock_get_redis.return_value = mock_redis

    # Geocoding a pre-seeded name should return coordinates immediately and not call Nominatim
    with patch("httpx.AsyncClient.get") as mock_http_get:
        coords = await geocode("Belawan")
        assert coords == KNOWN_POIS["belawan"]
        mock_http_get.assert_not_called()


@pytest.mark.asyncio
@patch("app.nlp.geocoding_service.get_redis")
async def test_geocode_cache_hit(mock_get_redis):
    mock_redis = MagicMock()
    mock_redis.get.return_value = json.dumps([3.1234, 98.5678])  # Cache hit
    mock_get_redis.return_value = mock_redis

    coords = await geocode("anyplace")
    assert coords == (3.1234, 98.5678)
    mock_redis.get.assert_called_once_with("lrip:geocode:anyplace")


# ==============================================================================
# Social OSINT Scraper Tests
# ==============================================================================

@pytest.mark.asyncio
@patch("app.scrapers.social_scraper.extract_locations")
@patch("app.scrapers.social_scraper.geocode")
@patch("app.services.redis_client.get_redis")
async def test_social_severity_critical(mock_get_redis, mock_geocode, mock_extract_locs):
    mock_redis = MagicMock()
    mock_redis.get.return_value = None  # No dedup hit
    mock_get_redis.return_value = mock_redis

    
    mock_extract_locs.return_value = ["Belawan"]
    mock_geocode.return_value = (3.7944, 98.6913)

    scraper = SocialScraper()
    
    raw_posts = [
        {
            "id": "t1",
            "platform": "twitter",
            "text": "Antrian macet parah lumpuh total di gerbang Belawan!",
            "author": "driver_x",
            "created_at": "2026-07-06T12:00:00Z"
        }
    ]
    
    events = await scraper.parse(raw_posts)
    assert len(events) == 1
    assert events[0]["severity"] == "critical"
    assert events[0]["lat"] == "3.7944"
    assert events[0]["lon"] == "98.6913"


@pytest.mark.asyncio
@patch("app.scrapers.social_scraper.extract_locations")
@patch("app.scrapers.social_scraper.geocode")
@patch("app.services.redis_client.get_redis")
async def test_social_severity_low(mock_get_redis, mock_geocode, mock_extract_locs):
    mock_redis = MagicMock()
    mock_redis.get.return_value = None
    mock_get_redis.return_value = mock_redis

    
    mock_extract_locs.return_value = ["Medan"]
    mock_geocode.return_value = (3.5952, 98.6722)

    scraper = SocialScraper()
    raw_posts = [
        {
            "id": "t2",
            "platform": "twitter",
            "text": "Cuaca mendung di kota Medan hari ini.",
            "author": "user_y",
            "created_at": "2026-07-06T12:00:00Z"
        }
    ]
    
    events = await scraper.parse(raw_posts)
    assert len(events) == 1
    assert events[0]["severity"] == "low"


# ==============================================================================
# Base Scraper Dynamic Interval Test
# ==============================================================================

@pytest.mark.asyncio
@patch("app.scrapers.base_scraper.get_redis")
async def test_crisis_mode_interval_switch(mock_get_redis):
    mock_redis = MagicMock()
    # First check: active (crisis mode), Second check: normal (normal mode)
    mock_redis.get.side_effect = ["active", "normal"]
    mock_get_redis.return_value = mock_redis

    scraper = PIHPSScraper()
    
    # 1. Active crisis check
    assert scraper.is_crisis_mode() is True
    
    # 2. Normal mode check
    assert scraper.is_crisis_mode() is False
