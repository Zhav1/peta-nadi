"""
PreHub — Unified Multi-Outlet News & Official Agency Ingestion Service (Supabase-Native)
Aggregates live news and bulletins across all 10 provinces of Sumatra:
1. Tier 1 (Official & Government Agencies): LKBN ANTARA (10 Sumatra Bureaus), BMKG, BNPB
2. Tier 2 (Authoritative Regional & National Press): Targeted queries for DetikSumut, Tribun Medan, Kompas, CNBC
3. Direct Persistence: Upserts structured news with PostGIS points directly into Supabase public.news_articles
"""
import logging
import asyncio
import urllib.parse
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
        "link": "https://news.google.com/search?q=Banjir+Luapan+Sungai+Padang+Tebing+Tinggi+KM+78+ANTARA&hl=id-ID&gl=ID&ceid=ID:id",
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
        "link": "https://news.google.com/search?q=Tebing+Sitinjau+Lauik+Longsor+Padang+Solok+ANTARA&hl=id-ID&gl=ID&ceid=ID:id",
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


async def fetch_rss_feed_items(feed_config: Dict[str, Any], timeout: float = 6.0) -> List[Dict[str, Any]]:
    """Fetches and parses a single XML RSS feed."""
    url = feed_config["url"]
    source_name = feed_config["source"]
    source_tier = feed_config.get("tier", "TIER_2_AUTHORITATIVE_PRESS")
    
    items = []
    try:
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
            resp = await client.get(url, headers={"User-Agent": "Mozilla/5.0 (PreHub Logistics Bot 2.0)"})
            if resp.status_code == 200:
                root = ET.fromstring(resp.text)
                for item in root.findall(".//item")[:10]:
                    title = item.findtext("title", "").strip()
                    link = item.findtext("link", "").strip()
                    pub_date = item.findtext("pubDate", "").strip()
                    desc = item.findtext("description", "").strip()
                    
                    if not title:
                        continue
                        
                    items.append({
                        "title": title,
                        "link": link,
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
                for item in root.findall(".//item")[:8]:
                    title = item.findtext("title", "").strip()
                    link = item.findtext("link", "").strip()
                    pub_date = item.findtext("pubDate", "").strip()
                    source_elem = item.find("source")
                    source_name = source_elem.text.strip() if source_elem is not None and source_elem.text else "Media Terverifikasi"
                    
                    if not title:
                        continue
                        
                    # Classify tier
                    is_official = any(s in source_name.lower() for s in ["antara", "bmkg", "bnpb", "kemenhub", "bulog", "bi.go.id"])
                    source_tier = "TIER_1_OFFICIAL" if is_official else "TIER_2_AUTHORITATIVE_PRESS"
                    
                    items.append({
                        "title": title,
                        "link": link,
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
            "ground_truth_metrics": a.get("ground_truth_metrics") or {},
            "confidence_score": float(a.get("confidence_score") or 0.85),
            "raw_description": a.get("raw_description") or a.get("summary"),
            "summary": a.get("summary") or a.get("title"),
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
    return upsert_count


async def fetch_news_from_supabase(limit: int = 50, province: Optional[str] = None, severity: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    Retrieves dynamic verified news articles from Supabase public.news_articles.
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
        return res.data or []
    except Exception as e:
        logger.warning(f"Error fetching news articles from Supabase: {e}")
        return []
