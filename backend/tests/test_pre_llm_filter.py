"""
Unit & Integration tests for Phase 83: Zero-Token Pre-LLM Filtering & Distillation Pipeline.
Verifies:
1. Zero-token HTML boilerplate & ad stripping, plus 400-char lead clamping.
2. Two-factor deterministic regex pre-LLM gate (Disaster keyword co-occurring with Sumatra anchor).
3. Automatic dropping of non-matching articles with 0 LLM tokens spent.
4. CoT & <think> tag stripping for DeepSeek-R1 / OpenCode completions.
"""
import pytest
from app.services.news_aggregator import extract_lead_text_from_html
from app.nlp.news_extractor import (
    passes_disaster_regex_gate,
    extract_structured_news_batch,
    extract_structured_news,
)
from agents.llm_gateway import strip_thinking_tags


def test_html_stripping_and_clamping():
    """Verifies that non-content tags, ads, and widgets are stripped and output is clamped to <= 400 chars."""
    raw_html = """
    <!DOCTYPE html>
    <html>
    <head>
        <script>var tracker = 123;</script>
        <style>.body { color: red; }</style>
        <meta property="og:description" content="Banjir bandang melanda wilayah Agam Sumatera Barat akibat luapan sungai.">
    </head>
    <body>
        <header><nav><a href="/">Home</a></nav></header>
        <div class="ad-banner">Dapatkan promo diskon tiket murah sekarang juga!</div>
        <article class="post-content">
            <p>Hujan deras dengan intensitas tinggi memicu luapan sungai yang merendam puluhan rumah di Kabupaten Agam.</p>
            <p>Akses transportasi logistik bahan pokok sempat terhambat akibat genangan air setinggi 80 cm di badan jalan raya.</p>
            <p>Petugas BPBD bersama relawan telah diterjunkan ke lokasi untuk membantu evakuasi warga dan pengamanan arus lalu lintas.</p>
            <p>""" + ("Paragraf pengisi yang sangat panjang sekali " * 30) + """</p>
        </article>
        <aside><div class="sidebar-widget">Berita Populer Lainnya</div></aside>
        <footer><p>Copyright 2026 Antara News. All rights reserved.</p></footer>
    </body>
    </html>
    """
    cleaned = extract_lead_text_from_html(raw_html)

    # Must be stripped and strictly clamped to <= 400 chars
    assert len(cleaned) <= 400
    assert "<script" not in cleaned
    assert "<style" not in cleaned
    assert "promo diskon tiket" not in cleaned
    assert "Berita Populer" not in cleaned
    assert "Copyright" not in cleaned
    # Must capture the core disaster event text
    assert "Banjir bandang melanda wilayah Agam" in cleaned


def test_passes_disaster_regex_gate_cases():
    """Verifies the two-factor regex gate requiring both disaster keyword and Sumatra geographic anchor."""
    # 1. Valid disaster + valid Sumatra location -> PASS
    assert passes_disaster_regex_gate(
        title="Banjir bandang di Solok rendam jalan lintas Sumatera",
        text="Luapan air setinggi 1 meter memutus arus truk sembako."
    ) is True

    # 2. Valid landslide + valid Sumatra mountain pass -> PASS
    assert passes_disaster_regex_gate(
        title="Tanah longsor timbun Sitinjau Lauik",
        text="Akses jalur Padang ke Solok lumpuh total tertimbun material tanah."
    ) is True

    # 3. Valid port closure + Sumatra ferry port -> PASS
    assert passes_disaster_regex_gate(
        title="Gelombang tinggi paksa dermaga tutup di Bakauheni",
        text="Pelabuhan penyeberangan Bakauheni Lampung menunda keberangkatan kapal roro."
    ) is True

    # 4. Valid disaster keyword but NO Sumatra anchor (Java incident) -> FAIL (0 tokens)
    assert passes_disaster_regex_gate(
        title="Gunung Merapi erupsi semburkan awan panas di Sleman",
        text="Warga sekitar lereng Yogyakarta diminta menjauhi radius bahaya."
    ) is False

    # 5. Generic disaster keyword with no regional anchor -> FAIL (0 tokens)
    assert passes_disaster_regex_gate(
        title="Banjir parah rendam ratusan rumah warga",
        text="Petugas gabungan mengevakuasi lansia dan anak-anak ke tempat pengungsian."
    ) is False

    # 6. Sumatra anchor present but NO disaster keyword (Economic/ceremonial news) -> FAIL (0 tokens)
    assert passes_disaster_regex_gate(
        title="Gubernur Sumut resmikan jembatan baru di Medan",
        text="Pembangunan infrastruktur transportasi diharapkan dapat meningkatkan pertumbuhan ekonomi daerah."
    ) is False

    # 7. Empty or None inputs -> FAIL
    assert passes_disaster_regex_gate("", "") is False
    assert passes_disaster_regex_gate(None, None) is False


@pytest.mark.asyncio
async def test_batch_extraction_pre_filter_drops_irrelevant():
    """Verifies non-matching articles are flagged as DROPPED_IRRELEVANT without calling the LLM."""
    test_articles = [
        {
            "id": "art_disaster_sumatra",
            "title": "Banjir luapan sungai rendam jalan nasional di Kampar Riau",
            "raw_description": "Genangan air setinggi 60 cm melumpuhkan arus distribusi logistik di Kampar Riau.",
            "source": "Antara Riau",
            "link": "https://riau.antaranews.com/berita/123/banjir-kampar",
        },
        {
            "id": "art_economy_sumatra",
            "title": "Ekspor kopi Sumatera Utara meningkat pesat melalui pelabuhan Belawan",
            "raw_description": "Pemerintah provinsi mengapresiasi kinerja petani kopi di Deli Serdang dan Karo.",
            "source": "Antara Sumut",
            "link": "https://sumut.antaranews.com/berita/456/ekspor-kopi",
        },
        {
            "id": "art_disaster_java",
            "title": "Banjir rob merendam kawasan pelabuhan Tanjung Emas Semarang",
            "raw_description": "Tanggul laut jebol menyebabkan genangan air laut di kawasan industri Jawa Tengah.",
            "source": "Antara Jateng",
            "link": "https://jateng.antaranews.com/berita/789/banjir-semarang",
        },
    ]

    results = await extract_structured_news_batch(test_articles)
    assert len(results) == 3

    by_id = {r["id"]: r for r in results}

    # art_disaster_sumatra must pass pre-filter
    res1 = by_id["art_disaster_sumatra"]
    assert res1.get("zone_tier") in ("RED_CONFIRMED", "YELLOW_CLARIFY")
    assert "Kampar" in str(res1.get("corridor_nodes") or []) or res1.get("is_geocoded") is True

    # art_economy_sumatra lacks disaster keywords -> dropped
    res2 = by_id["art_economy_sumatra"]
    assert res2.get("zone_tier") == "DROPPED_IRRELEVANT"
    assert "pra-filter deterministik" in res2.get("tier_reason", "").lower() or "bukan disrupsi" in res2.get("tier_reason", "").lower()

    # art_disaster_java lacks Sumatra anchors -> dropped
    res3 = by_id["art_disaster_java"]
    assert res3.get("zone_tier") == "DROPPED_IRRELEVANT"
    assert "pra-filter deterministik" in res3.get("tier_reason", "").lower() or "bukan disrupsi" in res3.get("tier_reason", "").lower()


def test_strip_thinking_tags():
    """Verifies that DeepSeek-R1 / OpenCode reasoning blocks (<think>...</think>) are completely removed."""
    # Closed think block
    cot_response = (
        "<think>\n"
        "1. Identify disaster: flood\n"
        "2. Identify location: Solok, Sumatera Barat\n"
        "3. Severity assessment: high\n"
        "</think>\n"
        '{"is_active_disaster": true, "zone_tier": "RED_CONFIRMED"}'
    )
    cleaned = strip_thinking_tags(cot_response)
    assert cleaned == '{"is_active_disaster": true, "zone_tier": "RED_CONFIRMED"}'
    assert "<think>" not in cleaned
    assert "Identify disaster" not in cleaned

    # Plain text without think tags
    normal_text = '{"status": "ok"}'
    assert strip_thinking_tags(normal_text) == '{"status": "ok"}'

    # Unclosed think block
    unclosed = "<think>Analyzing input step by step without closing tag"
    assert strip_thinking_tags(unclosed) == ""

    # None or empty
    assert strip_thinking_tags("") == ""
    assert strip_thinking_tags(None) == ""
