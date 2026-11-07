"""Phase 179 D8: Gate-2 mimo-v2.6-pro review deprecation and safe no-op verification."""
import pytest
from app.nlp.news_extractor import _needs_gate2_review, run_gate2_async_verification
from app.services.unified_news_ingestor import UnifiedNewsIngestor


@pytest.mark.asyncio
async def test_gate2_mimo_review_is_noop_and_returns_zero_reviewed():
    """Phase 179 D8: Gate-2 background review is a clean no-op returning reviewed: 0."""
    ingestor = UnifiedNewsIngestor()
    sample_articles = [
        {"title": "Banjir Belawan", "zone_tier": "YELLOW_CLARIFY", "confidence_score": 0.55},
        {"title": "Tanah Longsor Bukittinggi", "zone_tier": "RED_CONFIRMED", "confidence_score": 0.65},
    ]
    result = await ingestor.run_gate2_background_review(sample_articles)
    assert result["status"] == "success"
    assert result["reviewed"] == 0
    assert "Gate-2 dropped" in result.get("message", "")


def test_needs_gate2_review_always_returns_false():
    """Phase 179 D8: _needs_gate2_review always returns False (no Gate-2 review passes needed)."""
    # Test ambiguous confidence
    ambiguous_article = {
        "title": "Banjir rendam jalan",
        "zone_tier": "YELLOW_CLARIFY",
        "confidence_score": 0.55,
        "raw_description": "Air setinggi 50cm menggenangi jalan raya.",
    }
    assert _needs_gate2_review(ambiguous_article) is False

    # Test high-confidence article
    clear_article = {
        "title": "Jembatan Ampera Amblas",
        "zone_tier": "RED_CONFIRMED",
        "confidence_score": 0.95,
    }
    assert _needs_gate2_review(clear_article) is False


@pytest.mark.asyncio
async def test_gate2_async_verification_passes_articles_unmodified():
    """Phase 179 D8: run_gate2_async_verification safely returns original articles without mutation."""
    articles = [
        {"id": "art-1", "title": "Longsor Sumbar", "zone_tier": "RED_CONFIRMED", "latitude": -0.45, "longitude": 100.35},
        {"id": "art-2", "title": "Banjir Riau", "zone_tier": "YELLOW_CLARIFY", "latitude": 0.51, "longitude": 101.44},
    ]
    verified = await run_gate2_async_verification(articles)
    assert verified == articles
    assert len(verified) == 2
    assert verified[0]["zone_tier"] == "RED_CONFIRMED"
    assert verified[1]["zone_tier"] == "YELLOW_CLARIFY"
