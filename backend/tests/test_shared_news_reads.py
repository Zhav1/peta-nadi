"""Hermetic contracts for passive shared news reads and bounded ingestion I/O."""

import asyncio
import threading
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from fastapi import BackgroundTasks

from app.routers import news_router
from app.services import news_aggregator, unified_news_ingestor as ingestor_module


def _stored_article() -> dict:
    published_at = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()
    return {
        "id": "stored-news-1",
        "title": "Banjir mengganggu jalur logistik Sumatera Utara",
        "source": "LKBN ANTARA Sumut",
        "source_tier": "TIER_1_OFFICIAL",
        "link": "https://news.google.com/search?q=stored-source-link",
        "url": "https://news.google.com/search?q=stored-source-link",
        "link_alive": "unknown",
        "province": "Sumatera Utara",
        "severity": "high",
        "latitude": 3.3,
        "longitude": 99.1,
        "is_geocoded": True,
        "zone_tier": "YELLOW_CLARIFY",
        "published_at": published_at,
        "original_pub_date": published_at,
        "ground_truth_metrics": {
            "schema_version": 7,
            "zone_tier": "YELLOW_CLARIFY",
            "original_pub_date": published_at,
        },
    }


@pytest.fixture(autouse=True)
def _reset_news_module_state(monkeypatch):
    monkeypatch.setattr(
        news_router,
        "_NEWS_CACHE",
        {"articles": [], "last_fetched_at": 0.0, "last_updated": None, "meta": None},
    )
    monkeypatch.setattr(news_router, "_NEWS_SHARED_MODE", True)
    monkeypatch.setattr(news_router, "_INGESTION_LOCK_TOKEN", "")
    news_router.reset_news_read_lock()
    yield
    news_router.reset_news_read_lock()


@pytest.mark.asyncio
async def test_public_live_get_is_passive_even_with_force_refresh(monkeypatch):
    article = _stored_article()
    fetch_calls = []

    async def fake_fetch(**kwargs):
        fetch_calls.append(kwargs)
        return [article]

    async def fail_if_ingest(*_args, **_kwargs):
        raise AssertionError("public GET attempted ingestion")

    def fail_if_metrics_written(*_args, **_kwargs):
        raise AssertionError("public GET attempted a Redis yield write")

    monkeypatch.setattr(news_router, "fetch_news_from_supabase", fake_fetch)
    monkeypatch.setattr(news_router, "run_background_news_ingestion", fail_if_ingest)
    monkeypatch.setattr(news_router.news_yield, "record_read_drop", fail_if_metrics_written)

    tasks = BackgroundTasks()
    result = await news_router.get_live_news(
        background_tasks=tasks,
        province=None,
        severity=None,
        force_refresh=True,
    )

    assert result["status"] == "live"
    assert fetch_calls and fetch_calls[0]["raise_on_error"] is True
    assert result["articles"][0]["link"] == article["link"]
    assert result["articles"][0]["url"] == article["url"]
    assert result["articles"][0]["link_alive"] == "unknown"
    assert result["articles"][0]["published_at"] == article["published_at"]
    assert tasks.tasks == []


@pytest.mark.asyncio
async def test_stored_news_failure_returns_degraded_not_healthy_empty(monkeypatch):
    async def failed_fetch(**_kwargs):
        raise RuntimeError("database unavailable")

    monkeypatch.setattr(news_router, "fetch_news_from_supabase", failed_fetch)
    result = await news_router.get_live_news(
        background_tasks=BackgroundTasks(),
        province=None,
        severity=None,
        force_refresh=True,
    )

    assert result["status"] == "degraded"
    assert result["source_status"] == "unavailable"
    assert result["stale"] is False
    assert result["articles"] == []


@pytest.mark.asyncio
async def test_stored_news_failure_serves_cached_rows_as_stale(monkeypatch):
    article = _stored_article()
    news_router._NEWS_CACHE.update(
        articles=[article],
        last_fetched_at=0.0,
        last_updated=article["published_at"],
        meta={"total": 1},
    )

    async def failed_fetch(**_kwargs):
        raise RuntimeError("database unavailable")

    monkeypatch.setattr(news_router, "fetch_news_from_supabase", failed_fetch)
    result = await news_router.get_live_news(
        background_tasks=BackgroundTasks(),
        province=None,
        severity=None,
        force_refresh=True,
    )

    assert result["status"] == "degraded"
    assert result["cached"] is True
    assert result["stale"] is True
    assert result["articles"] == [article]


@pytest.mark.asyncio
async def test_news_fetch_can_distinguish_database_failure_from_empty(monkeypatch):
    class BrokenQuery:
        def select(self, *_args, **_kwargs):
            return self

        def order(self, *_args, **_kwargs):
            return self

        def limit(self, _limit):
            return self

        def execute(self):
            raise RuntimeError("db connection failed")

    class FakeSupabase:
        def table(self, _name):
            return BrokenQuery()

    monkeypatch.setattr("app.db.supabase_client.get_client", lambda: FakeSupabase())

    with pytest.raises(RuntimeError, match="db connection failed"):
        await news_aggregator.fetch_news_from_supabase(raise_on_error=True)

    assert await news_aggregator.fetch_news_from_supabase() == []


@pytest.mark.asyncio
async def test_async_canonical_resolver_never_calls_sync_google_decoder(monkeypatch):
    target = "https://sumut.antaranews.com/berita/123456/banjir"

    def fail_sync_decoder(*_args, **_kwargs):
        raise AssertionError("blocking Google decoder called on async path")

    async def async_decoder(*_args, **_kwargs):
        return target

    monkeypatch.setattr(news_aggregator, "_decode_google_news_token_sync", fail_sync_decoder)
    monkeypatch.setattr(news_aggregator, "_decode_google_news_token_async", async_decoder)

    resolved = await news_aggregator.resolve_canonical_article_url_async(
        "https://news.google.com/rss/articles/AU_yqL_testtoken"
    )
    assert resolved == target


@pytest.mark.asyncio
async def test_ingestor_canonical_batch_obeys_concurrency_limit(monkeypatch):
    ingestor = ingestor_module.UnifiedNewsIngestor()
    monkeypatch.setattr(ingestor, "CANONICAL_RESOLVE_CONCURRENCY", 2)
    current = 0
    maximum = 0

    class FakeAsyncClient:
        def __init__(self, **_kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return False

    async def fake_resolve(raw_url, *_args, **_kwargs):
        nonlocal current, maximum
        current += 1
        maximum = max(maximum, current)
        await asyncio.sleep(0.01)
        current -= 1
        return raw_url + "/resolved"

    monkeypatch.setattr(ingestor_module.httpx, "AsyncClient", FakeAsyncClient)
    monkeypatch.setattr(ingestor_module, "resolve_canonical_article_url_async", fake_resolve)
    articles = [{"link": f"https://publisher.example/article/{i}"} for i in range(7)]

    await ingestor._resolve_canonical_links(articles)

    assert maximum == 2
    assert all(item["url"] == item["link"] for item in articles)
    assert all(item["link"].endswith("/resolved") for item in articles)


def test_shared_news_lease_fails_closed_when_redis_is_unavailable(monkeypatch):
    monkeypatch.setattr(news_router, "_NEWS_SHARED_MODE", True)

    def unavailable():
        raise RuntimeError("redis unavailable")

    monkeypatch.setattr(news_router, "get_redis", unavailable)
    assert news_router._acquire_cross_process_ingestion_lock() is False

    monkeypatch.setattr(news_router, "_NEWS_SHARED_MODE", False)
    assert news_router._acquire_cross_process_ingestion_lock() is True


def test_news_lease_renewal_and_release_are_atomic_and_owner_checked(monkeypatch):
    class FakeRedis:
        def __init__(self):
            self.value = None
            self.eval_calls = []

        def set(self, key, value, nx=False, ex=None):
            assert nx is True
            assert ex == news_router._INGESTION_REDIS_LOCK_TTL
            if self.value is not None:
                return False
            self.value = value
            return True

        def eval(self, script, numkeys, key, token, *args):
            self.eval_calls.append((script, key, token, args))
            if self.value != token:
                return 0
            if "expire" in script:
                return 1
            if "del" in script:
                self.value = None
                return 1
            return 0

    fake = FakeRedis()
    monkeypatch.setattr(news_router, "_NEWS_SHARED_MODE", True)
    monkeypatch.setattr(news_router, "get_redis", lambda: fake)

    assert news_router._acquire_cross_process_ingestion_lock() is True
    owner = news_router._INGESTION_LOCK_TOKEN
    assert owner and fake.value == owner
    assert news_router._renew_cross_process_ingestion_lock() is True

    fake.value = "another-worker"
    assert news_router._renew_cross_process_ingestion_lock() is False
    news_router._release_cross_process_ingestion_lock()
    assert fake.value == "another-worker"
    assert len(fake.eval_calls) == 3


@pytest.mark.asyncio
async def test_news_database_query_runs_off_event_loop_thread(monkeypatch):
    loop_thread = threading.get_ident()
    execute_threads = []

    class FakeQuery:
        def select(self, *_args, **_kwargs):
            return self

        def order(self, *_args, **_kwargs):
            return self

        def limit(self, _limit):
            return self

        def execute(self):
            execute_threads.append(threading.get_ident())
            return SimpleNamespace(data=[])

    class FakeSupabase:
        def table(self, _name):
            return FakeQuery()

    monkeypatch.setattr("app.db.supabase_client.get_client", lambda: FakeSupabase())
    assert await news_aggregator.fetch_news_from_supabase() == []
    assert execute_threads and execute_threads[0] != loop_thread


@pytest.mark.asyncio
async def test_news_upsert_runs_off_loop_and_preserves_source_fields(monkeypatch):
    loop_thread = threading.get_ident()
    execute_threads = []
    records = []

    class FakeTable:
        def upsert(self, rows, on_conflict=None):
            assert on_conflict == "link"
            records.extend(rows)
            return self

        def execute(self):
            execute_threads.append(threading.get_ident())
            return SimpleNamespace(data=[{"id": "stored-news-1"}])

    class FakeSupabase:
        def table(self, _name):
            return FakeTable()

    monkeypatch.setattr("app.db.supabase_client.get_service_client", lambda: FakeSupabase())
    count = await news_aggregator.upsert_articles_to_supabase(
        [{
            "id": "stored-news-1",
            "title": "Publisher title",
            "source": "Publisher",
            "link": "https://publisher.example/original-path",
            "original_pub_date": "2026-11-05T12:00:00+00:00",
        }]
    )

    assert count == 1
    assert execute_threads and execute_threads[0] != loop_thread
    assert records[0]["source"] == "Publisher"
    assert records[0]["link"] == "https://publisher.example/original-path"
    assert records[0]["published_at"] == "2026-11-05T12:00:00+00:00"


@pytest.mark.asyncio
async def test_upsert_does_not_invent_a_publication_timestamp(monkeypatch):
    records = []

    class FakeTable:
        def upsert(self, rows, on_conflict=None):
            records.extend(rows)
            return self

        def execute(self):
            return SimpleNamespace(data=[{"id": "stored-news-1"}])

    class FakeSupabase:
        def table(self, _name):
            return FakeTable()

    monkeypatch.setattr("app.db.supabase_client.get_service_client", lambda: FakeSupabase())
    await news_aggregator.upsert_articles_to_supabase(
        [{"id": "stored-news-1", "link": "https://publisher.example/article"}]
    )
    assert "published_at" not in records[0]
