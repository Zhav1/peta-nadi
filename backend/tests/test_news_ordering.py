"""Tests for recency-based round-robin ordering across Sumatra provinces.
Verifies that round-robin does not statically favor Aceh by index, but orders
by the latest article publication timestamp.
"""
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List
import pytest

from app.routers.news_router import apply_breadth_contract


def _make_article(idx: int, province: str, pub_dt: datetime) -> Dict[str, Any]:
    return {
        "id": f"art-{idx}",
        "title": f"Disrupsi logistik {province} {idx}",
        "province": province,
        "region": province,
        "source": f"Media {province}",
        "published_at": pub_dt.isoformat(),
        "created_at": pub_dt.isoformat(),
        "zone_tier": "RED_CONFIRMED",
    }


def test_round_robin_orders_by_recency_not_aceh_first():
    base_time = datetime(2026, 11, 11, 12, 0, 0, tzinfo=timezone.utc)

    # Lampung article is newest (12:00)
    # Sumut article is middle (11:00)
    # Aceh article is oldest (10:00)
    articles = [
        _make_article(1, "Lampung", base_time),
        _make_article(2, "Sumatera Utara", base_time - timedelta(hours=1)),
        _make_article(3, "Aceh", base_time - timedelta(hours=2)),
        _make_article(4, "Lampung", base_time - timedelta(hours=3)),
        _make_article(5, "Sumatera Utara", base_time - timedelta(hours=4)),
        _make_article(6, "Aceh", base_time - timedelta(hours=5)),
    ]

    selected, meta = apply_breadth_contract(articles, max_total=6, per_source_cap=5)

    # The round-robin first pass must pick Lampung, then Sumut, then Aceh (recency order)
    first_three_provinces = [row["province"] for row in selected[:3]]
    assert first_three_provinces == ["Lampung", "Sumatera Utara", "Aceh"], (
        f"Expected ['Lampung', 'Sumatera Utara', 'Aceh'] by recency, got {first_three_provinces}"
    )


def test_round_robin_area_wide_comes_last():
    base_time = datetime(2026, 11, 11, 12, 0, 0, tzinfo=timezone.utc)

    # Even if Area-wide (Sumatera) has a newer timestamp, real provinces take precedence
    articles = [
        _make_article(1, "Sumatera", base_time + timedelta(hours=1)),
        _make_article(2, "Riau", base_time),
        _make_article(3, "Jambi", base_time - timedelta(hours=1)),
    ]

    selected, meta = apply_breadth_contract(articles, max_total=3, per_source_cap=5)
    first_two_provinces = [row["province"] for row in selected[:2]]
    assert first_two_provinces == ["Riau", "Jambi"]
    assert selected[2]["province"] == "Sumatera"
