"""Phase 172.5 (M9) — two honest display tiers, one unchanged hazard gate.

Measured after 172: of the 150 newest `news_articles` rows, 149 are dropped by
the relevance gate and only 1 survives, so the dashboard has almost nothing to
show. Quotas cannot fix an empty pool. The fix classifies for DISPLAY:

* ``crisis``   — passes the existing gate exactly as today (`zone_tier !=
                 DROPPED_IRRELEVANT`). The only tier the hazard pipeline may
                 consume.
* ``regional`` — gate-rejected, but geocoded to one of the ten Sumatra
                 provinces, published within 48h, and about a broad regional
                 topic. Display only: never claimed as crisis, never published
                 to the agent stream.
* ``dropped``  — everything else, unchanged.

Hermetic: Supabase is faked (`get_client`) and the read path's fetch is patched;
Redis is never touched.
"""

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from unittest.mock import AsyncMock

import pytest
from fastapi import BackgroundTasks

from app.routers import news_router
from app.services import news_aggregator, news_yield

NOW = datetime.now(timezone.utc)
NOW_ISO = NOW.isoformat()

REGIONAL_PROVINCES = [
    "Sumatera Utara",
    "Sumatera Barat",
    "Riau",
    "Jambi",
    "Sumatera Selatan",
    "Lampung",
]


# ---------------------------------------------------------------------------
# synthetic rows
# ---------------------------------------------------------------------------


def row(
    idx: int,
    *,
    province: str,
    source: str,
    zone_tier: str,
    title: str,
    published_at: str = NOW_ISO,
) -> Dict[str, Any]:
    """A fully v7, geocoded, fresh row — only `zone_tier`/province/topic differ."""
    return {
        "id": f"tier-{idx}",
        "title": title,
        "summary": title,
        "link": f"https://www.antaranews.com/berita/45{idx:05d}/tier-{idx}",
        "source": source,
        "source_tier": "TIER_2_AUTHORITATIVE_PRESS",
        "province": province,
        "region": province,
        "severity": "medium",
        "latitude": 3.3,
        "longitude": 99.1,
        "is_geocoded": True,
        "location_precision": "kabupaten_kota",
        "zone_tier": zone_tier,
        "original_pub_date": published_at,
        "published_at": published_at,
        "confidence_score": 0.86,
        "ground_truth_metrics": {
            "schema_version": 7,
            "zone_tier": zone_tier,
            "original_pub_date": published_at,
        },
    }


def crisis_row(idx: int) -> Dict[str, Any]:
    return row(
        idx,
        province="Aceh",
        source=f"ANTARA Aceh {idx % 4}",
        zone_tier="YELLOW_CLARIFY",
        title=f"Banjir lumpuh jalan nasional di Aceh {idx}",
    )


def regional_row(idx: int, province: str) -> Dict[str, Any]:
    return row(
        1000 + idx,
        province=province,
        # 5 outlets per province so the per-tier cap of 12 cannot clip the pool.
        source=f"Media {province} {idx % 5}",
        zone_tier="DROPPED_IRRELEVANT",
        title=f"Truk antre di pelabuhan dan jalur logistik {province} {idx}",
    )


def junk_row(idx: int) -> Dict[str, Any]:
    return row(
        2000 + idx,
        province="Sumatera",
        source=f"Junk {idx % 4}",
        zone_tier="DROPPED_IRRELEVANT",
        title=f"Kisah wisata kuliner keluarga bahagia nomor {idx}",
    )


async def call_live(monkeypatch, rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Invoke the read path with a fresh cache and no ingestion work."""
    monkeypatch.setattr(news_router, "fetch_news_from_supabase", AsyncMock(return_value=rows))
    monkeypatch.setattr(
        news_router,
        "_NEWS_CACHE",
        {"articles": [], "last_fetched_at": 0.0, "last_updated": None, "meta": None},
    )
    monkeypatch.setattr(news_router, "_acquire_cross_process_ingestion_lock", lambda: True)
    monkeypatch.setattr(news_router, "_release_cross_process_ingestion_lock", lambda: None)
    return await news_router.get_live_news(
        background_tasks=BackgroundTasks(), province=None, severity=None, force_refresh=False
    )


# ---------------------------------------------------------------------------
# 1. 20 crisis + 100 regional over 6 provinces + 30 junk
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_read_path_splits_crisis_and_regional_with_breadth(monkeypatch):
    rows: List[Dict[str, Any]] = [crisis_row(i) for i in range(20)]
    for i in range(100):
        rows.append(regional_row(i, REGIONAL_PROVINCES[i % len(REGIONAL_PROVINCES)]))
    rows.extend(junk_row(i) for i in range(30))
    assert len(rows) == 150

    res = await call_live(monkeypatch, rows)
    meta = res["meta"]
    articles = res["articles"]

    assert res["status"] == "live"
    assert meta["crisis_count"] == 20
    assert meta["regional_count"] == 100
    assert meta["tier_counts"] == {"crisis": 20, "regional": 100}

    ids = {a["id"] for a in articles}
    for i in range(30):
        assert f"tier-{2000 + i}" not in ids, "junk was admitted"
    assert len(articles) == 120

    # Every regional province the window actually contains is reported as present.
    for province in REGIONAL_PROVINCES:
        assert province in meta["provinces_present"], f"{province} missing from the page"

    # The per-source cap (12) applies inside each tier.
    for tier in ("crisis", "regional"):
        per_source: Dict[str, int] = {}
        for item in articles:
            if item.get("relevance_tier") != tier:
                continue
            per_source[item["source"]] = per_source.get(item["source"], 0) + 1
        assert max(per_source.values()) <= 12, f"{tier} exceeded the per-source cap"
    assert all(count <= 12 for count in meta["source_counts"].values())

    # Ordering: the whole crisis block precedes the whole regional block.
    tiers = [a["relevance_tier"] for a in articles]
    assert tiers == ["crisis"] * 20 + ["regional"] * 100

    # The hazard gate is NOT weakened: regional keeps DROPPED_IRRELEVANT and no
    # regional row is ever promoted to a zone.
    for item in articles:
        if item["relevance_tier"] == "regional":
            assert item["zone_tier"] == "DROPPED_IRRELEVANT"
        else:
            assert item["zone_tier"] == "YELLOW_CLARIFY"

    # Province grouping data is honest about what is actually returned.
    assert sum(meta["province_counts"].values()) == len(articles)
    assert meta["total"] == len(articles)


@pytest.mark.asyncio
async def test_per_source_cap_applies_inside_the_regional_tier(monkeypatch):
    """20 regional rows from ONE outlet → 12 survive, inside the regional tier."""
    rows = [
        dict(regional_row(i, "Bengkulu"), source="Tribun Bengkulu")
        for i in range(20)
    ]
    res = await call_live(monkeypatch, rows)
    assert res["meta"]["regional_count"] == 12
    assert res["meta"]["source_counts"]["Tribun Bengkulu"] == 12
    assert res["meta"]["crisis_count"] == 0


# ---------------------------------------------------------------------------
# 2. the hazard/agent consumer path never receives a regional row
# ---------------------------------------------------------------------------


class _FakeResult:
    def __init__(self, data: List[Dict[str, Any]]):
        self.data = data


class _FakeNewsTable:
    def __init__(self, store: List[Dict[str, Any]]):
        self._store = store
        self._limit: Optional[int] = None

    def select(self, *_a, **_k):
        return self

    def order(self, *_a, **_k):
        return self

    def limit(self, value: int):
        self._limit = value
        return self

    def eq(self, *_a, **_k):
        return self

    def execute(self):
        rows = [dict(r) for r in self._store]
        return _FakeResult(rows[: self._limit] if self._limit else rows)


class _FakeSupabase:
    def __init__(self, rows: List[Dict[str, Any]]):
        self.rows = rows

    def table(self, _name: str):
        return _FakeNewsTable(self.rows)


def _regional_candidate_from_db() -> Dict[str, Any]:
    """A gate-dropped row that WOULD qualify as regional display context."""
    return row(
        9000,
        province="Sumatera Barat",
        source="Tribun Sumbar",
        zone_tier="DROPPED_IRRELEVANT",
        title="Antrean truk di pelabuhan Teluk Bayur",
    )


@pytest.mark.asyncio
async def test_hazard_consumer_path_excludes_regional(monkeypatch):
    import inspect

    params = inspect.signature(news_aggregator.fetch_news_from_supabase).parameters
    assert params["include_regional"].default is False, (
        "the default service contract must be crisis-only (display opts in)"
    )

    fake = _FakeSupabase([_regional_candidate_from_db()])
    monkeypatch.setattr("app.db.supabase_client.get_client", lambda: fake)
    monkeypatch.setattr("app.db.supabase_client.get_write_client", lambda: fake)

    hazard_rows = await news_aggregator.fetch_news_from_supabase(limit=10)
    assert hazard_rows == [], "a regional row leaked into the hazard/agent consumer path"

    display_rows = await news_aggregator.fetch_news_from_supabase(limit=10, include_regional=True)
    assert len(display_rows) == 1, "the display path must be able to classify the candidate"
    assert display_rows[0]["_gate_dropped"] is True
    # Even as a display candidate the row is never re-labelled a hazard.
    assert display_rows[0]["zone_tier"] == "DROPPED_IRRELEVANT"


# ---------------------------------------------------------------------------
# 3. province geocoded only to "Sumatera" is not regional
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_area_wide_province_is_not_admitted_as_regional(monkeypatch):
    area_wide = row(
        9100,
        province="Sumatera",
        source="Media Area",
        zone_tier="DROPPED_IRRELEVANT",
        title="Harga pangan dan distribusi logistik di sejumlah daerah",
    )
    assert news_router.classify_relevance_tier(area_wide) == "dropped"
    assert news_router.is_regional_context(area_wide) is False

    res = await call_live(monkeypatch, [area_wide])
    assert res["articles"] == []
    assert res["meta"]["regional_count"] == 0

    # A "Nasional" label normalizes to the same area-wide bucket.
    nasional = dict(area_wide, province="Nasional", region="Nasional")
    assert news_router.is_regional_context(nasional) is False


# ---------------------------------------------------------------------------
# 4. older than 48h is never regional, topic match or not
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_stale_row_is_not_admitted_as_regional(monkeypatch):
    def regional_at(hours_ago: float) -> Dict[str, Any]:
        return row(
            9200,
            province="Lampung",
            source="Tribun Lampung",
            zone_tier="DROPPED_IRRELEVANT",
            title="Banjir dan cuaca ekstrem di jalur logistik Lampung",
            published_at=(NOW - timedelta(hours=hours_ago)).isoformat(),
        )

    stale = regional_at(72)
    assert news_router.is_regional_context(stale) is False
    assert news_router.classify_relevance_tier(stale) == "dropped"

    # Boundary: 47h old is inside the window, 49h old is not.
    assert news_router.is_regional_context(regional_at(47)) is True
    assert news_router.is_regional_context(regional_at(49)) is False

    res = await call_live(monkeypatch, [stale])
    assert res["articles"] == []
    assert res["meta"]["regional_count"] == 0


# ---------------------------------------------------------------------------
# 5. tier is display-only: the crisis gate itself is untouched
# ---------------------------------------------------------------------------


def test_regional_tier_never_rewrites_zone_tier():
    regional = row(
        9300,
        province="Riau",
        source="Media Riau",
        zone_tier="DROPPED_IRRELEVANT",
        title="Kapal dan truk tertahan di pelabuhan Dumai",
    )
    assert news_router.classify_relevance_tier(regional) == "regional"
    assert regional["zone_tier"] == "DROPPED_IRRELEVANT", "classification must not mutate the row"

    crisis = row(
        9301,
        province="Riau",
        source="Media Riau",
        zone_tier="RED_CONFIRMED",
        title="Kebakaran hutan tutup jalan lintas",
    )
    assert news_router.classify_relevance_tier(crisis) == "crisis"

    # Short tokens must not fire inside unrelated words ("kontrol").
    noise = row(
        9302,
        province="Riau",
        source="Media Riau",
        zone_tier="DROPPED_IRRELEVANT",
        title="Protokol kontrol lalu lintas upacara adat",
    )
    assert news_router.is_regional_context(noise) is False


# ---------------------------------------------------------------------------
# 6. the yield diagnostic reports the two regional counters separately
# ---------------------------------------------------------------------------


def test_foreign_conflict_story_is_not_regional_context():
    gaza = row(
        9400,
        province="Aceh",
        source="Tribun Aceh",
        zone_tier="DROPPED_IRRELEVANT",
        title="Pengungsi Gaza Terancam Hujan, Angin Kencang, dan Banjir",
    )
    assert news_router.is_regional_context(gaza) is False
    assert news_router.classify_relevance_tier(gaza) == "dropped"

    hormuz = row(
        9401,
        province="Aceh",
        source="Tribun Aceh",
        zone_tier="DROPPED_IRRELEVANT",
        title="IRGC Klaim Tiga Kapal Tanker Terbakar di Selat Hormuz",
    )
    assert news_router.is_regional_context(hormuz) is False

    local = row(
        9402,
        province="Aceh",
        source="ANTARA News Aceh",
        zone_tier="DROPPED_IRRELEVANT",
        title="BPBD Pidie Jaya koordinasikan penanganan darurat cegah banjir",
    )
    assert news_router.is_regional_context(local) is True


def test_yield_report_exposes_regional_counters(monkeypatch):
    news_yield.reset_yield_counters()
    monkeypatch.setattr(news_yield, "_redis", lambda: None)

    news_yield.record_yield("Tribun Aceh", "dropped_gate", "Aceh", count=5)
    news_yield.record_yield("Tribun Aceh", "regional_admitted", "Aceh", count=3)
    news_yield.record_yield("Tribun Aceh", "regional_dropped", "Aceh", count=2)

    source = news_yield.get_yield_report()["sources"]["Tribun Aceh"]
    assert source["regional_admitted"] == 3
    assert source["regional_dropped"] == 2
    # The hazard counter keeps its own, untouched meaning.
    assert source["dropped_gate"] == 5
    news_yield.reset_yield_counters()
