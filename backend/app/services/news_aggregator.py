"""
PreHub — Unified Multi-Outlet News & Official Agency Ingestion Service
Aggregates live news and bulletins from:
1. Tier 1 (Official & Government Agencies): LKBN ANTARA Sumut, LKBN ANTARA Ekonomi, BMKG, BNPB
2. Tier 2 (Authoritative Regional & National Press): Targeted queries for DetikSumut, Tribun Medan, Kompas, CNBC
3. Public News APIs (Optional NewsAPI.org / GNews.io when configured)
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

# Direct Official RSS Feeds (Tier 1 Authority)
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

FALLBACK_STANDARDIZED_ARTICLES = [
    {
        "id": "NEWS-001",
        "title": "Banjir Luapan Sungai Padang Rendam Jalur Logistik Tebing Tinggi KM 78",
        "link": "https://sumut.antaranews.com",
        "source": "LKBN ANTARA Sumut",
        "source_tier": "TIER_1_OFFICIAL",
        "pubDate": "15m lalu",
        "summary": "Debit air meningkat 120cm menutup badan jalan arteri Jalinsum KM 78. Akses truk sembako dialihkan via Tol Medan-Kualanamu-Tebing Tinggi.",
        "region": "Sumatera Utara",
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
        "id": "NEWS-002",
        "title": "Peringatan Dini BMKG: Gelombang 2.5m dan Angin Kencang Selat Malaka",
        "link": "https://antaranews.com",
        "source": "BMKG Maritim Belawan",
        "source_tier": "TIER_1_OFFICIAL",
        "pubDate": "45m lalu",
        "summary": "Tinggi gelombang diprediksi mencapai 2.5–3.0 meter dalam 24 jam ke depan. Armada kargo Tol Laut diimbau menunda keberangkatan.",
        "region": "Selat Malaka",
        "category": "METEOROLOGY",
        "corridor_nodes": ["Belawan", "Dumai"],
        "corridor_segment": "Jalur Laut Selat Malaka",
        "incident_type": "marine_wave",
        "severity": "high",
        "temporal_phase": "forecast_early_warning",
        "lead_time_hours": 6.0,
        "commodities_affected": ["Beras Impor", "Gula Pasir"],
        "ground_truth_metrics": {"wave_height_m": 2.8, "port_clearance": "RESTRICTED"},
        "confidence_score": 0.94
    },
    {
        "id": "NEWS-003",
        "title": "Tebing Sitinjau Lauik Longsor, Jalur Distribusi Padang-Solok Terputus",
        "link": "https://antaranews.com",
        "source": "LKBN ANTARA",
        "source_tier": "TIER_1_OFFICIAL",
        "pubDate": "1j lalu",
        "summary": "Material longsor menutupi badan jalan nasional. Truk pasokan hortikultura dan cabai dialihkan via jalur alternatif Malalak.",
        "region": "Sumatera Barat",
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
    },
    {
        "id": "NEWS-004",
        "title": "BULOG Sumut Terima 4.400 Ton Beras Perkuat Cadangan Pangan",
        "link": "https://sumut.antaranews.com",
        "source": "LKBN ANTARA Sumut",
        "source_tier": "TIER_1_OFFICIAL",
        "pubDate": "2j lalu",
        "summary": "Perum BULOG Kanwil Sumut mengoptimalkan stok cadangan pangan di buffer gudang Medan dan Pematang Siantar untuk antisipasi gangguan cuaca.",
        "region": "Sumatera Utara",
        "category": "SUPPLY_BUFFER",
        "corridor_nodes": ["Medan", "Belawan", "Pematang Siantar"],
        "corridor_segment": "Gudang Buffer Bulog",
        "incident_type": "supply_buffer",
        "severity": "low",
        "temporal_phase": "forecast_early_warning",
        "lead_time_hours": 12.0,
        "commodities_affected": ["Beras BULOG"],
        "ground_truth_metrics": {"buffer_tonnage": 4400, "status": "AVAILABLE"},
        "confidence_score": 0.95
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
                for item in root.findall(".//item")[:8]:
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
                for item in root.findall(".//item")[:6]:
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
    Aggregates all incoming raw news items from direct official RSS feeds
    and targeted regional press queries concurrently.
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
            
    return unique_articles
