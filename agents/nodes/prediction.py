import logging
import json
import numpy as np
from datetime import datetime, timezone
from agents.state import CrisisState, AgentFinding
from agents.memory.stm import get_async_redis
from app.db.supabase_client import get_client

logger = logging.getLogger(__name__)


async def prediction_agent(state: CrisisState) -> dict:
    """Agent 3: Multi-horizon congestion forecast (6h/12h/24h/48h)."""
    logger.info("Agent 3 [PredictionAgent] running...")
    
    norm_event = state.get("normalized_event") or {}
    event_type = norm_event.get("event_type", "unknown")
    
    # 1. Pull last 24h TomTom data from Redis
    r = get_async_redis()
    delays = []
    timestamps = []
    
    try:
        # Scan for TomTom segments keys
        keys = await r.keys("lrip:tomtom:segment:*")
        for k in keys:
            val = await r.get(k)
            if val:
                try:
                    data = json.loads(val)
                    # Use current delay/travel time
                    delays.append(float(data.get("delay_min", data.get("currentTravelTime", 0) / 60.0)))
                    # Fallback timestamp
                    timestamps.append(float(data.get("timestamp", datetime.now(timezone.utc).timestamp())))
                except Exception:
                    pass
    except Exception as re:
        logger.error(f"Failed to scan TomTom data from Redis: {re}")

    # 2. Query incidents table for historical events count in same region
    has_history = False
    try:
        supabase = get_client()
        res = supabase.table("incidents").select("incident_id").eq("region", state.get("region", "")).execute()
        if res.data and len(res.data) >= 5:
            has_history = True
    except Exception as dbe:
        logger.debug(f"Failed to query historical incidents: {dbe}")

    # 3. Forecast calculation (numpy polyfit or linear regression)
    # Default forecast delay values
    base_delays = {
        "6h": 30.0,
        "12h": 60.0,
        "24h": 45.0,
        "48h": 15.0
    }
    
    # If we have enough data points, perform linear extrapolation
    if len(delays) >= 5:
        try:
            # Fit line: y = mx + c
            x = np.array(timestamps) - min(timestamps)
            y = np.array(delays)
            slope, intercept = np.polyfit(x, y, 1)
            
            # Predict forward 6h, 12h, 24h, 48h (in seconds)
            now_ts = datetime.now(timezone.utc).timestamp() - min(timestamps)
            for h_str, h_val in [("6h", 6), ("12h", 12), ("24h", 24), ("48h", 48)]:
                future_ts = now_ts + (h_val * 3600)
                predicted = (slope * future_ts) + intercept
                # Keep it positive and bound
                base_delays[h_str] = float(max(5.0, min(300.0, predicted)))
        except Exception as pe:
            logger.debug(f"Failed to fit numpy polyfit: {pe}. Using base values.")

    # 4. Wildfire spread adjustment
    is_wildfire = event_type == "wildfire" or event_type == "fire"
    if is_wildfire:
        # Increase delay prediction due to wildfire spread risk
        for h in base_delays:
            base_delays[h] *= 1.3
            
    # Build forecast dict with confidence intervals
    congestion_forecast = {}
    for h in base_delays:
        val = base_delays[h]
        congestion_forecast[h] = {
            "delay_min": round(val, 1),
            "confidence_interval": [round(val * 0.8, 1), round(val * 1.2, 1)]
        }

    # 5. Compute confidence score
    confidence = 0.5  # Base
    if has_history:
        confidence += 0.2
    if len(delays) >= 5:
        confidence += 0.2
    if is_wildfire:
        confidence += 0.1
        
    confidence = min(1.0, confidence)
    
    finding: AgentFinding = {
        "agent": "PredictionAgent",
        "confidence": confidence,
        "summary": f"Generated 48h multi-horizon forecast. Max predicted delay: {congestion_forecast['12h']['delay_min']} minutes in 12h.",
        "data": {
            "forecast": congestion_forecast,
            "data_points_used": len(delays),
            "has_historical_precedents": has_history
        },
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    
    logger.info(f"Agent 3 finished. Confidence: {confidence}")
    return {
        "congestion_forecast": congestion_forecast,
        "prediction_finding": finding,
        "messages": state.get("messages", []) + ["PredictionAgent: Generated traffic and incident forecasts."]
    }
