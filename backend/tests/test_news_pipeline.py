import pytest
from app.services.news_aggregator import (
    OFFICIAL_RSS_FEEDS,
    TARGETED_PRESS_QUERIES,
    FALLBACK_STANDARDIZED_ARTICLES,
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
    assert res1["id"] == res2["id"]
    assert "Beras BULOG" in res1["commodities_affected"]
