"""
FastAPI Router for Ground-Truth Field Outcomes.
Enables logging and retrieving verified post-disruption conditions (clearance time, delays, price shifts)
at T+12h and T+24h horizons with local SQLite fallback resilience.
"""
import logging
import asyncio
from datetime import datetime
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException, Query, status

from app.schemas.decision_schemas import (
    OutcomeHorizon,
    VerificationSource,
    OutcomeCreate,
    OutcomeResponse,
    OutcomeListResponse
)
from app.db import local_storage

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/outcomes", tags=["outcomes"])


@router.post("", response_model=Dict[str, Any], status_code=status.HTTP_201_CREATED)
async def record_outcome(payload: OutcomeCreate):
    """
    Record a verified ground-truth field outcome for an incident.
    Persists to Supabase cloud with automatic fallback to local SQLite.
    """
    clearance_str = payload.actual_clearance_time.isoformat() if payload.actual_clearance_time else None
    db_payload = {
        "incident_id": payload.incident_id,
        "horizon": payload.horizon.value,
        "actual_clearance_time": clearance_str,
        "observed_delay_hours": float(payload.observed_delay_hours),
        "actual_price_spike_pct": float(payload.actual_price_spike_pct),
        "verified_by": payload.verified_by,
        "verification_source": payload.verification_source.value,
        "notes": payload.notes or "",
        "sync_status": "synced"
    }

    # Attempt Supabase cloud write
    try:
        from app.db.supabase_client import get_client
        sb = get_client()
        
        result = await asyncio.to_thread(
            lambda: sb.table("ground_truth_outcomes").insert(db_payload).execute()
        )
        
        if result.data and len(result.data) > 0:
            item = result.data[0]
            record_id = str(item.get("id") or f"OUT-{payload.incident_id}")
            created_at = item.get("created_at") or datetime.now().isoformat()
            
            # Mirror locally as synced
            local_payload = dict(db_payload, id=record_id, created_at=created_at, sync_status="synced")
            local_storage.save_outcome(local_payload)
            
            logger.info(f"Ground-truth outcome logged in Supabase: id={record_id}")
            return {
                "id": record_id,
                "incident_id": payload.incident_id,
                "horizon": payload.horizon.value,
                "status": "success"
            }
    except Exception as e:
        logger.warning(f"Supabase unavailable for outcome log, persisting to local SQLite: {e}")

    # Offline / local storage fallback
    db_payload["sync_status"] = "pending"
    saved = local_storage.save_outcome(db_payload)
    logger.info(
        f"[OFFLINE-OUTCOME-LOG] incident={payload.incident_id} | horizon={payload.horizon.value} | delay={payload.observed_delay_hours}h"
    )
    return {
        "id": saved["id"],
        "incident_id": saved["incident_id"],
        "horizon": saved["horizon"],
        "status": "local_queued"
    }


@router.get("", response_model=OutcomeListResponse)
async def list_outcomes(
    incident_id: Optional[str] = Query(None, description="Filter by incident ID"),
    horizon: Optional[str] = Query(None, description="Filter by horizon (T+12h or T+24h)"),
    limit: int = Query(50, ge=1, le=100)
):
    """List ground-truth outcome verification records."""
    # Attempt cloud query first
    try:
        from app.db.supabase_client import get_client
        sb = get_client()
        
        query = sb.table("ground_truth_outcomes").select("*").order("created_at", desc=True).limit(limit)
        if incident_id:
            query = query.eq("incident_id", incident_id)
        if horizon:
            query = query.eq("horizon", horizon)
            
        result = await asyncio.to_thread(lambda: query.execute())
        items = result.data or []
        if items:
            responses = []
            for item in items:
                created_str = item.get("created_at") or datetime.now().isoformat()
                created_dt = datetime.fromisoformat(created_str.replace("Z", "+00:00"))
                clearance_dt = None
                if item.get("actual_clearance_time"):
                    try:
                        clearance_dt = datetime.fromisoformat(item["actual_clearance_time"].replace("Z", "+00:00"))
                    except Exception:
                        pass

                responses.append(
                    OutcomeResponse(
                        id=str(item.get("id")),
                        incident_id=item.get("incident_id", "INC-DEFAULT"),
                        horizon=OutcomeHorizon(item.get("horizon", "T+12h")),
                        actual_clearance_time=clearance_dt,
                        observed_delay_hours=float(item.get("observed_delay_hours", 0.0)),
                        actual_price_spike_pct=float(item.get("actual_price_spike_pct", 0.0)),
                        verified_by=item.get("verified_by", "anonymous"),
                        verification_source=VerificationSource(item.get("verification_source", "FIELD_REPORT")),
                        notes=item.get("notes"),
                        sync_status="synced",
                        created_at=created_dt
                    )
                )
            return OutcomeListResponse(items=responses, total=len(responses))
    except Exception as e:
        logger.debug(f"Supabase unavailable for list_outcomes, querying local SQLite: {e}")

    # Fallback to local SQLite
    local_items = local_storage.list_outcomes(incident_id=incident_id, horizon=horizon, limit=limit)
    responses = []
    for item in local_items:
        created_str = item.get("created_at") or datetime.now().isoformat()
        try:
            created_dt = datetime.fromisoformat(created_str.replace("Z", "+00:00"))
        except Exception:
            created_dt = datetime.now()
            
        clearance_dt = None
        if item.get("actual_clearance_time"):
            try:
                clearance_dt = datetime.fromisoformat(item["actual_clearance_time"].replace("Z", "+00:00"))
            except Exception:
                pass

        responses.append(
            OutcomeResponse(
                id=item["id"],
                incident_id=item["incident_id"],
                horizon=OutcomeHorizon(item["horizon"]),
                actual_clearance_time=clearance_dt,
                observed_delay_hours=item["observed_delay_hours"],
                actual_price_spike_pct=item["actual_price_spike_pct"],
                verified_by=item["verified_by"],
                verification_source=VerificationSource(item["verification_source"]),
                notes=item.get("notes"),
                sync_status=item.get("sync_status", "pending"),
                created_at=created_dt
            )
        )
    return OutcomeListResponse(items=responses, total=len(responses))
