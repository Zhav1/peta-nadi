import logging
from fastapi import APIRouter, HTTPException, Query
from typing import Optional, Dict, Any
from pydantic import BaseModel
from datetime import datetime
import uuid
import asyncio

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/incidents", tags=["incidents"])

BACKEND_SEED_INCIDENTS: Dict[str, Dict[str, Any]] = {
    "mock-past-1": {
        "incident_id": "mock-past-1",
        "title": "Belawan Toll Road Congestion",
        "type": "congestion",
        "is_simulated": True,
        "lat": 3.78,
        "lon": 98.67,
        "region": "north_sumatra",
        "status": "resolved",
        "severity": "medium",
        "overall_confidence": 0.9,
        "confidence": 0.9,
        "validated": True,
        "created_at": datetime.now(),
        "updated_at": datetime.now(),
        "messages": ["Baseline traffic flow metrics recovered."],
        "route_recommendations": [],
        "evidence": {
            "cctv_label": "CAM_BELAWAN_TOLL",
            "osint_text": "Toll road traffic cleared. Flow returned to baseline."
        }
    },
    "mock-past-2": {
        "incident_id": "mock-past-2",
        "title": "Medan Flood Level II",
        "type": "flood",
        "is_simulated": True,
        "lat": 3.61,
        "lon": 98.65,
        "region": "north_sumatra",
        "status": "resolved",
        "severity": "high",
        "overall_confidence": 0.95,
        "confidence": 0.95,
        "validated": True,
        "created_at": datetime.now(),
        "updated_at": datetime.now(),
        "messages": ["Hydrological water level cleared."],
        "route_recommendations": [],
        "evidence": {
            "cctv_label": "CAM_MEDAN_FLOOD",
            "osint_text": "Flood waters receded. Cleanup operations underway."
        }
    },
    "mock-earthquake-1": {
        "incident_id": "mock-earthquake-1",
        "title": "Gempa Tektonik M5.2 (Sesar Sumatra)",
        "type": "earthquake",
        "is_simulated": True,
        "lat": 3.45,
        "lon": 98.78,
        "region": "north_sumatra",
        "status": "resolved",
        "severity": "critical",
        "overall_confidence": 0.96,
        "confidence": 0.96,
        "validated": True,
        "created_at": datetime.now(),
        "updated_at": datetime.now(),
        "messages": ["BMKG TEWS alarm validated.", "Tectonic fault crack vector detected."],
        "route_recommendations": [],
        "evidence": {
            "cctv_label": "CAM_BMKG_SEISMIC",
            "osint_text": "Terdeteksi getaran gempa M5.2 kedalaman 10km di Sesar Sumatra. Jalur Trans-Sumatra terpantau aman."
        }
    },
    "mock-future-1": {
        "incident_id": "mock-future-1",
        "title": "Predicted High Rainfall (BMKG Warning)",
        "type": "flood",
        "is_simulated": True,
        "lat": 3.55,
        "lon": 98.72,
        "region": "north_sumatra",
        "status": "detecting",
        "severity": "medium",
        "overall_confidence": 0.72,
        "confidence": 0.72,
        "validated": False,
        "created_at": datetime.now(),
        "updated_at": datetime.now(),
        "messages": [],
        "route_recommendations": [],
        "evidence": {
            "cctv_label": "CAM_BMKG_RADAR",
            "osint_text": "Heavy rain warning issued for Deli Serdang coastal region."
        }
    },
    "mock-future-2": {
        "incident_id": "mock-future-2",
        "title": "Expected Toll Delay near Binjai",
        "type": "congestion",
        "is_simulated": True,
        "lat": 3.65,
        "lon": 98.58,
        "region": "north_sumatra",
        "status": "validating",
        "severity": "low",
        "overall_confidence": 0.68,
        "confidence": 0.68,
        "validated": False,
        "created_at": datetime.now(),
        "updated_at": datetime.now(),
        "messages": [],
        "route_recommendations": [],
        "evidence": {
            "cctv_label": "CAM_BINJAI_GATE",
            "osint_text": "Slow moving traffic detected near Binjai toll gate."
        }
    },
    "mock-predict-1": {
        "incident_id": "mock-predict-1",
        "title": "Inflation Spike Alert: Rice Stock Depletion",
        "type": "port_closure",
        "is_simulated": True,
        "lat": 3.79,
        "lon": 98.68,
        "region": "north_sumatra",
        "status": "predicting",
        "severity": "critical",
        "overall_confidence": 0.88,
        "confidence": 0.88,
        "validated": True,
        "created_at": datetime.now(),
        "updated_at": datetime.now(),
        "messages": [],
        "route_recommendations": [],
        "evidence": {
            "cctv_label": "CAM_PORT_BELAWAN_01",
            "osint_text": "Anomali pasokan beras di Pelabuhan Belawan memicu risiko lonjakan harga di pasar Medan."
        }
    }
}


class IncidentResponse(BaseModel):
    id: str
    title: str
    type: str
    severity: str
    status: str
    confidence: float
    lat: Optional[float] = None
    lon: Optional[float] = None
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
    List incidents from Supabase, sorted newest-first.
    Falls back to empty list if Supabase is unavailable (offline demo safety).
    Includes in-memory demo incidents.
    """
    formatted_items = []
    
    # First get from DEMO_STORE if available
    try:
        from app.routers.demo_router import DEMO_STORE
        for cid, run in DEMO_STORE.items():
            full_state = run["crisis_state"]
            # Apply filters
            if status and full_state.get("status") != status:
                continue
            if severity and full_state.get("data_collection_finding", {}).get("severity", "high") != severity:
                continue
                
            formatted_items.append(IncidentResponse(
                id=cid,
                title=full_state.get("title", "Demo Incident"),
                type=full_state.get("type", "flood"),
                severity=full_state.get("data_collection_finding", {}).get("severity", "high") if isinstance(full_state.get("data_collection_finding"), dict) else "high",
                status=full_state.get("status", "validated"),
                confidence=full_state.get("overall_confidence", 0.91),
                lat=full_state.get("lat"),
                lon=full_state.get("lon"),
                created_at=full_state.get("created_at") or datetime.now()
            ))
    except Exception as demo_err:
        logger.debug(f"DEMO_STORE not imported or empty: {demo_err}")

    # Append backend seeded incidents to dynamic list
    for cid, val in BACKEND_SEED_INCIDENTS.items():
        if status and val.get("status") != status:
            continue
        if severity and val.get("severity") != severity:
            continue
        if any(x.id == cid for x in formatted_items):
            continue
        formatted_items.append(IncidentResponse(
            id=cid,
            title=val["title"],
            type=val["type"],
            severity=val["severity"],
            status=val["status"],
            confidence=val["overall_confidence"],
            lat=val["lat"],
            lon=val["lon"],
            created_at=val["created_at"]
        ))

    try:
        from app.db.supabase_client import get_client
        sb = get_client()
        query = sb.table("incidents").select(
            "incident_id, title, type, severity, status, confidence, created_at, lat, lon"
        ).order("created_at", desc=True).limit(limit)
        
        if status:
            query = query.eq("status", status)
        if severity:
            query = query.eq("severity", severity)
            
        result = query.execute()
        items = result.data or []
        
        # Map incident_id to id for IncidentResponse pydantic model
        for item in items:
            item_copy = dict(item)
            item_copy["id"] = item_copy.pop("incident_id")
            # Avoid duplicates if already in demo or seeded items
            if any(x.id == item_copy["id"] for x in formatted_items):
                continue
            formatted_items.append(IncidentResponse(**item_copy))

    except Exception as e:
        logger.warning(f"Supabase unavailable: {e}")
        
    return IncidentListResponse(
        items=formatted_items,
        total=len(formatted_items),
    )


@router.get("/{incident_id}", response_model=dict)
async def get_incident(incident_id: str):
    """Get a single incident with full CrisisState detail."""
    # 1. Check BACKEND_SEED_INCIDENTS first
    if incident_id in BACKEND_SEED_INCIDENTS:
        data = dict(BACKEND_SEED_INCIDENTS[incident_id])
        data["id"] = data["incident_id"]
        data["crisis_id"] = data["incident_id"]
        if isinstance(data.get("created_at"), datetime):
            data["created_at"] = data["created_at"].isoformat()
        if isinstance(data.get("updated_at"), datetime):
            data["updated_at"] = data["updated_at"].isoformat()
        return data

    # 2. Check DEMO_STORE next
    try:
        from app.routers.demo_router import DEMO_STORE
        if incident_id in DEMO_STORE:
            data = dict(DEMO_STORE[incident_id]["crisis_state"])
            data["id"] = data["crisis_id"]
            return data
    except Exception as demo_err:
        logger.debug(f"DEMO_STORE check failed: {demo_err}")

    try:
        from app.db.supabase_client import get_client
        sb = get_client()
        result = sb.table("incidents").select("*").eq("incident_id", incident_id).single().execute()
        if not result.data:
            raise HTTPException(status_code=404, detail=f"Incident {incident_id} not found")
            
        data = dict(result.data)
        data["id"] = data["incident_id"]
        data["crisis_id"] = data["incident_id"]
        return data
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to fetch incident {incident_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/simulate")
async def simulate_incident(body: dict):
    """
    TheoTown: accepts a GeoJSON polygon and triggers Crisis Mode via the agent swarm.
    Injects a synthetic crisis event into Redis Streams and runs the LangGraph pipeline.
    """
    try:
        from app.workers.agent_worker import run_crisis_event
        
        polygon = body.get("polygon", [])
        crisis_type = body.get("type", "flood")
        region = body.get("region", "north_sumatra")
        
        # Derive centroid from polygon for lat/lon
        if polygon:
            lons = [p[0] for p in polygon]
            lats = [p[1] for p in polygon]
            lat = sum(lats) / len(lats)
            lon = sum(lons) / len(lons)
        else:
            lat, lon = 3.79, 98.67  # Belawan default
        
        scenario_id = str(uuid.uuid4())
        event = {
            "type": crisis_type,
            "source": "simulation",
            "severity": "high",
            "lat": lat,
            "lon": lon,
            "region": region,
            "title": f"[Simulated] {crisis_type.replace('_', ' ').title()} — {region.replace('_', ' ').title()}",
            "is_simulated": True,
            "crisis_id": scenario_id,
            "affected_polygon": polygon,
        }
        
        # Fire-and-forget: run swarm asynchronously
        asyncio.create_task(run_crisis_event(event))
        
        return {"scenario_id": scenario_id, "message": "Simulation pipeline triggered"}
    except Exception as e:
        logger.error(f"Simulation failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
