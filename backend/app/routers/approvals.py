import logging
import asyncio
from datetime import datetime
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException, Query, status

from app.schemas.decision_schemas import (
    DecisionAction,
    TacticalManeuver,
    DecisionTraceCreate,
    DecisionTraceResponse,
    DecisionTraceListResponse
)
from app.db import local_storage

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/approvals", tags=["approvals"])

# Keep ApprovalCreate alias for backwards compatibility
ApprovalCreate = DecisionTraceCreate
ApprovalResponse = DecisionTraceResponse
ApprovalListResponse = DecisionTraceListResponse


@router.post("", response_model=Dict[str, Any], status_code=status.HTTP_201_CREATED)
async def create_approval(payload: DecisionTraceCreate):
    """
    Log an operator decision trace in Supabase with local SQLite fallback.
    Supports multi-action decisions: ACCEPT, REJECT, and OVERRIDE with tactical maneuvers.
    """
    inc_id = payload.incident_id or payload.crisis_id or "INC-DEFAULT"
    op_id = payload.operator_id or payload.approved_by or "anonymous"
    
    db_payload = {
        "incident_id": inc_id,
        "route_id": payload.route_id,
        "action": payload.action.value,
        "tactical_action": payload.tactical_action.value,
        "operator_id": op_id,
        "recommended_route": payload.recommended_route or {},
        "custom_constraints": payload.custom_constraints or {},
        "notes": payload.notes or "",
        "sync_status": "synced"
    }

    # Attempt Supabase cloud insertion
    try:
        from app.db.supabase_client import get_client
        sb = get_client()
        
        # Insert into route_decision_traces or legacy route_approvals
        result = await asyncio.to_thread(
            lambda: sb.table("route_approvals").insert(db_payload).execute()
        )
        
        if result.data and len(result.data) > 0:
            item = result.data[0]
            record_id = item.get("id") or f"DEC-{inc_id}"
            approved_at = item.get("approved_at") or item.get("created_at") or datetime.now().isoformat()
            
            # Also mirror locally as synced
            local_payload = dict(db_payload, id=record_id, created_at=approved_at, sync_status="synced")
            local_storage.save_decision_trace(local_payload)
            
            logger.info(f"Decision trace logged in Supabase & synced locally: id={record_id}")
            return {
                "id": record_id,
                "approval_id": record_id,
                "approved_at": approved_at,
                "action": payload.action.value,
                "tactical_action": payload.tactical_action.value,
                "status": "success"
            }
    except Exception as e:
        logger.warning(f"Supabase unavailable for decision log, persisting to local SQLite: {e}")

    # Offline / Local fallback
    db_payload["sync_status"] = "pending"
    saved = local_storage.save_decision_trace(db_payload)
    logger.info(
        f"[OFFLINE-DECISION-LOG] operator={op_id} | incident={inc_id} | action={payload.action.value} | tactical={payload.tactical_action.value}"
    )
    return {
        "id": saved["id"],
        "approval_id": saved["id"],
        "approved_at": saved["created_at"],
        "action": payload.action.value,
        "tactical_action": payload.tactical_action.value,
        "status": "local_queued"
    }


@router.get("", response_model=DecisionTraceListResponse)
async def list_approvals(
    incident_id: Optional[str] = Query(None, description="Filter by incident ID"),
    limit: int = Query(50, ge=1, le=100)
):
    """List logged decision traces, falling back to local SQLite if Supabase is offline."""
    # Attempt cloud read first
    try:
        from app.db.supabase_client import get_client
        sb = get_client()
        
        query = sb.table("route_approvals").select("*").order("created_at", desc=True).limit(limit)
        if incident_id:
            query = query.eq("incident_id", incident_id)
            
        result = await asyncio.to_thread(lambda: query.execute())
        items = result.data or []
        if items:
            responses = []
            for item in items:
                created_str = item.get("approved_at") or item.get("created_at") or datetime.now().isoformat()
                created_dt = datetime.fromisoformat(created_str.replace("Z", "+00:00"))
                responses.append(
                    DecisionTraceResponse(
                        id=str(item.get("id")),
                        incident_id=item.get("incident_id", "INC-DEFAULT"),
                        route_id=str(item.get("route_id", "0")),
                        action=DecisionAction(item.get("action", "ACCEPT")),
                        tactical_action=TacticalManeuver(item.get("tactical_action", "REROUTE")),
                        operator_id=item.get("operator_id", "anonymous"),
                        recommended_route=item.get("recommended_route"),
                        custom_constraints=item.get("custom_constraints"),
                        notes=item.get("notes"),
                        sync_status="synced",
                        created_at=created_dt
                    )
                )
            return DecisionTraceListResponse(items=responses, total=len(responses))
    except Exception as e:
        logger.debug(f"Supabase unavailable for list_approvals, querying local SQLite: {e}")

    # Fallback to local SQLite
    local_items = local_storage.list_decision_traces(incident_id=incident_id, limit=limit)
    responses = []
    for item in local_items:
        created_str = item.get("created_at") or datetime.now().isoformat()
        try:
            created_dt = datetime.fromisoformat(created_str.replace("Z", "+00:00"))
        except Exception:
            created_dt = datetime.now()
        responses.append(
            DecisionTraceResponse(
                id=item["id"],
                incident_id=item["incident_id"],
                route_id=item["route_id"],
                action=DecisionAction(item["action"]),
                tactical_action=TacticalManeuver(item["tactical_action"]),
                operator_id=item["operator_id"],
                recommended_route=item.get("recommended_route"),
                custom_constraints=item.get("custom_constraints"),
                notes=item.get("notes"),
                sync_status=item.get("sync_status", "pending"),
                created_at=created_dt
            )
        )
    return DecisionTraceListResponse(items=responses, total=len(responses))
