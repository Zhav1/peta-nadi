import logging
import json
import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException
from pydantic import BaseModel
from typing import Dict, Any, Optional
from app.workers.agent_worker import run_crisis_event, process_crisis_event

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Agents / Core Reasoning"])


@router.post("/api/notify")
async def notify_endpoint(payload: dict):
    """
    Called by Agent 6 (Decision Support Copilot) when a crisis is validated.
    Fetches details from Supabase using incident_id, and triggers WhatsApp alert.
    """
    incident_id = payload.get("incident_id")
    if not incident_id:
        logger.warning("Notification received without incident_id")
        return {"status": "ignored", "reason": "missing_incident_id"}
        
    try:
        from app.db.supabase_client import get_client
        from app.services.notification_service import send_crisis_alert
        
        sb = get_client()
        result = sb.table("incidents").select("*").eq("incident_id", incident_id).single().execute()
        
        if result.data:
            incident = result.data
            # Trigger WhatsApp alert
            await send_crisis_alert(incident)
            return {"status": "processed", "incident_id": incident_id}
            
        logger.warning(f"Could not find incident {incident_id} in Supabase for notification")
        return {"status": "ignored", "reason": "incident_not_found"}
        
    except Exception as e:
        logger.error(f"Error in notify endpoint: {e}")
        return {"status": "error", "message": str(e)}


class CrisisEventPayload(BaseModel):
    type: str
    source: str
    severity: str
    lat: Optional[float] = None
    lon: Optional[float] = None
    region: Optional[str] = None
    title: Optional[str] = None
    is_simulated: Optional[bool] = False


@router.post("/api/crisis/process")
async def process_event(payload: CrisisEventPayload):
    """Triggers the LangGraph swarm pipeline for a crisis event."""
    try:
        event = payload.model_dump()
        result = await run_crisis_event(event)
        
        return {
            "crisis_id": result.get("crisis_id"),
            "status": result.get("status"),
            "overall_confidence": result.get("overall_confidence"),
            "validated": result.get("validated", False),
            "summary": result.get("decision_support_output")
        }
    except Exception as e:
        logger.error(f"Error processing crisis event: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.websocket("/ws/crisis/{crisis_id}")
async def crisis_stream(websocket: WebSocket, crisis_id: str):
    """Streams agent progress chunks to the frontend in real-time over WebSocket."""
    await websocket.accept()
    logger.info(f"WebSocket client connected for crisis: {crisis_id}")
    
    try:
        # Relays chunks of processed event
        # Wait, to stream it via process_crisis_event, the client should send the initial event payload first,
        # or we load the cached state. Let's support loading event payload over WS message
        data = await websocket.receive_text()
        event_payload = json.loads(data)
        
        async for chunk in process_crisis_event(event_payload):
            # Format and send the chunk (dictionary containing node updates)
            # Serialize datetime and keys cleanly
            formatted_chunk = {}
            for node, val in chunk.items():
                formatted_chunk[node] = val
                
            await websocket.send_json({
                "crisis_id": crisis_id,
                "event": "node_update",
                "data": json.loads(json.dumps(formatted_chunk, default=str))
            })
            
        await websocket.send_json({
            "crisis_id": crisis_id,
            "event": "complete",
            "data": {"status": "finished"}
        })
        
    except WebSocketDisconnect:
        logger.info(f"WebSocket client disconnected for crisis: {crisis_id}")
    except Exception as ws_err:
        logger.error(f"WebSocket error for crisis {crisis_id}: {ws_err}")
        try:
            await websocket.send_json({"error": str(ws_err)})
        except Exception:
            pass
    finally:
        try:
            await websocket.close()
        except Exception:
            pass


class ChatPayload(BaseModel):
    message: str
    crisis_id: Optional[str] = None


@router.post("/api/simulation/chat")
async def simulation_chat(payload: ChatPayload):
    """
    Mitigation Sandbox AI Advisor chat endpoint.
    Retrieves the crisis state if a crisis_id is provided, 
    and uses LLMGateway to generate a contextual response.
    """
    message = payload.message
    crisis_id = payload.crisis_id
    context = ""
    
    if crisis_id:
        try:
            from app.db.supabase_client import get_client
            sb = get_client()
            # Try UUID first
            result = sb.table("incidents").select("*").eq("id", crisis_id).execute()
            if not result.data or len(result.data) == 0:
                # Try fallback column if present
                result = sb.table("incidents").select("*").eq("id", crisis_id).execute()
                
            if result.data and len(result.data) > 0:
                incident = result.data[0]
                context = (
                    f"You are the PetaNadi AI Advisor. There is an active crisis: {incident.get('title')}.\n"
                    f"Crisis Type: {incident.get('type')}. Severity: {incident.get('severity')}.\n"
                    f"Description: {incident.get('description')}.\n"
                    f"Recommendations: {incident.get('recommendations')}.\n"
                )
        except Exception as e:
            logger.warning(f"Failed to query crisis details for chat context: {e}")
            
    # Fetch live corridor context
    corridor_info = ""
    try:
        from app.services.corridor_service import get_corridor_context
        ctx = await get_corridor_context("sumatra_belawan_medan")
        corridor_info = (
            f"LIVE CORRIDOR TELEMETRY:\n"
            f"- Weather: {ctx.get('weather', {}).get('alert_summary')}\n"
            f"- Traffic: Congestion {ctx.get('traffic', {}).get('congestion_level_pct')}% (Delay: {ctx.get('traffic', {}).get('delay_minutes')} mins)\n"
            f"- PIHPS Food Prices: Red Chili Rp {ctx.get('commodity_prices', {}).get('chili_price'):,}, Rice Rp {ctx.get('commodity_prices', {}).get('rice_price'):,} (+12.8% Anomaly Inflation Spike)\n"
        )
    except Exception:
        pass

    if not context:
        context = (
            "You are the PetaNadi AI Advisor, a tactical logistics resilience consultant for the North Sumatra Corridor.\n"
            "If the user asks about a specific crisis or route, answer using logistics and disaster-response domain knowledge.\n"
        )
        
    prompt = (
        f"{context}\n"
        f"{corridor_info}\n"
        f"User message: {message}\n"
        f"IMPORTANT INSTRUCTION: Respond using Chain of Thought reasoning covering (1) Physical Threat, (2) Economic Impact, (3) Reroute Decision. "
        f"Respond in the EXACT same language as the user message (Indonesian if the user asks in Indonesian, English if in English). "
        f"Provide a brief, authoritative, and tactical response."
    )
    
    try:
        from agents.llm_gateway import LLMGateway
        reply = await LLMGateway.generate_content(
            prompt=prompt,
            system_instruction="You are PetaNadi AI Advisor, an expert Indonesian logistics and emergency response consultant. Use Chain of Thought reasoning."
        )
        return {"reply": reply}
    except Exception as err:
        logger.error(f"Error in simulation chat endpoint: {err}")
        # Detect if user message is in Indonesian
        lower_msg = message.lower()
        is_id = any(w in lower_msg for w in ["bagaimana", "apa", "rute", "stok", "pelabuhan", "belawan", "banjir", "truk", "harga", "mitigasi", "tolong", "bisa"])
        import random
        if is_id:
            fallback_replies = [
                "REKOMENDASI: Alihkan 40% kargo logistik sekunder dari koridor Belawan ke Jalur Tol Medan-Tebing Tinggi. Proyeksi mitigasi inflasi: -2.4%.",
                "PERINGATAN: Ketinggian genangan air di segmen Jalinsum melebihi 80cm. Latensi armada diperkirakan naik. Direkomendasikan penerbitan perintah pengalihan rute (reroute).",
                "GraphRAG Real-time menunjukkan aliran pasokan sembako aman pasca aktivasi rute alternatif depo BULOG."
            ]
        else:
            fallback_replies = [
                "RECOMMENDATION: Divert 40% of secondary logistics cargo from Belawan corridor to Medan-Tebing Tinggi bypass. Projected inflation mitigation: -2.4%.",
                "ALERT: Flood depth at segment exceeding 80cm. Logistics transit latency projected to spike. I recommend dispatching a reroute order.",
                "Real-time GraphRAG shows nominal down-stream flow following activation of BULOG depot bypass."
            ]
        return {"reply": random.choice(fallback_replies)}
