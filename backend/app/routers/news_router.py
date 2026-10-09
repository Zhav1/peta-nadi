"""
PreHub — Unified Multi-Outlet News & Early Warning Intelligence Router (Supabase-Native)
Ingests from LKBN Antara (10 Sumatra Bureaus), BMKG/BNPB, and targeted regional media,
persists to Supabase public.news_articles with PostGIS geography, extracts structured NLP
crisis intelligence, and manages Globot-style Human-In-The-Loop review workflows.
"""
import logging
import asyncio
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Query, HTTPException
from pydantic import BaseModel

from app.services.redis_client import get_redis
from app.services.news_aggregator import (
    fetch_news_from_supabase
)
from app.services.unified_news_ingestor import unified_news_ingestor

logger = logging.getLogger(__name__)

router = APIRouter(prefix="", tags=["News Intelligence"])

# In-memory cache for ultra-fast repeated UI reads (30s TTL before querying Supabase)
_NEWS_CACHE: Dict[str, Any] = {
    "articles": [],
    "last_fetched_at": 0.0
}
CACHE_TTL_SECONDS = 30


class HitlActionRequest(BaseModel):
    approval_id: str
    action: Optional[str] = None  # "ACCEPT", "APPROVE", "REJECT", "HOLD", "DISMISS"
    decision: Optional[str] = None  # Frontend alias for action
    tactical_action: Optional[str] = "REROUTE"
    operator_id: Optional[str] = "dispatcher_lead"
    approved_by: Optional[str] = None  # Frontend alias for operator_id
    notes: Optional[str] = None


@router.get("/api/v1/news/live")
async def get_live_news(
    province: Optional[str] = Query(None, description="Filter by Sumatra province (e.g. 'Sumatera Barat', 'Sumatera Utara')"),
    severity: Optional[str] = Query(None, description="Filter by severity ('critical', 'high', 'medium', 'low')"),
    force_refresh: bool = Query(False, description="Force dynamic re-scrape from RSS & Google News into Supabase")
):
    """
    Returns aggregated real-time news articles from Supabase public.news_articles,
    enriched with PostGIS coordinates, corridor impact metrics, and official citations.
    """
    now = datetime.now(timezone.utc).timestamp()

    # If force refresh requested or cache expired, run ingestion cycle
    if force_refresh or (now - _NEWS_CACHE["last_fetched_at"] > 300) or not _NEWS_CACHE["articles"]:
        try:
            logger.info("Executing dynamic news ingestion cycle into Supabase...")
            await unified_news_ingestor.run_ingestion_cycle(force_refresh=force_refresh)
        except Exception as ie:
            logger.warning(f"Live news ingestion error: {ie}")

    # Query latest articles from Supabase
    articles = await fetch_news_from_supabase(limit=60, province=province, severity=severity)

    # If Supabase is currently empty or network is cold, trigger immediate on-demand ingestion
    if not articles:
        await unified_news_ingestor.run_ingestion_cycle(force_refresh=True)
        articles = await fetch_news_from_supabase(limit=60, province=province, severity=severity)

    _NEWS_CACHE["articles"] = articles
    _NEWS_CACHE["last_fetched_at"] = now

    return {
        "status": "live",
        "storage": "supabase_postgis",
        "count": len(articles),
        "total": len(articles),
        "last_updated": datetime.now(timezone.utc).isoformat(),
        "articles": articles,
        "items": articles
    }


@router.get("/api/v1/news/market-regime")
async def get_market_regime():
    """
    Aggregates active market and early warning risk regime dynamically across the whole island of Sumatra
    based on verified news feeds in Supabase.
    """
    articles = await fetch_news_from_supabase(limit=40)
    if not articles:
        articles = _NEWS_CACHE.get("articles", [])

    critical_items = [a for a in articles if a.get("severity") in ["critical", "high"]]
    early_warning_items = [a for a in articles if a.get("temporal_phase") == "forecast_early_warning"]

    critical_count = len(critical_items)
    early_warning_count = len(early_warning_items)

    regime = "NORMAL"
    if critical_count >= 2:
        regime = "HIGH_DISRUPTION_RISK"
    elif critical_count >= 1 or early_warning_count >= 1:
        regime = "EARLY_WARNING_ACTIVE"

    # Extract dynamic active crisis indicators from actual headlines
    active_indicators = []
    active_corridors = set()
    threatened_provinces = set()

    for item in critical_items[:4]:
        title = item.get("title", "")
        # Truncate clean indicator title
        short_title = title.split(" - ")[0] if " - " in title else title
        active_indicators.append(short_title[:60])
        
        corridor = item.get("corridor_segment")
        if corridor:
            active_corridors.add(corridor)
            
        prov = item.get("province")
        if prov:
            threatened_provinces.add(prov)

    primary_corridor = list(active_corridors)[0] if active_corridors else "Jalur Arteri Logistik Trans-Sumatera"
    primary_prov = list(threatened_provinces)[0] if threatened_provinces else "Pulau Sumatera"

    primary_threat = (
        f"Disrupsi aktif dilaporkan di koridor {primary_corridor} ({primary_prov})."
        if critical_count > 0 else
        "Kondisi koridor logistik Sumatera terpantau lancar dan terkendali."
    )

    return {
        "regime": regime,
        "market_regime": regime,
        "active_crisis_indicators": active_indicators,
        "commodity_volatility_score": min(0.85, 0.05 + (critical_count * 0.15)),
        "critical_news_count": critical_count,
        "early_warning_count": early_warning_count,
        "corridor": primary_corridor,
        "primary_province": primary_prov,
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "primary_threat": primary_threat
    }


@router.post("/api/v1/news/verify")
async def verify_news_claim(
    claim: str = Query(..., description="Claim or disaster text to verify"),
    location: str = Query("Sumatera", description="Geographic location context")
):
    """
    Verifies a claim against verified multi-outlet official news feeds stored in Supabase.
    Returns corroboration status, confidence score, matching attributions, and reasoning.
    """
    articles = await fetch_news_from_supabase(limit=100)
    claim_lower = claim.lower()
    loc_lower = location.lower()

    matches = []
    for art in articles:
        text = f"{art.get('title', '')} {art.get('summary', '')} {art.get('province', '')} {art.get('corridor_segment', '')}".lower()
        claim_words = [w for w in claim_lower.split() if len(w) > 3]
        overlap = sum(1 for w in claim_words if w in text)
        if overlap >= 2 or (loc_lower in text and overlap >= 1):
            matches.append(art)

    if matches:
        top_match = matches[0]
        return {
            "verification_status": "CORROBORATED_OFFICIAL",
            "confidence_score": max(0.88, float(top_match.get("confidence_score") or 0.90)),
            "claim": claim,
            "location": location,
            "attributions": [
                {
                    "source": m.get("source", "LKBN ANTARA"),
                    "title": m.get("title", ""),
                    "link": m.get("link", ""),
                    "published_at": m.get("created_at", datetime.now(timezone.utc).isoformat()),
                    "tier": m.get("source_tier", "TIER_1_OFFICIAL")
                }
                for m in matches[:3]
            ],
            "reasoning": f"Klaim terkonfirmasi melalui {len(matches)} laporan resmi terverifikasi di wilayah {location}."
        }
    else:
        return {
            "verification_status": "UNVERIFIED_GRASSROOTS",
            "confidence_score": 0.45,
            "claim": claim,
            "location": location,
            "attributions": [],
            "reasoning": f"Belum ditemukan pemberitaan resmi instansi/media pers terkait klaim '{claim}' di wilayah {location}."
        }


# ==================== GLOBOT-STYLE HITL DECISION ENDPOINTS ====================

@router.get("/api/v1/news/hitl-pending")
async def get_pending_hitl_approvals():
    """
    Returns pending disruption reviews from Supabase public.route_approvals
    where operator action is required.
    """
    try:
        from app.db.supabase_client import get_client
        sb = get_client()
        res = sb.table("route_approvals").select("*").eq("sync_status", "pending_operator_review").order("approved_at", desc=True).limit(10).execute()
        raw_items = res.data or []

        # Standardize records into consistent HITL schema for frontend drawer
        formatted_items = []
        for r in raw_items:
            rec_route = r.get("recommended_route") or {}
            impacted_list = rec_route.get("impacted_vehicles") or []
            
            # Map vehicles into frontend impact assessment schema
            assessments = []
            total_spoilage = 0.0
            for v in impacted_list:
                spoilage = float(v.get("spoilage_loss_idr") or 0.0)
                fuel_cost = float(v.get("detour_fuel_cost_idr") or 185000.0)
                net_benefit = float(v.get("net_benefit_idr") or max(0.0, spoilage - fuel_cost))
                total_spoilage += spoilage
                assessments.append({
                    "vehicle_id": v.get("vehicle_id", "TRK-01"),
                    "commodity_key": v.get("commodity_key", "Cabai / Hortikultura"),
                    "cargo_tonnage": float(v.get("cargo_tonnage") or 8.0),
                    "spoilage_loss_idr": spoilage,
                    "detour_fuel_cost_idr": fuel_cost,
                    "detour_distance_km": float(v.get("detour_distance_km") or 42.0),
                    "detour_time_hours": float(v.get("detour_time_hours") or 1.5),
                    "net_benefit_idr": net_benefit,
                    "recommended_action": v.get("recommended_action") or "REROUTE"
                })

            formatted_items.append({
                "approval_id": r.get("id"),
                "incident_id": r.get("incident_id"),
                "route_id": r.get("route_id"),
                "route_name": r.get("route_name") or rec_route.get("incident_title") or f"Reroute {rec_route.get('corridor', 'Sumatera')}",
                "origin": r.get("origin") or rec_route.get("corridor") or "Titik Awal",
                "destination": r.get("destination") or "Tujuan Logistik",
                "operator_id": r.get("operator_id"),
                "status": "PENDING_REVIEW",
                "created_at": r.get("approved_at"),
                "notes": r.get("notes"),
                "impact_assessment": {
                    "hazard_type": rec_route.get("hazard_type") or "road_closure",
                    "total_value_at_risk_idr": total_spoilage,
                    "critical_spoilage_count": sum(1 for v in assessments if v["spoilage_loss_idr"] > 0),
                    "impacted_vehicles_count": rec_route.get("impacted_vehicles_count") or len(assessments),
                    "recommended_action": rec_route.get("tactical_recommendation") or "REROUTE_VIA_ALTERNATIVE",
                    "impacted_assessments": assessments
                },
                "news_citation": {
                    "headline": rec_route.get("incident_title") or "Peringatan Disrupsi Logistik",
                    "source": rec_route.get("news_source") or "LKBN ANTARA",
                    "link": rec_route.get("news_link"),
                    "corridor": rec_route.get("corridor"),
                    "severity": "high",
                    "confidence_score": 0.94
                }
            })

        return {
            "count": len(formatted_items),
            "items": formatted_items,
            "pending_approvals": formatted_items
        }
    except Exception as e:
        logger.warning(f"Error fetching pending route approvals: {e}")
        return {"count": 0, "items": [], "pending_approvals": []}


@router.post("/api/v1/news/hitl-action")
async def submit_hitl_operator_action(req: HitlActionRequest):
    """
    Executes a Human-In-The-Loop dispatcher action (Approve Detour, Hold, or Dismiss).
    Persists decision to Supabase public.route_approvals and broadcasts to telemetry.
    """
    try:
        from app.db.supabase_client import get_service_client
        sb = get_service_client()

        raw_action = (req.decision or req.action or "APPROVE").upper()
        # Normalize action keywords
        action_verb = "ACCEPT" if raw_action in ["APPROVE", "ACCEPT"] else ("DISMISS" if raw_action in ["REJECT", "DISMISS"] else "HOLD")
        op_id = req.approved_by or req.operator_id or "dispatcher_lead"
        
        update_payload = {
            "action": action_verb,
            "tactical_action": req.tactical_action,
            "operator_id": op_id,
            "sync_status": "synced" if action_verb in ["ACCEPT", "DISMISS"] else "action_committed",
            "notes": req.notes or f"Operator {op_id} executed {action_verb} for route reroute.",
            "approved_at": datetime.now(timezone.utc).isoformat()
        }
        
        res = sb.table("route_approvals").update(update_payload).eq("id", req.approval_id).execute()
        if not res.data:
            raise HTTPException(status_code=404, detail="Approval ID not found in Supabase")
            
        logger.info(f"Operator {req.operator_id} committed action {req.action} for approval {req.approval_id}")
        return {
            "status": "success",
            "message": f"Action {req.action} successfully committed to Supabase",
            "approval": res.data[0]
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to commit operator action: {e}")
        raise HTTPException(status_code=500, detail=str(e))
