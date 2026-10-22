import pytest
from types import SimpleNamespace
from typing import Any, Dict
from unittest.mock import MagicMock, AsyncMock

import httpx

from app.services.news_aggregator import (
    OFFICIAL_RSS_FEEDS,
    TARGETED_PRESS_QUERIES,
    fetch_rss_feed_items,
    fetch_google_news_targeted
)
from app.nlp.news_extractor import _fast_heuristic_extraction, extract_structured_news


def test_official_feeds_configured():
    assert len(OFFICIAL_RSS_FEEDS) >= 4
    sources = [f["source"] for f in OFFICIAL_RSS_FEEDS]
    assert "LKBN ANTARA Sumut" in sources
    assert "LKBN ANTARA Ekonomi" in sources


def test_targeted_queries_configured():
    assert len(TARGETED_PRESS_QUERIES) >= 3
    assert any("site:antaranews.com" in q for q in TARGETED_PRESS_QUERIES)


def test_fast_heuristic_extraction_flood():
    raw_article = {
        "title": "Banjir Luapan Sungai Padang Rendam Jalur Logistik Tebing Tinggi KM 78",
        "link": "https://sumut.antaranews.com/test",
        "pubDate": "10m lalu",
        "source": "LKBN ANTARA Sumut",
        "source_tier": "TIER_1_OFFICIAL",
        "raw_description": "Debit air mencapai 120cm menutup jalan arteri Jalinsum."
    }
    extracted = _fast_heuristic_extraction(raw_article)
    assert extracted["incident_type"] == "flood"
    assert extracted["severity"] == "critical"
    assert "Medan" in extracted["corridor_nodes"] or "Tebing Tinggi" in extracted["corridor_nodes"]
    assert extracted["source_tier"] == "TIER_1_OFFICIAL"
    assert extracted["confidence_score"] >= 0.90


def test_fast_heuristic_extraction_early_warning():
    raw_article = {
        "title": "Peringatan Dini BMKG: Waspada Gelombang Tinggi Selat Malaka",
        "link": "https://antaranews.com/test",
        "pubDate": "1j lalu",
        "source": "BMKG",
        "source_tier": "TIER_1_OFFICIAL",
        "raw_description": "Potensi gelombang 3 meter diprediksi melanda perairan timur."
    }
    extracted = _fast_heuristic_extraction(raw_article)
    assert extracted["temporal_phase"] == "forecast_early_warning"
    assert extracted["lead_time_hours"] > 0
    assert extracted["incident_type"] == "marine_wave"


@pytest.mark.asyncio
async def test_extract_structured_news_caching():
    raw_article = {
        "title": "BULOG Sumut Siapkan Cadangan Pangan di Medan",
        "link": "https://antaranews.com/bulog",
        "source": "LKBN ANTARA Sumut",
        "source_tier": "TIER_1_OFFICIAL",
        "raw_description": "Stok beras aman 4.400 ton."
    }
    res1 = await extract_structured_news(raw_article)
    res2 = await extract_structured_news(raw_article)
    assert any("Beras" in c for c in res1["commodities_affected"])


@pytest.mark.asyncio
async def test_osint_stream_publish_is_bounded(monkeypatch):
    """S6: XADD to lrip:stream:osint is capped at maxlen=10_000 (approximate)."""
    from app.services import unified_news_ingestor as ingestor_module

    mock_redis = MagicMock()
    mock_redis.xlen.return_value = 42
    monkeypatch.setattr(ingestor_module, "get_redis", lambda: mock_redis)

    ingestor = ingestor_module.UnifiedNewsIngestor()
    await ingestor._publish_to_redis([{"id": "news-1", "title": "Banjir Jalinsum"}])

    assert mock_redis.xadd.called
    args, kwargs = mock_redis.xadd.call_args
    assert args[0] == "lrip:stream:osint"
    assert kwargs.get("maxlen") == 10_000
    assert kwargs.get("approximate") is True


# ---------------------------------------------------------------------------
# WP4: source link integrity (link_alive provenance)
# ---------------------------------------------------------------------------

def _fake_response(status_code: int, url: str):
    return SimpleNamespace(status_code=status_code, url=url)


def _install_fake_httpx(monkeypatch, responses: Dict[str, Any]) -> Dict[str, Any]:
    """Replaces httpx.AsyncClient used by the ingestor with a deterministic fake."""
    from app.services import unified_news_ingestor as ingestor_module

    captured: Dict[str, Any] = {"calls": [], "client_kwargs": {}}

    class FakeAsyncClient:
        def __init__(self, **kwargs):
            captured["client_kwargs"] = kwargs

        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc_info):
            return False

        async def get(self, url):
            captured["calls"].append(url)
            outcome = responses[url]
            if isinstance(outcome, Exception):
                raise outcome
            return outcome

    monkeypatch.setattr(ingestor_module.httpx, "AsyncClient", FakeAsyncClient)
    return captured


@pytest.mark.asyncio
async def test_news_link_liveness_verdicts(monkeypatch):
    """Dead = 4xx/5xx, redirect to site root, or redirect to another host. Timeouts stay unknown."""
    from app.services import unified_news_ingestor as ingestor_module

    alive_url = "https://sumut.antaranews.com/berita/banjir-jalinsum"
    root_redirect_url = "https://sumut.antaranews.com/berita/kedaluwarsa"
    other_host_url = "https://agregator.example.com/artikel/123"
    missing_url = "https://sumut.antaranews.com/berita/hilang"
    timeout_url = "https://sumut.antaranews.com/berita/lambat"

    captured = _install_fake_httpx(monkeypatch, {
        alive_url: _fake_response(200, alive_url),
        root_redirect_url: _fake_response(200, "https://sumut.antaranews.com/"),
        other_host_url: _fake_response(200, "https://sindikasi.example.net/berita/123"),
        missing_url: _fake_response(404, missing_url),
        timeout_url: httpx.TimeoutException("timed out"),
    })

    ingestor = ingestor_module.UnifiedNewsIngestor()
    articles = [
        {"id": "n1", "link": alive_url},
        {"id": "n2", "link": root_redirect_url},
        {"id": "n3", "link": other_host_url},
        {"id": "n4", "link": missing_url},
        {"id": "n5", "link": timeout_url},
        {"id": "n6"},
    ]

    await ingestor._attach_link_liveness(articles)

    verdicts = {a["id"]: a["link_alive"] for a in articles}
    assert verdicts == {
        "n1": "alive",
        "n2": "dead",
        "n3": "dead",
        "n4": "dead",
        "n5": "unknown",
        "n6": "unknown",
    }
    assert captured["client_kwargs"]["follow_redirects"] is True
    assert captured["client_kwargs"]["timeout"] == ingestor.LINK_CHECK_TIMEOUT_SECONDS
    assert len(captured["calls"]) == 5  # the article without a link is never probed


@pytest.mark.asyncio
async def test_news_link_liveness_cache_avoids_second_probe(monkeypatch):
    from app.services import unified_news_ingestor as ingestor_module

    url = "https://sumut.antaranews.com/berita/banjir"
    captured = _install_fake_httpx(monkeypatch, {url: _fake_response(200, url)})

    ingestor = ingestor_module.UnifiedNewsIngestor()
    first_batch = [{"id": "a", "link": url}]
    second_batch = [{"id": "b", "link": url}]

    await ingestor._attach_link_liveness(first_batch)
    await ingestor._attach_link_liveness(second_batch)

    assert first_batch[0]["link_alive"] == "alive"
    assert second_batch[0]["link_alive"] == "alive"
    assert captured["calls"] == [url]  # second probe served from the TTL cache


@pytest.mark.asyncio
async def test_news_link_liveness_cache_expires_after_ttl(monkeypatch):
    from app.services import unified_news_ingestor as ingestor_module

    url = "https://sumut.antaranews.com/berita/banjir"
    captured = _install_fake_httpx(monkeypatch, {url: _fake_response(200, url)})

    ingestor = ingestor_module.UnifiedNewsIngestor()
    await ingestor._attach_link_liveness([{"id": "a", "link": url}])

    verdict, checked_at = ingestor._link_liveness_cache[url]
    ingestor._link_liveness_cache[url] = (verdict, checked_at - (ingestor.LINK_LIVENESS_TTL_SECONDS + 1))

    await ingestor._attach_link_liveness([{"id": "b", "link": url}])
    assert captured["calls"] == [url, url]


@pytest.mark.asyncio
async def test_link_alive_is_persisted_to_supabase(monkeypatch):
    """The upsert whitelist must carry link_alive, otherwise the dashboard can never see it."""
    from app.services import news_aggregator

    captured_chunks = []

    class FakeTable:
        def upsert(self, chunk, on_conflict=None):
            captured_chunks.append(chunk)
            return self

        def execute(self):
            return SimpleNamespace(data=[{"id": "n1"}])

    class FakeSupabase:
        def table(self, name):
            return FakeTable()

    monkeypatch.setattr("app.db.supabase_client.get_service_client", lambda: FakeSupabase())

    count = await news_aggregator.upsert_articles_to_supabase([
        {"id": "n1", "title": "Banjir Jalinsum", "link": "https://sumut.antaranews.com/berita/1", "link_alive": "dead"}
    ])

    assert count == 1
    assert captured_chunks[0][0]["link_alive"] == "dead"


# ---------------------------------------------------------------------------
# WP-B1: Non-blocking news ingestion & warming state
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_news_stampede_guard_prevents_duplicate_runs(monkeypatch):
    """Multiple concurrent calls to run_background_news_ingestion must not run concurrently."""
    import asyncio
    from app.routers import news_router

    calls = 0

    async def fake_ingest(force_refresh=False):
        nonlocal calls
        calls += 1
        await asyncio.sleep(0.05)

    monkeypatch.setattr(news_router.unified_news_ingestor, "run_ingestion_cycle", fake_ingest)

    # Launch two ingestion triggers simultaneously
    task1 = asyncio.create_task(news_router.run_background_news_ingestion(force=True))
    task2 = asyncio.create_task(news_router.run_background_news_ingestion(force=True))

    await asyncio.gather(task1, task2)

    # Stampede guard must allow only 1 cycle execution
    assert calls == 1


@pytest.mark.asyncio
async def test_get_live_news_returns_warming_state_when_cold(monkeypatch):
    """When Supabase has no cached articles, return warming status immediately without blocking."""
    from fastapi import BackgroundTasks
    from app.routers import news_router

    monkeypatch.setattr(news_router, "fetch_news_from_supabase", AsyncMock(return_value=[]))
    monkeypatch.setattr(news_router, "_NEWS_CACHE", {"articles": [], "last_fetched_at": 0.0})

    bg_tasks = BackgroundTasks()
    res = await news_router.get_live_news(background_tasks=bg_tasks)

    assert res["status"] == "warming"
    assert res["count"] == 0
    assert res["articles"] == []
    assert "warming" in res["status"]


@pytest.mark.asyncio
async def test_get_live_news_returns_live_state_when_cached(monkeypatch):
    """When Supabase has articles, return live status immediately."""
    from fastapi import BackgroundTasks
    from datetime import datetime, timezone
    from app.routers import news_router

    _now = datetime.now(timezone.utc).isoformat()
    sample_articles = [{
        "id": "art-1",
        "title": "Banjir Tebing Tinggi putus jalan arteri Jalinsum",
        "severity": "high",
        "link": "https://sumut.antaranews.com/berita/123456/banjir-tebing-tinggi-jalinsum",
        "url": "https://sumut.antaranews.com/berita/123456/banjir-tebing-tinggi-jalinsum",
        "pubDate": _now,
        "original_pub_date": _now,
        "published_at": _now,
        "latitude": 3.3285,
        "longitude": 99.1625,
        "province": "Sumatera Utara",
        "zone_tier": "YELLOW_CLARIFY",
        "is_geocoded": True,
        "ground_truth_metrics": {"zone_tier": "YELLOW_CLARIFY", "schema_version": 7, "original_pub_date": _now},
    }]
    monkeypatch.setattr(news_router, "fetch_news_from_supabase", AsyncMock(return_value=sample_articles))
    monkeypatch.setattr(news_router, "_NEWS_CACHE", {"articles": [], "last_fetched_at": 0.0})

    bg_tasks = BackgroundTasks()
    res = await news_router.get_live_news(background_tasks=bg_tasks)

    assert res["status"] == "live"
    assert res["count"] == 1
    assert len(res["articles"]) == 1
