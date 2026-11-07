"""Phase 179 D4 & D7: Removal of regional display leak and strict disruption classification."""
import pytest
from app.routers import news_router


def test_regional_context_always_false_purging_regional_display_leak():
    """Phase 179 D4/D7: is_regional_context is always False (regional tier removed)."""
    sample_article = {
        "title": "Truk antre di pelabuhan Teluk Bayur dan jalan tol",
        "summary": "Antrean kendaraan logistik di pelabuhan.",
        "province": "Sumatera Barat",
        "zone_tier": "DROPPED_IRRELEVANT",
    }
    assert news_router.is_regional_context(sample_article) is False

    sample_article_2 = {
        "title": "Banjir rendam jalan lintas Sumatera",
        "summary": "Genangan air menghambat arus barang.",
        "province": "Lampung",
        "zone_tier": "DROPPED_IRRELEVANT",
    }
    assert news_router.is_regional_context(sample_article_2) is False


def test_dropped_irrelevant_always_classifies_as_dropped():
    """Phase 179 D4/D7: DROPPED_IRRELEVANT rows always classify as 'dropped', never promoted."""
    article = {
        "title": "Pelatihan konversi motor listrik PLN",
        "summary": "CSR PLN membina siswa SMK.",
        "province": "Sumatera Utara",
        "zone_tier": "DROPPED_IRRELEVANT",
    }
    assert news_router.classify_relevance_tier(article) == "dropped"

    article_held = {
        "title": "Berita tanpa verifikasi LLM",
        "summary": "Ringkasan berita.",
        "province": "Riau",
        "zone_tier": "HELD_BACK_LLM_UNAVAILABLE",
    }
    assert news_router.classify_relevance_tier(article_held) == "dropped"


def test_valid_crisis_still_classifies_as_crisis():
    """Phase 179 D7: Valid verified disruption articles classify as 'crisis'."""
    crisis_article = {
        "title": "Banjir Bandang Terjang Jalur Logistik Padang Panjang",
        "summary": "Akses jalan nasional terputus total akibat luapan sungai.",
        "province": "Sumatera Barat",
        "zone_tier": "RED_CONFIRMED",
        "is_disruption": True,
    }
    assert news_router.classify_relevance_tier(crisis_article) == "crisis"
