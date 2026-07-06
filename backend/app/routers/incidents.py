from fastapi import APIRouter, HTTPException, Query
from typing import Optional
from pydantic import BaseModel
from datetime import datetime
import uuid

router = APIRouter(prefix="/incidents", tags=["incidents"])


class IncidentResponse(BaseModel):
    id: str
    title: str
    type: str
    severity: str
    status: str
    confidence: float
    created_at: datetime


class IncidentListResponse(BaseModel):
    items: list[IncidentResponse]
    total: int


@router.get("", response_model=IncidentListResponse)
async def list_incidents(
    status: Optional[str] = Query(None, description="Filter by status: unconfirmed, validating, validated, resolved"),
    severity: Optional[str] = Query(None, description="Filter by severity: low, medium, high, critical"),
    limit: int = Query(50, ge=1, le=200),
):
    """
    List all incidents with optional filters.
    Returns validated crisis events sorted by creation time (newest first).
    
    Phase 1+ will hydrate this from Supabase. Currently returns stub data.
    """
    # TODO: Phase 1 — query Supabase incidents table with PostGIS
    # Stub: return empty list during Phase 0
    return IncidentListResponse(items=[], total=0)


@router.get("/{incident_id}", response_model=IncidentResponse)
async def get_incident(incident_id: str):
    """
    Get a specific incident by ID including full evidence chain and recommendations.
    """
    # TODO: Phase 1 — hydrate from Supabase
    raise HTTPException(status_code=404, detail=f"Incident {incident_id} not found")


@router.post("/simulate")
async def simulate_incident(body: dict):
    """
    TheoTown endpoint: accepts a synthetic disaster polygon and triggers Crisis Mode.
    Phase 3+ will route this through the LangGraph agent swarm.
    """
    # TODO: Phase 3 — inject into Redis Streams and trigger agent pipeline
    return {
        "message": "Simulation queued (stub — implement in Phase 3)",
        "scenario_id": str(uuid.uuid4()),
    }
