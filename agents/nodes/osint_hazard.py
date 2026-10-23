import json
import logging
import math
import asyncio
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional, Tuple
from agents.state import CrisisState, AgentFinding
from agents.tools.supabase_tools import get_hazard_polygons
from agents.memory.stm import get_async_redis
from agents.nodes.data_collection import (
    extract_payload_text,
    normalize_region,
    region_matches_text,
)
from app.nlp.ner_pipeline import extract_locations
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# A corroborating report may only lift confidence when it is spatially anchored
# to the incident: within 100 km of the state coordinates, or explicitly naming
# the incident's region/corridor while describing the same hazard type.
SPATIAL_GATE_RADIUS_KM = 100.0

# Hazard vocabulary used for the hazard-type alignment half of the NER gate.
_HAZARD_TYPE_KEYWORDS: Dict[str, Tuple[str, ...]] = {
    "flood": ("banjir", "genangan", "luapan", "terendam", "rendam", "air naik"),
    "landslide": ("longsor", "tanah longsor", "galodo", "tebing runtuh"),
    "earthquake": ("gempa", "gempa bumi", "lindu", "guncangan"),
    "wildfire": ("kebakaran", "karhutla", "hotspot", "titik panas", "asap"),
    "fire": ("kebakaran", "karhutla", "hotspot", "titik panas", "asap"),
    "congestion": ("macet", "kemacetan", "antre", "antrian", "padat merayap"),
    "port_closure": ("pelabuhan", "tutup", "ditutup", "blokade", "putus", "berhenti beroperasi"),
    "road_closure": ("jalan putus", "jalur putus", "ditutup", "blokade", "longsor", "banjir"),
    "drought": ("kekeringan", "kemarau", "sulit air"),
    "volcanic": ("erupsi", "gunung berapi", "abu vulkanik", "letusan"),
    "tsunami": ("tsunami",),
    "marine_accident": ("kapal", "kandas", "tabrakan kapal", "maritim"),
}

# Redis-outage fallback for the OSINT/news corroboration path. When the Redis
# stream is empty or unreachable, recent gatekeeper-approved articles are read
# straight from Supabase so the same spatial/corroboration loop still runs.
NEWS_FALLBACK_WINDOW_HOURS = 12
NEWS_FALLBACK_LIMIT = 30
NEWS_FALLBACK_TIERS = ("RED_CONFIRMED", "YELLOW_CLARIFY")


def _as_float(value: Any) -> Optional[float]:
    """Coerce a stream value (often a string) to float; None when invalid."""
    if value is None or isinstance(value, bool):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in kilometres."""
    r = 6371.0088
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = (
        math.sin(dphi / 2.0) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2.0) ** 2
    )
    return r * 2.0 * math.atan2(math.sqrt(a), math.sqrt(max(0.0, 1.0 - a)))


def _first_nonempty(*values: Any) -> str:
    for value in values:
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def _parse_raw_meta(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Unpack the social scraper's `raw` JSON into a dict (never raises)."""
    raw = payload.get("raw")
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str) and raw.strip():
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, dict):
                return parsed
        except (ValueError, TypeError):
            return {}
    return {}


def _is_social_payload(payload: Dict[str, Any]) -> bool:
    source = str(payload.get("source") or "").lower()
    event_type = str(payload.get("event_type") or "").lower()
    return (
        source in ("social", "citizen_report", "citizen")
        or event_type in ("osint_report", "citizen_report")
        or bool(payload.get("platform"))
    )


def _unpack_social_payload(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Normalize a citizen/social payload into summarizable evidence fields."""
    meta = _parse_raw_meta(payload)
    text = _first_nonempty(
        meta.get("raw_text"),
        meta.get("text"),
        meta.get("description"),
        payload.get("text"),
        payload.get("description"),
        payload.get("summary"),
        payload.get("title"),
    )
    published_at = _first_nonempty(
        payload.get("published_at"),
        payload.get("ts"),
        payload.get("created_at"),
        meta.get("created_at"),
        meta.get("published_at"),
        meta.get("timestamp"),
    )
    return {
        "text": text,
        "summary": text,
        "published_at": published_at,
        "source_tier": "TIER_3_CITIZEN_OSINT",
        "platform": _first_nonempty(meta.get("platform"), payload.get("platform")),
        "meta": meta,
    }


def _payload_coords(
    payload: Dict[str, Any], meta: Dict[str, Any]
) -> Tuple[Optional[float], Optional[float]]:
    lat = _as_float(payload.get("lat"))
    lon = _as_float(payload.get("lon"))
    if lat is None:
        lat = _as_float(payload.get("latitude"))
    if lon is None:
        lon = _as_float(payload.get("longitude"))
    if lat is None:
        lat = _as_float(meta.get("lat"))
    if lon is None:
        lon = _as_float(meta.get("lon"))
    return lat, lon


def _hazard_type_alignment(event_type: Any, text: str) -> bool:
    """True when the payload describes the same hazard class as the incident."""
    keyword_list = _HAZARD_TYPE_KEYWORDS.get(str(event_type or "").lower())
    if not keyword_list:
        return True  # Unknown/custom type: do not silently reject evidence.
    return any(keyword in text for keyword in keyword_list)


def _evaluate_spatial_relevance(
    state_lat: Optional[float],
    state_lon: Optional[float],
    region: Any,
    event_type: Any,
    payload: Dict[str, Any],
    meta: Dict[str, Any],
    text: str,
) -> Tuple[bool, Optional[float], str]:
    """Apply the anti-false-corroboration spatial gate.

    Returns ``(relevant, distance_km, reason)``. A hit is relevant only when it
    is within 100 km of the incident, or — when the payload carries no usable
    coordinates — its NER text names the incident region/corridor *and* matches
    the incident hazard type. Explicit coordinates are authoritative: a distant
    Lampung post therefore never corroborates a Belawan flood, even if it
    incidentally mentions "Sumut".
    """
    payload_lat, payload_lon = _payload_coords(payload, meta)
    distance_km: Optional[float] = None
    if (
        state_lat is not None
        and state_lon is not None
        and payload_lat is not None
        and payload_lon is not None
    ):
        distance_km = round(
            _haversine_km(state_lat, state_lon, payload_lat, payload_lon), 2
        )

    if distance_km is not None:
        if distance_km <= SPATIAL_GATE_RADIUS_KM:
            return True, distance_km, "within_radius"
        return False, distance_km, "outside_radius"

    hazard_ok = _hazard_type_alignment(event_type, text)
    region_ok = region_matches_text(region, text)
    if region_ok and hazard_ok:
        return True, None, "ner_region_hazard_match"
    return False, None, "no_spatial_evidence"


def _news_row_to_payload(row: Dict[str, Any]) -> Dict[str, Any]:
    """Map a public.news_articles row onto the OSINT stream payload shape."""
    gtm = row.get("ground_truth_metrics")
    if not isinstance(gtm, dict):
        gtm = {}
    tier = row.get("gatekeeper_tier") or gtm.get("zone_tier")
    commodities = row.get("commodities_affected")
    if isinstance(commodities, (list, tuple, set)):
        commodities = ",".join(str(c) for c in commodities if str(c).strip())
    return {
        "gatekeeper_tier": tier,
        "source": row.get("source") or "news_articles",
        # Provenance: every payload here is press/OSINT, never a physical sensor.
        # `is_incident_triggered` rows were already turned into a news incident,
        # so they can never be treated as independent corroboration.
        "source_type": "news_ingestor" if row.get("is_incident_triggered") else "news_article",
        "source_tier": row.get("source_tier") or "TIER_2_AUTHORITATIVE_PRESS",
        "event_type": row.get("incident_type"),
        "title": str(row.get("title") or ""),
        "summary": str(row.get("summary") or row.get("raw_description") or ""),
        "published_at": row.get("published_at") or row.get("created_at"),
        "url": row.get("link") or "",
        "lat": row.get("latitude"),
        "lon": row.get("longitude"),
        "corridor_segment": row.get("corridor_segment"),
        "lane_status": gtm.get("lane_status", "CLEAR"),
        "temporal_phase": row.get("temporal_phase") or "active_disruption",
        "commodities_affected": commodities or "",
    }


def _query_recent_news_articles() -> List[Dict[str, Any]]:
    """Blocking Supabase read of recent gatekeeper-approved news articles."""
    from app.db.supabase_client import get_client

    sb = get_client()
    cutoff = (
        datetime.now(timezone.utc) - timedelta(hours=NEWS_FALLBACK_WINDOW_HOURS)
    ).isoformat()

    try:
        # Preferred contract: a dedicated gatekeeper_tier column.
        res = (
            sb.table("news_articles").select("*")
            .gte("created_at", cutoff)
            .in_("gatekeeper_tier", list(NEWS_FALLBACK_TIERS))
            .order("created_at", desc=True)
            .limit(NEWS_FALLBACK_LIMIT)
            .execute()
        )
        rows = list(res.data or [])
        return [_news_row_to_payload(r) for r in rows if isinstance(r, dict)]
    except Exception:
        # Deployments that persist the tier inside ground_truth_metrics JSONB
        # reject the server-side filter; retry unfiltered and tier in Python.
        res = (
            sb.table("news_articles").select("*")
            .gte("created_at", cutoff)
            .order("created_at", desc=True)
            .limit(NEWS_FALLBACK_LIMIT * 4)
            .execute()
        )
        rows = [_news_row_to_payload(r) for r in (res.data or []) if isinstance(r, dict)]
        return [
            r for r in rows if r.get("gatekeeper_tier") in NEWS_FALLBACK_TIERS
        ][:NEWS_FALLBACK_LIMIT]


async def _load_news_articles_fallback() -> List[Dict[str, Any]]:
    """Async wrapper: never block the event loop on the Supabase HTTP call."""
    return await asyncio.to_thread(_query_recent_news_articles)


async def osint_hazard_agent(state: CrisisState) -> dict:
    """Agent 2: PostGIS hazard fusion + Official News & OSINT corroboration."""
    logger.info("Agent 2 [OSINTHazardAgent] running...")
    
    norm_event = state.get("normalized_event") or {}
    lat = state.get("lat")
    lon = state.get("lon")
    source = norm_event.get("source")
    event_type = norm_event.get("event_type", "unknown")
    region = state.get("region", "Sumatra")

    # Degradation ledger: an empty evidence set is only "quiet" when every path
    # actually answered. A named degraded source tells the dashboard the truth:
    # the path is dead (or degraded), not simply a slow day.
    degraded_sources: List[str] = []
    errors: Dict[str, str] = {}

    def _degrade(source_name: str, exc: Any) -> None:
        if source_name not in degraded_sources:
            degraded_sources.append(source_name)
        errors[source_name] = str(exc)

    # 1. Hazard fusion (Query Supabase)
    hazard_polygons = []
    if lat is not None and lon is not None:
        try:
            hazard_polygons = await get_hazard_polygons(
                lat, lon, radius_km=50, degraded_sources=degraded_sources
            )
            if "supabase_polygons" in degraded_sources:
                errors.setdefault(
                    "supabase_polygons", "hazard polygon query unavailable"
                )
        except Exception as poly_err:
            logger.warning(
                "OSINTHazardAgent: hazard polygon query failed; "
                "degraded_sources=supabase_polygons error=%s",
                poly_err,
            )
            _degrade("supabase_polygons", poly_err)
    else:
        logger.warning(
            "OSINTHazardAgent: missing event coordinates; hazard fusion skipped "
            "(degraded_sources=supabase_polygons)"
        )
        _degrade("supabase_polygons", "missing event coordinates")
    logger.debug(f"Fused {len(hazard_polygons)} hazard polygons.")

    # 2. Read recent OSINT & Official News events from Redis Stream lrip:stream:osint (last 3h)
    r = get_async_redis()
    social_corroborations = 0
    official_corroborations = 0
    ner_location_overlap = False
    verified_citations = []
    blocked_corridors = []
    affected_commodities = set()
    early_warning_active = False
    spatially_rejected = []
    state_lat = _as_float(lat)
    state_lon = _as_float(lon)
    region_slug = normalize_region(region)
    
    try:
        three_hours_ago = datetime.now(timezone.utc) - timedelta(hours=3)
        start_id = f"{int(three_hours_ago.timestamp() * 1000)}"
        
        raw_events = []
        for stream_key in ["lrip:stream:osint", "lrip:events:social"]:
            try:
                events = await r.xrange(stream_key, min=start_id, max="+")
                raw_events.extend(events)
            except Exception as e_stream:
                try:
                    list_data = await r.lrange(stream_key, 0, -1)
                    for item in list_data:
                        try:
                            raw_events.append((None, json.loads(item)))
                        except Exception:
                            pass
                except Exception as e_list:
                    logger.warning(
                        "OSINTHazardAgent: no active stream or list for %s in Redis; "
                        "degraded_sources=redis_osint error=%s",
                        stream_key,
                        e_list,
                    )
                    _degrade("redis_osint", f"{stream_key}: {e_list}")

        # Redis-down / cold-stream fallback: read recent gatekeeper-approved
        # articles from Supabase and feed them through the same parsing and
        # spatial-corroboration loop below.
        if not raw_events:
            try:
                fallback_payloads = await _load_news_articles_fallback()
                raw_events = [(None, payload) for payload in fallback_payloads]
                if fallback_payloads:
                    logger.info(
                        "OSINTHazardAgent: Redis OSINT stream empty; using %d "
                        "Supabase news_articles rows (last %dh, tiers=%s)",
                        len(fallback_payloads),
                        NEWS_FALLBACK_WINDOW_HOURS,
                        ",".join(NEWS_FALLBACK_TIERS),
                    )
            except Exception as fb_err:
                logger.warning(
                    "OSINTHazardAgent: Supabase news_articles fallback failed; "
                    "degraded_sources=supabase_news error=%s",
                    fb_err,
                )
                _degrade("supabase_news", fb_err)

        # Parse and count corroborations
        for _, payload in raw_events:
            if isinstance(payload, str):
                try:
                    payload = json.loads(payload)
                except Exception:
                    continue
            if not isinstance(payload, dict):
                continue

            # Citizen/social payloads store their real content inside a JSON
            # `raw` blob. Unpack it before the discourse/freshness gates so the
            # report is judged on its text (not on the wrapper title).
            is_social = _is_social_payload(payload)
            raw_meta = _parse_raw_meta(payload) if is_social else {}
            title = str(payload.get("title", "") or "")
            if is_social:
                social_view = _unpack_social_payload(payload)
                summary = social_view["summary"]
                published_at = (
                    social_view["published_at"]
                    or _first_nonempty(
                        payload.get("published_at"),
                        payload.get("pubDate"),
                        payload.get("original_pub_date"),
                    )
                )
                source_tier = "TIER_3_CITIZEN_OSINT"
            else:
                summary = str(payload.get("summary", "") or "")
                published_at = _first_nonempty(
                    payload.get("published_at"),
                    payload.get("pubDate"),
                    payload.get("original_pub_date"),
                )
                source_tier = payload.get("source_tier", "TIER_2_AUTHORITATIVE_PRESS")

            # Agent verification gate: skip academic/opinion/solution discourse
            # and archival (>48h) payloads so they never boost hazard confidence.
            try:
                from app.nlp.news_extractor import NON_INCIDENT_DISCOURSE_MARKERS
                _ptext = f"{title} {summary}".lower()
                _POST_CONSTRUCTION = ("pascabencana", "pasca-bencana", "pascabanjir", "pasca-banjir",
                                      "pascagempa", "pasca-gempa", "pembangunan", "membangun",
                                      "tanggul", "perbaikan", "renovasi")
                if any(m in _ptext for m in NON_INCIDENT_DISCOURSE_MARKERS):
                    continue
                if any(m in _ptext for m in _POST_CONSTRUCTION):
                    continue
                try:
                    from app.services.news_aggregator import parse_and_validate_article_freshness as _osint_fresh
                    _pfresh = _osint_fresh(
                        published_at,
                        payload.get("url") or payload.get("link"),
                        html_meta_date=payload.get("html_published_at"),
                        max_age_hours=48,
                    )
                    if not _pfresh.get("is_fresh"):
                        continue
                except Exception:
                    pass
            except Exception:
                pass

            source_name = payload.get("source", "")
            lane_status = payload.get("lane_status", "CLEAR")
            temporal_phase = payload.get("temporal_phase", "active_disruption")
            comm_list = payload.get("commodities_affected", "")
            if is_social:
                # Citizen reports never inherit official lane/forecast labels.
                lane_status = "CLEAR"
                temporal_phase = "active_disruption"

            text = f"{title} {summary}".lower()

            # Check if keywords or event type matches
            matched = event_type in text or any(kw in text for kw in ["banjir", "longsor", "gempa", "gelombang", "macet", "putus", "bulog"])

            if not matched:
                continue

            # P2 spatial gate: a hit may only corroborate when it is anchored to
            # this incident. Everything else is recorded as rejected, never
            # counted toward confidence/commodities/corridors.
            relevant, distance_km, gate_reason = _evaluate_spatial_relevance(
                state_lat, state_lon, region_slug, event_type, payload, raw_meta, text
            )
            if not relevant:
                if len(spatially_rejected) < 10:
                    spatially_rejected.append({
                        "headline": title,
                        "source": source_name,
                        "tier": source_tier,
                        "distance_km": distance_km,
                        "reason": gate_reason,
                        "spatially_relevant": False,
                    })
                continue

            social_corroborations += 1
            if source_tier == "TIER_1_OFFICIAL":
                official_corroborations += 1

            if temporal_phase == "forecast_early_warning":
                early_warning_active = True

            if lane_status == "BLOCKED" or "putus" in text or "tutup" in text:
                blocked_corridors.append(payload.get("corridor_segment", "Jalur Logistik"))

            if comm_list:
                for c in str(comm_list).split(","):
                    if c.strip():
                        affected_commodities.add(c.strip())

            # NER region/corridor overlap only counts when hazard type aligns.
            extracted = await extract_locations(text)
            region_named_in_text = region_matches_text(region_slug, text)
            extracted_matches_region = any(
                normalize_region(loc) == region_slug for loc in (extracted or [])
            )
            if (region_named_in_text or extracted_matches_region) and _hazard_type_alignment(event_type, text):
                ner_location_overlap = True

            if len(verified_citations) < 3:
                verified_citations.append({
                    "headline": title,
                    "source": source_name,
                    "tier": source_tier,
                    "temporal_phase": temporal_phase,
                    "lane_status": lane_status,
                    "url": payload.get("url") or payload.get("link") or "",
                    "published_at": published_at,
                    "distance_km": distance_km,
                    "spatially_relevant": True,
                    "spatial_reason": gate_reason,
                })
    except Exception as re:
        logger.error(f"Failed to read OSINT events from Redis: {re}")
        _degrade("redis_osint", re)

    # 3. Conditional LLM Call (if source is citizen social)
    inferred_severity = norm_event.get("severity", "medium")
    source_key = str(source or state.get("source") or "").lower()
    if source_key in ("social", "citizen_report"):
        raw_payload = norm_event.get("raw_payload") or {}
        raw_text = extract_payload_text(raw_payload) or extract_payload_text(state)
        if raw_text:
            try:
                prompt = (
                    "Based on the following citizen report transcript, classify the crisis severity as "
                    "either 'low', 'medium', 'high', or 'critical'. Return ONLY the classification word "
                    "in lowercase (no period, no additional text).\n\n"
                    f"Report: {raw_text}"
                )
                from agents.llm_gateway import LLMGateway
                inferred = await LLMGateway.generate_content(
                    prompt=prompt,
                    model_name=settings.opencode_driver_model
                )
                inferred = inferred.strip().lower()
                if inferred in ['low', 'medium', 'high', 'critical']:
                    inferred_severity = inferred
            except Exception as le:
                logger.error(f"LLMGateway severity inference failed: {le}")

    # 4. Compute confidence score with official source weight
    confidence = 0.60  # Base
    if hazard_polygons:
        confidence += 0.20
    if official_corroborations >= 1:
        confidence += 0.15  # Strong boost for LKBN Antara / BMKG / BNPB
    elif social_corroborations >= 1:
        confidence += 0.10  # Citizen/OSINT corroboration, only after the spatial gate
    if ner_location_overlap:
        confidence += 0.05
        
    confidence = min(0.98, confidence)
    
    summary_parts = []
    if official_corroborations > 0:
        summary_parts.append(f"Divalidasi {official_corroborations} rilis berita resmi")
    if hazard_polygons:
        summary_parts.append(f"{len(hazard_polygons)} polygon bahaya")
    if early_warning_active:
        summary_parts.append("Status Peringatan Dini Aktif (3-6 Jam)")
        
    summary_text = " · ".join(summary_parts) if summary_parts else f"Fused {len(hazard_polygons)} hazard polygons with {social_corroborations} reports."

    # Agent-status telemetry is a write path too; a rejected write must surface
    # instead of being swallowed (dashboard would otherwise show a stale agent).
    try:
        from app.routers.agent_router import update_agent_status
        update_agent_status("OSINTHazardAgent", "complete", confidence, summary_text)
    except Exception as write_err:
        logger.warning(
            "OSINTHazardAgent: agent status write rejected; "
            "degraded_sources=write_rejected error=%s",
            write_err,
        )
        _degrade("write_rejected", write_err)

    # Dashboard contract: "quiet" means every path answered with no hits;
    # "degraded" names exactly which path died.
    if degraded_sources:
        evidence_health = "degraded"
    elif not hazard_polygons and social_corroborations == 0:
        evidence_health = "quiet"
    else:
        evidence_health = "nominal"

    finding: AgentFinding = {
        "agent": "OSINTHazardAgent",
        "confidence": confidence,
        "summary": summary_text,
        "data": {
            "hazard_polygons_count": len(hazard_polygons),
            "social_corroborations": social_corroborations,
            "official_corroborations": official_corroborations,
            "ner_location_overlap": ner_location_overlap,
            "early_warning_active": early_warning_active,
            "inferred_severity": inferred_severity,
            "verified_citations": verified_citations,
            "blocked_corridors": list(set(blocked_corridors)),
            "affected_commodities": list(affected_commodities),
            # Explicit spatial gate audit: no distant report may corroborate.
            "spatially_relevant": bool(social_corroborations or official_corroborations),
            "spatial_gate": {
                "radius_km": SPATIAL_GATE_RADIUS_KM,
                "state_lat": state_lat,
                "state_lon": state_lon,
                "region": region_slug,
                "accepted_hits": social_corroborations,
                "official_hits": official_corroborations,
                "rejected_hits": len(spatially_rejected),
                "rejected": spatially_rejected,
            },
            # Degradation ledger (quiet day vs dead path).
            "degraded_sources": degraded_sources,
            "errors": errors,
            "evidence_health": evidence_health,
        },
        "timestamp": datetime.now(timezone.utc).isoformat()
    }

    logger.info(f"Agent 2 finished. Confidence: {confidence}")
    return {
        "hazard_polygons": hazard_polygons,
        "osint_hazard_finding": finding,
        "verified_news_citations": verified_citations,
        "blocked_corridors": list(set(blocked_corridors)),
        "news_affected_commodities": list(affected_commodities),
        "messages": state.get("messages", []) + [f"OSINTHazardAgent: Fused PostGIS hazards and {official_corroborations} official news reports."]
    }
