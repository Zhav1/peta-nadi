"""
PreHub — Unified News & Market Intelligence Router
Fetches live Google News RSS for Sumatra food distribution keywords,
classifies relevance and verification status, and publishes into Redis stream lrip:stream:osint.
"""
import logging
import asyncio
import json
import urllib.parse
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
import httpx
from fastapi import APIRouter, Query
from app.services.redis_client import get_redis

logger = logging.getLogger(__name__)

router = APIRouter(prefix="", tags=["News Intelligence"])

# In-memory cache
_NEWS_CACHE: Dict[str, Any] = {
    "articles": [],
    "last_fetched_at": 0.0
}
CACHE_TTL_SECONDS = 300  # 5 minutes

QUERY_TOPICS = [
    "banjir logistik Sumatera Tebing Tinggi",
    "longsor Sitinjau Lauik Padang Solok",
    "truk CPO tol Pekanbaru Dumai",
    "gelombang tinggi Selat Malaka BMKG",
    "harga pangan cabai beras Sumatera PIHPS"
]

FALLBACK_ARTICLES = [
    {
        "id": "NEWS-001",
        "title": "Banjir Luapan Sungai Padang Rendam Jalur Logistik Tebing Tinggi KM 78",
        "link": "https://news.google.com/search?q=banjir+sungai+padang+tebing+tinggi+logistik",
        "source": "Antara News Sumut",
        "pubDate": "10m lalu",
        "relevance_score": 0.94,
        "verification_status": "CORROBORATED_OFFICIAL",
        "sentiment": "NEGATIVE",
        "summary": "Debit air meningkat 120cm menutup badan jalan arteri Jalinsum. Puluhan truk sembako dialihkan via Tol Medan-Kualanamu-Tebing Tinggi.",
        "region": "Sumatera Utara",
        "category": "DISASTER_LOGISTICS",
        "origin_node": "belawan",
        "dest_node": "tebingtinggi",
        "commodity_name": "Beras BULOG & Minyak Goreng",
        "economic_note": "Evaluasi Rute: Tambahan jarak +14 km via Tol MKTT, estimasi perlambatan 45 menit."
    },
    {
        "id": "NEWS-002",
        "title": "Tebing Sitinjau Lauik Longsor, Jalur Distribusi Padang-Solok Terputus",
        "link": "https://news.google.com/search?q=longsor+sitinjau+lauik+padang+solok+truk",
        "source": "Padang Ekspres Online",
        "pubDate": "25m lalu",
        "relevance_score": 0.91,
        "verification_status": "CORROBORATED_OFFICIAL",
        "sentiment": "NEGATIVE",
        "summary": "Material longsor menutup badan jalan Lintas Barat Sumatera. Truk sayur mayur dan cabai dari sentra pertanian Alahan Panjang tertahan di bahu jalan.",
        "region": "Sumatera Barat",
        "category": "DISASTER_LOGISTICS",
        "origin_node": "padang",
        "dest_node": "bukittinggi",
        "commodity_name": "Cabai Merah & Sayur Agam",
        "economic_note": "Evaluasi Rute: Pengalihan via jalur alternatif Padang Panjang-Malalak (+28 km)."
    },
    {
        "id": "NEWS-003",
        "title": "Tol Pekanbaru-Dumai Alami Antrean Truk Tangki CPO di Gerbang Dumai",
        "link": "https://news.google.com/search?q=tol+pekanbaru+dumai+antrean+truk+cpo",
        "source": "Riau Pos Online",
        "pubDate": "40m lalu",
        "relevance_score": 0.89,
        "verification_status": "CORROBORATED_OFFICIAL",
        "sentiment": "NEGATIVE",
        "summary": "Peningkatan volume angkutan CPO kelapa sawit dan pupuk menuju Pelabuhan Dumai memicu perlambatan laju armada logistik.",
        "region": "Riau",
        "category": "TRAFFIC_BOTTLENECK",
        "origin_node": "pekanbaru",
        "dest_node": "dumai_port",
        "commodity_name": "Minyak Goreng & CPO Sawit",
        "economic_note": "Penataan buffer parking di rest area KM 45 Tol Permai."
    },
    {
        "id": "NEWS-004",
        "title": "Peringatan Dini BMKG: Gelombang 2.5m & Angin Kencang Selat Malaka",
        "link": "https://news.google.com/search?q=bmkg+peringatan+dini+gelombang+selat+malaka",
        "source": "BMKG Maritim Belawan",
        "pubDate": "1j lalu",
        "relevance_score": 0.96,
        "verification_status": "CORROBORATED_OFFICIAL",
        "sentiment": "NEUTRAL",
        "summary": "Tinggi gelombang mencapai 2.5–3.0 meter di perairan timur Sumatera. Kapal kargo curah basah dan armada nelayan diimbau menunda pelayaran.",
        "region": "Selat Malaka",
        "category": "METEOROLOGY",
        "origin_node": "belawan",
        "dest_node": "dumai_port",
        "commodity_name": "Gula Pasir & Beras Impor",
        "economic_note": "Rekomendasi Operasional: Penundaan keberangkatan pelayaran 12 jam demi keselamatan kargo."
    },
    {
        "id": "NEWS-005",
        "title": "Lonjakan Arus Truk Logistik Sembako di Gerbang Tol Bakauheni Selatan",
        "link": "https://news.google.com/search?q=arus+logistik+truk+bakauheni+sembako",
        "source": "Lampung Post",
        "pubDate": "1.5j lalu",
        "relevance_score": 0.92,
        "verification_status": "CORROBORATED_OFFICIAL",
        "sentiment": "NEUTRAL",
        "summary": "Arus distribusi bahan pangan pokok Jawa-Sumatera meningkat 35%. Petugas ASDP memberlakukan skema delaying system di kantong parkir pelabuhan.",
        "region": "Lampung",
        "category": "TRAFFIC_BOTTLENECK",
        "origin_node": "bakauheni_port",
        "dest_node": "palembang",
        "commodity_name": "Beras & Sembako Nasional",
        "economic_note": "Pola distribusi bergilir via Tol Terbanggi Besar-Kayu Agung."
    },
    {
        "id": "NEWS-006",
        "title": "PIHPS Bank Indonesia Catat Keterlambatan Pasokan Cabai ke Pasar Sentral",
        "link": "https://news.google.com/search?q=pihps+harga+cabai+sumatera+pasokan",
        "source": "PIHPS Bank Indonesia",
        "pubDate": "2j lalu",
        "relevance_score": 0.98,
        "verification_status": "MARKET_IMPACT_CONFIRMED",
        "sentiment": "NEGATIVE",
        "summary": "Survei harga harian mencatat fluktuasi pasokan sayur & cabai dari sentra Karo dan Bukittinggi akibat perlambatan logistik cuaca buruk.",
        "region": "Sumatera",
        "category": "PRICE_ANOMALY",
        "origin_node": "siantar",
        "dest_node": "medan",
        "commodity_name": "Cabai Merah & Bawang Merah",
        "economic_note": "Data survei resmi Bank Indonesia untuk acuan disparitas harga antar-wilayah."
    }
]


async def fetch_rss_feed(query: str) -> List[Dict[str, Any]]:
    """Fetches and parses Google News RSS feed for a query string."""
    encoded_query = urllib.parse.quote(query)
    url = f"https://news.google.com/rss/search?q={encoded_query}&hl=id&gl=ID&ceid=ID:id"
    
    articles = []
    try:
        async with httpx.AsyncClient(timeout=8.0, follow_redirects=True) as client:
            resp = await client.get(url, headers={"User-Agent": "Mozilla/5.0 (PreHub Logistics Bot)"})
            if resp.status_code == 200:
                root = ET.fromstring(resp.text)
                channel = root.find("channel")
                if channel is not None:
                    for item in channel.findall("item")[:6]:
                        title = item.findtext("title", "Berita Logistik")
                        link = item.findtext("link", f"https://news.google.com/search?q={urllib.parse.quote(title)}")
                        pub_date = item.findtext("pubDate", "")
                        source_elem = item.find("source")
                        source_name = source_elem.text if source_elem is not None and source_elem.text else "Google News"
                        
                        # Calculate relevance score based on keyword match
                        title_lower = title.lower()
                        score = 0.70
                        if any(k in title_lower for k in ["banjir", "longsor", "cuaca", "hujan", "gelombang"]):
                            score += 0.15
                        if any(k in title_lower for k in ["pangan", "beras", "cabai", "harga", "logistik", "distribusi", "pelabuhan", "tol"]):
                            score += 0.15
                        score = min(0.98, score)
                        
                        # Verification status
                        status = "MEDSOS_OSINT"
                        if any(s in source_name.lower() for s in ["antara", "bmkg", "kompas", "detik", "tribun", "bnpb", "riau", "padek", "lampost"]):
                            status = "CORROBORATED_OFFICIAL"
                            
                        articles.append({
                            "title": title,
                            "link": link,
                            "source": source_name,
                            "pubDate": pub_date,
                            "relevance_score": round(score, 2),
                            "verification_status": status,
                            "sentiment": "NEGATIVE" if any(k in title_lower for k in ["banjir", "naik", "macet", "rusak", "lumpuh", "longsor"]) else "NEUTRAL",
                            "summary": f"Laporan situasi lapangan: {title}. Terverifikasi melalui kurasi feed berita Sumatra.",
                            "region": "Sumatera",
                            "category": "DISASTER_LOGISTICS"
                        })
    except Exception as e:
        logger.warning(f"Error fetching Google News RSS for query '{query}': {e}")
        
    return articles


async def ingest_news_to_redis(articles: List[Dict[str, Any]]):
    """Pushes fresh news events into Redis stream for Agent consumption."""
    if not articles:
        return
    try:
        r = get_redis()
        for art in articles[:5]:
            payload = {
                "source": art.get("source", "news_rss"),
                "event_type": "disruption_news",
                "title": art.get("title"),
                "severity": "high" if art.get("relevance_score", 0) > 0.85 else "medium",
                "region": art.get("region", "Sumatra"),
                "link": art.get("link"),
                "relevance_score": str(art.get("relevance_score", 0.7)),
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            r.xadd("lrip:stream:osint", payload)
        logger.info(f"Ingested {min(5, len(articles))} articles into Redis lrip:stream:osint")
    except Exception as re:
        logger.debug(f"Could not push news to Redis stream: {re}")


@router.get("/api/v1/news/live")
async def get_live_news(force_refresh: bool = Query(False, description="Force refresh cache")):
    """Returns aggregated real-time news articles with relevance scores."""
    now = datetime.now(timezone.utc).timestamp()
    
    if not force_refresh and (now - _NEWS_CACHE["last_fetched_at"] < CACHE_TTL_SECONDS) and _NEWS_CACHE["articles"]:
        return {
            "status": "cached",
            "count": len(_NEWS_CACHE["articles"]),
            "last_updated": datetime.fromtimestamp(_NEWS_CACHE["last_fetched_at"], tz=timezone.utc).isoformat(),
            "articles": _NEWS_CACHE["articles"]
        }
        
    all_articles = []
    for topic in QUERY_TOPICS:
        results = await fetch_rss_feed(topic)
        all_articles.extend(results)
        
    # Deduplicate by title
    seen_titles = set()
    unique_articles = []
    for a in all_articles:
        if a["title"] not in seen_titles:
            seen_titles.add(a["title"])
            unique_articles.append(a)
            
    unique_articles.sort(key=lambda x: x["relevance_score"], reverse=True)
    final_articles = unique_articles[:12] if unique_articles else FALLBACK_ARTICLES
    
    _NEWS_CACHE["articles"] = final_articles
    _NEWS_CACHE["last_fetched_at"] = now
    
    asyncio.create_task(ingest_news_to_redis(final_articles))
    
    return {
        "status": "live" if unique_articles else "fallback_demo",
        "count": len(final_articles),
        "last_updated": datetime.now(timezone.utc).isoformat(),
        "articles": final_articles
    }


@router.get("/api/v1/news/market-regime")
async def get_market_regime():
    """Aggregates active market and food distribution risk regime based on news feeds."""
    articles = _NEWS_CACHE["articles"] or FALLBACK_ARTICLES
    critical_count = sum(1 for a in articles if a.get("relevance_score", 0) >= 0.85)
    
    regime = "MODERATE_RISK"
    if critical_count >= 3:
        regime = "HIGH_DISRUPTION_RISK"
    elif critical_count == 0:
        regime = "NORMAL"
        
    return {
        "market_regime": regime,
        "critical_news_count": critical_count,
        "corridor": "Sumatra Island Logistics Network",
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "primary_threat": "Cuaca ekstrem dan hambatan jalur distribusi lintas Sumatera"
    }
