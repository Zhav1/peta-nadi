"""
PreHub — Unified Multi-Outlet News & Early Warning Intelligence Router
Ingests from LKBN Antara (Sumut & Ekonomi), BMKG/BNPB, and targeted regional media,
extracts structured NLP crisis intelligence, and publishes to Redis stream lrip:stream:osint.
"""
import logging
import asyncio
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Query

from app.services.redis_client import get_redis
from app.services.news_aggregator import (
    fetch_all_multi_outlet_news,
    FALLBACK_STANDARDIZED_ARTICLES
)
from app.nlp.news_extractor import extract_structured_news

logger = logging.getLogger(__name__)

router = APIRouter(prefix="", tags=["News Intelligence"])

# In-memory cache and trigger deduplication
_NEWS_CACHE: Dict[str, Any] = {
    "articles": [],
    "last_fetched_at": 0.0
}
CACHE_TTL_SECONDS = 180  # 3 minutes
_TRIGGERED_NEWS_IDS: set = set()



async def ingest_news_to_redis(articles: List[Dict[str, Any]]):
    """Pushes structured news and early-warning events into Redis stream for Agent Swarm."""
    if not articles:
        return
    try:
        r = get_redis()
        for art in articles[:8]:
            payload = {
                "id": str(art.get("id", "NEWS-000")),
                "source": str(art.get("source", "news_rss")),
                "source_tier": str(art.get("source_tier", "TIER_1_OFFICIAL")),
                "event_type": "disruption_news",
                "incident_type": str(art.get("incident_type", "flood")),
                "title": str(art.get("title", "")),
                "summary": str(art.get("summary", "")),
                "severity": str(art.get("severity", "medium")),
                "temporal_phase": str(art.get("temporal_phase", "active_disruption")),
                "lead_time_hours": str(art.get("lead_time_hours", 0.0)),
                "region": str(art.get("region", "Sumatera Utara")),
                "corridor_segment": str(art.get("corridor_segment", "Jalur Logistik Utama")),
                "corridor_nodes": ",".join(art.get("corridor_nodes", ["Medan"])),
                "commodities_affected": ",".join(art.get("commodities_affected", ["Beras"])),
                "lane_status": str(art.get("ground_truth_metrics", {}).get("lane_status", "CLEAR")),
                "water_level_cm": str(art.get("ground_truth_metrics", {}).get("water_level_cm", 0)),
                "link": str(art.get("link", "")),
                "confidence_score": str(art.get("confidence_score", 0.90)),
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            r.xadd("lrip:stream:osint", payload)

            # Autonomous Early Warning Trigger: Auto-dispatch to Swarm for critical road/port disruptions
            lane_blocked = art.get("ground_truth_metrics", {}).get("lane_status") == "BLOCKED"
            is_critical = art.get("severity") == "critical"
            article_id = str(art.get("id", ""))
            
            if (lane_blocked or is_critical) and article_id not in _TRIGGERED_NEWS_IDS:
                _TRIGGERED_NEWS_IDS.add(article_id)
                try:
                    from app.workers.agent_worker import run_crisis_event
                    crisis_event = {
                        "type": art.get("incident_type", "flood"),
                        "event_type": art.get("incident_type", "flood"),
                        "source": art.get("source", "LKBN ANTARA"),
                        "severity": art.get("severity", "critical"),
                        "title": f"[Early Warning] {art.get('title')}",
                        "region": art.get("region", "Sumatera Utara"),
                        "lat": 3.568,
                        "lon": 98.956,
                        "corridor_segment": art.get("corridor_segment", "Jalinsum KM 78"),
                        "is_simulated": False
                    }
                    asyncio.create_task(run_crisis_event(crisis_event))
                    logger.info(f"Autonomously triggered Swarm crisis workflow for critical news: {art.get('title', '')[:60]}")
                except Exception as we:
                    logger.debug(f"Autonomous crisis trigger skipped: {we}")
        logger.info(f"Ingested {min(8, len(articles))} structured news items into Redis lrip:stream:osint")
    except Exception as re:
        logger.debug(f"Redis news ingestion skipped/offline: {re}")


@router.get("/api/v1/news/live")
async def get_live_news(force_refresh: bool = Query(False, description="Force refresh cache")):
    """
    Returns aggregated real-time news articles from official & authoritative outlets
    enriched with structured early warning and corridor impact metrics.
    """
    now = datetime.now(timezone.utc).timestamp()
    
    if not force_refresh and (now - _NEWS_CACHE["last_fetched_at"] < CACHE_TTL_SECONDS) and _NEWS_CACHE["articles"]:
        return {
            "status": "cached",
            "count": len(_NEWS_CACHE["articles"]),
            "last_updated": datetime.fromtimestamp(_NEWS_CACHE["last_fetched_at"], tz=timezone.utc).isoformat(),
            "articles": _NEWS_CACHE["articles"]
        }
        
    # 1. Ingest raw items from all outlets
    raw_articles = await fetch_all_multi_outlet_news()
    
    # 2. Extract structured intelligence
    structured_articles = []
    if raw_articles:
        # Process top 25 articles concurrently across all regional feeds
        extraction_tasks = [extract_structured_news(a) for a in raw_articles[:25]]
        structured_articles = await asyncio.gather(*extraction_tasks, return_exceptions=True)
        structured_articles = [a for a in structured_articles if isinstance(a, dict)]
        
    final_articles = structured_articles if structured_articles else FALLBACK_STANDARDIZED_ARTICLES
    
    # Sort: Tier 1 official & higher severity/confidence first
    final_articles.sort(
        key=lambda x: (
            1 if x.get("source_tier") == "TIER_1_OFFICIAL" else 0,
            x.get("confidence_score", 0.8)
        ),
        reverse=True
    )
    
    _NEWS_CACHE["articles"] = final_articles
    _NEWS_CACHE["last_fetched_at"] = now
    
    # Push to Redis stream in background
    asyncio.create_task(ingest_news_to_redis(final_articles))
    
    return {
        "status": "live" if structured_articles else "fallback_demo",
        "count": len(final_articles),
        "total": len(final_articles),
        "last_updated": datetime.now(timezone.utc).isoformat(),
        "articles": final_articles,
        "items": final_articles
    }


@router.get("/api/v1/news/market-regime")
async def get_market_regime():
    """Aggregates active market and early warning risk regime based on verified news feeds."""
    articles = _NEWS_CACHE["articles"] or FALLBACK_STANDARDIZED_ARTICLES
    
    critical_count = sum(1 for a in articles if a.get("severity") in ["critical", "high"])
    early_warning_count = sum(1 for a in articles if a.get("temporal_phase") == "forecast_early_warning")
    
    regime = "NORMAL"
    if critical_count >= 2:
        regime = "HIGH_DISRUPTION_RISK"
    elif critical_count >= 1 or early_warning_count >= 1:
        regime = "EARLY_WARNING_ACTIVE"
        
    return {
        "regime": regime,
        "market_regime": regime,
        "active_crisis_indicators": ["Banjir Sungai Padang Tebing Tinggi", "Gelombang Selat Malaka"] if critical_count > 0 else [],
        "commodity_volatility_score": 0.25 if critical_count > 0 else 0.05,
        "critical_news_count": critical_count,
        "early_warning_count": early_warning_count,
        "corridor": "North Sumatra Strategic Corridor (Belawan - Medan - Tebing Tinggi)",
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "primary_threat": "Potensi hambatan cuaca hidrometeorologi dan luapan sungai di koridor logistik utama."
    }
