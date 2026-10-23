"""
agent_router.py : PetaNadi Multi-Agent & LLM Advisory Router
Handles real-time AI simulation chat, LangGraph reasoning traces, and agency orchestration calls.
"""
import logging
import hashlib
import time
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from datetime import datetime, timezone

logger = logging.getLogger(__name__)

router = APIRouter(prefix="", tags=["simulation", "agent"])

AGENT_STATUS_STORE: Dict[str, Dict[str, Any]] = {
    "DataCollectionAgent": {
        "agent_id": "DataCollectionAgent",
        "name": "Data Collection & Health",
        "status": "idle",
        "confidence": 0.88,
        "last_run_at": "never",
        "summary": "Validasi telemetri BMKG, TomTom, dan status sumber data pangan."
    },
    "OSINTHazardAgent": {
        "agent_id": "OSINTHazardAgent",
        "name": "OSINT & Intelligence",
        "status": "idle",
        "confidence": 0.84,
        "last_run_at": "never",
        "summary": "Ekstraksi berita RSS & analisis anomali krisis lapangan."
    },
    "PredictionAgent": {
        "agent_id": "PredictionAgent",
        "name": "Congestion & Weather Forecast",
        "status": "idle",
        "confidence": 0.82,
        "last_run_at": "never",
        "summary": "Proyeksi kemacetan 48 jam & estimasi risiko presipitasi Open-Meteo."
    },
    "RouteOptimizationAgent": {
        "agent_id": "RouteOptimizationAgent",
        "name": "Logistics & Graph Routing",
        "status": "idle",
        "confidence": 0.90,
        "last_run_at": "never",
        "summary": "Komputasi rute mitigasi NetworkX Dijkstra dengan penalti bahaya."
    },
    "EconomicIntelligenceAgent": {
        "agent_id": "EconomicIntelligenceAgent",
        "name": "Price & Inflation Intelligence",
        "status": "idle",
        "confidence": 0.86,
        "last_run_at": "never",
        "summary": "Deteksi anomali harga cabai/beras & proyeksi tren inflasi."
    },
    "DecisionSupportCopilot": {
        "agent_id": "DecisionSupportCopilot",
        "name": "AI Decision Copilot",
        "status": "idle",
        "confidence": 0.92,
        "last_run_at": "never",
        "summary": "Sintesis CoT eksekutif multi-instansi dengan penalaran opencode (mimo reasoning + deepseek driver)."
    }
}


def update_agent_status(agent_id: str, status: str = "complete", confidence: float = 0.85, summary: str = ""):
    """Updates the in-memory health record for a specific agent node."""
    if agent_id in AGENT_STATUS_STORE:
        AGENT_STATUS_STORE[agent_id]["status"] = status
        AGENT_STATUS_STORE[agent_id]["confidence"] = round(confidence, 2)
        AGENT_STATUS_STORE[agent_id]["last_run_at"] = datetime.now(timezone.utc).isoformat()
        if summary:
            AGENT_STATUS_STORE[agent_id]["summary"] = summary


@router.get("/api/v1/agents/status")
@router.get("/api/agents/status")
async def get_agents_status():
    """Returns the persistent health and telemetry execution status of all 6 swarm agents.

    Honesty rule (audit F4): before the first real run the store holds idle
    seeds, so the aggregate reports "warming" with 0.0 confidence instead of
    "healthy" with a seeded average that was never measured.
    """
    agents_list = list(AGENT_STATUS_STORE.values())
    measured = [
        a["confidence"] for a in agents_list
        if a.get("last_run_at") not in (None, "", "never")
    ]
    any_run = len(measured) > 0
    avg_confidence = round(sum(measured) / len(measured), 2) if any_run else 0.0

    return {
        "status": "healthy" if any_run else "warming",
        "active_agents": len(agents_list),
        "average_confidence": avg_confidence,
        "note": "live" if any_run else "last-known seeds until first run",
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "agents": agents_list
    }


@router.post("/api/v1/notify")
@router.post("/api/notify")
async def notify_validated_crisis(payload: dict):
    """Internal validated-alert notification endpoint.

    The original Agent 6 webhook targeted a non-existent ``/api/notify`` route
    on localhost, so every alert silently 404'd. Agent 6 now calls the
    notification service directly, and this endpoint remains for internal
    callers/ops. It never raises: missing WHATSAPP_* config is reported as a
    degraded (log-only) outcome.
    """
    from app.services.notification_service import notify_validated_alert

    try:
        result = await notify_validated_alert(payload or {})
    except Exception as exc:  # defensive: notification must never 500 the caller
        logger.error("Notify endpoint failed: %s", exc)
        return {
            "status": "failed",
            "sent": False,
            "configured": False,
            "missing": [],
            "degraded_sources": ["whatsapp"],
            "detail": str(exc),
        }

    return {
        **result,
        "sent": result.get("status") == "sent",
        "crisis_id": (payload or {}).get("crisis_id"),
        "incident_id": (payload or {}).get("incident_id"),
    }


@router.post("/api/v1/simulate/stream")
@router.post("/simulate/stream")
async def simulate_crisis_stream(payload: dict):
    """
    Real-time SSE streaming endpoint executing the 4-stage LangGraph swarm.
    Yields node_update events for each agent and finishes with simulation_complete.
    """
    from fastapi.responses import StreamingResponse
    import json
    import uuid

    polygon = payload.get("polygon", [])
    crisis_type = payload.get("type", "flood")
    region = payload.get("region", "north_sumatra")
    
    if polygon:
        lons = [p[0] for p in polygon]
        lats = [p[1] for p in polygon]
        lat = sum(lats) / len(lats)
        lon = sum(lons) / len(lons)
    else:
        lat = float(payload.get("lat", 3.79))
        lon = float(payload.get("lon", 98.67))

    scenario_id = payload.get("crisis_id") or str(uuid.uuid4())
    event = {
        **payload,
        "type": crisis_type,
        # Preserve the caller's declared source (e.g. citizen_report); the
        # simulation provenance stays explicit via is_simulated below.
        "source": payload.get("source") or "simulation",
        "severity": payload.get("severity", "high"),
        "lat": lat,
        "lon": lon,
        "region": region,
        "title": payload.get("title") or f"[Simulasi] {crisis_type.replace('_', ' ').title()} : {region.replace('_', ' ').title()}",
        "is_simulated": True,
        "crisis_id": scenario_id,
        "affected_polygon": polygon,
    }

    async def sse_generator():
        from app.workers.agent_worker import process_crisis_event
        try:
            async for item in process_crisis_event(event):
                data_str = json.dumps(item, default=str)
                yield f"data: {data_str}\n\n"
        except Exception as e:
            err_str = json.dumps({"event": "error", "message": str(e)})
            yield f"data: {err_str}\n\n"

    return StreamingResponse(
        sse_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )

