import json
import logging
import math
import asyncio
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List
from agents.state import CrisisState, AgentFinding, LTMEpisode
from agents.memory.stm import get_async_redis
from agents.memory.ltm import query_ltm
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# Redis-down fallback window for commodity anomaly detection.
COMMODITY_HISTORY_DAYS = 14


def _pihps_stats_from_supabase() -> Dict[str, Dict[str, Any]]:
    """Recompute per-commodity current/mean/std from public.commodity_prices.

    Blocking Supabase read (call via ``asyncio.to_thread``). Uses the last
    ``COMMODITY_HISTORY_DAYS`` days per commodity; the newest price is "current".
    """
    from app.db.supabase_client import get_client

    sb = get_client()
    cutoff = (
        datetime.now(timezone.utc) - timedelta(days=COMMODITY_HISTORY_DAYS)
    ).isoformat()
    res = (
        sb.table("commodity_prices")
        .select("commodity,price_idr,time")
        .gte("time", cutoff)
        .order("time", desc=False)
        .execute()
    )

    grouped: Dict[str, List[Any]] = {}
    for row in res.data or []:
        if not isinstance(row, dict):
            continue
        commodity = row.get("commodity")
        try:
            price = float(row.get("price_idr"))
        except (TypeError, ValueError):
            continue
        if not commodity or price <= 0:
            continue
        grouped.setdefault(str(commodity), []).append(
            (str(row.get("time") or ""), price)
        )

    stats: Dict[str, Dict[str, Any]] = {}
    for commodity, points in grouped.items():
        points.sort(key=lambda item: item[0])
        series = [price for _, price in points]
        current = series[-1]
        mean = sum(series) / len(series)
        std = math.sqrt(
            sum((price - mean) ** 2 for price in series) / len(series)
        )
        stats[commodity] = {
            "current": round(current, 2),
            "mean": round(mean, 2),
            "std": round(std, 2),
            "z_score": (
                round((current - mean) / std, 2) if std > 0 else 0.0
            ),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
    return stats


async def economic_intelligence_agent(state: CrisisState) -> dict:
    """Agent 5: PIHPS anomaly detection + News supply shock grounding + pgvector LTM retrieval."""
    logger.info("Agent 5 [EconomicIntelligenceAgent] running...")
    
    norm_event = state.get("normalized_event") or {}
    event_type = norm_event.get("event_type", "unknown")
    region = state.get("region", "north_sumatra")
    severity = norm_event.get("severity", "medium")
    
    # 1. PIHPS anomaly detection (Redis snapshot, Supabase fallback when down/empty)
    r = get_async_redis()
    anomaly_detected = False
    anomalous_commodities = []
    pihps_source = "redis"

    data = None
    try:
        latest_pihps = await r.get("lrip:pihps:latest")
        if latest_pihps:
            data = json.loads(latest_pihps)
    except Exception as re:
        logger.warning(f"Failed to read PIHPS data from Redis: {re}")
        data = None

    if not isinstance(data, dict) or not data:
        # Redis unavailable or the PIHPS scraper has not published this cycle:
        # recompute current/mean/std on the fly from the last 14 days of
        # public.commodity_prices so the anomaly channel still answers.
        try:
            data = await asyncio.to_thread(_pihps_stats_from_supabase)
            pihps_source = "supabase_commodity_prices"
            logger.info(
                "EconomicIntelligenceAgent: PIHPS snapshot unavailable in Redis; "
                f"recomputed {len(data)} commodities from commodity_prices"
            )
        except Exception as sb_err:
            logger.warning(
                "EconomicIntelligenceAgent: PIHPS Redis and Supabase fallback "
                f"unavailable: {sb_err}"
            )
            data = None
            pihps_source = "unavailable"

    if isinstance(data, dict):
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
                
    primary_commodity = anomalous_commodities[0] if anomalous_commodities else "cabai_merah"
    pct_increase = float(round((inflation_multiplier - 1.0) * 100.0, 1))

    # 3. Anomaly and inflation forecast
    inflation_forecast = {
        "region": region,
        "timeframe_hours": 48,
        "inflation_multiplier": round(inflation_multiplier, 2),
        "commodity": primary_commodity,
        "pct_increase": pct_increase,
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
            f"ekonomi singkat (2-3 kalimat) mengenai proyeksi inflasi pangan di koridor {region}. "
            "Sebutkan komoditas terdampak secara faktual tanpa kata berlebihan.\n\n"
            f"Event: {event_type} ({severity})\n"
            f"Komoditas Teridentifikasi: {anomalous_commodities}\n"
            f"Proyeksi Multiplier Inflasi: {inflation_multiplier}"
        )
        from agents.llm_gateway import LLMGateway
        resp_text = await LLMGateway.generate_content(
            prompt=prompt,
            model_name=settings.opencode_reasoning_model
        )
        degraded_markers = ("FALLBACK", "CRISIS EXECUTIVE SUMMARY", "RINGKASAN EKSEKUTIF PREHUB", "MOCKED")
        if (
            resp_text
            and len(resp_text) > 20
            and not any(marker in resp_text.upper() for marker in degraded_markers)
        ):
            narrative = resp_text.strip()
        else:
            logger.warning("EconomicIntelligenceAgent: LLM narrative rejected as degraded/fallback text; using deterministic narrative.")
    except Exception as le:
        logger.warning(f"EconomicIntelligenceAgent: LLM narrative generation unavailable; using deterministic narrative: {le}")

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
            "pihps_source": pihps_source,
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
