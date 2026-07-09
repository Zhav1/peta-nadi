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
    """Agent 2: PostGIS hazard fusion + social OSINT corroboration."""
    logger.info("Agent 2 [OSINTHazardAgent] running...")
    
    norm_event = state.get("normalized_event") or {}
    lat = state.get("lat")
    lon = state.get("lon")
    source = norm_event.get("source")
    event_type = norm_event.get("event_type", "unknown")
    
    # 1. Hazard fusion (Query Supabase)
    hazard_polygons = []
    if lat is not None and lon is not None:
        hazard_polygons = await get_hazard_polygons(lat, lon, radius_km=50)
    logger.debug(f"Fused {len(hazard_polygons)} hazard polygons.")

    # 2. Read recent OSINT events from Redis Stream lrip:stream:osint (last 2h)
    r = get_async_redis()
    social_corroborations = 0
    ner_location_overlap = False
    
    try:
        # Try reading from stream
        # Get events from 2 hours ago (approx)
        two_hours_ago = datetime.now(timezone.utc) - timedelta(hours=2)
        start_id = f"{int(two_hours_ago.timestamp() * 1000)}"
        
        raw_events = []
        try:
            raw_events = await r.xrange("lrip:stream:osint", min=start_id, max="+")
        except Exception as e_stream:
            # Fallback to list
            try:
                list_data = await r.lrange("lrip:stream:osint", 0, -1)
                for item in list_data:
                    try:
                        raw_events.append((None, json.loads(item)))
                    except Exception:
                        pass
            except Exception as e_list:
                logger.debug(f"No active OSINT stream or list found in Redis: {e_list}")
                
        # Parse and count corroborations
        for _, payload in raw_events:
            if isinstance(payload, str):
                try:
                    payload = json.loads(payload)
                except Exception:
                    continue
            
            text = payload.get("text", "").lower()
            # Check if keywords match
            if event_type in text or any(kw in text for kw in ["banjir", "gempa", "kebakaran", "macet", "tutup"]):
                social_corroborations += 1
                
                # Check NER location overlap
                extracted = await extract_locations(payload.get("text", ""))
                # If any extracted location is in our corridor
                if any(loc.lower() in state.get("region", "").lower() for loc in extracted):
                    ner_location_overlap = True
    except Exception as re:
        logger.error(f"Failed to read OSINT events from Redis: {re}")

    # 3. Conditional LLM Call (if source is social)
    inferred_severity = norm_event.get("severity", "medium")
    if source == "social" and settings.gemini_api_key and settings.gemini_api_key != "your-gemini-api-key":
        try:
            genai.configure(api_key=settings.gemini_api_key)
            model = genai.GenerativeModel("gemini-1.5-flash")
            
            raw_text = norm_event.get("raw_payload", {}).get("text", "")
            if raw_text:
                prompt = (
                    "Based on the following citizen report transcript, classify the crisis severity as "
                    "either 'low', 'medium', 'high', or 'critical'. Return ONLY the classification word "
                    "in lowercase (no period, no additional text).\n\n"
                    f"Report: {raw_text}"
                )
                response = await asyncio.to_thread(model.generate_content, prompt)
                inferred = response.text.strip().lower()
                if inferred in ['low', 'medium', 'high', 'critical']:
                    inferred_severity = inferred
        except Exception as le:
            logger.error(f"Gemini LLM severity inference failed: {le}")

    # 4. Compute confidence score
    confidence = 0.6  # Base
    if hazard_polygons:
        confidence += 0.2
    if social_corroborations >= 2:
        confidence += 0.15
    if ner_location_overlap:
        confidence += 0.05
        
    confidence = min(1.0, confidence)
    
    finding: AgentFinding = {
        "agent": "OSINTHazardAgent",
        "confidence": confidence,
        "summary": f"Fused {len(hazard_polygons)} hazard polygons with {social_corroborations} social corroborations. Inferred severity: {inferred_severity}.",
        "data": {
            "hazard_polygons_count": len(hazard_polygons),
            "social_corroborations": social_corroborations,
            "ner_location_overlap": ner_location_overlap,
            "inferred_severity": inferred_severity
        },
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    
    logger.info(f"Agent 2 finished. Confidence: {confidence}")
    return {
        "hazard_polygons": hazard_polygons,
        "osint_hazard_finding": finding,
        "messages": state.get("messages", []) + ["OSINTHazardAgent: Fused PostGIS hazards and OSINT corroborations."]
    }
