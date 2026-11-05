"""Hermetic tests for the passive `/news/live` stored-data read contract.

Supabase and the heuristic are monkeypatched. Redis ingestion locks are stubbed,
so no network or production service is touched.
"""

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import pytest
from fastapi import BackgroundTasks

from app.routers import news_router
from app.services import news_aggregator

NOW = datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# fakes
# ---------------------------------------------------------------------------


class _FakeResult:
    def __init__(self, data: List[Dict[str, Any]]):
        self.data = data


class _FakeNewsTable:
    """Minimal PostgREST stand-in: select/order/limit/eq + batched upsert."""

    def __init__(self, store: List[Dict[str, Any]], upserts: List[Dict[str, Any]]):
        self._store = store
        self._upserts = upserts
        self._filters: Dict[str, Any] = {}
        self._limit: Optional[int] = None

    def select(self, *_args, **_kwargs):
        return self

    def order(self, *_args, **_kwargs):
        return self

    def limit(self, value: int):
        self._limit = value
        return self

    def eq(self, column: str, value: Any):
        self._filters[column] = value
        return self

    def execute(self):
        rows = [
            dict(row)
            for row in self._store
            if all(row.get(k) == v for k, v in self._filters.items())
        ]
        if self._limit is not None:
            rows = rows[: self._limit]
        return _FakeResult(rows)

    def upsert(self, chunk, on_conflict: Optional[str] = None):
        # Recorded once per call: the contract is one batched upsert, not N.
        self._upserts.append({"rows": list(chunk), "on_conflict": on_conflict})
        for record in chunk:
            for existing in self._store:
                if on_conflict and existing.get(on_conflict) == record.get(on_conflict):
                    existing.update(record)
                    break
            else:
                self._store.append(dict(record))
        return self


class _FakeSupabase:
    def __init__(self):
        self.rows: List[Dict[str, Any]] = []
        self.upserts: List[Dict[str, Any]] = []

    def table(self, _name: str):
        return _FakeNewsTable(self.rows, self.upserts)


def _legacy_row(link: str = "https://sumut.antaranews.com/berita/legacy-1") -> Dict[str, Any]:
    """A pre-v7 row: no zone_tier, no coordinates, ground_truth_metrics v6."""
    return {
        "id": "11111111-1111-1111-1111-111111111111",
        "title": "Banjir rendam jalur logistik Jalinsum di Tebing Tinggi",
        "link": link,
        "source": "LKBN ANTARA Sumut",
        "source_tier": "TIER_1_OFFICIAL",
        "province": "Sumatera Utara",
        "raw_description": "Debit air menutup jalan arteri.",
        "latitude": None,
        "longitude": None,
        "published_at": NOW,
        "created_at": NOW,
        "ground_truth_metrics": {"schema_version": 6},
    }


def _fresh_v7_row(link: str = "https://sumut.antaranews.com/berita/fresh-1") -> Dict[str, Any]:
    return {
        "id": "22222222-2222-2222-2222-222222222222",
        "title": "Banjir Tebing Tinggi putus jalan arteri Jalinsum",
        "severity": "high",
        "link": link,
        "source": "LKBN ANTARA Sumut",
        "province": "Sumatera Utara",
        "latitude": 3.3285,
        "longitude": 99.1625,
        "published_at": NOW,
        "original_pub_date": NOW,
        "created_at": NOW,
        "zone_tier": "YELLOW_CLARIFY",
        "is_geocoded": True,
        "ground_truth_metrics": {
            "schema_version": 7,
            "zone_tier": "YELLOW_CLARIFY",
            "original_pub_date": NOW,
        },
    }


@pytest.fixture(autouse=True)
def _reset_news_state(monkeypatch):
    """Fresh cache + ingestion guards per test (they are module globals)."""
    monkeypatch.setattr(
        news_router,
        "_NEWS_CACHE",
        {"articles": [], "last_fetched_at": 0.0, "last_updated": None, "meta": None},
    )
    monkeypatch.setattr(news_router, "_is_ingesting", False)
    monkeypatch.setattr(news_router, "_last_cycle_completed_at", None)
    monkeypatch.setattr(news_router, "_acquire_cross_process_ingestion_lock", lambda: True)
    monkeypatch.setattr(news_router, "_release_cross_process_ingestion_lock", lambda: None)
    try:
        news_router.reset_news_read_lock()
    except Exception:
        pass
    yield
    try:
        news_router.reset_news_read_lock()
    except Exception:
        pass


def _install_heuristic(monkeypatch) -> List[str]:
    """Counts heuristic invocations and returns a deterministic v7 verdict."""
    calls: List[str] = []

    def fake_re_tier(article: Dict[str, Any]) -> Dict[str, Any]:
        calls.append(str(article.get("link") or ""))
        return {
            "zone_tier": "YELLOW_CLARIFY",
            "tier_reason": "v7 heuristic on read",
            "custom_hazard_label": "banjir",
            "is_geocoded": True,
            "location_precision": "kecamatan",
            "latitude": 3.3285,
            "longitude": 99.1625,
            "incident_type": "flood",
            "severity": "high",
            "corridor_segment": "Jalinsum",
            "affected_locations": ["Tebing Tinggi"],
            "radius_km": 6.0,
            "ground_truth_metrics": {
                "schema_version": 7,
                "zone_tier": "YELLOW_CLARIFY",
                "original_pub_date": NOW,
            },
        }

    monkeypatch.setattr("app.nlp.news_extractor._fast_heuristic_extraction", fake_re_tier)
    return calls


# ---------------------------------------------------------------------------
# 1. last_fetched_at guard
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_completed_cycle_stamps_cache_instead_of_zeroing_it(monkeypatch):
    """The cycle used to write 0.0 — a permanent cache miss that re-armed ingestion."""
    cycles: List[bool] = []

    async def fake_cycle(force_refresh: bool = False):
        cycles.append(force_refresh)

    monkeypatch.setattr(news_router.unified_news_ingestor, "run_ingestion_cycle", fake_cycle)

    await news_router.run_background_news_ingestion(force=False)

    assert cycles == [False]
    stamped = news_router._NEWS_CACHE["last_fetched_at"]
    assert stamped > 0.0, "a completed cycle must not reset the cache timestamp to 0.0"
    now = datetime.now(timezone.utc).timestamp()
    assert now - stamped < 5.0


@pytest.mark.asyncio
async def test_two_live_reads_within_ttl_do_not_reingest(monkeypatch):
    """Two `/news/live` reads inside the 30 s window: one fetch, zero ingestions."""
    fetches: List[int] = []
    cycles: List[bool] = []

    async def fake_fetch(limit: int = 150, province=None, severity=None, **_kwargs):
        fetches.append(limit)
        return [_fresh_v7_row()]

    async def fake_cycle(force_refresh: bool = False):
        cycles.append(force_refresh)

    monkeypatch.setattr(news_router, "fetch_news_from_supabase", fake_fetch)
    monkeypatch.setattr(news_router.unified_news_ingestor, "run_ingestion_cycle", fake_cycle)

    # A cycle just completed: this is the state the old code broke by writing 0.0.
    await news_router.run_background_news_ingestion(force=False)
    assert cycles == [False]
    cycles.clear()

    first_tasks = BackgroundTasks()
    # Called directly (not through HTTP), so every Query default must be passed
    # explicitly — a `Query(False)` object is truthy and would fake a force_refresh.
    first = await news_router.get_live_news(
        background_tasks=first_tasks, province=None, severity=None, force_refresh=False
    )
    assert first["status"] == "live"
    assert first_tasks.tasks == [], "a read inside the TTL must not schedule ingestion"
    assert len(fetches) == 1

    second_tasks = BackgroundTasks()
    second = await news_router.get_live_news(
        background_tasks=second_tasks, province=None, severity=None, force_refresh=False
    )
    assert second["cached"] is True
    assert second_tasks.tasks == [], "the 30s cache must serve the second read"
    assert len(fetches) == 1, "the second read must not re-query Supabase"
    assert cycles == [], "neither read may start another ingestion cycle"


@pytest.mark.asyncio
async def test_expired_cache_read_never_schedules_ingestion(monkeypatch):
    """An expired process cache causes a stored read, never an ingest task."""
    async def fake_fetch(limit: int = 150, province=None, severity=None, **_kwargs):
        return [_fresh_v7_row()]

    monkeypatch.setattr(news_router, "fetch_news_from_supabase", fake_fetch)

    # Simulate the old post-cycle state (timestamp 0.0 ⇒ massively expired).
    news_router._NEWS_CACHE["last_fetched_at"] = 0.0

    tasks = BackgroundTasks()
    await news_router.get_live_news(
        background_tasks=tasks, province=None, severity=None, force_refresh=False
    )
    assert tasks.tasks == [], "an expired cache must not schedule ingestion from GET"


@pytest.mark.asyncio
async def test_force_refresh_bypasses_cache_without_scheduling_ingestion(monkeypatch):
    """The public compatibility flag only bypasses cached stored data."""
    async def fake_fetch(limit: int = 150, province=None, severity=None, **_kwargs):
        return [_fresh_v7_row()]

    monkeypatch.setattr(news_router, "fetch_news_from_supabase", fake_fetch)
    news_router._NEWS_CACHE["articles"] = [_fresh_v7_row()]
    news_router._NEWS_CACHE["last_fetched_at"] = datetime.now(timezone.utc).timestamp()

    tasks = BackgroundTasks()
    await news_router.get_live_news(
        background_tasks=tasks, province=None, severity=None, force_refresh=True
    )
    assert tasks.tasks == [], "force_refresh on GET must never trigger ingestion"


# ---------------------------------------------------------------------------
# 2. re-tier write-back
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_legacy_row_is_re_tiered_in_response_without_writeback(monkeypatch):
    calls = _install_heuristic(monkeypatch)
    fake = _FakeSupabase()
    fake.rows = [_legacy_row()]
    monkeypatch.setattr("app.db.supabase_client.get_client", lambda: fake)
    monkeypatch.setattr("app.db.supabase_client.get_write_client", lambda: fake)

    first = await news_aggregator.fetch_news_from_supabase(limit=10)
    assert len(first) == 1
    assert first[0]["zone_tier"] == "YELLOW_CLARIFY"
    assert calls == ["https://sumut.antaranews.com/berita/legacy-1"]

    # Repairs are response-local. Reads never upsert even when legacy rows need
    # the v7 heuristic; ingestion owns convergence of persisted schema.
    assert fake.upserts == []
    assert first[0]["ground_truth_metrics"]["schema_version"] == 7

    second = await news_aggregator.fetch_news_from_supabase(limit=10)
    assert len(second) == 1
    assert len(calls) == 2
    assert fake.upserts == []


@pytest.mark.asyncio
async def test_many_legacy_rows_are_never_written_by_a_read(monkeypatch):
    _install_heuristic(monkeypatch)
    fake = _FakeSupabase()
    fake.rows = [
        _legacy_row("https://sumut.antaranews.com/berita/legacy-1"),
        _legacy_row("https://sumut.antaranews.com/berita/legacy-2"),
        _legacy_row("https://sumut.antaranews.com/berita/legacy-3"),
    ]
    monkeypatch.setattr("app.db.supabase_client.get_client", lambda: fake)
    monkeypatch.setattr("app.db.supabase_client.get_write_client", lambda: fake)

    await news_aggregator.fetch_news_from_supabase(limit=10)

    assert fake.upserts == []


@pytest.mark.asyncio
async def test_read_does_not_attempt_writeback_when_write_client_is_unavailable(monkeypatch):
    _install_heuristic(monkeypatch)
    fake = _FakeSupabase()
    fake.rows = [_legacy_row()]
    monkeypatch.setattr("app.db.supabase_client.get_client", lambda: fake)

    def exploding_write_client():
        raise RuntimeError("service role unavailable")

    monkeypatch.setattr("app.db.supabase_client.get_write_client", exploding_write_client)

    rows = await news_aggregator.fetch_news_from_supabase(limit=10)
    assert len(rows) == 1
    assert rows[0]["zone_tier"] == "YELLOW_CLARIFY"
    assert fake.upserts == []


@pytest.mark.asyncio
async def test_router_guard_repairs_legacy_rows_without_persisting_them(monkeypatch):
    """The router's defensive response guard is read-only as well."""
    calls = _install_heuristic(monkeypatch)
    fake = _FakeSupabase()
    monkeypatch.setattr("app.db.supabase_client.get_write_client", lambda: fake)

    # A row handed to the router directly (no fetch write-back involved).
    legacy = _legacy_row()
    legacy.pop("latitude", None)
    legacy.pop("longitude", None)

    async def fake_fetch(limit: int = 150, province=None, severity=None, **_kwargs):
        return [legacy]

    monkeypatch.setattr(news_router, "fetch_news_from_supabase", fake_fetch)

    tasks = BackgroundTasks()
    res = await news_router.get_live_news(
        background_tasks=tasks, province=None, severity=None, force_refresh=False
    )

    assert res["status"] == "live"
    assert len(calls) == 1
    assert fake.upserts == []


@pytest.mark.asyncio
async def test_concurrent_live_reads_coalesce_to_one_fetch(monkeypatch):
    """Two simultaneous cache misses run one 150-row scan; second hits cache."""
    import asyncio

    fetches: list[int] = []

    async def fake_fetch(limit: int = 150, province=None, severity=None, **_kwargs):
        fetches.append(limit)
        await asyncio.sleep(0.2)
        return [_fresh_v7_row()]

    monkeypatch.setattr(news_router, "fetch_news_from_supabase", fake_fetch)

    async def caller():
        return await news_router.get_live_news(
            background_tasks=BackgroundTasks(),
            province=None,
            severity=None,
            force_refresh=False,
        )

    first, second = await asyncio.gather(caller(), caller())

    assert len(fetches) == 1, "concurrent cold misses must share one fetch"
    assert first["status"] == "live"
    assert second["status"] == "live"
    assert second.get("cached") is True
    assert first["articles"] == second["articles"]
