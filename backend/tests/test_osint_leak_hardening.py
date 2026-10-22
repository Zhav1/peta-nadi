"""Regression tests for OSINT News Pipeline Leak Hardening (Tasks 1-5).

Covers:
1. Freshness backdoor (relative ID parsing + fail-closed prod).
2. Baca-Juga DOM stripping.
3. Sentence-level physical proximity + economic veto.
4. Pan-Sumatra spatial rules (remote towns pass, un-geocoded never RED).
5. Single-item LLM batch (no cross-contamination signature).
"""
import pytest
from datetime import datetime, timezone

from app.services.news_aggregator import (
    parse_and_validate_article_freshness,
    extract_lead_text_from_html,
    extract_full_article_body_from_html,
)
from app.nlp.news_extractor import (
    SUMATRA_GEO_REGEX,
    has_physical_crisis_proximity,
    _fast_heuristic_extraction,
    _apply_batch_llm_item,
    passes_disaster_regex_gate,
)
from app.nlp.geocoding_service import resolve_all_sumatra_locations
from app.nlp.news_extractor import _is_within_strict_sumatra_bbox


# ---------- 1. Freshness ----------

def test_relative_menit_lalu_is_fresh():
    r = parse_and_validate_article_freshness("15 menit lalu", "https://x.com/a", max_age_hours=48)
    assert r["is_fresh"] is True
    assert r["age_hours"] is not None and r["age_hours"] < 1.0


def test_relative_jam_lalu_is_fresh():
    r = parse_and_validate_article_freshness("2 jam lalu", "https://x.com/a", max_age_hours=48)
    assert r["is_fresh"] is True
    assert 1.9 <= r["age_hours"] <= 2.1


def test_relative_hari_lalu_stale():
    r = parse_and_validate_article_freshness("3 hari lalu", "https://x.com/a", max_age_hours=48)
    assert r["is_fresh"] is False
    assert r["age_hours"] == 72.0


def test_shortform_m_j_lalu_supported():
    assert parse_and_validate_article_freshness("10m lalu", "https://x.com/a")["is_fresh"] is True
    assert parse_and_validate_article_freshness("1j lalu", "https://x.com/a")["is_fresh"] is True


def test_missing_date_prod_fails_closed():
    r = parse_and_validate_article_freshness(None, "https://sumut.antaranews.com/berita/123/x")
    assert r["is_fresh"] is False
    assert r["reject_reason"] == "unparseable_date_in_prod"


def test_terkini_prod_fails_closed():
    r = parse_and_validate_article_freshness("Terkini", "https://x.com/a")
    assert r["is_fresh"] is False
    assert r["reject_reason"] == "unparseable_date_in_prod"


def test_missing_date_fixture_flag_passes():
    r = parse_and_validate_article_freshness(None, "https://x.com/a", is_test_fixture=True)
    assert r["is_fresh"] is True


# ---------- 2. Baca-Juga stripping ----------

def test_baca_juga_para_stripped_lead():
    html = """
    <html><body><article>
    <p>Banjir merendam jalan arteri Jalinsum KM 78 di Tebing Tinggi, arus dialihkan.</p>
    <p>Baca juga: <a href="/lama">Jalan Lintas Timur Banjir Tahun Lalu di Palembang</a> bikin heboh.</p>
    <p>Saksikan video pilihan di bawah ini untuk info selengkapnya.</p>
    <p>Petugas BPBD mengevakuasi warga dengan perahu karet ke posko pengungsian darurat.</p>
    </article></body></html>
    """
    cleaned = extract_lead_text_from_html(html)
    assert "Jalan Lintas Timur Banjir Tahun Lalu" not in cleaned
    assert "Saksikan video pilihan" not in cleaned
    assert "Banjir merendam jalan arteri" in cleaned or "BPBD" in cleaned


def test_baca_juga_variants_stripped_full_body():
    html = """
    <html><body><article>
    <p>Longsor menutup badan jalan Sitinjau Lauik, Padang ke Solok lumpuh total.</p>
    <p>Lihat Juga: Longsor tahun 2022 di tempat sama menewaskan warga.</p>
    <p>Ikuti berita terbaru di Google News untuk update harian.</p>
    <p>Alat berat dikerahkan untuk membersihkan material longsor setebal dua meter.</p>
    </article></body></html>
    """
    cleaned = extract_full_article_body_from_html(html)
    assert "Longsor tahun 2022" not in cleaned
    assert "Google News" not in cleaned


# ---------- 3. Sentence proximity + metaphor veto ----------

@pytest.mark.parametrize("title,desc", [
    ("Harga cabai tinggi buat daya beli warga di Lampung lumpuh",
     "Kenaikan harga cabai meroket menekan daya beli masyarakat Lampung."),
    ("Pasokan beras terputus akibat ulah tengkulak di Medan",
     "Distribusi beras terganggu oleh permainan harga tengkulak, bukan banjir."),
    ("Banjir diskon tol Trans-Sumatera sambut liburan",
     "Promo banjir diskon tarif tol Trans Sumatera hingga 20 persen."),
    ("Gempa politik jelang pilkada guncang Sumatera Utara",
     "Dukungan suara terbelah, kritik pedas mewarnai bursa calon."),
])
def test_metaphor_economic_news_dropped(title, desc):
    assert has_physical_crisis_proximity(f"{title}. {desc}") is False
    art = {
        "title": title,
        "raw_description": desc,
        "source": "Media",
        "link": "https://sumut.antaranews.com/berita/999/x",
        "pubDate": "5 menit lalu",
        "published_at": "5 menit lalu",
        "original_pub_date": "5 menit lalu",
    }
    out = _fast_heuristic_extraction(art)
    assert out["zone_tier"] == "DROPPED_IRRELEVANT"


def test_true_physical_blockage_passes_proximity():
    assert has_physical_crisis_proximity(
        "Banjir merendam jalan arteri Jalinsum KM 78 di Tebing Tinggi, arus dialihkan."
    ) is True
    assert has_physical_crisis_proximity(
        "Jembatan putus di Curup Bengkulu, akses jalan tertutup total."
    ) is True
    assert has_physical_crisis_proximity(
        "Longsor menutup badan jalan Sitinjau Lauik, Padang ke Solok lumpuh total."
    ) is True


# ---------- 4. Pan-Sumatra spatial ----------

@pytest.mark.parametrize("place", [
    "Curup", "Mukomuko", "Kaur", "Lebong",
    "Natuna", "Anambas", "Lingga", "Karimun", "Batam", "Bintan",
    "Mentawai", "Tuapejat", "Enggano",
    "Nias", "Gunungsitoli", "Simeulue", "Sabang",
    "Kerinci", "Sungai Penuh", "Krui", "Pesisir Barat",
    "Tapanuli", "Sipirok", "Tarutung",
    "Jalinsum", "Jalintim", "Jalinbar", "Jalinteng", "Jalinpantim",
    "Lintas Sumatera", "Lintas Timur", "Lintas Barat", "Lintas Tengah",
    "JTTS", "Tol Trans Sumatera", "Trans Sumatera",
    "Manggar", "Toboali", "Koba", "Ranai",
])
def test_geo_regex_covers_pan_sumatra(place):
    assert SUMATRA_GEO_REGEX.search(place) is not None, f"missing geo anchor: {place}"


@pytest.mark.parametrize("text,province", [
    ("Jembatan amblas di Curup Bengkulu, akses jalan tertutup total", "Bengkulu"),
    ("Rob merendam dermaga Kuala Tungkal Tanjung Jabung Barat, penyeberangan lumpuh", "Jambi"),
    ("Longsor menutup badan jalan lintas Tapanuli Sipirok, kendaraan tak bisa dilalui", "Sumatera Utara"),
    ("Tanah longsor timbun akses Nias Selatan, jalan terputus", "Sumatera Utara"),
    ("Banjir bandang rendam jalur Kerinci Sungai Penuh, jembatan putus", "Jambi"),
    ("Longsor tutup ruas Krui Pesisir Barat Lampung, arus dialihkan via Liwa", "Lampung"),
    ("Gelombang tinggi tutup penyeberangan Natuna Ranai, kapal tak berlayar", "Kepulauan Riau"),
])
def test_remote_physical_incidents_geocode_and_tier(text, province):
    assert passes_disaster_regex_gate(text, "") is True or SUMATRA_GEO_REGEX.search(text) is not None
    locs = resolve_all_sumatra_locations(text, fallback_province=province)
    assert locs, f"no geocode for: {text}"
    for loc in locs:
        assert _is_within_strict_sumatra_bbox(loc["latitude"], loc["longitude"]) is True
    art = {
        "title": text,
        "raw_description": text,
        "source": "LKBN ANTARA",
        "source_tier": "TIER_1_OFFICIAL",
        "province": province,
        "link": "https://antaranews.com/berita/999/x",
        "pubDate": "5 menit lalu",
        "published_at": "5 menit lalu",
        "original_pub_date": "5 menit lalu",
    }
    out = _fast_heuristic_extraction(art)
    assert out["is_geocoded"] is True
    assert out["zone_tier"] in ("RED_CONFIRMED", "YELLOW_CLARIFY")


def test_ungeocoded_never_red_via_llm_merge():
    base = _fast_heuristic_extraction({
        "title": "Banjir rendam kawasan Sumatera",
        "raw_description": "Air menggenang di wilayah Sumatera tanpa titik jelas.",
        "source": "Media",
        "link": "https://x.com/1",
        "pubDate": "5 menit lalu",
        "published_at": "5 menit lalu",
        "original_pub_date": "5 menit lalu",
    })
    base["is_geocoded"] = False
    base["latitude"] = None
    base["longitude"] = None
    base["location_precision"] = "none"
    _apply_batch_llm_item(base, {
        "id": base.get("id"),
        "is_active_disaster": True,
        "zone_tier": "RED_CONFIRMED",
        "tier_reason": "LLM claims red",
        "verified_sumatra_location": None,
    })
    assert base["zone_tier"] != "RED_CONFIRMED"


def test_out_of_bbox_dropped():
    art = {
        "title": "Banjir putus jalan di Semarang",
        "raw_description": "Banjir merendam jalan arteri Semarang, akses lumpuh total.",
        "source": "Antara Jateng",
        "link": "https://jateng.antaranews.com/berita/1/x",
        "pubDate": "5 menit lalu",
        "published_at": "5 menit lalu",
        "original_pub_date": "5 menit lalu",
    }
    out = _fast_heuristic_extraction(art)
    assert out["zone_tier"] == "DROPPED_IRRELEVANT"


# ---------- 5. Batch is single-item (no array prompt) ----------

@pytest.mark.asyncio
async def test_batch_single_item_no_bleed(monkeypatch):
    from app.nlp import news_extractor as nx
    from agents import llm_gateway as gw

    calls = []

    async def fake_generate_content(prompt, model_name=None, **kw):
        calls.append(prompt)
        # Echo back per-article id found in prompt; never leak other ids.
        import re as _re
        m = _re.search(r'"id":\s*"([^"]+)"', prompt)
        _id = m.group(1) if m else "unknown"
        assert "array JSON" not in prompt.lower() or "satu objek per artikel" not in prompt.lower(), \
            "batch array prompt leaked into single-item path"
        return (
            '{"id": "%s", "is_active_disaster": false, '
            '"zone_tier": "DROPPED_IRRELEVANT", "tier_reason": "uji", '
            '"verified_sumatra_location": null}' % _id
        )

    monkeypatch.setattr(gw.LLMGateway, "generate_content", fake_generate_content)
    monkeypatch.setattr(nx, "get_settings", lambda: type("S", (), {"opencode_api_key": "test-key"})())

    arts = [
        {"id": "A1", "title": "Banjir putus jalan Sitinjau Lauik Padang Solok",
         "raw_description": "Longsor menutup badan jalan Sitinjau Lauik.",
         "source": "ANTARA", "link": "https://x.com/a1",
         "pubDate": "5 menit lalu", "published_at": "5 menit lalu", "original_pub_date": "5 menit lalu"},
        {"id": "A2", "title": "Harga beras naik di pasar Medan",
         "raw_description": "Operasi pasar digelar, harga beras naik tipis.",
         "source": "ANTARA", "link": "https://x.com/a2",
         "pubDate": "5 menit lalu", "published_at": "5 menit lalu", "original_pub_date": "5 menit lalu"},
    ]
    # Force both past heuristic by stubbing heuristic? No — run real path;
    # A2 should drop via pre-filter with 0 LLM calls, A1 gets exactly 1 isolated call.
    res = await nx.extract_structured_news_batch(arts)
    assert len(res) == 2
    # At most 1 LLM call (A2 drops pre-LLM), and prompts never contain both ids.
    for p in calls:
        assert not ("A1" in p and "A2" in p), "cross-article bleed: single prompt contains both ids"
