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
    """Agent 5: PIHPS anomaly detection + News supply shock grounding + pgvector LTM retrieval."""
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

    # Merge news-reported affected commodities
    news_commodities = state.get("news_affected_commodities") or []
    osint_finding = state.get("osint_hazard_finding", {})
    if isinstance(osint_finding, dict):
        news_commodities.extend(osint_finding.get("data", {}).get("affected_commodities", []))
        
    for nc in news_commodities:
        clean_c = nc.lower().replace(" ", "_")
        if clean_c not in anomalous_commodities:
            anomalous_commodities.append(clean_c)

    # 2. LTM retrieval (pgvector query)
    ltm_query = f"{event_type} in {region}, {severity} severity"
    ltm_episodes = await query_ltm(ltm_query, top_k=5)
    
    # Calculate inflation multiplier
    inflation_multiplier = 1.05  # Base default multiplier
    strong_precedent = False
    direction_agreement = 0
    
    if ltm_episodes:
        valid_episodes = [ep for ep in ltm_episodes if ep.get("similarity_score", 0) > 0.0]
        if valid_episodes:
            top_ep = valid_episodes[0]
            if top_ep["similarity_score"] > 0.8:
                strong_precedent = True
                
            direction_agreement = sum(1 for ep in valid_episodes if ep["inflation_multiplier"] > 1.0)
            top_3 = valid_episodes[:3]
            total_weight = sum(ep["similarity_score"] for ep in top_3)
            if total_weight > 0:
                inflation_multiplier = sum(ep["inflation_multiplier"] * ep["similarity_score"] for ep in top_3) / total_weight
            else:
                inflation_multiplier = top_ep["inflation_multiplier"]

    # Scale inflation multiplier if news verifies active supply chain severance
    if news_commodities and severity in ["high", "critical"]:
        inflation_multiplier = max(inflation_multiplier, 1.15)
                
    # 3. Anomaly and inflation forecast
    inflation_forecast = {
        "region": region,
        "timeframe_hours": 48,
        "inflation_multiplier": round(inflation_multiplier, 2),
        "anomalous_commodities": anomalous_commodities if anomalous_commodities else ["cooking_oil", "rice"]
    }

    # 4. Narrative generation
    pct_rise = int(round((inflation_multiplier - 1) * 100))
    narrative = f"Model dampak ekonomi memproyeksikan kenaikan harga pangan +{pct_rise}% dalam 48 jam ke depan di {region}."
    if news_commodities:
        narrative += f" Komoditas paling rentan: {', '.join(anomalous_commodities[:3])}."
        
    try:
        prompt = (
            "Berdasarkan preseden historis, data harga PIHPS, dan laporan intelijen berita resmi, buat ringkasan narasi "
            "ekonomi singkat (2-3 kalimat) mengenai proyeksi inflasi pangan di koridor Sumatera Utara. "
            "Sebutkan komoditas terdampak secara faktual tanpa kata berlebihan.\n\n"
            f"Event: {event_type} ({severity})\n"
            f"Komoditas Teridentifikasi: {anomalous_commodities}\n"
            f"Proyeksi Multiplier Inflasi: {inflation_multiplier}"
        )
        from agents.llm_gateway import LLMGateway
        resp_text = await LLMGateway.generate_content(
            prompt=prompt,
            model_name="gemini-1.5-flash"
        )
        if resp_text and len(resp_text) > 20:
            narrative = resp_text.strip()
    except Exception as le:
        logger.debug(f"LLMGateway narrative generation skipped: {le}")

    # 5. Compute confidence score
    confidence = 0.5  # Base
    if anomaly_detected or news_commodities:
        confidence += 0.25
    if strong_precedent:
        confidence += 0.15
    if direction_agreement >= 2:
        confidence += 0.05
        
    confidence = min(0.96, confidence)
    
    finding: AgentFinding = {
        "agent": "EconomicIntelligenceAgent",
        "confidence": confidence,
        "summary": narrative,
        "data": {
            "inflation_forecast": inflation_forecast,
            "ltm_episodes_used": len(ltm_episodes),
            "anomaly_detected": anomaly_detected,
            "news_commodities": list(news_commodities)
        },
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    
    try:
        from app.routers.agent_router import update_agent_status
        update_agent_status("EconomicIntelligenceAgent", "complete", confidence, finding["summary"])
    except Exception:
        pass

    logger.info(f"Agent 5 finished. Confidence: {confidence}")
    return {
        "inflation_forecast": inflation_forecast,
        "ltm_episodes": ltm_episodes,
        "economic_intelligence_finding": finding,
        "messages": state.get("messages", []) + ["EconomicIntelligenceAgent: Projected economic impact and inflation forecasts."]
    }
