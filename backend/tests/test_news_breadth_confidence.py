"""Phase 172 (M9) — Berita breadth + confidence honesty.

SPEC decision 7: the 0.86/0.94 constant is never displayed as confidence;
unverified reads "Belum terverifikasi".
SPEC decision 8: measure per-feed yield, kill the silent "Sumatera Utara"
default, then enforce read-time quotas (max per source + every province with
qualifying 48h articles appears).

Hermetic: Supabase is not touched (`fetch_news_from_supabase` is patched) and
Redis is only ever best-effort — the yield module answers from process memory
when a bucket cannot be written.
"""

from datetime import datetime, timezone
from typing import Any, Dict, List
from unittest.mock import AsyncMock

import pytest
from fastapi import BackgroundTasks

from app.nlp.geocoding_service import resolve_sumatra_location_and_corridor
from app.nlp.news_extractor import _fast_heuristic_extraction
from app.routers import news_router
from app.services import news_yield

NOW = datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# synthetic rows
# ---------------------------------------------------------------------------


def article(
    idx: int,
    *,
    source: str = "LKBN ANTARA Sumut",
    province: str = "Sumatera Utara",
    source_tier: str = "TIER_2_AUTHORITATIVE_PRESS",
    confidence_score: float = 0.86,
    audit: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    """A row that is already v7, fresh, geocoded and inside the Sumatra bbox."""
    gtm: Dict[str, Any] = {
        "schema_version": 7,
        "zone_tier": "YELLOW_CLARIFY",
        "original_pub_date": NOW,
    }
    if audit is not None:
        gtm["verification_audit"] = audit
    return {
        "id": f"art-{idx}",
        "title": f"Banjir lumpuh jalan nasional {idx}",
        "link": f"https://www.antaranews.com/berita/45{idx:05d}/banjir-{idx}",
        "source": source,
        "source_tier": source_tier,
        "province": province,
        "region": province,
        "severity": "high",
        "latitude": 3.3,
        "longitude": 99.1,
        "is_geocoded": True,
        "location_precision": "kabupaten_kota",
        "zone_tier": "YELLOW_CLARIFY",
        "original_pub_date": NOW,
        "published_at": NOW,
        "confidence_score": confidence_score,
        "ground_truth_metrics": gtm,
    }


async def call_live(monkeypatch, rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Invoke the read path directly with a fresh cache and no ingestion work."""
    monkeypatch.setattr(news_router, "fetch_news_from_supabase", AsyncMock(return_value=rows))
    monkeypatch.setattr(
        news_router,
        "_NEWS_CACHE",
        {"articles": [], "last_fetched_at": 0.0, "last_updated": None, "meta": None},
    )
    monkeypatch.setattr(news_router, "_acquire_cross_process_ingestion_lock", lambda: True)
    monkeypatch.setattr(news_router, "_release_cross_process_ingestion_lock", lambda: None)

    tasks = BackgroundTasks()
    return await news_router.get_live_news(
        background_tasks=tasks, province=None, severity=None, force_refresh=False
    )


# ---------------------------------------------------------------------------
# 1. read-time diversity contract
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_breadth_contract_caps_one_source_and_keeps_every_province(monkeypatch):
    """100 Aceh items from one feed + 50 across 4 provinces → all 5, ≤12 each."""
    rows: List[Dict[str, Any]] = []
    for i in range(100):
        rows.append(article(i, source="Tribun Aceh", province="Aceh"))
    spread = ["Sumatera Utara", "Sumatera Barat", "Lampung", "Riau"]
    for i in range(50):
        province = spread[i % 4]
        rows.append(article(100 + i, source=f"Media {province}", province=province))

    res = await call_live(monkeypatch, rows)
    meta = res["meta"]
    returned = res["articles"]

    assert res["status"] == "live"
    assert len(rows) == 150
    for province in ["Aceh", *spread]:
        assert province in meta["provinces_present"], f"{province} missing from the first page"

    aceh_count = sum(1 for a in returned if a.get("source") == "Tribun Aceh")
    assert aceh_count <= 12, "one prolific publisher filled the window"
    assert meta["source_counts"]["Tribun Aceh"] <= 12
    assert meta["max_per_source"] == 12

    assert sum(meta["province_counts"].values()) == len(returned)
    assert meta["province_counts"]["Aceh"] >= 1
    assert len(returned) <= 150
    assert meta["truncated"] is True
    # Provinces with no qualifying article are reported, never invented.
    assert "Bengkulu" in meta["provinces_missing"]
    assert "Aceh" not in meta["provinces_missing"]


# ---------------------------------------------------------------------------
# 2. province derivation honesty
# ---------------------------------------------------------------------------


def test_unlocated_article_is_area_wide_never_sumut():
    art = {
        "title": "Harga cabai merah naik di sejumlah daerah jelang akhir tahun",
        "raw_description": "Kenaikan harga cabai merah terjadi di berbagai daerah.",
        "source": "Google News",
        "link": "https://example.com/a/1",
        "pubDate": NOW,
    }
    out = _fast_heuristic_extraction(art)
    assert out["is_geocoded"] is False
    assert out["province"] == "Sumatera"
    assert out["province"] != "Sumatera Utara"
    assert out["region"] == out["province"]

    # The resolver itself must not echo the caller's fallback as a "resolved"
    # province when nothing matched.
    resolved = resolve_sumatra_location_and_corridor(art["title"], fallback_province="Sumatera Utara")
    assert resolved["is_geocoded"] is False
    assert resolved["province"] is None


def test_declared_feed_province_is_the_only_fallback():
    base = {
        "title": "Harga cabai merah naik di sejumlah daerah jelang akhir tahun",
        "raw_description": "Kenaikan harga cabai merah terjadi di berbagai daerah.",
        "source": "Feed",
        "link": "https://example.com/a/2",
        "pubDate": NOW,
    }
    aceh = _fast_heuristic_extraction({**base, "province": "Aceh"})
    assert aceh["province"] == "Aceh", "a feed that declares a province may use it"

    # "Nasional" is not a province claim.
    national = _fast_heuristic_extraction({**base, "province": "Nasional"})
    assert national["province"] == "Sumatera"


# ---------------------------------------------------------------------------
# 3-5. confidence honesty
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_tier2_without_corroboration_has_no_value_and_says_unverified(monkeypatch):
    res = await call_live(
        monkeypatch,
        [article(1, source="Tribun Batam", province="Kepulauan Riau", confidence_score=0.86)],
    )
    item = res["articles"][0]
    display = item["display_confidence"]

    assert display["value"] is None
    assert display["label"] == "Belum terverifikasi"
    assert display["basis"] == "unverified"
    assert display["tier"] == "TIER_2_AUTHORITATIVE_PRESS"
    # The extractor's constant is still carried for legacy consumers…
    assert item["confidence_score"] == pytest.approx(0.86)
    # …but it is documented as display-deprecated.
    assert "deprecated" in res["meta"]["confidence_note"].lower()


@pytest.mark.asyncio
async def test_calibrated_value_with_sensor_corroboration_is_shown(monkeypatch):
    audit = {"calibrated_confidence": 0.78, "corroborating_agents": ["BMKG_RADAR", "OSINT_AUTHORITY"]}
    res = await call_live(
        monkeypatch,
        [article(2, source="Tribun Palembang", province="Sumatera Selatan", audit=audit)],
    )
    display = res["articles"][0]["display_confidence"]
    assert display["value"] == pytest.approx(0.78)
    assert display["label"] == "Terverifikasi sensor"
    assert display["basis"] == "sensor_corroborated"


@pytest.mark.asyncio
async def test_no_payload_article_exposes_the_static_constant_as_value(monkeypatch):
    rows = [article(i) for i in range(20)]
    rows += [article(100 + i, source="LKBN ANTARA Aceh", province="Aceh", source_tier="TIER_1_OFFICIAL",
                     confidence_score=0.94) for i in range(5)]
    res = await call_live(monkeypatch, rows)
    assert res["articles"], "payload is empty — the assertion would be vacuous"
    for item in res["articles"]:
        value = item["display_confidence"]["value"]
        assert value != pytest.approx(0.86), "the static Tier-2 constant leaked into display_confidence"
        assert value != pytest.approx(0.94), "the static Tier-1 constant leaked into display_confidence"
        assert item["display_confidence"]["label"] in {
            "Terverifikasi sensor",
            "Terkonfirmasi multi-sumber",
            "Satu sumber",
            "Belum terverifikasi",
        }


# ---------------------------------------------------------------------------
# 6. yield diagnostic
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_yield_endpoint_reports_per_source_funnel_keys(monkeypatch):
    news_yield.reset_yield_counters()
    # Hermetic: never read/write a shared Redis bucket in a unit test.
    monkeypatch.setattr(news_yield, "_redis", lambda: None)
    monkeypatch.setattr(
        "app.config.get_settings",
        lambda: type("S", (), {"internal_tick_token": ""})(),
    )


    news_yield.record_yield("Tribun Aceh", "fetched", "Aceh", count=9)
    news_yield.record_yield("Tribun Aceh", "dropped_gate", "Aceh", count=2)
    news_yield.record_yield("Tribun Aceh", "dropped_stale", "Aceh")
    news_yield.record_yield("Tribun Aceh", "dropped_ungeocoded", "Aceh", count=3)
    news_yield.record_yield("Tribun Aceh", "published", "Aceh", count=4)

    report = await news_router.get_news_yield(x_internal_token=None, window_hours=24)

    assert report["window_hours"] == 24
    assert report["storage"] in {"redis", "memory"}
    source = report["sources"]["Tribun Aceh"]
    for key in (
        "fetched",
        "dropped_gate",
        "dropped_stale",
        "dropped_ungeocoded",
        "published",
        "last_seen_at",
    ):
        assert key in source, f"missing yield counter: {key}"
    assert source["fetched"] == 9
    assert source["dropped_gate"] == 2
    assert source["dropped_stale"] == 1
    assert source["dropped_ungeocoded"] == 3
    assert source["published"] == 4
    assert source["last_seen_at"] is not None

    assert report["provinces"]["Aceh"]["published"] == 4
    assert report["totals"]["fetched"] == 9
    news_yield.reset_yield_counters()


@pytest.mark.asyncio
async def test_read_path_drops_are_deduped_per_article(monkeypatch):
    """A re-scanned window must not inflate one rejected row into thousands."""
    news_yield.reset_yield_counters()
    monkeypatch.setattr(news_yield, "_redis", lambda: None)

    for _ in range(5):
        news_yield.record_read_drop("art-dup-1", "Republika", "dropped_gate", "Sumatera")
    assert news_yield.get_yield_report()["sources"]["Republika"]["dropped_gate"] == 1

    news_yield.record_read_drop("art-dup-2", "Republika", "dropped_gate", "Sumatera")
    assert news_yield.get_yield_report()["sources"]["Republika"]["dropped_gate"] == 2
    news_yield.reset_yield_counters()


@pytest.mark.asyncio
async def test_yield_endpoint_requires_internal_token_when_configured(monkeypatch):
    news_yield.reset_yield_counters()
    monkeypatch.setattr(news_yield, "_redis", lambda: None)
    monkeypatch.setattr(
        "app.config.get_settings",
        lambda: type("S", (), {"internal_tick_token": "secret-token"})(),
    )
    with pytest.raises(Exception) as exc:
        await news_router.get_news_yield(x_internal_token="wrong", window_hours=24)
    assert getattr(exc.value, "status_code", None) == 401

    ok = await news_router.get_news_yield(x_internal_token="secret-token", window_hours=24)
    assert "sources" in ok
