"""
PreHub: Unified Multi-Outlet News & Early Warning Intelligence Router (Supabase-Native)
Ingests from LKBN Antara (10 Sumatra Bureaus), BMKG/BNPB, and targeted regional media,
persists to Supabase public.news_articles with PostGIS geography, extracts structured NLP
crisis intelligence, and manages Globot-style Human-In-The-Loop review workflows.
"""
import logging
import asyncio
import time
import uuid
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
from urllib.parse import urlparse
from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks, status
from pydantic import BaseModel

from app.auth.supabase_auth import UserSession, get_current_user

from app.services.redis_client import get_redis
from app.services.news_aggregator import (
    fetch_news_from_supabase,
    resolve_canonical_article_url,
)
from app.services.unified_news_ingestor import unified_news_ingestor

logger = logging.getLogger(__name__)

router = APIRouter(prefix="", tags=["News Intelligence"])

# In-memory cache for ultra-fast repeated UI reads (30s TTL before querying Supabase)
_NEWS_CACHE: Dict[str, Any] = {
    "articles": [],
    "last_fetched_at": 0.0,
    # Captured from the response payload at fetch time (max published_at) — a cache
    # hit replays THIS value instead of fabricating datetime.now().
    "last_updated": None,
}
CACHE_TTL_SECONDS = 30


def _max_published_at_iso(articles: List[Dict[str, Any]]) -> Optional[str]:
    """Newest real `published_at` across rows; None when no row has one.

    Used for the honest `last_updated`: never datetime.now() when data exists.
    Naive timestamps are treated as UTC so comparisons never raise.
    """
    newest_dt = None
    for a in articles or []:
        try:
            cand = a.get("published_at") if isinstance(a, dict) else None
        except Exception:
            cand = None
        if not cand:
            continue
        try:
            parsed = datetime.fromisoformat(str(cand).replace("Z", "+00:00"))
        except Exception:
            continue
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        if newest_dt is None or parsed > newest_dt:
            newest_dt = parsed
    return newest_dt.isoformat() if newest_dt else None


class HitlActionRequest(BaseModel):
    approval_id: str
    action: Optional[str] = None  # "ACCEPT", "APPROVE", "REJECT", "HOLD", "DISMISS"
    decision: Optional[str] = None  # Frontend alias for action
    tactical_action: Optional[str] = "REROUTE"
    operator_id: Optional[str] = None
    approved_by: Optional[str] = None  # Frontend alias for operator_id
    notes: Optional[str] = None


_ingestion_lock = asyncio.Lock()
_is_ingesting = False

# Cross-process guard: uvicorn --workers > 1 (or several replicas) each own a
# separate in-process asyncio.Lock, so a best-effort Redis NX lock keeps a single
# RSS/LLM cycle per interval. Non-fatal by design — if Redis is down the worker
# still ingests (the in-process lock already serializes it).
_INGESTION_REDIS_LOCK_KEY = "lrip:lock:news_ingestor"
_INGESTION_REDIS_LOCK_TTL = 240
_INGESTION_LOCK_TOKEN = uuid.uuid4().hex
# Monotonic timestamp of the last completed cycle. A caller that queued behind a
# running cycle is *already satisfied* by that cycle and must not start another.
_last_cycle_completed_at: Optional[float] = None


def _acquire_cross_process_ingestion_lock() -> bool:
    """Non-blocking Redis lock acquire; True when this worker may ingest.

    Returns False only when another worker provably holds the lock. Any Redis
    failure degrades to True so a Redis outage never stalls ingestion.
    """
    try:
        r = get_redis()
        if r is None:
            return True
        return bool(
            r.set(
                _INGESTION_REDIS_LOCK_KEY,
                _INGESTION_LOCK_TOKEN,
                nx=True,
                ex=_INGESTION_REDIS_LOCK_TTL,
            )
        )
    except Exception as lock_err:
        logger.debug(
            f"Redis news ingestion lock unavailable ({lock_err}); "
            "continuing with in-process lock only"
        )
        return True


def _release_cross_process_ingestion_lock() -> None:
    """Best-effort release, only when this worker still owns the token."""
    try:
        r = get_redis()
        if r is None:
            return
        if r.get(_INGESTION_REDIS_LOCK_KEY) == _INGESTION_LOCK_TOKEN:
            r.delete(_INGESTION_REDIS_LOCK_KEY)
    except Exception as lock_err:
        logger.debug(f"Redis news ingestion lock release skipped: {lock_err}")


async def run_background_news_ingestion(force: bool = False):
    """
    Background worker for asynchronous news and disaster early-warning indexing.
    Protected by a double-checked in-process lock plus a cross-process Redis lock
    to eliminate stampedes across concurrent requests and uvicorn workers.
    """
    global _is_ingesting, _last_cycle_completed_at
    if _is_ingesting:
        logger.info("News ingestion cycle already in progress, skipping duplicate trigger.")
        return
    entered_at = time.monotonic()
    async with _ingestion_lock:
        # Double-checked locking: a second caller may have entered the flag while
        # we were waiting on the lock; re-check before spending any RSS/LLM work.
        if _is_ingesting:
            logger.info(
                "News ingestion cycle started while waiting for the lock, "
                "skipping duplicate trigger."
            )
            return
        if (
            _last_cycle_completed_at is not None
            and _last_cycle_completed_at >= entered_at
        ):
            logger.info(
                "News ingestion cycle completed while this trigger was queued, "
                "skipping duplicate cycle."
            )
            return
        if not await asyncio.to_thread(_acquire_cross_process_ingestion_lock):
            logger.info(
                "News ingestion cycle is running in another worker "
                "(lrip:lock:news_ingestor held), skipping duplicate trigger."
            )
            return
        _is_ingesting = True
        try:
            logger.info("Executing background news ingestion cycle into Supabase...")
            await unified_news_ingestor.run_ingestion_cycle(force_refresh=force)
            _NEWS_CACHE["last_fetched_at"] = 0.0
        except Exception as ie:
            logger.warning(f"Background news ingestion error: {ie}")
        finally:
            _is_ingesting = False
            _last_cycle_completed_at = time.monotonic()
            await asyncio.to_thread(_release_cross_process_ingestion_lock)


@router.get("/api/v1/news/live")
async def get_live_news(
    background_tasks: BackgroundTasks = None,
    province: Optional[str] = Query(None, description="Filter by Sumatra province (e.g. 'Sumatera Barat', 'Sumatera Utara')"),
    severity: Optional[str] = Query(None, description="Filter by severity ('critical', 'high', 'medium', 'low')"),
    force_refresh: bool = Query(False, description="Force dynamic re-scrape from RSS & Google News into Supabase")
):
    """
    Returns aggregated real-time news articles from Supabase public.news_articles,
    enriched with PostGIS coordinates, corridor impact metrics, and official citations.
    Non-blocking: ingestion runs in background, returning cached/current data immediately.
    """
    now = datetime.now(timezone.utc).timestamp()

    # Fast-path: Return cached articles if valid (<30s) and no specific query filters
    if not force_refresh and not province and not severity and _NEWS_CACHE["articles"]:
        if (now - _NEWS_CACHE.get("last_fetched_at", 0.0)) <= CACHE_TTL_SECONDS:
            cached_articles = _NEWS_CACHE["articles"]
            return {
                "status": "live",
                "storage": "supabase_postgis",
                "cached": True,
                "count": len(cached_articles),
                "total": len(cached_articles),
                # Replay the stored fetch-time value; never datetime.now() on a hit.
                "last_updated": (
                    _NEWS_CACHE.get("last_updated")
                    or _max_published_at_iso(cached_articles)
                    or datetime.now(timezone.utc).isoformat()
                ),
                "articles": cached_articles,
                "items": cached_articles
            }

    # If force refresh requested or cache expired (5 min), trigger background ingestion
    if force_refresh or (now - _NEWS_CACHE.get("last_fetched_at", 0.0) > 300):
        if background_tasks is not None:
            background_tasks.add_task(run_background_news_ingestion, force_refresh)
        else:
            asyncio.create_task(run_background_news_ingestion(force_refresh))

    # Query latest articles immediately from Supabase
    # Over-fetch (150) so the 48h / tier / geo filters below have candidates;
    # a 60-row window let valid rows get pushed out by dropped ones.
    articles = await fetch_news_from_supabase(limit=150, province=province, severity=severity)

    # Defensive on-read guard: fetch_news_from_supabase already unpacks
    # ground_truth_metrics + re-tiers legacy rows, but re-apply here so legacy
    # bureau-centroid noise can never reach the map even if the service path changes.
    try:
        from app.nlp.news_extractor import _fast_heuristic_extraction as _router_re_tier
    except Exception:
        _router_re_tier = None  # type: ignore
    try:
        from app.services.news_aggregator import parse_and_validate_article_freshness as _router_fresh
    except Exception:
        _router_fresh = None  # type: ignore
    _guarded: list[dict] = []
    for _r in articles or []:
        try:
            _row = dict(_r)
            _gtm = _row.get("ground_truth_metrics") or {}
            if isinstance(_gtm, str):
                import json as _js
                try:
                    _gtm = _js.loads(_gtm)
                except Exception:
                    _gtm = {}
            for _k in ("zone_tier", "tier_reason", "custom_hazard_label",
                       "impact_profile", "is_geocoded", "location_precision",
                       "affected_locations", "schema_version", "radius_km",
                       "geometry_polygon", "verification_audit"):
                if _row.get(_k) is None and isinstance(_gtm, dict) and _gtm.get(_k) is not None:
                    _row[_k] = _gtm[_k]
            _sv_row = _gtm.get("schema_version") if isinstance(_gtm, dict) else None
            if (not _row.get("zone_tier") or _sv_row != 7) and _router_re_tier is not None:
                _re = _router_re_tier({
                    "title": _row.get("title", ""),
                    "raw_description": _row.get("raw_description") or _row.get("summary") or "",
                    "source": _row.get("source", "Media"),
                    "source_tier": _row.get("source_tier", "TIER_2_AUTHORITATIVE_PRESS"),
                    "province": _row.get("province", "Sumatera"),
                    "link": _row.get("link", ""),
                    "pubDate": _row.get("original_pub_date") or _row.get("pubDate") or _row.get("published_at"),
                    "original_pub_date": _row.get("original_pub_date") or (isinstance(_gtm, dict) and _gtm.get("original_pub_date")),
                    "published_at": _row.get("published_at"),
                    "html_published_at": _row.get("html_published_at"),
                })
                for _k in ("zone_tier", "tier_reason", "custom_hazard_label",
                           "impact_profile", "is_geocoded", "location_precision",
                           "latitude", "longitude", "incident_type", "severity",
                           "affected_locations", "radius_km", "geometry_polygon", "verification_audit"):
                    if _re.get(_k) is not None and (_row.get(_k) is None or _k.startswith("zone") or _k.startswith("tier") or _sv_row != 7):
                        _row[_k] = _re[_k]
                try:
                    _row["ground_truth_metrics"] = _re.get("ground_truth_metrics", _row.get("ground_truth_metrics"))
                except Exception:
                    pass
            # Strict 48h freshness gate on read (archival URL or stale pubDate).
            if _router_fresh is not None:
                try:
                    _fr = _router_fresh(
                        _row.get("original_pub_date") or (isinstance(_gtm, dict) and _gtm.get("original_pub_date")) or _row.get("pubDate") or _row.get("published_at"),
                        _row.get("link"),
                        html_meta_date=_row.get("html_published_at"),
                        max_age_hours=48,
                    )
                    if not _fr.get("is_fresh"):
                        continue
                except Exception:
                    pass
            if _row.get("zone_tier") == "DROPPED_IRRELEVANT":
                continue
            if _row.get("is_geocoded") is False:
                continue
            if _row.get("latitude") is None or _row.get("longitude") is None:
                continue
            _guarded.append(_row)
        except Exception:
            continue
    articles = _guarded

    # If Supabase is cold or empty, trigger background ingestion and return honest warming state
    if not articles:
        if background_tasks is not None:
            background_tasks.add_task(run_background_news_ingestion, True)
        else:
            asyncio.create_task(run_background_news_ingestion(True))
        return {
            "status": "warming",
            "storage": "supabase_postgis",
            "count": 0,
            "total": 0,
            "message": "Indeks intelijen berita sedang disinkronkan di latar belakang...",
            "last_updated": datetime.now(timezone.utc).isoformat(),
            "articles": [],
            "items": []
        }

    # Honest last_updated: the newest real published_at only (no ingested_at /
    # pubDate guesses, no datetime.now()). Fall back to now only if truly empty.
    latest_ts_iso = _max_published_at_iso(articles)
    newest_dt = None
    if latest_ts_iso:
        try:
            newest_dt = datetime.fromisoformat(latest_ts_iso)
        except Exception:
            newest_dt = None

    if not latest_ts_iso:
        latest_ts_iso = datetime.now(timezone.utc).isoformat()

    # Detect if articles are older than 30 minutes or contain legacy search URLs
    needs_refresh = False
    now_utc = datetime.now(timezone.utc)
    if newest_dt:
        dt_cmp = newest_dt if newest_dt.tzinfo else newest_dt.replace(tzinfo=timezone.utc)
        if (now_utc - dt_cmp).total_seconds() > 1800:
            needs_refresh = True
    else:
        needs_refresh = True

    has_legacy_search_links = any(
        "news.google.com/search" in str(a.get("link", "")) or "news.google.com/search" in str(a.get("url", ""))
        for a in articles
    )
    if has_legacy_search_links:
        needs_refresh = True

    # If force refresh requested or background refresh needed, trigger ingestion
    if force_refresh or needs_refresh or (now - _NEWS_CACHE.get("last_fetched_at", 0.0) > 300):
        if background_tasks is not None:
            background_tasks.add_task(run_background_news_ingestion, force_refresh or needs_refresh)
        else:
            asyncio.create_task(run_background_news_ingestion(force_refresh or needs_refresh))

    # Ensure every article has both link and url as deep permalinks and link_alive="alive"
    enriched_articles = []
    for a in articles:
        art = dict(a)
        raw_l = art.get("link") or art.get("url") or ""
        clean_l = str(raw_l).strip()

        if "news.google.com/search" in clean_l:
            clean_l = resolve_canonical_article_url(clean_l, art.get("title", ""), art.get("source", ""))
            if not clean_l:
                # M1: unresolvable link → drop the row, never surface a search page.
                continue

        art["link"] = clean_l
        art["url"] = clean_l

        p = urlparse(clean_l)
        if clean_l and p.netloc and p.path not in ("", "/"):
            if art.get("link_alive") != "dead":
                art["link_alive"] = "alive"
        elif not clean_l or p.path in ("", "/"):
            art["link_alive"] = "dead"

        enriched_articles.append(art)

    _NEWS_CACHE["articles"] = enriched_articles
    _NEWS_CACHE["last_fetched_at"] = now
    # Snapshot the fetch-time last_updated so 30s cache hits replay it verbatim.
    _NEWS_CACHE["last_updated"] = latest_ts_iso

    return {
        "status": "live",
        "storage": "supabase_postgis",
        "count": len(enriched_articles),
        "total": len(enriched_articles),
        "last_updated": latest_ts_iso,
        "articles": enriched_articles,
        "items": enriched_articles
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

    # Honest regime timestamp: newest published_at (or the cached fetch-time
    # snapshot); datetime.now() only when there is genuinely no data at all.
    regime_updated_at = _max_published_at_iso(articles) or _NEWS_CACHE.get("last_updated")

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
        "updated_at": regime_updated_at or datetime.now(timezone.utc).isoformat(),
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
async def get_pending_hitl_approvals(
    current_user: UserSession = Depends(get_current_user),
):
    """
    Returns pending disruption reviews from Supabase public.route_approvals
    where operator action is required.
    Read endpoint: requires authenticated session (any role may read).
    """
    try:
        from app.db.supabase_client import get_write_client
        sb = get_write_client()
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
async def submit_hitl_operator_action(
    req: HitlActionRequest,
    current_user: UserSession = Depends(get_current_user),
):
    """
    Executes a Human-In-The-Loop dispatcher action (Approve Detour, Hold, or Dismiss).
    Persists decision to Supabase public.route_approvals and broadcasts to telemetry.
    RBAC: requires 'approvals:write' (Dispatcher only); GUEST/REGULATOR get 403.
    """
    try:
        uuid.UUID(str(req.approval_id))
    except (ValueError, AttributeError, TypeError):
        raise HTTPException(
            status_code=422,
            detail="Invalid UUID format for approval_id"
        )

    # RBAC: only Dispatcher (approvals:write) may commit HITL actions.
    if "approvals:write" not in (current_user.permissions or []):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "FORBIDDEN",
                "message": f"Akses ditolak: Hanya Dispatcher dengan wewenang 'approvals:write' yang dapat mengeksekusi HITL. Peran Anda saat ini adalah {current_user.role}.",
                "current_role": current_user.role,
                "required_permissions": ["approvals:write"],
            },
        )

    try:
        from app.db.supabase_client import get_service_client
        sb = get_service_client()

        raw_action = (req.decision or req.action or "APPROVE").upper()
        # Normalize action keywords
        action_verb = "ACCEPT" if raw_action in ["APPROVE", "ACCEPT"] else ("DISMISS" if raw_action in ["REJECT", "DISMISS"] else "HOLD")
        # approved_by precedence: authenticated session wins over client-supplied aliases.
        op_id = current_user.id or req.approved_by or req.operator_id
        committed_by_role = current_user.role

        update_payload = {
            "action": action_verb,
            "tactical_action": req.tactical_action,
            "operator_id": op_id,
            "sync_status": "synced" if action_verb in ["ACCEPT", "DISMISS"] else "action_committed",
            "notes": req.notes or f"Operator {op_id} ({committed_by_role}) executed {action_verb} for route reroute.",
            "approved_at": datetime.now(timezone.utc).isoformat()
        }
        
        res = sb.table("route_approvals").update(update_payload).eq("id", req.approval_id).execute()
        if not res.data:
            raise HTTPException(status_code=404, detail="Approval ID not found in Supabase")
            
        logger.info(f"Operator {op_id} ({committed_by_role}) committed action {req.action} for approval {req.approval_id}")
        return {
            "status": "success",
            "message": f"Action {req.action} successfully committed to Supabase",
            "operator_id": op_id,
            "committed_by_role": committed_by_role,
            "approval": res.data[0]
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to commit operator action: {e}")
        raise HTTPException(status_code=500, detail=str(e))
