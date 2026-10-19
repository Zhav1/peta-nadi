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
from urllib.parse import urlparse, quote_plus
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
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
    }
]

# Targeted Google News queries for verified regional press & logistics corridors across Pulau Sumatera
TARGETED_PRESS_QUERIES = [
    "(site:antaranews.com OR site:detik.com OR site:tribunnews.com OR site:kompas.com) (banjir OR longsor OR jalan terputus) (Medan OR Tebing Tinggi OR Belawan OR Jalinsum)",
    "(site:antaranews.com OR site:tribunnews.com OR site:detik.com) (longsor Sitinjau Lauik OR jalan Padang Solok OR tol Pekanbaru Dumai)",
    "(site:antaranews.com OR site:bisnis.com OR site:tempo.co) (stok beras BULOG OR harga cabai OR pasokan pangan) (Sumatera OR Sumut OR Sumbar OR Riau OR Lampung)",
    "(site:antaranews.com OR site:detik.com) (gelombang Selat Malaka OR Pelabuhan Belawan OR Pelabuhan Panjang OR Bakauheni OR antrean truk tol)",
    "(site:antaranews.com OR site:kompas.com) (jalan lintas timur OR jalintim OR jalinbar OR jembatan putus OR amblas) (Palembang OR Jambi OR Lampung)"
]

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


def _map_publisher_deep_fallback(title: str, source: str = "") -> str:
    """Builds a deep news publisher search/article URL instead of a generic Google landing page."""
    q = quote_plus(f"{title} {source}".strip())
    s_lower = (source or "").lower()
    if "sumbar" in s_lower:
        return f"https://sumbar.antaranews.com/search?q={q}"
    elif "sumut" in s_lower:
        return f"https://sumut.antaranews.com/search?q={q}"
    elif "detik" in s_lower:
        return f"https://www.detik.com/search/searchall?query={q}"
    elif "kompas" in s_lower:
        return f"https://search.kompas.com/search/?q={q}"
    return f"https://www.antaranews.com/search?q={q}"


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


def resolve_canonical_article_url(raw_url: str, title: str = "", source: str = "") -> str:
    """
    Resolves raw or wrapped news URLs to permanent, direct article permalinks.
    - Preserves direct publisher article permalinks (antaranews.com, detik.com, etc.).
    - Decodes Google News opaque wrappers (news.google.com/rss/articles/CBMi... or /articles/...)
      extracting the embedded HTTP/HTTPS URL from base64/protobuf payload or batchexecute RPC.
    - Rejects bare root domains (where path is empty or '/') and news.google.com/search queries,
      resolving instead to authentic publisher deep links.
    """
    if not raw_url or not isinstance(raw_url, str):
        if title:
            return _map_publisher_deep_fallback(title, source)
        return ""

    clean_url = raw_url.strip()

    # Reject bare root domains (path is empty or just '/')
    try:
        parsed = urlparse(clean_url)
        if parsed.scheme in ("http", "https") and parsed.netloc:
            if parsed.path in ("", "/"):
                if title:
                    return _map_publisher_deep_fallback(title, source)
                return clean_url
    except Exception:
        pass

    # Rewrite synthetic or dummy test IDs without a slug (e.g. 543210, 532190)
    DUMMY_IDS = ("543210", "532190", "571234", "562341", "123456", "999999")
    if any(f"/{did}" in clean_url for did in DUMMY_IDS) and not re.search(r'/\d{6}/[a-z0-9-]+', clean_url):
        if title:
            return _map_publisher_deep_fallback(title, source)

    # Detect Antara URLs that lack a numeric article ID (which causes 404 on Antara's CMS)
    if "antaranews.com/berita/" in clean_url and not re.search(r'antaranews\.com/berita/\d{5,8}/', clean_url):
        if title:
            return _map_publisher_deep_fallback(title, source)

    # If it's already a direct non-Google publisher link with a deep path, return it directly
    try:
        p = urlparse(clean_url)
        if p.netloc and "google.com" not in p.netloc and p.path not in ("", "/"):
            return clean_url
    except Exception:
        pass

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

            if title:
                return _map_publisher_deep_fallback(title, source)

    return clean_url


async def resolve_canonical_article_url_async(
    raw_url: str,
    title: str = "",
    source: str = "",
    client: Optional[httpx.AsyncClient] = None,
    timeout: float = 4.0
) -> str:
    """
    Async canonical permalink resolver. Follows redirects and decodes modern Google News
    AU_yqL tokens via batchexecute Fbv4je RPC so articles always resolve to actual deep publisher URLs.
    """
    if not raw_url or not isinstance(raw_url, str):
        if title:
            return _map_publisher_deep_fallback(title, source)
        return ""

    clean_url = raw_url.strip()

    # Fast check: already a direct publisher URL with deep path
    try:
        p = urlparse(clean_url)
        if p.netloc and "google.com" not in p.netloc and p.path not in ("", "/"):
            # Check for dummy test IDs without slug
            DUMMY_IDS = ("543210", "532190", "571234", "562341", "123456", "999999")
            if any(f"/{did}" in clean_url for did in DUMMY_IDS) and not re.search(r'/\d{6}/[a-z0-9-]+', clean_url):
                if title:
                    return _map_publisher_deep_fallback(title, source)
            return clean_url
    except Exception:
        pass

    # First check CBMi synchronous decode
    resolved = resolve_canonical_article_url(clean_url, title, source)
    p_res = urlparse(resolved)
    if p_res.netloc and "google.com" not in p_res.netloc and p_res.path not in ("", "/"):
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

    if title:
        return _map_publisher_deep_fallback(title, source)
    return clean_url


LOGISTICS_DISASTER_KEYWORDS = (
    "banjir", "longsor", "amblas", "terputus", "jembatan", "jalan", "jalinsum", "jalintim", "jalinbar",
    "tol", "pelabuhan", "dermaga", "belawan", "merak", "bakauheni", "teluk bayur", "panjang", "boom baru",
    "kapal", "cuaca", "hujan", "badai", "gelombang", "angin", "gempa", "erupsi", "gunung",
    "beras", "cabai", "minyak goreng", "gula", "pangan", "bawang", "sembako", "bulog", "pihps",
    "distribusi", "truk", "kargo", "logistik", "rantai pasok", "kontainer", "kemacetan", "antrean",
    "bbm", "solar", "pertamina", "pupuk", "disrupsi", "bencana"
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
            remember_processed_article(row)
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


async def fetch_rss_feed_items(feed_config: Dict[str, Any], timeout: float = 6.0) -> List[Dict[str, Any]]:
    """Fetches and parses a single XML RSS feed with logistics/disaster keyword gate."""
    url = feed_config["url"]
    source_name = feed_config["source"]
    source_tier = feed_config.get("tier", "TIER_2_AUTHORITATIVE_PRESS")
    
    items = []
    try:
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
            resp = await client.get(url, headers={"User-Agent": "Mozilla/5.0 (PreHub Logistics Bot 2.0)"})
            if resp.status_code == 200:
                root = ET.fromstring(resp.text)
                for item in root.findall(".//item")[:15]:
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
                    items.append({
                        "title": title,
                        "link": canonical_link,
                        "url": canonical_link,
                        "pubDate": pub_date,
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
                    items.append({
                        "title": title,
                        "link": canonical_link,
                        "url": canonical_link,
                        "pubDate": pub_date,
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
                   "is_geocoded", "location_precision"):
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
            "published_at": datetime.now(timezone.utc).isoformat()
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
                   "is_geocoded", "location_precision"):
            if row.get(_k) is None and gtm.get(_k) is not None:
                row[_k] = gtm[_k]
    except Exception:
        pass
    return row


async def fetch_news_from_supabase(limit: int = 50, province: Optional[str] = None, severity: Optional[str] = None) -> List[Dict[str, Any]]:
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
        # Legacy rows missing zone_tier: re-run fast heuristic on read.
        if not row.get("zone_tier") and _re_tier is not None:
            try:
                legacy_art = {
                    "title": row.get("title", ""),
                    "raw_description": row.get("raw_description") or row.get("summary") or "",
                    "source": row.get("source", "Media"),
                    "source_tier": row.get("source_tier", "TIER_2_AUTHORITATIVE_PRESS"),
                    "province": row.get("province", "Sumatera"),
                    "link": row.get("link", ""),
                }
                re_tiered = _re_tier(legacy_art)
                for _k in ("zone_tier", "tier_reason", "custom_hazard_label", "impact_profile",
                           "is_geocoded", "location_precision", "latitude", "longitude",
                           "incident_type", "severity", "corridor_nodes", "corridor_segment"):
                    if re_tiered.get(_k) is not None:
                        # Only overwrite coordinates/geo when legacy row has none
                        # or was a blind fallback centroid without a real location.
                        if _k in ("latitude", "longitude", "corridor_segment", "corridor_nodes",
                                  "province", "region"):
                            if row.get("latitude") is None or row.get("longitude") is None or row.get("zone_tier") is None:
                                row[_k] = re_tiered.get(_k)
                        else:
                            row[_k] = re_tiered.get(_k)
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
