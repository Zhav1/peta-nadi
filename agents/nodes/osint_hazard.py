import json
import logging
from datetime import datetime, timezone, timedelta
import google.generativeai as genai
from agents.state import CrisisState, AgentFinding
from agents.tools.supabase_tools import get_hazard_polygons
from agents.memory.stm import get_async_redis
from app.nlp.ner_pipeline import extract_locations
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


async def osint_hazard_agent(state: CrisisState) -> dict:
    """Agent 2: PostGIS hazard fusion + Official News & OSINT corroboration."""
    logger.info("Agent 2 [OSINTHazardAgent] running...")
    
    norm_event = state.get("normalized_event") or {}
    lat = state.get("lat")
    lon = state.get("lon")
    source = norm_event.get("source")
    event_type = norm_event.get("event_type", "unknown")
    region = state.get("region", "Sumatera Utara")
    
    # 1. Hazard fusion (Query Supabase)
    hazard_polygons = []
    if lat is not None and lon is not None:
        hazard_polygons = await get_hazard_polygons(lat, lon, radius_km=50)
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
                    logger.debug(f"No active stream or list for {stream_key} in Redis: {e_list}")
                
        # Parse and count corroborations
        for _, payload in raw_events:
            if isinstance(payload, str):
                try:
                    payload = json.loads(payload)
                except Exception:
                    continue
            
            title = payload.get("title", "")
            source_name = payload.get("source", "")
            source_tier = payload.get("source_tier", "TIER_2_AUTHORITATIVE_PRESS")
            lane_status = payload.get("lane_status", "CLEAR")
            temporal_phase = payload.get("temporal_phase", "active_disruption")
            comm_list = payload.get("commodities_affected", "")
            
            text = f"{title} {payload.get('summary', '')}".lower()
            
            # Check if keywords or event type matches
            matched = event_type in text or any(kw in text for kw in ["banjir", "longsor", "gempa", "gelombang", "macet", "putus", "bulog"])
            
            if matched:
                social_corroborations += 1
                if source_tier == "TIER_1_OFFICIAL":
                    official_corroborations += 1
                    
                if temporal_phase == "forecast_early_warning":
                    early_warning_active = True
                    
                if lane_status == "BLOCKED" or "putus" in text or "tutup" in text:
                    blocked_corridors.append(payload.get("corridor_segment", "Jalur Logistik"))
                    
                if comm_list:
                    for c in comm_list.split(","):
                        if c.strip():
                            affected_commodities.add(c.strip())
                            
                # Check NER location overlap
                extracted = await extract_locations(text)
                if any(loc.lower() in region.lower() for loc in extracted) or "sumut" in text or "medan" in text:
                    ner_location_overlap = True
                    
                if len(verified_citations) < 3:
                    verified_citations.append({
                        "headline": title,
                        "source": source_name,
                        "tier": source_tier,
                        "temporal_phase": temporal_phase,
                        "lane_status": lane_status
                    })
    except Exception as re:
        logger.error(f"Failed to read OSINT events from Redis: {re}")

    # 3. Conditional LLM Call (if source is citizen social)
    inferred_severity = norm_event.get("severity", "medium")
    if source == "social":
        raw_text = norm_event.get("raw_payload", {}).get("text", "")
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
                    model_name="gemini-1.5-flash"
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
    elif social_corroborations >= 2:
        confidence += 0.10
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
            "affected_commodities": list(affected_commodities)
        },
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    
    try:
        from app.routers.agent_router import update_agent_status
        update_agent_status("OSINTHazardAgent", "complete", confidence, finding["summary"])
    except Exception:
        pass

    logger.info(f"Agent 2 finished. Confidence: {confidence}")
    return {
        "hazard_polygons": hazard_polygons,
        "osint_hazard_finding": finding,
        "verified_news_citations": verified_citations,
        "blocked_corridors": list(set(blocked_corridors)),
        "news_affected_commodities": list(affected_commodities),
        "messages": state.get("messages", []) + [f"OSINTHazardAgent: Fused PostGIS hazards and {official_corroborations} official news reports."]
    }
