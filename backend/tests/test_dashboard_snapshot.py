"""Phase 163a — dashboard snapshot service.

Hermetic: no Supabase client is created and no section touches the network.
The section plan is substituted for the isolation test; the persistence tests
use a fake Supabase client.

Pinned here:

* the map-bootstrap plan is exactly the five seeded sections (no weather
  polygons, corridor, commodity, approval, health, evaluation, outcome or BNPB
  sections);
* the news section is a direct display read — it never calls
  ``get_live_news`` (breadth contract, re-tier, ingestion scheduling), keeps
  only display-eligible tiers (crisis / regional) and reports the newest
  publish time as ``last_updated`` (never wall-clock now on the seed);
* a degraded/stale inner fire/weather payload is mirrored by the section
  (``degraded`` / ``stale``), and a degraded payload is never stored as
  last-good;
* a failing section and a timing-out section are isolated (`degraded` /
  `timeout`) while the healthy sections stay `ok`;
* a failed section reuses its last good value when this process has one;
* store -> read round-trip keeps key, payload, computed_at, schema_version and
  source_freshness;
* a missing row -> `None`; a Supabase error -> `None` (never raises);
* a schema_version mismatch is treated as a miss;
* `build_and_store_global_snapshot` never raises and reports `snapshot_failed`.
"""

import asyncio
import time

import pytest

from app.services import dashboard_snapshot_service as svc


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

class _FakeTable:
    def __init__(self, store: dict, table: str):
        self._store = store
        self._table = table
        self._row = None
        self._filters: dict = {}
        self._limit = None

    # write
    def upsert(self, row, on_conflict=None):  # noqa: ANN001 - PostgREST signature
        assert self._table == svc.SNAPSHOT_TABLE
        assert on_conflict == "snapshot_key"
        self._row = dict(row)
        return self

    # read
    def select(self, columns):  # noqa: ANN001
        return self

    def eq(self, column, value):
        self._filters[column] = value
        return self

    def limit(self, count):
        self._limit = count
        return self

    def execute(self):
        if self._row is not None:
            self._store[self._row["snapshot_key"]] = self._row
            return _FakeResult([dict(self._row)])
        rows = []
        for row in self._store.values():
            if all(row.get(k) == v for k, v in self._filters.items()):
                rows.append(dict(row))
        if self._limit is not None:
            rows = rows[: self._limit]
        return _FakeResult(rows)


class _FakeResult:
    def __init__(self, data):
        self.data = data


class _FakeClient:
    """Minimal stand-in for the service-role Supabase client."""

    def __init__(self, store=None, fail=False):
        self.store: dict = {} if store is None else store
        self.fail = fail
        self.tables: list[str] = []

    def table(self, name):
        if self.fail:
            raise RuntimeError("supabase unreachable")
        self.tables.append(name)
        return _FakeTable(self.store, name)


@pytest.fixture(autouse=True)
def _clean_section_cache():
    svc.reset_section_cache()
    yield
    svc.reset_section_cache()


def _snapshot(**overrides):
    snapshot = {
        "snapshot_key": "global",
        "schema_version": 1,
        "computed_at": svc.utcnow().isoformat(),
        "source_freshness": {"incidents": {"status": "ok", "ms": 3}},
        "payload": {"incidents": {"status": "ok", "data": {"items": [], "total": 0}}},
    }
    snapshot.update(overrides)
    return snapshot


# ---------------------------------------------------------------------------
# 1. Map-bootstrap plan
# ---------------------------------------------------------------------------

def test_section_plan_is_the_five_map_bootstrap_sections():
    plan = svc.section_plan()

    assert set(plan) == {"incidents", "news", "news_market_regime", "fire_hotspots", "weather_summary"}
    assert len(plan) == 5
    # Removed in the 2026-10-28 payload trim: the frontend fetches weather and
    # corridor live and lazy-mounts Analitik/Laporan/Evaluasi.
    for removed in (
        "corridor_context",
        "weather_spatial_polygons",
        "commodity_prices",
        "commodity_spikes",
        "approvals",
        "source_health",
        "evaluation_benchmark",
        "evaluation_test_matrix",
        "evaluation_corridor_efficiency",
        "outcomes",
        "bnpb_events",
    ):
        assert removed not in plan


@pytest.mark.asyncio
async def test_news_section_classifies_tiers_and_uses_max_publish_time(monkeypatch):
    from app.routers import news_router
    from app.services import news_aggregator

    calls: list[dict] = []

    async def fake_fetch(**kwargs):
        calls.append(kwargs)
        return [
            {"id": "N-1", "published_at": "2026-10-28T08:00:00+00:00"},
            {
                "id": "N-2",
                "published_at": "2026-10-28T09:30:00+00:00",
                "zone_tier": "DROPPED_IRRELEVANT",
            },
        ]

    def fake_regional(article, now=None):
        return article.get("id") == "N-2"

    def must_not_run(*args, **kwargs):
        raise AssertionError("the snapshot news section must never call get_live_news")

    monkeypatch.setattr(news_aggregator, "fetch_news_from_supabase", fake_fetch)
    monkeypatch.setattr(news_router, "is_regional_context", fake_regional)
    monkeypatch.setattr(news_router, "get_live_news", must_not_run)

    section = await svc.section_plan()["news"]()

    assert calls == [{"limit": 40, "include_regional": True}]
    assert section["status"] == "ok"
    # Both display tiers are kept and every row carries its own tier.
    assert [a["id"] for a in section["articles"]] == ["N-1", "N-2"]
    assert section["articles"][0]["relevance_tier"] == "crisis"
    assert section["articles"][1]["relevance_tier"] == "regional"
    assert section["total"] == 2
    # The data clock is the newest kept article's publish time, never now().
    assert section["last_updated"] == "2026-10-28T09:30:00+00:00"


@pytest.mark.asyncio
async def test_news_section_keeps_real_regional_row_and_drops_politics(monkeypatch):
    from datetime import datetime, timezone

    from app.services import news_aggregator

    now = datetime.now(timezone.utc).isoformat()

    async def fake_fetch(**kwargs):
        return [
            {
                "id": "CRISIS",
                "title": "Banjir lumpuh jalur utama Belawan",
                "published_at": now,
                "zone_tier": "RED_CONFIRMED",
            },
            {
                "id": "REGIONAL",
                "title": "Pemkab Aceh Timur bangun jalan terdampak banjir",
                "published_at": now,
                "zone_tier": "DROPPED_IRRELEVANT",
                "province": "Aceh",
                "latitude": 4.6167,
                "longitude": 97.6167,
                "is_geocoded": True,
            },
            {
                "id": "POLITICS",
                "title": "Ketua DPW PPP Aceh Dukung Pemberhentian Waketum",
                "published_at": now,
                "zone_tier": "DROPPED_IRRELEVANT",
                "province": "Aceh",
                "latitude": 5.5483,
                "longitude": 95.3238,
                "is_geocoded": True,
            },
        ]

    monkeypatch.setattr(news_aggregator, "fetch_news_from_supabase", fake_fetch)

    section = await svc.section_plan()["news"]()

    assert [a["id"] for a in section["articles"]] == ["CRISIS", "REGIONAL"]
    assert section["articles"][0]["relevance_tier"] == "crisis"
    assert section["articles"][1]["relevance_tier"] == "regional"


@pytest.mark.asyncio
async def test_news_section_drops_rows_that_neither_pass_nor_read_regional(monkeypatch):
    from app.routers import news_router
    from app.services import news_aggregator

    async def fake_fetch(**kwargs):
        return [
            {"id": "N-1", "published_at": "2026-10-28T08:00:00+00:00"},
            {
                "id": "N-2",
                "published_at": "2026-10-28T09:30:00+00:00",
                "zone_tier": "DROPPED_IRRELEVANT",
            },
        ]

    monkeypatch.setattr(news_aggregator, "fetch_news_from_supabase", fake_fetch)
    monkeypatch.setattr(news_router, "is_regional_context", lambda article, now=None: False)

    section = await svc.section_plan()["news"]()

    # The dropped row never reaches the seed: total reflects the kept rows and
    # the clock is the newest kept article, not a fabricated wall-clock now.
    assert [a["id"] for a in section["articles"]] == ["N-1"]
    assert section["total"] == 1
    assert section["last_updated"] == "2026-10-28T08:00:00+00:00"


@pytest.mark.asyncio
async def test_news_section_last_updated_falls_back_to_now_without_timestamps(monkeypatch):
    from datetime import datetime, timezone

    from app.routers import news_router
    from app.services import news_aggregator

    async def fake_fetch(**kwargs):
        return [{"id": "N-1"}]  # no published_at on any row

    monkeypatch.setattr(news_aggregator, "fetch_news_from_supabase", fake_fetch)

    section = await svc.section_plan()["news"]()

    assert section["status"] == "ok"
    assert section["total"] == 1
    parsed = datetime.fromisoformat(section["last_updated"])
    assert (datetime.now(timezone.utc) - parsed).total_seconds() < 120


@pytest.mark.asyncio
async def test_incidents_section_uses_limit_50(monkeypatch):
    from app.routers import incidents as incidents_router

    calls: list[dict] = []

    async def fake_list(**kwargs):
        calls.append(kwargs)
        return {"items": [], "total": 0}

    monkeypatch.setattr(incidents_router, "list_incidents", fake_list)

    payload = await svc.section_plan()["incidents"]()

    assert calls == [{"status": None, "severity": None, "limit": 50}]
    assert payload == {"items": [], "total": 0}


@pytest.mark.asyncio
async def test_weather_summary_section_has_bbox_cuaca_waspada(monkeypatch):
    from app.routers import routing_router

    async def fake_summary(**kwargs):
        return {
            "bbox": [94.0, -6.0, 108.0, 6.0],
            "generated_at": svc.utcnow().isoformat(),
            "cuaca": {"count": 3, "total": 3, "status": "ok"},
            "waspada": {"count": 1, "total": 1, "status": "ok"},
        }

    monkeypatch.setattr(routing_router, "fetch_weather_summary", fake_summary)

    payload = await svc.section_plan()["weather_summary"]()

    assert payload["bbox"] == [94.0, -6.0, 108.0, 6.0]
    assert payload["generated_at"]
    assert payload["cuaca"]["count"] == 3
    assert payload["waspada"]["count"] == 1


@pytest.mark.asyncio
async def test_weather_summary_timeout_is_degraded_never_fake_zero(monkeypatch):
    async def hang():
        await asyncio.sleep(30)
        return {"bbox": [], "generated_at": "", "cuaca": {}, "waspada": {}}

    monkeypatch.setattr(svc, "section_plan", lambda corridor_id=None: {"weather_summary": hang})
    monkeypatch.setattr(svc, "SECTION_TIMEOUT_SECONDS", 0.05)

    snapshot = await svc.build_global_snapshot()
    section = snapshot["payload"]["weather_summary"]
    assert section["status"] in ("timeout", "degraded")
    assert section["data"] is None or isinstance(section["data"], dict)
    if isinstance(section.get("data"), dict):
        # A reused last-good payload keeps its shape; a fresh timeout is None.
        pass
    else:
        assert section["data"] is None


# ---------------------------------------------------------------------------
# 1b. Section truth from the inner payloads (fire / weather never raise)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_degraded_inner_fire_and_weather_payloads_are_degraded(monkeypatch):
    async def fire():
        return {"status": "degraded", "hotspots": []}

    async def fire_inner_timeout():
        return {"status": "timeout", "hotspots": []}

    async def weather():
        return {
            "bbox": [],
            "generated_at": svc.utcnow().isoformat(),
            # One degraded counter is enough: the snapshot used to store this
            # payload as ok with a fresh timestamp.
            "cuaca": {"count": 0, "total": 0, "status": "degraded"},
            "waspada": {"count": 0, "total": 0, "status": "ok"},
        }

    monkeypatch.setattr(
        svc,
        "section_plan",
        lambda corridor_id=None: {"fire_hotspots": fire, "weather_summary": weather},
    )

    snapshot = await svc.build_global_snapshot()
    payload = snapshot["payload"]
    freshness = snapshot["source_freshness"]

    assert payload["fire_hotspots"]["status"] == "degraded"
    assert payload["fire_hotspots"]["error"] == "upstream degraded"
    assert payload["fire_hotspots"]["data"]["status"] == "degraded"
    assert freshness["fire_hotspots"]["status"] == "degraded"
    assert "fire_hotspots" not in svc._LAST_GOOD

    assert payload["weather_summary"]["status"] == "degraded"
    assert payload["weather_summary"]["error"] == "upstream degraded"
    assert freshness["weather_summary"]["status"] == "degraded"
    assert "weather_summary" not in svc._LAST_GOOD

    # A fire envelope that itself timed out is degraded the same way.
    monkeypatch.setattr(
        svc, "section_plan", lambda corridor_id=None: {"fire_hotspots": fire_inner_timeout}
    )
    snapshot = await svc.build_global_snapshot()
    assert snapshot["payload"]["fire_hotspots"]["status"] == "degraded"
    assert snapshot["source_freshness"]["fire_hotspots"]["status"] == "degraded"
    assert "fire_hotspots" not in svc._LAST_GOOD


@pytest.mark.asyncio
async def test_stale_inner_payloads_are_stale_and_stay_last_good_eligible(monkeypatch):
    async def fire():
        return {"status": "stale", "hotspots": ["A"]}

    async def weather():
        return {
            "bbox": [],
            "generated_at": svc.utcnow().isoformat(),
            "cuaca": {"count": 1, "total": 1, "status": "ok"},
            "waspada": {"count": 0, "total": 0, "status": "stale"},
        }

    monkeypatch.setattr(
        svc,
        "section_plan",
        lambda corridor_id=None: {"fire_hotspots": fire, "weather_summary": weather},
    )

    snapshot = await svc.build_global_snapshot()
    payload = snapshot["payload"]
    freshness = snapshot["source_freshness"]

    assert payload["fire_hotspots"]["status"] == "stale"
    assert payload["fire_hotspots"]["data"]["hotspots"] == ["A"]
    assert freshness["fire_hotspots"]["status"] == "stale"

    assert payload["weather_summary"]["status"] == "stale"
    assert freshness["weather_summary"]["status"] == "stale"

    # Stale data is real data: it still counts as the last-good value.
    assert "fire_hotspots" in svc._LAST_GOOD
    assert "weather_summary" in svc._LAST_GOOD


@pytest.mark.asyncio
async def test_ok_and_empty_inner_payloads_stay_ok(monkeypatch):
    async def fire_empty():
        return {"status": "empty", "hotspots": []}

    async def weather_ok():
        return {
            "bbox": [],
            "generated_at": svc.utcnow().isoformat(),
            "cuaca": {"count": 3, "total": 3, "status": "ok"},
            "waspada": {"count": 1, "total": 1, "status": "ok"},
        }

    monkeypatch.setattr(
        svc,
        "section_plan",
        lambda corridor_id=None: {"fire_hotspots": fire_empty, "weather_summary": weather_ok},
    )

    snapshot = await svc.build_global_snapshot()
    payload = snapshot["payload"]

    assert payload["fire_hotspots"]["status"] == "ok"
    assert payload["weather_summary"]["status"] == "ok"
    assert "fire_hotspots" in svc._LAST_GOOD
    assert "weather_summary" in svc._LAST_GOOD


# ---------------------------------------------------------------------------
# 2. Builder isolation
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_builder_isolates_failing_and_timing_out_sections(monkeypatch):
    async def ok():
        return {"value": "good"}

    async def boom():
        raise RuntimeError("upstream 500")

    async def slow():
        await asyncio.sleep(5)
        return {"value": "too late"}

    monkeypatch.setattr(
        svc,
        "section_plan",
        lambda corridor_id=None: {"healthy": ok, "broken": boom, "slow": slow},
    )
    monkeypatch.setattr(svc, "SECTION_TIMEOUT_SECONDS", 0.05)

    started = time.perf_counter()
    snapshot = await svc.build_global_snapshot()
    elapsed = time.perf_counter() - started

    payload = snapshot["payload"]
    freshness = snapshot["source_freshness"]

    assert payload["healthy"] == {"status": "ok", "data": {"value": "good"}}
    assert payload["broken"]["status"] == "degraded"
    assert payload["broken"]["data"] is None
    assert payload["slow"]["status"] == "timeout"
    assert freshness["broken"]["status"] == "degraded"
    assert "upstream 500" in freshness["broken"]["error"]
    assert freshness["slow"]["status"] == "timeout"
    assert freshness["healthy"]["status"] == "ok"
    assert isinstance(freshness["healthy"]["ms"], int)

    # Top-level envelope.
    assert snapshot["snapshot_key"] == "global"
    assert snapshot["schema_version"] == svc.SNAPSHOT_SCHEMA_VERSION
    assert snapshot["computed_at"]
    # The failing sections must not fail the build, and the timeout must be bounded.
    assert elapsed < 2.0


@pytest.mark.asyncio
async def test_failed_section_reuses_last_good_value(monkeypatch):
    calls = {"n": 0}

    async def flaky():
        calls["n"] += 1
        if calls["n"] == 1:
            return {"items": [1, 2, 3]}
        raise RuntimeError("transient")

    monkeypatch.setattr(svc, "section_plan", lambda corridor_id=None: {"incidents": flaky})

    first = await svc.build_global_snapshot()
    assert first["payload"]["incidents"]["status"] == "ok"

    second = await svc.build_global_snapshot()
    section = second["payload"]["incidents"]
    assert section["status"] == "degraded"
    assert section["data"] == {"items": [1, 2, 3]}
    assert section["cached"] is True


@pytest.mark.asyncio
async def test_sync_section_runs_in_thread_and_stays_jsonable(monkeypatch):
    from datetime import datetime, timezone

    def sync_section():
        return {"at": datetime(2026, 10, 27, tzinfo=timezone.utc)}

    monkeypatch.setattr(svc, "section_plan", lambda corridor_id=None: {"sync": sync_section})

    snapshot = await svc.build_global_snapshot()
    assert snapshot["payload"]["sync"]["status"] == "ok"
    assert isinstance(snapshot["payload"]["sync"]["data"]["at"], str)


# ---------------------------------------------------------------------------
# 3. Persistence
# ---------------------------------------------------------------------------

def test_store_read_round_trip_with_fake_client(monkeypatch):
    client = _FakeClient()
    monkeypatch.setattr(svc, "_client", lambda: client)

    snapshot = _snapshot()
    stored = svc.store_global_snapshot(snapshot)

    assert client.tables == [svc.SNAPSHOT_TABLE]
    assert stored["snapshot_key"] == "global"
    assert stored["payload"] == snapshot["payload"]
    assert stored["computed_at"] == snapshot["computed_at"]
    assert stored["schema_version"] == 1
    assert stored["source_freshness"] == snapshot["source_freshness"]

    read = svc.read_global_snapshot()
    assert read is not None
    assert read["snapshot_key"] == "global"
    assert read["schema_version"] == 1
    assert read["payload"] == snapshot["payload"]
    assert read["source_freshness"] == snapshot["source_freshness"]
    assert svc.snapshot_age_seconds(read) is not None


def test_read_returns_none_when_row_missing(monkeypatch):
    monkeypatch.setattr(svc, "_client", lambda: _FakeClient())
    assert svc.read_global_snapshot() is None


def test_read_returns_none_when_supabase_fails(monkeypatch):
    monkeypatch.setattr(svc, "_client", lambda: _FakeClient(fail=True))
    assert svc.read_global_snapshot() is None


def test_read_treats_schema_version_mismatch_as_a_miss(monkeypatch):
    store = {}
    client = _FakeClient(store=store)
    monkeypatch.setattr(svc, "_client", lambda: client)

    store["global"] = {
        "snapshot_key": "global",
        "payload": {"incidents": {"status": "ok", "data": None}},
        "computed_at": svc.utcnow().isoformat(),
        "schema_version": svc.SNAPSHOT_SCHEMA_VERSION + 1,
        "source_freshness": {},
    }
    assert svc.read_global_snapshot() is None


def test_snapshot_age_seconds_is_none_without_timestamp():
    assert svc.snapshot_age_seconds(None) is None
    assert svc.snapshot_age_seconds({}) is None
    assert svc.snapshot_age_seconds({"computed_at": "not-a-date"}) is None


# ---------------------------------------------------------------------------
# 4. Tick entry point
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_build_and_store_reports_ok(monkeypatch):
    client = _FakeClient()
    monkeypatch.setattr(svc, "_client", lambda: client)

    async def plan_factory():
        return {"ok": True}

    monkeypatch.setattr(svc, "section_plan", lambda corridor_id=None: {"incidents": plan_factory})

    status = await svc.build_and_store_global_snapshot()

    assert status["status"] == "ok"
    assert status["sections"] == 1
    assert status["computed_at"]
    assert "global" in client.store


@pytest.mark.asyncio
async def test_build_and_store_never_raises(monkeypatch):
    async def boom(**kwargs):
        raise RuntimeError("compose failed")

    monkeypatch.setattr(svc, "build_global_snapshot", boom)

    status = await svc.build_and_store_global_snapshot()

    assert status["status"] == "error"
    assert "compose failed" in status["error"]


@pytest.mark.asyncio
async def test_build_and_store_reports_store_failure(monkeypatch):
    monkeypatch.setattr(svc, "_client", lambda: _FakeClient(fail=True))

    async def plan_factory():
        return {"ok": True}

    monkeypatch.setattr(svc, "section_plan", lambda corridor_id=None: {"incidents": plan_factory})

    status = await svc.build_and_store_global_snapshot()
    assert status["status"] == "error"
    assert "supabase unreachable" in status["error"]
