import json
import logging
import asyncio
from datetime import datetime, timezone
import google.generativeai as genai
from agents.state import CrisisState, AgentFinding, LTMEpisode
from agents.memory.stm import get_async_redis
from agents.memory.ltm import query_ltm
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


async def economic_intelligence_agent(state: CrisisState) -> dict:
    """Agent 5: PIHPS anomaly detection + pgvector LTM retrieval."""
    logger.info("Agent 5 [EconomicIntelligenceAgent] running...")
    
    norm_event = state.get("normalized_event") or {}
    event_type = norm_event.get("event_type", "unknown")
    region = state.get("region", "north_sumatra")
    severity = norm_event.get("severity", "medium")
    
    # 1. PIHPS anomaly detection (Read from Redis)
    r = get_async_redis()
    anomaly_detected = False
    anomalous_commodities = []
    
    try:
        latest_pihps = await r.get("lrip:pihps:latest")
        if latest_pihps:
            data = json.loads(latest_pihps)
            # Look for price spike flag or perform standard dev z-score check
            # E.g. data = {"rice": {"current": 14000, "mean": 12500, "std": 500}}
            for comm, stats in data.items():
                if isinstance(stats, dict) and "current" in stats and "mean" in stats and "std" in stats:
                    current = float(stats["current"])
                    mean = float(stats["mean"])
                    std = float(stats["std"])
                    if std > 0:
                        z_score = (current - mean) / std
                        if abs(z_score) > 1.5:
                            anomaly_detected = True
                            anomalous_commodities.append(comm)
    except Exception as re:
        logger.debug(f"Failed to read PIHPS data from Redis: {re}")

    # 2. LTM retrieval (pgvector query)
    ltm_query = f"{event_type} in {region}, {severity} severity"
    ltm_episodes = await query_ltm(ltm_query, top_k=5)
    
    # Calculate inflation multiplier
    inflation_multiplier = 1.05  # Base default multiplier
    strong_precedent = False
    direction_agreement = 0
    
    if ltm_episodes:
        # Sort by similarity score
        valid_episodes = [ep for ep in ltm_episodes if ep.get("similarity_score", 0) > 0.0]
        
        if valid_episodes:
            top_ep = valid_episodes[0]
            if top_ep["similarity_score"] > 0.8:
                strong_precedent = True
                
            # Count direction agreement (inflation > 1.0)
            direction_agreement = sum(1 for ep in valid_episodes if ep["inflation_multiplier"] > 1.0)
            
            # Weighted average multiplier from top 3
            top_3 = valid_episodes[:3]
            total_weight = sum(ep["similarity_score"] for ep in top_3)
            if total_weight > 0:
                inflation_multiplier = sum(ep["inflation_multiplier"] * ep["similarity_score"] for ep in top_3) / total_weight
            else:
                inflation_multiplier = top_ep["inflation_multiplier"]
                
    # 3. Anomaly and inflation forecast
    inflation_forecast = {
        "region": region,
        "timeframe_hours": 48,
        "inflation_multiplier": round(inflation_multiplier, 2),
        "anomalous_commodities": anomalous_commodities if anomalous_commodities else ["cooking_oil", "rice"]
    }

    # 4. Gemini Flash narrative generation
    narrative = f"Economic impact model projects a {int((inflation_multiplier - 1) * 100)}% price increase for staples in {region} over the next 48 hours."
    if ltm_episodes:
        narrative += f" This is informed by historical precedent: '{ltm_episodes[0]['title']}'."
        
    if settings.gemini_api_key and settings.gemini_api_key != "your-gemini-api-key":
        try:
            genai.configure(api_key=settings.gemini_api_key)
            model = genai.GenerativeModel("gemini-1.5-flash")
            
            prompt = (
                "Based on the following historical precedents and current price details, generate a short 3-sentence "
                "economic narrative forecasting inflation in Indonesian logistics. Mention most affected commodities "
                "and cite the top historical precedent.\n\n"
                f"Current Event: {event_type} in {region} ({severity} severity)\n"
                f"Historical Precedents: {json.dumps(ltm_episodes[:2], default=str)}\n"
                f"Projected Multiplier: {inflation_multiplier}\n"
                f"Anomalous Commodities: {anomalous_commodities}"
            )
            response = await asyncio.to_thread(model.generate_content, prompt)
            resp_text = response.text.strip()
            if resp_text:
                narrative = resp_text
        except Exception as le:
            logger.error(f"Gemini LLM narrative generation failed: {le}")

    # 5. Compute confidence score
    confidence = 0.4  # Base
    if anomaly_detected:
        confidence += 0.3
    if strong_precedent:
        confidence += 0.2
    if direction_agreement >= 3:
        confidence += 0.1
        
    confidence = min(1.0, confidence)
    
    finding: AgentFinding = {
        "agent": "EconomicIntelligenceAgent",
        "confidence": confidence,
        "summary": narrative,
        "data": {
            "inflation_forecast": inflation_forecast,
            "ltm_episodes_used": len(ltm_episodes),
            "anomaly_detected": anomaly_detected
        },
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    
    logger.info(f"Agent 5 finished. Confidence: {confidence}")
    return {
        "inflation_forecast": inflation_forecast,
        "ltm_episodes": ltm_episodes,
        "economic_intelligence_finding": finding,
        "messages": state.get("messages", []) + ["EconomicIntelligenceAgent: Projected economic impact and inflation forecasts."]
    }
