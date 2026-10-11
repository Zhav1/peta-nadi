import json
import logging
import pytest
from unittest.mock import MagicMock, AsyncMock, patch
from datetime import datetime, timezone

from app.scrapers.pihps_scraper import PIHPSScraper, _get_write_client
from app.scrapers.marketplace_scraper import MarketplaceScraper
from app.scrapers.social_scraper import SocialScraper
from app.nlp.ner_pipeline import extract_locations, extract_locations_gazetteer
from app.nlp.geocoding_service import geocode, KNOWN_POIS


@pytest.fixture(autouse=True)
def mock_pihps_service_client():
    """Guarantee tests never use the real service-role Supabase credentials."""
    with patch(
        "app.scrapers.pihps_scraper.get_service_client",
        side_effect=RuntimeError("service key not configured in tests"),
    ) as mock_service_client:
        yield mock_service_client


# ==============================================================================
# PIHPS Scraper Tests
# ==============================================================================

@pytest.mark.asyncio
@patch("app.scrapers.pihps_scraper.get_client")
@patch("app.scrapers.pihps_scraper.get_redis")
async def test_pihps_no_spike(mock_get_redis, mock_get_client):
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
@patch("app.scrapers.pihps_scraper.get_client")
@patch("app.scrapers.pihps_scraper.get_redis")
async def test_pihps_spike_detection_high(mock_get_redis, mock_get_client):
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
@patch("app.scrapers.pihps_scraper.get_client")
@patch("app.scrapers.pihps_scraper.get_redis")
async def test_pihps_spike_detection_critical(mock_get_redis, mock_get_client):
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
# PIHPS Persistence to Supabase commodity_prices
# ==============================================================================

def test_pihps_write_client_prefers_service_role_client():
    """Ingestion writes prefer the RLS-bypassing service client when configured."""
    with patch("app.scrapers.pihps_scraper.get_service_client", return_value="service-role") as mock_service:
        assert _get_write_client() == "service-role"
        mock_service.assert_called_once()

    with patch(
        "app.scrapers.pihps_scraper.get_service_client", side_effect=RuntimeError("no key")
    ), patch("app.scrapers.pihps_scraper.get_client", return_value="anon"):
        assert _get_write_client() == "anon"


@pytest.mark.asyncio
@patch("app.scrapers.pihps_scraper.get_client")
@patch("app.scrapers.pihps_scraper.get_redis")
async def test_pihps_persists_all_period_points_to_supabase(mock_get_redis, mock_get_client):
    mock_redis = MagicMock()
    mock_redis.get.side_effect = [None, None]  # empty rolling history, no dedup hit
    mock_get_redis.return_value = mock_redis

    scraper = PIHPSScraper()
    raw_data = {
        "beras": {
            "data": [
                {
                    "level": 2,
                    "name": "Beras Kualitas Medium I",
                    "Jan 2026 (I)": "13,000",
                    "Jan 2026 (II)": "13,200",
                    "Jan 2026 (III)": "13,500",
                }
            ]
        }
    }

    events = await scraper.parse(raw_data)
    assert len(events) == 1  # event stream behaviour unchanged

    builder = mock_get_client.return_value.table.return_value
    mock_get_client.return_value.table.assert_called_with("commodity_prices")

    inserted = [call.args[0] for call in builder.insert.call_args_list]
    assert len(inserted) == 3  # all periods persisted, not just the latest
    assert [r["price_idr"] for r in inserted] == [13000.0, 13200.0, 13500.0]
    assert [r["metadata"]["period"] for r in inserted] == ["Jan 2026 (I)", "Jan 2026 (II)", "Jan 2026 (III)"]
    for record in inserted:
        assert record["commodity"] == "beras"
        assert record["region"] == "north_sumatra"
        assert record["source"] == "pihps"
        assert record["metadata"]["row_name"] == "Beras Kualitas Medium I"
        assert record["metadata"]["level"] == 2

    # Idempotency: each (time, commodity, region) key is deleted before insert
    delete_time_eq = builder.delete.return_value.eq.return_value.eq.return_value.eq
    assert [call.args[1] for call in delete_time_eq.call_args_list] == [
        "2026-01-04T00:00:00+00:00",
        "2026-01-11T00:00:00+00:00",
        "2026-01-18T00:00:00+00:00",
    ]
    assert delete_time_eq.return_value.execute.call_count == 3


@pytest.mark.asyncio
@patch("app.scrapers.pihps_scraper.get_client")
@patch("app.scrapers.pihps_scraper.get_redis")
async def test_pihps_persistence_skips_when_supabase_unavailable(mock_get_redis, mock_get_client, caplog):
    mock_redis = MagicMock()
    mock_redis.get.side_effect = [None, None]
    mock_get_redis.return_value = mock_redis
    mock_get_client.side_effect = RuntimeError("Supabase credentials not configured")

    scraper = PIHPSScraper()
    raw_data = {"beras": {"data": [{"level": 2, "Jan 2026 (I)": "13,400"}]}}

    with caplog.at_level(logging.WARNING):
        events = await scraper.parse(raw_data)

    assert len(events) == 1  # parse still succeeds without Supabase
    assert any("skipping PIHPS persistence" in rec.getMessage() for rec in caplog.records)


@pytest.mark.asyncio
@patch("app.scrapers.pihps_scraper.get_client")
@patch("app.scrapers.pihps_scraper.get_redis")
async def test_pihps_persistence_skips_on_write_failure(mock_get_redis, mock_get_client, caplog):
    mock_redis = MagicMock()
    mock_redis.get.side_effect = [None, None]
    mock_get_redis.return_value = mock_redis

    builder = mock_get_client.return_value.table.return_value
    builder.insert.return_value.execute.side_effect = Exception("connection reset")

    scraper = PIHPSScraper()
    raw_data = {"beras": {"data": [{"level": 2, "Jan 2026 (I)": "13,400"}]}}

    with caplog.at_level(logging.WARNING):
        events = await scraper.parse(raw_data)

    assert len(events) == 1  # a failed write never crashes the scraper
    assert any("Failed to persist PIHPS price point" in rec.getMessage() for rec in caplog.records)


@pytest.mark.asyncio
@patch("app.scrapers.pihps_scraper.get_client")
@patch("app.scrapers.pihps_scraper.get_redis")
async def test_pihps_cabai_merah_falls_back_to_province_level_row(mock_get_redis, mock_get_client, caplog):
    mock_redis = MagicMock()
    mock_redis.get.side_effect = [None, None]
    mock_get_redis.return_value = mock_redis

    scraper = PIHPSScraper()
    raw_data = {
        "cabai_merah": {
            "data": [
                {
                    "level": 1,
                    "name": "Cabai Merah",
                    "Sep 2026 (I)": "56,050",
                    "Sep 2026 (II)": "58,000",
                }
            ]
        }
    }

    with caplog.at_level(logging.WARNING):
        events = await scraper.parse(raw_data)

    assert len(events) == 1
    assert any("No level-2 PIHPS row for cabai_merah" in rec.getMessage() for rec in caplog.records)

    builder = mock_get_client.return_value.table.return_value
    inserted = [call.args[0] for call in builder.insert.call_args_list]
    assert len(inserted) == 2
    assert all(r["commodity"] == "cabai_merah" for r in inserted)
    assert inserted[0]["metadata"]["level"] == 1
    assert inserted[0]["metadata"]["row_name"] == "Cabai Merah"


@pytest.mark.asyncio
@patch("app.scrapers.pihps_scraper.get_client")
@patch("app.scrapers.pihps_scraper.get_redis")
async def test_pihps_skips_when_no_level2_or_aggregate_row(mock_get_redis, mock_get_client, caplog):
    mock_redis = MagicMock()
    mock_get_redis.return_value = mock_redis

    scraper = PIHPSScraper()
    raw_data = {
        "cabai_merah": {
            "data": [{"level": 3, "name": "Pasar Tradisional X", "Jan 2026 (I)": "60,000"}]
        }
    }

    with caplog.at_level(logging.WARNING):
        events = await scraper.parse(raw_data)

    assert events == []
    mock_get_client.assert_not_called()
    assert any("No usable PIHPS commodity row" in rec.getMessage() for rec in caplog.records)


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
