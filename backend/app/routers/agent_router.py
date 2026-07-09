import logging
import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException
from pydantic import BaseModel
from typing import Dict, Any, Optional
from app.workers.agent_worker import run_crisis_event, process_crisis_event

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Agents / Core Reasoning"])


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
