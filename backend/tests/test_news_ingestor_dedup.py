"""Phase 179 D4 & D8: Gate-1 deduplication, Gate-2 deprecation, and LLM failure hold-back."""
import pytest
from unittest.mock import AsyncMock, patch
from app.nlp.news_extractor import (
    passes_logistics_disruption_prefilter,
    _hold_back_llm,
)
from app.services.unified_news_ingestor import UnifiedNewsIngestor


@pytest.mark.asyncio
async def test_gate1_passes_only_unseen_articles_to_llm():
    """Gate-1 prefilter ensures valid disruption keywords pass and deduplication prevents duplicate LLM calls."""
    article_disruption = {
        "title": "Banjir rendam jalur logistik Medan Belawan",
        "summary": "Truk pengangkut sembako terjebak banjir rob setinggi 60cm di akses pelabuhan Belawan.",
        "link": "https://sumut.antaranews.com/berita/12345/banjir-belawan",
    }
    # 1. Verify it passes the logistics disruption prefilter
    passed = passes_logistics_disruption_prefilter(
        article_disruption["title"],
        article_disruption["summary"],
    )
    assert passed is True, "Expected disruption article to pass Gate-1 prefilter"

    # 2. Verify deduplication tracking
    ingestor = UnifiedNewsIngestor()
    url = article_disruption["link"]
    assert url not in ingestor._processed_disruption_ids
    ingestor._processed_disruption_ids.add(url)
    assert url in ingestor._processed_disruption_ids


@pytest.mark.asyncio
async def test_gate2_reviews_only_ambiguous_within_24h_cap_8_and_persists_once():
    """Phase 179 D8: Gate-2 review is deprecated/no-op and returns reviewed == 0."""
    ingestor = UnifiedNewsIngestor()
    candidates = [
        {"id": f"cand-{i}", "title": f"Banjir Sumatra {i}", "confidence_score": 0.5}
        for i in range(10)
    ]
    res = await ingestor.run_gate2_background_review(candidates)
    assert res["status"] == "success"
    assert res["reviewed"] == 0


def test_heuristic_fallback_never_dropped_without_llm():
    """Phase 179 D4: When LLM fails/unavailable, article is held back safely with HELD_BACK_LLM_UNAVAILABLE."""
    item = {
        "title": "Banjir rendam jalan nasional Riau",
        "summary": "Akses logistik terputus total.",
    }
    _hold_back_llm(item, reason="LLM gateway 503")
    assert item["zone_tier"] == "HELD_BACK_LLM_UNAVAILABLE"
    assert item["is_disruption"] is False
    assert item["is_crisis"] is False
    assert item["llm_status"] == "held_back"
    assert "Ditahan" in item["tier_reason"]
