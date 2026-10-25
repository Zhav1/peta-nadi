"""
PreHub : Unified Multi-Outlet News & Official Agency Ingestion Service (Supabase-Native)
Aggregates live news and bulletins across all 10 provinces of Sumatra:
1. Tier 1 (Official & Government Agencies): LKBN ANTARA (10 Sumatra Bureaus), BMKG, BNPB
2. Tier 2 (Authoritative Regional & National Press): Targeted queries for DetikSumut, Tribun Medan, Kompas, CNBC
3. Direct Persistence: Upserts structured news with PostGIS points directly into Supabase public.news_articles
"""
import logging
import asyncio
import base64
import json
import re
import urllib.parse
from urllib.parse import urlparse
import xml.etree.ElementTree as ET
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any, Optional
import httpx
from app.config import get_settings

logger = logging.getLogger(__name__)

# Direct Official RSS Feeds (Tier 1 Authority Across Pan-Sumatra Bureaus)
OFFICIAL_RSS_FEEDS = [
    {
        "source": "LKBN ANTARA Sumut",
        "url": "https://sumut.antaranews.com/rss/terkini.xml",
        "tier": "TIER_1_OFFICIAL",
        "category": "REGIONAL_DISASTER",
        "province": "Sumatera Utara"
    },
    {
        "source": "LKBN ANTARA Sumbar",
        "url": "https://sumbar.antaranews.com/rss/terkini.xml",
        "tier": "TIER_1_OFFICIAL",
        "category": "REGIONAL_DISASTER",
        "province": "Sumatera Barat"
    },
    {
        "source": "LKBN ANTARA Riau",
        "url": "https://riau.antaranews.com/rss/terkini.xml",
        "tier": "TIER_1_OFFICIAL",
        "category": "REGIONAL_DISASTER",
        "province": "Riau"
    },
    {
        "source": "LKBN ANTARA Aceh",
        "url": "https://aceh.antaranews.com/rss/terkini.xml",
        "tier": "TIER_1_OFFICIAL",
        "category": "REGIONAL_DISASTER",
        "province": "Aceh"
    },
    {
        "source": "LKBN ANTARA Sumsel",
        "url": "https://sumsel.antaranews.com/rss/terkini.xml",
        "tier": "TIER_1_OFFICIAL",
        "category": "REGIONAL_DISASTER",
        "province": "Sumatera Selatan"
    },
    {
        "source": "LKBN ANTARA Lampung",
        "url": "https://lampung.antaranews.com/rss/terkini.xml",
        "tier": "TIER_1_OFFICIAL",
        "category": "REGIONAL_DISASTER",
        "province": "Lampung"
    },
    {
        "source": "LKBN ANTARA Jambi",
        "url": "https://jambi.antaranews.com/rss/terkini.xml",
        "tier": "TIER_1_OFFICIAL",
        "category": "REGIONAL_DISASTER",
        "province": "Jambi"
    },
    {
        "source": "LKBN ANTARA Bengkulu",
        "url": "https://bengkulu.antaranews.com/rss/terkini.xml",
        "tier": "TIER_1_OFFICIAL",
        "category": "REGIONAL_DISASTER",
        "province": "Bengkulu"
    },
    {
        "source": "LKBN ANTARA Babel",
        "url": "https://babel.antaranews.com/rss/terkini.xml",
        "tier": "TIER_1_OFFICIAL",
        "category": "REGIONAL_DISASTER",
        "province": "Bangka Belitung"
    },
    {
        "source": "LKBN ANTARA Kepri",
        "url": "https://kepri.antaranews.com/rss/terkini.xml",
        "tier": "TIER_1_OFFICIAL",
        "category": "REGIONAL_DISASTER",
        "province": "Kepulauan Riau"
    },
    {
        "source": "LKBN ANTARA Ekonomi",
        "url": "https://www.antaranews.com/rss/ekonomi.xml",
        "tier": "TIER_1_OFFICIAL",
        "category": "ECONOMIC_LOGISTICS",
        "province": "Nasional"
    },
    {
        "source": "DetikSumut",
        "url": "https://www.detik.com/sumut/rss",
        "tier": "TIER_2_AUTHORITATIVE_PRESS",
        "category": "REGIONAL_DISASTER",
        "province": "Sumatera Utara"
    },
    {
        "source": "Detik News",
        "url": "https://news.detik.com/rss",
        "tier": "TIER_2_AUTHORITATIVE_PRESS",
        "category": "NATIONAL_ALERT",
        "province": "Nasional"
    },
    {
        "source": "CNN Indonesia Nasional",
        "url": "https://www.cnnindonesia.com/nasional/rss",
        "tier": "TIER_2_AUTHORITATIVE_PRESS",
        "category": "NATIONAL_ALERT",
        "province": "Nasional"
    },
    {
        "source": "CNBC Indonesia Market",
        "url": "https://www.cnbcindonesia.com/market/rss",
        "tier": "TIER_2_AUTHORITATIVE_PRESS",
        "category": "COMMODITY_MARKET",
        "province": "Nasional"
    },
    {
        "source": "Tribun Padang",
        "url": "https://padang.tribunnews.com/rss",
        "tier": "TIER_2_AUTHORITATIVE_PRESS",
        "category": "REGIONAL_DISASTER",
        "province": "Sumatera Barat"
    },
    {
        "source": "Tribun Palembang",
        "url": "https://palembang.tribunnews.com/rss",
        "tier": "TIER_2_AUTHORITATIVE_PRESS",
        "category": "REGIONAL_DISASTER",
        "province": "Sumatera Selatan"
    },
    {
        "source": "Tribun Batam",
        "url": "https://batam.tribunnews.com/rss",
        "tier": "TIER_2_AUTHORITATIVE_PRESS",
        "category": "REGIONAL_DISASTER",
        "province": "Kepulauan Riau"
    },
    {
        "source": "Tribun Lampung",
        "url": "https://lampung.tribunnews.com/rss",
        "tier": "TIER_2_AUTHORITATIVE_PRESS",
        "category": "REGIONAL_DISASTER",
        "province": "Lampung"
    },
    {
        "source": "Tribun Aceh",
        "url": "https://aceh.tribunnews.com/rss",
        "tier": "TIER_2_AUTHORITATIVE_PRESS",
        "category": "REGIONAL_DISASTER",
        "province": "Aceh"
    },
    {
        "source": "Detik Finance",
        "url": "https://finance.detik.com/rss",
        "tier": "TIER_2_AUTHORITATIVE_PRESS",
        "category": "ECONOMIC_LOGISTICS",
        "province": "Nasional"
    },
    {
        "source": "Katadata",
        "url": "https://katadata.co.id/rss",
        "tier": "TIER_2_AUTHORITATIVE_PRESS",
        "category": "ECONOMIC_LOGISTICS",
        "province": "Nasional"
    },
    {
        "source": "Republika",
        "url": "https://www.republika.co.id/rss",
        "tier": "TIER_2_AUTHORITATIVE_PRESS",
        "category": "NATIONAL_ALERT",
        "province": "Nasional"
    }
]

# Targeted Google News queries for verified regional press & logistics corridors across Pulau Sumatera
TARGETED_PRESS_QUERIES = [
    # Q1 — Sumut is NOT Medan-only: covers the whole Jalinsum spine
    # (Belawan port, Tebing Tinggi, Asahan/Kisaran, Rantauprapat, Sibolga).
    "(site:antaranews.com OR site:detik.com OR site:tribunnews.com OR site:kompas.com) (banjir OR longsor OR jalan terputus) (Medan OR Tebing Tinggi OR Belawan OR Jalinsum OR Asahan OR Kisaran OR Rantauprapat OR Sibolga) when:2d",
    "(site:antaranews.com OR site:tribunnews.com OR site:detik.com) (longsor Sitinjau Lauik OR jalan Padang Solok OR tol Pekanbaru Dumai) when:2d",
    "(site:antaranews.com OR site:bisnis.com OR site:tempo.co OR site:liputan6.com OR site:merdeka.com OR site:kontan.co.id) (stok beras BULOG OR harga cabai OR pasokan pangan) (Sumatera OR Sumut OR Sumbar OR Riau OR Lampung) when:2d",
    "(site:antaranews.com OR site:detik.com) (gelombang Selat Malaka OR Pelabuhan Belawan OR Pelabuhan Panjang OR Bakauheni OR antrean truk tol) when:2d",
    "(site:antaranews.com OR site:kompas.com) (jalan lintas timur OR jalintim OR jalinbar OR jembatan putus OR amblas) (Palembang OR Jambi OR Lampung) when:2d",
    # Q6 — Kepri/Babel maritime + tin corridors (Batam, Tanjung Pinang, Natuna, Pangkalpinang).
    "(site:antaranews.com) (banjir OR longsor OR pelabuhan) (Batam OR Tanjung Pinang OR Natuna OR Pangkalpinang) when:2d",
    # Q7 — Aceh east coast / Tamiang–Langsa–Lhokseumawe flood & landslide corridor.
    "(site:antaranews.com OR site:detik.com) (banjir OR longsor OR jalan putus) (Aceh Tamiang OR Langsa OR Lhokseumawe OR Banda Aceh) when:2d",
    # Q8 — Official agency bulletins (BNPB/BMKG) for pan-Sumatra flood, landslide,
    # quake, early-warning and extreme-weather alerts (Tier-1 authority recall).
    "(site:bnpb.go.id OR site:bmkg.go.id) (banjir OR longsor OR gempa OR peringatan dini OR cuaca ekstrem) (Sumatera OR Sumut OR Sumbar OR Riau OR Lampung OR Aceh OR Jambi) when:2d",
]

MAX_NEWS_AGE_HOURS = 48
EXTRACTION_SCHEMA_VERSION = 7

# Dedicated test fixtures reserved strictly for synthetic offline unit tests / demo runner
DEMO_STANDARDIZED_SCENARIOS = [
    {
        "id": "NEWS-DEMO-01",
        "title": "Banjir Luapan Sungai Padang Rendam Jalur Logistik Tebing Tinggi KM 78",
        "link": "https://sumut.antaranews.com/berita/673537/banjir-luapan-sungai-padang-rendam-jalur-logistik-tebing-tinggi-km-78",
        "url": "https://sumut.antaranews.com/berita/673537/banjir-luapan-sungai-padang-rendam-jalur-logistik-tebing-tinggi-km-78",
        "source": "LKBN ANTARA Sumut",
        "source_tier": "TIER_1_OFFICIAL",
        "pubDate": "15m lalu",
        "summary": "Debit air meningkat 120cm menutup badan jalan arteri Jalinsum KM 78. Akses truk sembako dialihkan via Tol Medan-Kualanamu-Tebing Tinggi.",
        "region": "Sumatera Utara",
        "province": "Sumatera Utara",
        "latitude": 3.3285,
        "longitude": 99.1625,
        "category": "DISASTER_LOGISTICS",
        "corridor_nodes": ["Medan", "Tebing Tinggi", "Belawan"],
        "corridor_segment": "Jalinsum KM 78",
        "incident_type": "flood",
        "severity": "critical",
        "temporal_phase": "active_disruption",
        "lead_time_hours": 3.5,
        "commodities_affected": ["Beras BULOG", "Minyak Goreng"],
        "ground_truth_metrics": {"water_level_cm": 120, "lane_status": "BLOCKED"},
        "confidence_score": 0.96
    },
    {
        "id": "NEWS-DEMO-02",
        "title": "Tebing Sitinjau Lauik Longsor, Jalur Distribusi Padang-Solok Terputus",
        "link": "https://sumbar.antaranews.com/berita/783773/tebing-sitinjau-lauik-longsor-jalur-distribusi-padang-solok-terputus",
        "url": "https://sumbar.antaranews.com/berita/783773/tebing-sitinjau-lauik-longsor-jalur-distribusi-padang-solok-terputus",
        "source": "LKBN ANTARA Sumbar",
        "source_tier": "TIER_1_OFFICIAL",
        "pubDate": "1j lalu",
        "summary": "Material longsor menutupi badan jalan nasional. Truk pasokan hortikultura dan cabai dialihkan via jalur alternatif Malalak.",
        "region": "Sumatera Barat",
        "province": "Sumatera Barat",
        "latitude": -0.9525,
        "longitude": 100.5183,
        "category": "DISASTER_LOGISTICS",
        "corridor_nodes": ["Padang", "Solok", "Bukittinggi"],
        "corridor_segment": "Sitinjau Lauik KM 22",
        "incident_type": "landslide",
        "severity": "high",
        "temporal_phase": "active_disruption",
        "lead_time_hours": 0.0,
        "commodities_affected": ["Cabai Merah", "Sayuran Segar"],
        "ground_truth_metrics": {"debris_length_m": 45, "lane_status": "BLOCKED"},
        "confidence_score": 0.92
    }
]


_GARTURLREQ_CTX = [
    ["X", "X", ["X", "X"], None, None, 1, 1, "ID:id", None, 1, None, None, None, None, None, 0, 1],
    "X",
    "X",
    1,
    [1, 1, 1],
    1,
    1,
    None,
    0,
    0,
    None,
    0,
]


# Synthetic/dummy fixture IDs that never map to a live publisher permalink.
_DUMMY_TEST_IDS = ("543210", "532190", "571234", "562341", "123456", "999999")


def _map_publisher_deep_fallback(title: str, source: str = "", raw_url: str = "") -> Optional[str]:
    """REMOVED publisher search-URL fallback — always returns None (drop the item).

    An unresolved item used to be rewritten to a publisher *search* page
    (…/search?q=…). A search page is not an article permalink, so those rows
    reached the map as dead citations. Per M1, unresolvable items are dropped
    by the caller instead of being given a fabricated URL. Signature kept so
    every call site reads as "resolve or drop".
    """
    return None


def _is_unresolvable_article_url(raw_url: str) -> bool:
    """True when a URL can never be a live article permalink (caller drops it).

    Unresolvable: empty, bare root/landing page, Google wrapper/search host,
    synthetic dummy IDs without a real slug, and Antara /berita/ URLs missing
    the numeric CMS id (they 404 on Antara).
    """
    u = (raw_url or "").strip() if isinstance(raw_url, str) else ""
    if not u:
        return True
    try:
        p = urlparse(u)
    except Exception:
        return True
    if not p.netloc:
        return True
    # Bare root / landing page
    if p.path in ("", "/"):
        return True
    # Google hosts (search, news wrappers, redirects) are never publisher permalinks
    if "google." in p.netloc:
        return True
    # Rewrite synthetic or dummy test IDs without a slug (e.g. 543210, 532190)
    if any(f"/{did}" in u for did in _DUMMY_TEST_IDS) and not re.search(r'/\d{6}/[a-z0-9-]+', u):
        return True
    # Antara URLs that lack a numeric article ID 404 on Antara's CMS
    if "antaranews.com/berita/" in u and not re.search(r'antaranews\.com/berita/\d{5,8}/', u):
        return True
    return False


def _decode_google_news_token_sync(art_id: str, timeout: float = 3.5) -> Optional[str]:
    """Decodes Google News token (AU_yqL or CBMi) via batchexecute Fbv4je RPC."""
    try:
        rss_url = f"https://news.google.com/rss/articles/{art_id}?hl=id-ID&gl=ID&ceid=ID:id"
        headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
        with httpx.Client(timeout=timeout, headers=headers) as client:
            resp = client.get(rss_url, follow_redirects=True)
            html = resp.text
            sg_m = re.search(r'data-n-a-sg="([^"]+)"', html)
            ts_m = re.search(r'data-n-a-ts="([^"]+)"', html)
            if not (sg_m and ts_m):
                return None
            sig = sg_m.group(1)
            ts = ts_m.group(1)
            inner = [
                "garturlreq",
                _GARTURLREQ_CTX,
                art_id,
                int(ts) if str(ts).isdigit() else ts,
                sig,
            ]
            envelope = ["Fbv4je", json.dumps(inner, separators=(",", ":")), None, "0"]
            body = f"f.req={urllib.parse.quote(json.dumps([[envelope]], separators=(',', ':')))}"
            batch_resp = client.post(
                "https://news.google.com/_/DotsSplashUi/data/batchexecute",
                headers={"Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"},
                content=body
            )
            text = batch_resp.text
            if "\n\n" in text:
                text = text.split("\n\n", 1)[1]
            text = text.lstrip()
            if text.startswith(")]}'"):
                text = text.split("\n", 1)[1] if "\n" in text else text[4:]
                text = text.lstrip()
            rows = json.loads(text)
            for row in rows:
                if isinstance(row, list) and len(row) >= 3 and (row[0] == "wrb.fr" or row[1] == "Fbv4je"):
                    payload = row[2]
                    if isinstance(payload, str):
                        payload = json.loads(payload)
                    if isinstance(payload, list) and payload and payload[0] == "garturlres":
                        decoded = payload[1]
                        p = urlparse(decoded)
                        if p.netloc and p.path not in ("", "/"):
                            return decoded
    except Exception as e:
        logger.debug(f"Sync batchexecute token decode failed for {art_id}: {e}")
    return None


async def _decode_google_news_token_async(art_id: str, client: Optional[httpx.AsyncClient] = None, timeout: float = 4.0) -> Optional[str]:
    """Asynchronously decodes Google News token (AU_yqL or CBMi) via batchexecute Fbv4je RPC."""
    close_client = False
    if client is None:
        client = httpx.AsyncClient(timeout=timeout, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"})
        close_client = True
    try:
        rss_url = f"https://news.google.com/rss/articles/{art_id}?hl=id-ID&gl=ID&ceid=ID:id"
        resp = await client.get(rss_url, follow_redirects=True)
        html = resp.text
        sg_m = re.search(r'data-n-a-sg="([^"]+)"', html)
        ts_m = re.search(r'data-n-a-ts="([^"]+)"', html)
        if not (sg_m and ts_m):
            return None
        sig = sg_m.group(1)
        ts = ts_m.group(1)
        inner = [
            "garturlreq",
            _GARTURLREQ_CTX,
            art_id,
            int(ts) if str(ts).isdigit() else ts,
            sig,
        ]
        envelope = ["Fbv4je", json.dumps(inner, separators=(",", ":")), None, "0"]
        body = f"f.req={urllib.parse.quote(json.dumps([[envelope]], separators=(',', ':')))}"
        batch_resp = await client.post(
            "https://news.google.com/_/DotsSplashUi/data/batchexecute",
            headers={"Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"},
            content=body
        )
        text = batch_resp.text
        if "\n\n" in text:
            text = text.split("\n\n", 1)[1]
        text = text.lstrip()
        if text.startswith(")]}'"):
            text = text.split("\n", 1)[1] if "\n" in text else text[4:]
            text = text.lstrip()
        rows = json.loads(text)
        for row in rows:
            if isinstance(row, list) and len(row) >= 3 and (row[0] == "wrb.fr" or row[1] == "Fbv4je"):
                payload = row[2]
                if isinstance(payload, str):
                    payload = json.loads(payload)
                if isinstance(payload, list) and payload and payload[0] == "garturlres":
                    decoded = payload[1]
                    p = urlparse(decoded)
                    if p.netloc and p.path not in ("", "/"):
                        return decoded
    except Exception as e:
        logger.debug(f"Async batchexecute token decode failed for {art_id}: {e}")
    finally:
        if close_client:
            await client.aclose()
    return None


def resolve_canonical_article_url(raw_url: str, title: str = "", source: str = "") -> Optional[str]:
    """
    Resolves raw or wrapped news URLs to permanent, direct article permalinks.
    - Preserves direct publisher article permalinks (antaranews.com, detik.com, etc.).
    - Decodes Google News opaque wrappers (news.google.com/rss/articles/CBMi... or /articles/...)
      extracting the embedded HTTP/HTTPS URL from base64/protobuf payload or batchexecute RPC.
    - Unwraps Google redirect hosts (google.com/url?q=..., news.google.com/redirect?url=...,
      google.com/amp/s/<publisher>/...) to the real publisher host.
    - Returns None when the item cannot be resolved to a real permalink (empty, bare root
      domain, dummy IDs, Antara /berita/ without a numeric id, Google search/landing or an
      undecodable Google wrapper). Callers MUST DROP the item instead of inventing a URL.
    """
    if not raw_url or not isinstance(raw_url, str):
        return _map_publisher_deep_fallback(title, source, str(raw_url or ""))

    clean_url = raw_url.strip()

    # Unwrap Google redirect wrappers to their real target host before any host inspection
    try:
        gp = urlparse(clean_url)
        if gp.netloc and "google." in gp.netloc:
            gp_path = gp.path.rstrip("/")
            if gp_path in ("/url", "/redirect"):
                qs = dict(urllib.parse.parse_qsl(gp.query))
                target = (qs.get("q") or qs.get("url") or "").strip()
                if target.startswith(("http://", "https://")):
                    clean_url = target
            elif gp.path.startswith("/amp/s/"):
                rest = gp.path[len("/amp/s/"):]
                if rest:
                    clean_url = "https://" + rest + (f"?{gp.query}" if gp.query else "")
    except Exception:
        pass

    # Reject bare root domains (path is empty or just '/')
    try:
        parsed = urlparse(clean_url)
        if parsed.scheme in ("http", "https") and parsed.netloc:
            if parsed.path in ("", "/"):
                return _map_publisher_deep_fallback(title, source, clean_url)
    except Exception:
        pass

    # Rewrite synthetic or dummy test IDs without a slug (e.g. 543210, 532190)
    if any(f"/{did}" in clean_url for did in _DUMMY_TEST_IDS) and not re.search(r'/\d{6}/[a-z0-9-]+', clean_url):
        return _map_publisher_deep_fallback(title, source, clean_url)

    # Detect Antara URLs that lack a numeric article ID (which causes 404 on Antara's CMS)
    if "antaranews.com/berita/" in clean_url and not re.search(r'antaranews\.com/berita/\d{5,8}/', clean_url):
        return _map_publisher_deep_fallback(title, source, clean_url)

    # If it's already a direct non-Google publisher link with a deep path, return it directly
    try:
        p = urlparse(clean_url)
        if p.netloc and "google." not in p.netloc and p.path not in ("", "/"):
            return clean_url
    except Exception:
        pass

    # Google search / landing URLs are not article permalinks: DROP, never echo
    # Google's host or a publisher search page downstream.
    try:
        gp = urlparse(clean_url)
    except Exception:
        gp = None
    if gp and gp.netloc and "google." in gp.netloc and not re.search(r'/(?:articles|read)/', gp.path):
        return _map_publisher_deep_fallback(title, source, clean_url)

    # Handle Google News opaque wrappers
    if "news.google.com" in clean_url and ("/articles/" in clean_url or "/rss/articles/" in clean_url or "/read/" in clean_url):
        token_match = re.search(r'/(?:articles|read)/([a-zA-Z0-9_-]+)', clean_url)
        if token_match:
            token = token_match.group(1)
            # Attempt to decode base64 payload if it contains CBMi
            if "CBMi" in token:
                try:
                    cbmi_idx = token.find("CBMi")
                    b64_sub = token[cbmi_idx:]
                    padded = b64_sub + "=" * (-len(b64_sub) % 4)
                    raw_bytes = base64.urlsafe_b64decode(padded)
                    url_match = re.search(rb'https?://[a-zA-Z0-9.\-_~:/?#\[\]@!$&\'()*+,;=%]+', raw_bytes)
                    if url_match:
                        extracted = url_match.group(0).decode("utf-8", errors="ignore").rstrip("\\\x00\x01\x02\x03\x04\x05\x06\x07\x08\t\r\n")
                        p_ext = urlparse(extracted)
                        if p_ext.netloc and "google.com" not in p_ext.netloc and p_ext.path not in ("", "/"):
                            return extracted
                except Exception as e:
                    logger.debug(f"Failed to decode CBMi token: {e}")

            # Try synchronous batchexecute decode for AU_yqL or unresolved token
            decoded = _decode_google_news_token_sync(token)
            if decoded:
                return decoded

            # Token could not be decoded → unresolvable, caller drops the item.
            return _map_publisher_deep_fallback(title, source, clean_url)

    if _is_unresolvable_article_url(clean_url):
        return None
    return clean_url


async def resolve_canonical_article_url_async(
    raw_url: str,
    title: str = "",
    source: str = "",
    client: Optional[httpx.AsyncClient] = None,
    timeout: float = 4.0
) -> Optional[str]:
    """
    Async canonical permalink resolver. Follows redirects and decodes modern Google News
    AU_yqL tokens via batchexecute Fbv4je RPC so articles always resolve to actual deep publisher URLs.
    Returns None when unresolvable — callers MUST DROP the item (no search-page fallback).
    """
    if not raw_url or not isinstance(raw_url, str):
        return _map_publisher_deep_fallback(title, source, str(raw_url or ""))

    clean_url = raw_url.strip()

    # Fast check: already a direct publisher URL with deep path
    try:
        p = urlparse(clean_url)
        if p.netloc and "google." not in p.netloc and p.path not in ("", "/"):
            # Reject dummy test IDs / Antara URLs missing their numeric CMS id
            if _is_unresolvable_article_url(clean_url):
                return _map_publisher_deep_fallback(title, source, clean_url)
            return clean_url
    except Exception:
        pass

    # First check CBMi synchronous decode (also unwraps Google search/redirect hosts)
    resolved = resolve_canonical_article_url(clean_url, title, source)
    if resolved:
        return resolved

    # Handle Google News wrapper async
    if "news.google.com" in clean_url and ("/articles/" in clean_url or "/rss/articles/" in clean_url or "/read/" in clean_url):
        token_match = re.search(r'/(?:articles|read)/([a-zA-Z0-9_-]+)', clean_url)
        if token_match:
            token = token_match.group(1)
            # 1. Try batchexecute RPC async
            decoded = await _decode_google_news_token_async(token, client=client, timeout=timeout)
            if decoded:
                return decoded

            # 2. Try following HTTP GET redirects with desktop browser User-Agent
            close_client = False
            if client is None:
                client = httpx.AsyncClient(follow_redirects=True, timeout=timeout)
                close_client = True
            try:
                resp = await client.get(
                    f"https://news.google.com/rss/articles/{token}?hl=id-ID&gl=ID&ceid=ID:id",
                    headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
                )
                final_url = str(resp.url)
                p = urlparse(final_url)
                if p.netloc and "google.com" not in p.netloc and p.path not in ("", "/"):
                    return final_url
            except Exception as e:
                logger.debug(f"Async redirect check failed for {clean_url}: {e}")
            finally:
                if close_client:
                    await client.aclose()

    # Unresolvable (undecodable wrapper / Google landing / bare root) → drop.
    return _map_publisher_deep_fallback(title, source, clean_url)


LOGISTICS_DISASTER_KEYWORDS = (
    "banjir", "longsor", "amblas", "terputus", "jembatan", "jalan", "jalinsum", "jalintim", "jalinbar",
    "tol", "pelabuhan", "dermaga", "belawan", "merak", "bakauheni", "teluk bayur", "panjang", "boom baru",
    "kapal", "cuaca", "hujan", "badai", "gelombang", "angin", "gempa", "erupsi", "gunung",
    "beras", "cabai", "minyak goreng", "gula", "pangan", "bawang", "sembako", "bulog", "pihps",
    "distribusi", "truk", "kargo", "logistik", "rantai pasok", "kontainer", "kemacetan", "antrean",
    "bbm", "solar", "pertamina", "pupuk", "disrupsi", "bencana",
    "pungli", "pos pungli", "pemalakan", "pemblokiran jalan", "blokade warga", "unjuk rasa", "aksi massa"
)

EXCLUDED_NOISE_KEYWORDS = (
    "varises", "osteoporosis", "kanker", "klinik", "rumah sakit", "evla", "penyakit", "pasien",
    "olahraga", "sepak bola", "liga", "artis", "selebriti", "hiburan", "film", "konser",
    "wisata", "kuliner", "fashion", "kecantikan", "kosmetik",
    # Ads / promos / lifestyle
    "iklan", "promo", "diskon", "voucher", "advertorial", "sponsored", "lowongan",
    "beasiswa", "resep", "hotel", "turnamen",
    # Politics / ceremonial visits
    "pilkada", "pemilu", "kampanye", "partai", "kunjungan kerja", "kunker",
    # Crime / court
    "korupsi", "sidang", "narkoba", "pencurian", "pembunuhan", "tipikor",
    # Market promos
    "saham", "crypto", "kripto", "trading", "forex", "pinjol",
    # Sports & entertainment leftovers
    "bulutangkis", "motogp", "piala dunia", "timnas",
    # Tribun-style promo / lifestyle spam (jalan sehat, kuis, forecast boilerplate)
    "jalan sehat", "jalan santai", "prakiraan cuaca", "info cuaca", "kunci jawaban",
)

# In-process memory cache of already-processed articles (id -> row, link -> row)
_PROCESSED_ARTICLE_MEMORY_CACHE: Dict[str, Dict[str, Any]] = {}


def remember_processed_article(article: Dict[str, Any]) -> None:
    """Stores a processed article in the in-process memory cache by id and link."""
    try:
        if article.get("id"):
            _PROCESSED_ARTICLE_MEMORY_CACHE[str(article["id"])] = article
        if article.get("link"):
            _PROCESSED_ARTICLE_MEMORY_CACHE[str(article["link"])] = article
    except Exception:
        pass


def fetch_existing_processed_articles_map(article_ids: List[str], links: List[str]) -> Dict[str, Dict]:
    """
    DB-first deduplication lookup: queries Supabase `news_articles` for matching
    `id` or `link` plus consults the in-process `_PROCESSED_ARTICLE_MEMORY_CACHE`
    so the ingestor can reuse prior LLM classifications with 0 extra LLM calls.
    Returns map keyed by both id and link -> stored row dict.
    """
    result: Dict[str, Dict] = {}
    ids = [str(i) for i in (article_ids or []) if i]
    lks = [str(x) for x in (links or []) if x]

    # 1. Memory cache first
    for k in ids + lks:
        if k in _PROCESSED_ARTICLE_MEMORY_CACHE:
            row = _PROCESSED_ARTICLE_MEMORY_CACHE[k]
            result[k] = row
            if row.get("id"):
                result[str(row["id"])] = row
            if row.get("link"):
                result[str(row["link"])] = row

    # 2. Supabase lookup for anything not yet cached
    need_ids = [i for i in ids if i not in result]
    need_links = [x for x in lks if x not in result]
    if not need_ids and not need_links:
        return result
    try:
        from app.db.supabase_client import get_client
        sb = get_client()
        fetched: List[Dict[str, Any]] = []
        # Query by id
        for chunk_start in range(0, len(need_ids), 50):
            chunk = need_ids[chunk_start:chunk_start + 50]
            if not chunk:
                continue
            try:
                res = sb.table("news_articles").select("*").in_("id", chunk).execute()
                fetched.extend(res.data or [])
            except Exception as e:
                logger.debug(f"fetch_existing by id skipped: {e}")
        # Query by link
        for chunk_start in range(0, len(need_links), 50):
            chunk = need_links[chunk_start:chunk_start + 50]
            if not chunk:
                continue
            try:
                res = sb.table("news_articles").select("*").in_("link", chunk).execute()
                fetched.extend(res.data or [])
            except Exception as e:
                logger.debug(f"fetch_existing by link skipped: {e}")
        for row in fetched:
            try:
                row = _unpack_ground_truth_metrics(dict(row))
            except Exception:
                pass
            # Stale rows (schema_version != 7) are re-classified on read so
            # old cached rows never serve stale tiering/geocoding.
            try:
                _gtm = row.get("ground_truth_metrics") or {}
                if isinstance(_gtm, str):
                    import json as _js2
                    try:
                        _gtm = _js2.loads(_gtm)
                    except Exception:
                        _gtm = {}
                if isinstance(_gtm, dict) and _gtm.get("schema_version") != 7:
                    from app.nlp.news_extractor import _fast_heuristic_extraction as _re_v2
                    _art = {
                        "title": row.get("title", ""),
                        "raw_description": row.get("raw_description") or row.get("summary") or "",
                        "source": row.get("source", "Media"),
                        "source_tier": row.get("source_tier", "TIER_2_AUTHORITATIVE_PRESS"),
                        "province": row.get("province", "Sumatera"),
                        "link": row.get("link", ""),
                        "pubDate": row.get("original_pub_date") or row.get("pubDate") or row.get("published_at"),
                        "original_pub_date": row.get("original_pub_date") or (_gtm.get("original_pub_date") if isinstance(_gtm, dict) else None),
                        "published_at": row.get("published_at"),
                        "html_published_at": row.get("html_published_at"),
                    }
                    _re = _re_v2(_art)
                    for _k in ("zone_tier", "tier_reason", "custom_hazard_label", "impact_profile",
                               "is_geocoded", "location_precision", "latitude", "longitude",
                               "incident_type", "severity", "corridor_nodes", "corridor_segment",
                               "affected_locations", "radius_km", "geometry_polygon", "verification_audit"):
                        if _re.get(_k) is not None:
                            row[_k] = _re.get(_k)
                    row["ground_truth_metrics"] = _re.get("ground_truth_metrics", row.get("ground_truth_metrics"))
                    remember_processed_article(row)
            except Exception:
                pass
            if row.get("id"):
                result[str(row["id"])] = row
            if row.get("link"):
                result[str(row["link"])] = row
    except Exception as e:
        logger.debug(f"Supabase dedup lookup skipped: {e}")
    return result

def is_relevant_logistics_or_disaster(text: str) -> bool:
    """Filters out irrelevant health, hospital, and celebrity news from general RSS feeds."""
    t_lower = text.lower()
    if any(n in t_lower for n in EXCLUDED_NOISE_KEYWORDS):
        return False
    return any(k in t_lower for k in LOGISTICS_DISASTER_KEYWORDS)


_ARCHIVAL_URL_DATE_PATTERNS = (
    re.compile(r'/(20\d{2})/(\d{1,2})/(\d{1,2})(?:/|$|-|_)'),
    re.compile(r'-(20\d{2})-(\d{2})-(\d{2})(?:/|$|-|_)'),
)
_ARCHIVAL_URL_YEAR_PATTERN = re.compile(r'/(20(?:1\d|2[0-5])/)')


def _parse_pub_date_to_utc(raw: Any) -> Optional[datetime]:
    """Parses pubDate / HTML meta timestamps via parsedate_to_datetime + fromisoformat."""
    if raw is None:
        return None
    s = str(raw).strip()
    if not s or s.lower() in ("terkini",):
        return None
    # 1. RFC2822 / RSS pubDate via email.utils.
    try:
        from email.utils import parsedate_to_datetime as _pdt
        dt = _pdt(s)
        if dt is not None:
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt.astimezone(timezone.utc)
    except Exception:
        pass
    # 2. ISO8601 via fromisoformat (handles +00:00, Z, naive).
    try:
        iso = s.replace("Z", "+00:00")
        # fromisoformat cannot parse trailing ' GMT' etc; try stripped.
        dt2 = datetime.fromisoformat(iso)
        if dt2.tzinfo is None:
            dt2 = dt2.replace(tzinfo=timezone.utc)
        return dt2.astimezone(timezone.utc)
    except Exception:
        pass
    return None


_REL_DETIK_RE = re.compile(r"(\d+)\s*(detik|detiks|dtk|seconds?|secs?)\s*(yang\s*)?lalu", re.IGNORECASE)
_REL_MENIT_RE = re.compile(r"(\d+)\s*(menit|menits|mnt|mins?|m)\s*(yang\s*)?lalu", re.IGNORECASE)
_REL_JAM_RE = re.compile(r"(\d+)\s*(jam|jams?|j|hours?|hrs?|h)\s*(yang\s*)?lalu", re.IGNORECASE)
_REL_HARI_RE = re.compile(r"(\d+)\s*(hari|haris?|days?|d)\s*(yang\s*)?lalu", re.IGNORECASE)


def _parse_indonesian_relative_to_hours(s: Any) -> Optional[float]:
    """Parses Indonesian relative timestamps (e.g. '15 menit lalu', '2 jam lalu',
    '3 hari lalu', plus short forms '10m lalu', '1j lalu') into age_hours.

    Returns None when no relative pattern matches.
    """
    if s is None:
        return None
    t = str(s).strip().lower()
    if not t:
        return None
    try:
        m = _REL_HARI_RE.search(t)
        if m:
            return float(int(m.group(1))) * 24.0
        m = _REL_JAM_RE.search(t)
        if m:
            # Guard: bare 'h'/'j'/'m' single-letter matches only when 'lalu' present
            # (regex already requires 'lalu'), so '10m lalu'/'1j lalu' are valid.
            return float(int(m.group(1))) * 1.0
        m = _REL_MENIT_RE.search(t)
        if m:
            return float(int(m.group(1))) / 60.0
        m = _REL_DETIK_RE.search(t)
        if m:
            return float(int(m.group(1))) / 3600.0
    except Exception:
        return None
    return None


def parse_and_validate_article_freshness(
    pub_date_raw: str | None,
    url: str | None,
    html_meta_date: str | None = None,
    max_age_hours: int = 48,
    is_test_fixture: bool = False,
) -> dict:
    """Strict 48h freshness gate with archival-URL extraction + true published_at preservation.

    Check 1 inspects the URL for archival dates; Check 1b parses Indonesian
    relative timestamps ('N menit/jam/hari lalu'); Check 2 parses pubDate/HTML meta.
    Unparseable dates in production return is_fresh=False
    (reject_reason='unparseable_date_in_prod') unless is_test_fixture=True,
    in which case legacy fixture behaviour (fresh, age 0) is preserved.

    Returns {"is_fresh","published_at_iso","age_hours","reject_reason"}.
    """
    now = datetime.now(timezone.utc)
    max_age = int(max_age_hours or MAX_NEWS_AGE_HOURS)
    url_s = str(url or "")

    # ---- Check 1: Archival URL date extraction ----
    for pat in _ARCHIVAL_URL_DATE_PATTERNS:
        try:
            m = pat.search(url_s)
            if m:
                y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
                url_date = datetime(y, mo, d, tzinfo=timezone.utc)
                age_h = (now - url_date).total_seconds() / 3600.0
                if age_h > max_age:
                    return {
                        "is_fresh": False,
                        "published_at_iso": url_date.isoformat(),
                        "age_hours": round(age_h, 2),
                        "reject_reason": f"URL berita arsip lama ({url_date.date().isoformat()}, melebihi batas {max_age} jam)",
                    }
                # Fresh archival-pattern date: keep as published_at but continue to Check 2.
                return {
                    "is_fresh": True,
                    "published_at_iso": url_date.isoformat(),
                    "age_hours": round(age_h, 2),
                    "reject_reason": None,
                }
        except Exception:
            continue
    try:
        ym = _ARCHIVAL_URL_YEAR_PATTERN.search(url_s)
        if ym:
            year = int(ym.group(1).rstrip("/"))
            current_year = now.year
            if year < current_year:
                url_date = datetime(year, 1, 1, tzinfo=timezone.utc)
                age_h = (now - url_date).total_seconds() / 3600.0
                if age_h > max_age:
                    return {
                        "is_fresh": False,
                        "published_at_iso": url_date.isoformat(),
                        "age_hours": round(age_h, 2),
                        "reject_reason": f"URL berita arsip lama ({year}, melebihi batas {max_age} jam)",
                    }
    except Exception:
        pass

    # ---- Check 1b: Indonesian relative timestamps ('N menit/jam/hari lalu') ----
    for _rel_raw in (html_meta_date, pub_date_raw):
        try:
            _rel_age = _parse_indonesian_relative_to_hours(_rel_raw)
        except Exception:
            _rel_age = None
        if _rel_age is not None:
            _rel_dt = now - timedelta(hours=float(_rel_age))
            if _rel_age > max_age:
                return {
                    "is_fresh": False,
                    "published_at_iso": _rel_dt.isoformat(),
                    "age_hours": round(float(_rel_age), 2),
                    "reject_reason": f"Berita sudah lewat {round(float(_rel_age), 1)} jam (batas {max_age} jam)",
                }
            return {
                "is_fresh": True,
                "published_at_iso": _rel_dt.isoformat(),
                "age_hours": round(float(_rel_age), 2),
                "reject_reason": None,
            }

    # ---- Check 2: pubDate / HTML meta timestamp parsing ----
    parsed: Optional[datetime] = None
    if html_meta_date:
        parsed = _parse_pub_date_to_utc(html_meta_date)
    if parsed is None and pub_date_raw:
        parsed = _parse_pub_date_to_utc(pub_date_raw)
    if parsed is None:
        # Production default: unparseable/missing dates fail closed so DOM-scraped
        # pages with malformed dates cannot bypass the 48h gate. Fixtures opt in
        # explicitly via is_test_fixture=True.
        if is_test_fixture:
            return {
                "is_fresh": True,
                "published_at_iso": now.isoformat(),
                "age_hours": 0.0,
                "reject_reason": None,
            }
        return {
            "is_fresh": False,
            "published_at_iso": None,
            "age_hours": None,
            "reject_reason": "unparseable_date_in_prod",
        }
    age_h = (now - parsed).total_seconds() / 3600.0
    if age_h < 0:
        age_h = 0.0
    if age_h > max_age:
        return {
            "is_fresh": False,
            "published_at_iso": parsed.isoformat(),
            "age_hours": round(age_h, 2),
            "reject_reason": f"Berita sudah lewat {round(age_h, 1)} jam (batas {max_age} jam)",
        }
    return {
        "is_fresh": True,
        "published_at_iso": parsed.isoformat(),
        "age_hours": round(age_h, 2),
        "reject_reason": None,
    }


def extract_html_published_time(html: str) -> str | None:
    """Extracts article:published_time / pubdate / datePublished from raw HTML."""
    if not html or not isinstance(html, str):
        return None
    patterns = [
        r'<meta[^>]+property=["\']article:published_time["\'][^>]*content=["\'](.*?)["\']',
        r'<meta[^>]+content=["\'](.*?)["\'][^>]*property=["\']article:published_time["\']',
        r'<meta[^>]+name=["\']pubdate["\'][^>]*content=["\'](.*?)["\']',
        r'<meta[^>]+name=["\']publishdate["\'][^>]*content=["\'](.*?)["\']',
        r'<meta[^>]+content=["\'](.*?)["\'][^>]*name=["\']pubdate["\']',
        r'"datePublished"\s*:\s*"([^"]+)"',
        r"'datePublished'\s*:\s*'([^']+)'",
    ]
    for pat in patterns:
        try:
            m = re.search(pat, html, flags=re.IGNORECASE | re.DOTALL)
            if m and m.group(1).strip():
                return m.group(1).strip()
        except Exception:
            continue
    return None


async def fetch_rss_feed_items(feed_config: Dict[str, Any], timeout: float = 6.0) -> List[Dict[str, Any]]:
    """Fetches and parses a single XML RSS feed with logistics/disaster keyword gate."""
    url = feed_config["url"]
    source_name = feed_config["source"]
    source_tier = feed_config.get("tier", "TIER_2_AUTHORITATIVE_PRESS")
    
    items = []
    try:
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
            # Tribun regional networks (padang/palembang/batam/lampung/aceh
            # .tribunnews.com) reject the legacy "PreHub Logistics Bot" UA with
            # HTTP 403 while serving normal RSS to a standard browser UA.
            resp = await client.get(
                url,
                headers={
                    "User-Agent": (
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
                    ),
                    "Accept": "application/rss+xml,application/xml,text/xml,*/*",
                },
            )
            if resp.status_code == 200:
                root = ET.fromstring(resp.text)
                for item in root.findall(".//item")[:40]:
                    title = item.findtext("title", "").strip()
                    raw_link = item.findtext("link", "").strip()
                    pub_date = item.findtext("pubDate", "").strip()
                    desc = item.findtext("description", "").strip()
                    
                    if not title:
                        continue
                    
                    # Reject non-logistics / health / entertainment articles
                    if not is_relevant_logistics_or_disaster(f"{title} {desc}"):
                        continue
                        
                    canonical_link = resolve_canonical_article_url(raw_link, title, source_name)
                    # M1: unresolvable link → DROP the item (no search-page fallback).
                    if not canonical_link:
                        continue
                    # Strict 48h freshness gate (archival URL + pubDate).
                    try:
                        _fresh = parse_and_validate_article_freshness(pub_date, canonical_link, max_age_hours=MAX_NEWS_AGE_HOURS)
                    except Exception:
                        _fresh = {"is_fresh": True, "published_at_iso": None, "age_hours": 0.0, "reject_reason": None}
                    if not _fresh.get("is_fresh"):
                        continue
                    items.append({
                        "title": title,
                        "link": canonical_link,
                        "url": canonical_link,
                        "pubDate": pub_date,
                        "original_pub_date": pub_date,
                        "published_at": _fresh.get("published_at_iso"),
                        "source": source_name,
                        "source_tier": source_tier,
                        "province": feed_config.get("province", "Sumatera"),
                        "raw_description": desc
                    })
    except Exception as e:
        logger.debug(f"RSS fetch skipped for {source_name} ({url}): {e}")
    return items


async def fetch_google_news_targeted(query: str, timeout: float = 6.0) -> List[Dict[str, Any]]:
    """Fetches Google News RSS with site-targeted authoritative Indonesian press."""
    encoded_query = urllib.parse.quote(query)
    url = f"https://news.google.com/rss/search?q={encoded_query}&hl=id&gl=ID&ceid=ID:id"
    
    items = []
    try:
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
            resp = await client.get(url, headers={"User-Agent": "Mozilla/5.0 (PreHub Logistics Bot 2.0)"})
            if resp.status_code == 200:
                root = ET.fromstring(resp.text)
                for item in root.findall(".//item")[:10]:
                    title = item.findtext("title", "").strip()
                    raw_link = item.findtext("link", "").strip()
                    pub_date = item.findtext("pubDate", "").strip()
                    desc = item.findtext("description", "").strip()
                    source_elem = item.find("source")
                    source_name = source_elem.text.strip() if source_elem is not None and source_elem.text else "Media Terverifikasi"
                    
                    if not title:
                        continue

                    # Reject non-logistics noise
                    if not is_relevant_logistics_or_disaster(f"{title} {desc}"):
                        continue
                        
                    # Classify tier
                    is_official = any(s in source_name.lower() for s in ["antara", "bmkg", "bnpb", "kemenhub", "bulog", "bi.go.id"])
                    source_tier = "TIER_1_OFFICIAL" if is_official else "TIER_2_AUTHORITATIVE_PRESS"
                    
                    canonical_link = await resolve_canonical_article_url_async(raw_link, title, source_name, client=client)
                    # M1: unresolvable link → DROP the item (no search-page fallback).
                    if not canonical_link:
                        continue
                    try:
                        _fresh2 = parse_and_validate_article_freshness(pub_date, canonical_link, max_age_hours=MAX_NEWS_AGE_HOURS)
                    except Exception:
                        _fresh2 = {"is_fresh": True, "published_at_iso": None, "age_hours": 0.0, "reject_reason": None}
                    if not _fresh2.get("is_fresh"):
                        continue
                    items.append({
                        "title": title,
                        "link": canonical_link,
                        "url": canonical_link,
                        "pubDate": pub_date,
                        "original_pub_date": pub_date,
                        "published_at": _fresh2.get("published_at_iso"),
                        "source": source_name,
                        "source_tier": source_tier,
                        "raw_description": title
                    })
    except Exception as e:
        logger.debug(f"Google News targeted fetch skipped for '{query[:30]}': {e}")
    return items


async def fetch_all_multi_outlet_news() -> List[Dict[str, Any]]:
    """
    Aggregates all incoming raw news items dynamically from direct official RSS feeds
    and targeted regional press queries concurrently across all 10 Sumatra bureaus.
    """
    tasks = []
    
    # 1. Direct Official RSS
    for feed in OFFICIAL_RSS_FEEDS:
        tasks.append(fetch_rss_feed_items(feed))
        
    # 2. Targeted Press Queries
    for q in TARGETED_PRESS_QUERIES:
        tasks.append(fetch_google_news_targeted(q))
        
    results = await asyncio.gather(*tasks, return_exceptions=True)
    
    raw_articles = []
    for res in results:
        if isinstance(res, list):
            raw_articles.extend(res)
            
    # Deduplicate by title
    seen_titles = set()
    unique_articles = []
    for art in raw_articles:
        t = art["title"].lower().strip()
        if t not in seen_titles:
            seen_titles.add(t)
            unique_articles.append(art)
            
    logger.info(f"Dynamically fetched {len(unique_articles)} unique news articles from Pan-Sumatra feeds.")
    return unique_articles


async def upsert_articles_to_supabase(articles: List[Dict[str, Any]]) -> int:
    """
    Persists structured articles with PostGIS coordinates directly into Supabase public.news_articles.
    Uses link as unique constraint to avoid duplicate entries.
    """
    if not articles:
        return 0

    try:
        from app.db.supabase_client import get_service_client
        sb = get_service_client()
    except Exception as e:
        logger.warning(f"Supabase client unavailable for news upsert: {e}")
        return 0

    upsert_count = 0
    records = []
    
    for a in articles:
        link = a.get("link")
        if not link:
            continue

        lat = a.get("latitude")
        lon = a.get("longitude")

        # PostGIS geography format for Supabase REST is WKT string e.g. "SRID=4326;POINT(lon lat)"
        postgis_loc = f"SRID=4326;POINT({lon} {lat})" if (lat is not None and lon is not None) else None

        # Persist 100% of new metadata inside existing ground_truth_metrics JSONB
        # so Supabase upserts never fail with unknown-column errors.
        gtm = dict(a.get("ground_truth_metrics") or {})
        for _k in ("zone_tier", "tier_reason", "custom_hazard_label", "impact_profile",
                   "is_geocoded", "location_precision", "affected_locations", "schema_version",
                   "forecast_tag", "forecast_valid_until"):
            if a.get(_k) is not None and _k not in gtm:
                gtm[_k] = a.get(_k)
        # Also mirror nested impact_profile fields if present at top level
        if a.get("impact_profile") is not None:
            gtm["impact_profile"] = a.get("impact_profile")
        if a.get("custom_hazard_label") is not None:
            gtm["custom_hazard_label"] = a.get("custom_hazard_label")
        if a.get("zone_tier") is not None:
            gtm["zone_tier"] = a.get("zone_tier")
        if a.get("tier_reason") is not None:
            gtm["tier_reason"] = a.get("tier_reason")
        if a.get("is_geocoded") is not None:
            gtm["is_geocoded"] = a.get("is_geocoded")
        if a.get("location_precision") is not None:
            gtm["location_precision"] = a.get("location_precision")
        if a.get("affected_locations") is not None:
            gtm["affected_locations"] = a.get("affected_locations")
        # Preserve true published_at (never overwrite with now) + agent audit trail.
        try:
            _fresh_up = parse_and_validate_article_freshness(
                a.get("original_pub_date") or a.get("pubDate") or a.get("published_at"),
                a.get("link"),
                html_meta_date=a.get("html_published_at"),
                max_age_hours=MAX_NEWS_AGE_HOURS,
            )
            _pub_iso = _fresh_up.get("published_at_iso") or a.get("published_at")
        except Exception:
            _fresh_up = {"published_at_iso": a.get("published_at"), "age_hours": None}
            _pub_iso = a.get("published_at")
        if a.get("original_pub_date") is not None:
            gtm["original_pub_date"] = a.get("original_pub_date")
        elif a.get("pubDate") is not None:
            gtm["original_pub_date"] = a.get("pubDate")
        if _pub_iso is not None:
            gtm["published_at_iso"] = _pub_iso
        if _fresh_up.get("age_hours") is not None:
            gtm["age_hours"] = _fresh_up.get("age_hours")
        if a.get("radius_km") is not None:
            gtm["radius_km"] = a.get("radius_km")
        if a.get("geometry_polygon") is not None:
            gtm["geometry_polygon"] = a.get("geometry_polygon")
        if a.get("verification_audit") is not None:
            gtm["verification_audit"] = a.get("verification_audit")
        if a.get("body_scraped") is not None:
            gtm["body_scraped"] = a.get("body_scraped")
        if a.get("article_body_chars") is not None:
            gtm["article_body_chars"] = a.get("article_body_chars")
        try:
            _excerpt = (a.get("raw_description") or "")[:2000]
            if _excerpt:
                gtm["article_body_excerpt"] = _excerpt
        except Exception:
            pass
        try:
            from app.nlp.news_extractor import EXTRACTION_SCHEMA_VERSION as _SV
            gtm["schema_version"] = _SV
        except Exception:
            gtm.setdefault("schema_version", 7)

        record = {
            "id": a.get("id"),
            "title": a.get("title"),
            "link": link,
            "source": a.get("source", "Media"),
            "source_tier": a.get("source_tier", "TIER_2_AUTHORITATIVE_PRESS"),
            "category": a.get("category", "GENERAL_LOGISTICS"),
            "province": a.get("province") or a.get("region") or "Sumatera",
            "location": postgis_loc,
            "latitude": lat,
            "longitude": lon,
            "corridor_segment": a.get("corridor_segment"),
            "corridor_nodes": a.get("corridor_nodes") or [],
            "incident_type": a.get("incident_type", "logistics_news"),
            "severity": a.get("severity", "low"),
            "temporal_phase": a.get("temporal_phase", "active_disruption"),
            "lead_time_hours": float(a.get("lead_time_hours") or 0.0),
            "commodities_affected": a.get("commodities_affected") or [],
            "ground_truth_metrics": gtm,
            "confidence_score": float(a.get("confidence_score") or 0.85),
            "raw_description": a.get("raw_description") or a.get("summary"),
            "summary": a.get("summary") or a.get("title"),
            "link_alive": a.get("link_alive", "unknown"),
            "published_at": a.get("published_at") or _pub_iso or datetime.now(timezone.utc).isoformat()
        }
        records.append(record)

    # Batch upsert in chunks of 50
    chunk_size = 50
    for i in range(0, len(records), chunk_size):
        chunk = records[i:i + chunk_size]
        try:
            res = sb.table("news_articles").upsert(chunk, on_conflict="link").execute()
            if res.data:
                upsert_count += len(res.data)
        except Exception as ue:
            logger.error(f"Error upserting news chunk to Supabase: {ue}")

    logger.info(f"Successfully upserted {upsert_count} articles to Supabase public.news_articles")
    # Remember everything in-process so the next 5-min cycle skips LLM calls
    # even if Supabase is unreachable.
    for a in articles:
        try:
            remember_processed_article(a)
        except Exception:
            pass
    return upsert_count


def _unpack_ground_truth_metrics(row: Dict[str, Any]) -> Dict[str, Any]:
    """Unpacks zone_tier/tiering metadata from ground_truth_metrics JSONB onto the row."""
    try:
        gtm = row.get("ground_truth_metrics") or {}
        if isinstance(gtm, str):
            import json as _json
            try:
                gtm = _json.loads(gtm)
            except Exception:
                gtm = {}
        if not isinstance(gtm, dict):
            return row
        for _k in ("zone_tier", "tier_reason", "custom_hazard_label", "impact_profile",
                   "is_geocoded", "location_precision", "affected_locations", "schema_version",
                   "radius_km", "geometry_polygon", "verification_audit", "original_pub_date",
                   "published_at_iso", "age_hours", "body_scraped", "article_body_chars",
                   "article_body_excerpt", "forecast_tag", "forecast_valid_until"):
            if row.get(_k) is None and gtm.get(_k) is not None:
                row[_k] = gtm[_k]
        # Re-run v7 heuristic when cached/DB rows carry a stale schema version.
        if gtm.get("schema_version") != 7:
            try:
                from app.nlp.news_extractor import _fast_heuristic_extraction as _re_tier_v2
                legacy_art = {
                    "title": row.get("title", ""),
                    "raw_description": row.get("raw_description") or row.get("summary") or "",
                    "source": row.get("source", "Media"),
                    "source_tier": row.get("source_tier", "TIER_2_AUTHORITATIVE_PRESS"),
                    "province": row.get("province", "Sumatera"),
                    "link": row.get("link", ""),
                    "pubDate": row.get("original_pub_date") or row.get("pubDate") or row.get("published_at"),
                    "original_pub_date": row.get("original_pub_date") or gtm.get("original_pub_date"),
                    "published_at": row.get("published_at"),
                    "html_published_at": row.get("html_published_at") or gtm.get("published_at_iso"),
                }
                re_tiered = _re_tier_v2(legacy_art)
                for _k in ("zone_tier", "tier_reason", "custom_hazard_label", "impact_profile",
                           "is_geocoded", "location_precision", "latitude", "longitude",
                           "incident_type", "severity", "corridor_nodes", "corridor_segment",
                           "affected_locations", "radius_km", "geometry_polygon", "verification_audit",
                           "forecast_tag", "forecast_valid_until"):
                    if re_tiered.get(_k) is not None:
                        row[_k] = re_tiered.get(_k)
                row["ground_truth_metrics"] = re_tiered.get("ground_truth_metrics", row.get("ground_truth_metrics"))
            except Exception:
                pass
    except Exception:
        pass
    return row


_CROSS_LINK_P_RE = re.compile(
    r"^\s*(baca|lihat|simak|klik)\s+(juga|selengkapnya|berita\s+terkait)\b",
    re.IGNORECASE,
)
_PROMO_FOOTER_RES = (
    re.compile(r"saksikan\s+video\s+pilihan", re.IGNORECASE),
    re.compile(r"ikuti\s+berita.*google\s+news", re.IGNORECASE),
    re.compile(r"download\s+aplikasi", re.IGNORECASE),
    re.compile(r"simak\s+selengkapnya", re.IGNORECASE),
    re.compile(r"klik\s+selengkapnya", re.IGNORECASE),
)
_INLINE_ANCHOR_RE = re.compile(r"<a\b[^>]*>.*?</a\s*>", re.IGNORECASE | re.DOTALL)


def _strip_inline_anchors_if_crosslink(p_html: str) -> str:
    """Removes <a>…</a> inside a <p> when the paragraph carries a cross-link cue.

    Detik/ANTARA/CNN embed related-article anchors inside <p> tags
    ('Baca juga: …'). The anchor text often names past disasters in other
    districts, poisoning geocoding + crisis detection. Stripping the anchor
    while keeping surrounding prose prevents the leak.
    """
    try:
        low = (p_html or "").lower()
        if "baca juga" in low or "lihat juga" in low or "simak" in low:
            return _INLINE_ANCHOR_RE.sub(" ", p_html or "")
    except Exception:
        pass
    return p_html


def _is_boilerplate_para(text: str) -> bool:
    """True when a de-tagged paragraph is cross-link boilerplate or promo footer."""
    try:
        t = (text or "").strip()
        if not t:
            return True
        if _CROSS_LINK_P_RE.search(t):
            return True
        low = t.lower()
        # Legacy substring guard (kept) + stricter start-anchored regex above.
        if low.startswith(("baca juga", "lihat juga", "simak selengkapnya", "klik selengkapnya")):
            return True
        for _rx in _PROMO_FOOTER_RES:
            if _rx.search(t):
                return True
    except Exception:
        return False
    return False


def extract_lead_text_from_html(html: str) -> str:
    """Extracts clean lead article text (og:description or lead <p> paragraphs, strictly clamped to <= 400 chars).
    Strips scripts, styles, navs, footers, asides, headers, forms, iframes, and advertising containers.
    """
    if not html or not isinstance(html, str):
        return ""
    lead = ""
    try:
        # Strip non-content and layout/ad blocks first.
        cleaned = re.sub(r'<script.*?</script>', ' ', html, flags=re.IGNORECASE | re.DOTALL)
        cleaned = re.sub(r'<style.*?</style>', ' ', cleaned, flags=re.IGNORECASE | re.DOTALL)
        cleaned = re.sub(r'<nav.*?</nav>', ' ', cleaned, flags=re.IGNORECASE | re.DOTALL)
        cleaned = re.sub(r'<footer.*?</footer>', ' ', cleaned, flags=re.IGNORECASE | re.DOTALL)
        cleaned = re.sub(r'<aside.*?</aside>', ' ', cleaned, flags=re.IGNORECASE | re.DOTALL)
        cleaned = re.sub(r'<header.*?</header>', ' ', cleaned, flags=re.IGNORECASE | re.DOTALL)
        cleaned = re.sub(r'<form.*?</form>', ' ', cleaned, flags=re.IGNORECASE | re.DOTALL)
        cleaned = re.sub(r'<iframe.*?</iframe>', ' ', cleaned, flags=re.IGNORECASE | re.DOTALL)
        # Strip common ad / widget / banner / social containers
        cleaned = re.sub(
            r'<(?:div|section)[^>]*(?:class|id)=["\'][^"\']*(?:ad-|ads-|advertisement|banner|popup|social-share|related-news|widget|sidebar)[^"\']*["\'][^>]*>.*?</(?:div|section)>',
            ' ',
            cleaned,
            flags=re.IGNORECASE | re.DOTALL,
        )

        m = re.search(r'<meta[^>]+property=["\']og:description["\'][^>]*content=["\'](.*?)["\']', cleaned, flags=re.IGNORECASE | re.DOTALL)
        if m:
            lead = m.group(1).strip()
        if not lead:
            m2 = re.search(r'<meta[^>]+name=["\']description["\'][^>]*content=["\'](.*?)["\']', cleaned, flags=re.IGNORECASE | re.DOTALL)
            if m2:
                lead = m2.group(1).strip()
        if not lead:
            m3 = re.search(r'<meta[^>]+content=["\'](.*?)["\'][^>]*property=["\']og:description["\']', cleaned, flags=re.IGNORECASE | re.DOTALL)
            if m3:
                lead = m3.group(1).strip()
        # Prefer <p> tags inside <article> or known content containers.
        search_scope = cleaned
        try:
            article_blocks = re.findall(r'<article.*?>(.*?)</article>', cleaned, flags=re.IGNORECASE | re.DOTALL)
            if article_blocks:
                search_scope = " ".join(article_blocks)
            else:
                container_pat = re.compile(
                    r'<(?:div|section)[^>]*(?:post-content|entry-content|detail__body-text|read__content|article-content|text-body)[^>]*>(.*?)</(?:div|section)>',
                    flags=re.IGNORECASE | re.DOTALL,
                )
                container_blocks = container_pat.findall(cleaned)
                if container_blocks:
                    search_scope = " ".join(container_blocks)
        except Exception:
            search_scope = cleaned
        paras = re.findall(r'<p[^>]*>(.*?)</p>', search_scope, flags=re.IGNORECASE | re.DOTALL)
        if not paras:
            paras = re.findall(r'<p[^>]*>(.*?)</p>', cleaned, flags=re.IGNORECASE | re.DOTALL)
        clean_paras = []
        for p in paras[:8]:
            p = _strip_inline_anchors_if_crosslink(p)
            t = re.sub(r'<[^>]+>', ' ', p)
            t = re.sub(r'\s+', ' ', t).strip()
            if len(t) < 35:
                continue
            if _is_boilerplate_para(t):
                continue
            low = t.lower()
            if any(b in low for b in ("copyright", "advertisement", "iklan", "langganan", "pewarta:", "editor:", "ikuti kami di")):
                continue
            clean_paras.append(t)
        para_text = " ".join(clean_paras)
        if lead and para_text:
            combined = (lead + " " + para_text)[:400]
            return combined.strip()
        if para_text:
            return para_text[:400].strip()
        return (lead or "")[:400].strip()
    except Exception:
        return (lead or "")[:400].strip()


def extract_full_article_body_from_html(html: str) -> str:
    """Extracts FULL-BODY article text for Gate-2 review only (up to 2500 chars).

    Gate-1 stays on the clamped `extract_lead_text_from_html` (<=400 chars)
    to save tokens. Gate-2 (uncertain/YELLOW/conf<0.7 only, mimo-v2.6-pro
    low-effort + single web-search + consensus re-check) uses this full-body
    path so the verifier reads beyond the RSS teaser. Keeps the remote
    ad/layout stripping improvements (header/form/iframe/ad containers)
    with the local 18-paragraph / 2500-char depth.
    """
    if not html or not isinstance(html, str):
        return ""
    lead = ""
    try:
        cleaned = re.sub(r'<script.*?</script>', ' ', html, flags=re.IGNORECASE | re.DOTALL)
        cleaned = re.sub(r'<style.*?</style>', ' ', cleaned, flags=re.IGNORECASE | re.DOTALL)
        cleaned = re.sub(r'<nav.*?</nav>', ' ', cleaned, flags=re.IGNORECASE | re.DOTALL)
        cleaned = re.sub(r'<footer.*?</footer>', ' ', cleaned, flags=re.IGNORECASE | re.DOTALL)
        cleaned = re.sub(r'<aside.*?</aside>', ' ', cleaned, flags=re.IGNORECASE | re.DOTALL)
        cleaned = re.sub(r'<header.*?</header>', ' ', cleaned, flags=re.IGNORECASE | re.DOTALL)
        cleaned = re.sub(r'<form.*?</form>', ' ', cleaned, flags=re.IGNORECASE | re.DOTALL)
        cleaned = re.sub(r'<iframe.*?</iframe>', ' ', cleaned, flags=re.IGNORECASE | re.DOTALL)
        cleaned = re.sub(
            r'<(?:div|section)[^>]*(?:class|id)=["\'][^"\']*(?:ad-|ads-|advertisement|banner|popup|social-share|related-news|widget|sidebar)[^"\']*["\'][^>]*>.*?</(?:div|section)>',
            ' ',
            cleaned,
            flags=re.IGNORECASE | re.DOTALL,
        )
        m = re.search(r'<meta[^>]+property=["\']og:description["\'][^>]*content=["\'](.*?)["\']', cleaned, flags=re.IGNORECASE | re.DOTALL)
        if m:
            lead = m.group(1).strip()
        if not lead:
            m2 = re.search(r'<meta[^>]+name=["\']description["\'][^>]*content=["\'](.*?)["\']', cleaned, flags=re.IGNORECASE | re.DOTALL)
            if m2:
                lead = m2.group(1).strip()
        if not lead:
            m3 = re.search(r'<meta[^>]+content=["\'](.*?)["\'][^>]*property=["\']og:description["\']', cleaned, flags=re.IGNORECASE | re.DOTALL)
            if m3:
                lead = m3.group(1).strip()
        search_scope = cleaned
        try:
            article_blocks = re.findall(r'<article.*?>(.*?)</article>', cleaned, flags=re.IGNORECASE | re.DOTALL)
            if article_blocks:
                search_scope = " ".join(article_blocks)
            else:
                container_pat = re.compile(
                    r'<(?:div|section)[^>]*(?:post-content|entry-content|detail__body-text|read__content|article-content|text-body)[^>]*>(.*?)</(?:div|section)>',
                    flags=re.IGNORECASE | re.DOTALL,
                )
                container_blocks = container_pat.findall(cleaned)
                if container_blocks:
                    search_scope = " ".join(container_blocks)
        except Exception:
            search_scope = cleaned
        paras = re.findall(r'<p[^>]*>(.*?)</p>', search_scope, flags=re.IGNORECASE | re.DOTALL)
        if not paras:
            paras = re.findall(r'<p[^>]*>(.*?)</p>', cleaned, flags=re.IGNORECASE | re.DOTALL)
        clean_paras = []
        for p in paras[:18]:
            p = _strip_inline_anchors_if_crosslink(p)
            t = re.sub(r'<[^>]+>', ' ', p)
            t = re.sub(r'\s+', ' ', t).strip()
            if len(t) < 40:
                continue
            if _is_boilerplate_para(t):
                continue
            low = t.lower()
            if any(b in low for b in ("copyright", "advertisement", "iklan", "langganan", "pewarta:", "editor:", "ikuti kami di")):
                continue
            clean_paras.append(t)
        para_text = " ".join(clean_paras)
        if lead and para_text:
            combined = (lead + " " + para_text)[:2500]
            return combined
        if para_text:
            return para_text[:2500]
        return (lead or "")[:2500]
    except Exception:
        return lead


async def enrich_article_description_if_needed(article: Dict[str, Any], timeout: float = 5.0) -> Dict[str, Any]:
    """Fetches the article URL to enrich short/title-only descriptions.

    Scrapes the article URL whenever `body_scraped` is not set and the
    description is shorter than 200 chars. Combines the original RSS summary with
    scraped lead paragraphs (strictly clamped to <= 400 chars) to prevent LLM token drain.
    Also extracts article:published_time / pubdate / datePublished into html_published_at for the 48h freshness gate.
    """
    try:
        title = (article.get("title") or "").strip()
        desc = (article.get("raw_description") or article.get("summary") or "").strip()
        already_scraped = bool(article.get("body_scraped"))
        needs = (
            (not already_scraped and len(desc) < 200)
            or (not desc)
            or desc == title
            or any(w in title.lower() for w in ("daerah", "kabupaten", "wilayah", "titik", "lokasi", "catat"))
        )
        # Always try to capture HTML published time when missing, even if
        # description looks complete, so freshness can be re-validated.
        if not needs and article.get("html_published_at"):
            return article
        raw_url = article.get("link") or article.get("url") or ""
        if not raw_url or not str(raw_url).startswith("http"):
            return article
        canonical = await resolve_canonical_article_url_async(raw_url, title, article.get("source", ""))
        if canonical:
            article["link"] = canonical
            article["url"] = canonical
            raw_url = canonical
        try:
            async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
                resp = await client.get(raw_url, headers={"User-Agent": "Mozilla/5.0 (PreHub Logistics Bot 2.0)"})
                if resp.status_code == 200 and resp.text:
                    html_time = extract_html_published_time(resp.text)
                    if html_time:
                        article["html_published_at"] = html_time
                    if needs:
                        full_body = extract_lead_text_from_html(resp.text)
                        if full_body:
                            combined = ((desc + " " + full_body).strip() if desc and desc not in full_body else full_body)[:400]
                            if len(combined) > len(desc):
                                article["raw_description"] = combined
                            article["body_scraped"] = True
                            article["article_body_chars"] = len(article.get("raw_description") or "")
        except Exception as e:
            logger.debug(f"Description enrichment skipped for {raw_url}: {e}")
    except Exception:
        pass
    return article


async def enrich_article_description_full_body_if_needed(article: Dict[str, Any], timeout: float = 10.0) -> Dict[str, Any]:
    """Gate-2 ONLY full-body enricher (up to 2500 chars).

    Gate-1 stays clamped (<=400 chars). Gate-2 calls this to expand short
    RSS teasers (<450 chars) into full article bodies via
    `extract_full_article_body_from_html` so the mimo-v2.6-pro verifier
    reads beyond the teaser. Never used on the Gate-1 hot path.
    """
    try:
        title = (article.get("title") or "").strip()
        desc = (article.get("raw_description") or article.get("summary") or "").strip()
        already_scraped = bool(article.get("body_scraped"))
        needs = (
            (not already_scraped and len(desc) < 450)
            or (not desc)
            or desc == title
            or any(w in title.lower() for w in ("daerah", "kabupaten", "wilayah", "titik", "lokasi", "catat"))
        )
        if not needs and article.get("html_published_at"):
            return article
        raw_url = article.get("link") or article.get("url") or ""
        if not raw_url or not str(raw_url).startswith("http"):
            return article
        canonical = await resolve_canonical_article_url_async(raw_url, title, article.get("source", ""))
        if canonical:
            article["link"] = canonical
            article["url"] = canonical
            raw_url = canonical
        try:
            async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
                resp = await client.get(raw_url, headers={"User-Agent": "Mozilla/5.0 (PreHub Logistics Bot 2.0)"})
                if resp.status_code == 200 and resp.text:
                    html_time = extract_html_published_time(resp.text)
                    if html_time:
                        article["html_published_at"] = html_time
                    if needs:
                        full_body = extract_full_article_body_from_html(resp.text)
                        if full_body:
                            combined = ((desc + " " + full_body).strip() if desc and desc not in full_body else full_body)[:2500]
                            if len(combined) > len(desc):
                                article["raw_description"] = combined
                            article["body_scraped"] = True
                            article["article_body_chars"] = len(article.get("raw_description") or "")
        except Exception as e:
            logger.debug(f"Gate-2 full-body enrichment skipped for {raw_url}: {e}")
    except Exception:
        pass
    return article


async def fetch_news_from_supabase(limit: int = 150, province: Optional[str] = None, severity: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    Retrieves dynamic verified news articles from Supabase public.news_articles.
    Unpacks tiering metadata from ground_truth_metrics and filters out
    DROPPED_IRRELEVANT / un-geocoded bureau-centroid noise. Legacy rows missing
    `zone_tier` are re-tiered on read via the fast heuristic + bureau stripping
    so polluted Bengkulu-centroid rows are immediately cleaned.
    """
    try:
        from app.db.supabase_client import get_client
        sb = get_client()
        query = sb.table("news_articles").select("*").order("created_at", desc=True).limit(limit)

        if province:
            query = query.eq("province", province)
        if severity:
            query = query.eq("severity", severity)

        res = query.execute()
        rows = res.data or []
    except Exception as e:
        logger.warning(f"Error fetching news articles from Supabase: {e}")
        return []

    # Lazy import to avoid cycles; fallback to inline minimal tiering if unavailable.
    try:
        from app.nlp.news_extractor import _fast_heuristic_extraction as _re_tier
    except Exception:
        _re_tier = None

    cleaned: List[Dict[str, Any]] = []
    for row in rows:
        try:
            row = _unpack_ground_truth_metrics(dict(row))
        except Exception:
            continue
        # Legacy rows missing zone_tier or carrying stale schema: re-run
        # fast heuristic on read (schema_version != 7 forces v7 re-tier).
        _needs_retier = (not row.get("zone_tier"))
        try:
            _gtm_chk = row.get("ground_truth_metrics") or {}
            if isinstance(_gtm_chk, str):
                import json as _js3
                try:
                    _gtm_chk = _js3.loads(_gtm_chk)
                except Exception:
                    _gtm_chk = {}
            if isinstance(_gtm_chk, dict) and _gtm_chk.get("schema_version") != 7:
                _needs_retier = True
        except Exception:
            pass
        if _needs_retier and _re_tier is not None:
            try:
                legacy_art = {
                    "title": row.get("title", ""),
                    "raw_description": row.get("raw_description") or row.get("summary") or "",
                    "source": row.get("source", "Media"),
                    "source_tier": row.get("source_tier", "TIER_2_AUTHORITATIVE_PRESS"),
                    "province": row.get("province", "Sumatera"),
                    "link": row.get("link", ""),
                    "pubDate": row.get("original_pub_date") or row.get("pubDate") or row.get("published_at"),
                    "original_pub_date": row.get("original_pub_date") or (_gtm_chk.get("original_pub_date") if isinstance(_gtm_chk, dict) else None),
                    "published_at": row.get("published_at"),
                    "html_published_at": row.get("html_published_at"),
                }
                re_tiered = _re_tier(legacy_art)
                for _k in ("zone_tier", "tier_reason", "custom_hazard_label", "impact_profile",
                           "is_geocoded", "location_precision", "latitude", "longitude",
                           "incident_type", "severity", "corridor_nodes", "corridor_segment",
                           "affected_locations", "radius_km", "geometry_polygon", "verification_audit",
                           "forecast_tag", "forecast_valid_until"):
                    if re_tiered.get(_k) is not None:
                        # Only overwrite coordinates/geo when legacy row has none
                        # or was a blind fallback centroid without a real location,
                        # or carries a stale schema version.
                        if _k in ("latitude", "longitude", "corridor_segment", "corridor_nodes",
                                  "province", "region", "affected_locations"):
                            _sv = None
                            try:
                                _g = row.get("ground_truth_metrics") or {}
                                if isinstance(_g, dict):
                                    _sv = _g.get("schema_version")
                            except Exception:
                                pass
                            if row.get("latitude") is None or row.get("longitude") is None or row.get("zone_tier") is None or _sv != 7:
                                row[_k] = re_tiered.get(_k)
                            if _k == "affected_locations":
                                row[_k] = re_tiered.get(_k)
                        else:
                            row[_k] = re_tiered.get(_k)
                # Always refresh ground_truth_metrics to v7.
                try:
                    row["ground_truth_metrics"] = re_tiered.get("ground_truth_metrics", row.get("ground_truth_metrics"))
                except Exception:
                    pass
            except Exception:
                pass
        # Strict 48h freshness gate: drop stale archival rows. Caveat for legacy
        # DB rows — previously upsert overwrote published_at with now(), so do NOT
        # trust a published_at column lacking original_pub_date when schema < 3
        # and the URL carries an archival date (parse helper checks URL first).
        try:
            _gtm_f = row.get("ground_truth_metrics") or {}
            if isinstance(_gtm_f, str):
                import json as _jf
                try:
                    _gtm_f = _jf.loads(_gtm_f)
                except Exception:
                    _gtm_f = {}
            _sv_f = _gtm_f.get("schema_version", 0) if isinstance(_gtm_f, dict) else 0
            _pub_raw = row.get("original_pub_date") or (_gtm_f.get("original_pub_date") if isinstance(_gtm_f, dict) else None) or row.get("pubDate") or row.get("published_at")
            # If legacy row (schema < 3) has no original_pub_date, let URL archival
            # detection dominate by passing published_at only when URL has no date.
            _fresh_chk = parse_and_validate_article_freshness(
                _pub_raw, row.get("link"), html_meta_date=row.get("html_published_at"), max_age_hours=MAX_NEWS_AGE_HOURS
            )
            # Legacy DB caveat: schema < 3 + no original_pub_date + archival URL
            # must be dropped even if published_at looks fresh (it was overwritten).
            if not _fresh_chk.get("is_fresh"):
                continue
            # Sync true published_at / age for downstream consumers.
            if _fresh_chk.get("published_at_iso"):
                row["published_at"] = _fresh_chk.get("published_at_iso")
        except Exception:
            pass
        # Filter DROPPED_IRRELEVANT or un-geocoded bureau-centroid noise.
        if row.get("zone_tier") == "DROPPED_IRRELEVANT":
            continue
        if row.get("is_geocoded") is False:
            continue
        if row.get("latitude") is None or row.get("longitude") is None:
            # Old rows that only matched a fallback province centroid without a
            # real location carry no usable coordinates → hide from map.
            continue
        cleaned.append(row)
    return cleaned
