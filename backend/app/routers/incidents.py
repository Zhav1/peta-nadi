import logging
from fastapi import APIRouter, HTTPException, Query
from typing import Optional
from pydantic import BaseModel
from datetime import datetime
import uuid
import asyncio

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/incidents", tags=["incidents"])


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
        
        # Map incident_id or id for IncidentResponse pydantic model
        for item in items:
            item_copy = dict(item)
            item_copy["id"] = item_copy.pop("incident_id", item_copy.get("id", ""))
            if "confidence" not in item_copy and "overall_confidence" in item_copy:
                item_copy["confidence"] = item_copy["overall_confidence"]
            # Avoid duplicates if already in demo items
            if any(x.id == item_copy["id"] for x in formatted_items):
                continue
            formatted_items.append(IncidentResponse(**item_copy))

    except Exception as e:
        logger.warning(f"Supabase unavailable: {e}")
        
    return IncidentListResponse(
        items=formatted_items,
        total=len(formatted_items),
    )


@router.get("/historical/episodes")
async def get_historical_episodes():
    """Returns curated historical disruption episodes for analogue matching."""
    episodes = [
        {
            "incident_id": "HIST-2024-01",
            "title": "Banjir Bandang Jalinsum Tebing Tinggi - Siantar",
            "type": "flood",
            "severity": "critical",
            "status": "historical",
            "region": "north_sumatra",
            "created_at": "2024-11-15T08:00:00Z",
            "lat": 3.3285,
            "lon": 99.1625,
            "confidence": 0.94,
            "impact_summary": "Genangan 110cm memutus jalur logistik 36 jam. Inflasi cabai merah +22.4%."
        },
        {
            "incident_id": "HIST-2024-02",
            "title": "Longsor Sitinjau Lauik KM 22 Padang - Solok",
            "type": "landslide",
            "severity": "high",
            "status": "historical",
            "region": "west_sumatra",
            "created_at": "2024-12-02T14:30:00Z",
            "lat": -0.9450,
            "lon": 100.5200,
            "confidence": 0.91,
            "impact_summary": "Tebing runtuh menutup 2 lajur. Truk sayur dialihkan via Malalak."
        },
        {
            "incident_id": "HIST-2025-01",
            "title": "Antrean Truk Sembako Pelabuhan Bakauheni Cuaca Buruk",
            "type": "port_queue",
            "severity": "high",
            "status": "historical",
            "region": "lampung",
            "created_at": "2025-01-20T06:00:00Z",
            "lat": -5.8711,
            "lon": 105.7533,
            "confidence": 0.96,
            "impact_summary": "Gelombang Selat Sunda 3.5m menahan 800+ truk logistik selama 18 jam."
        }
    ]
    return {"items": episodes, "total": len(episodes)}


@router.get("/predictive/risks")
async def get_predictive_risks():
    """Returns predictive climate and logistical risk forecasts."""
    risks = [
        {
            "id": "PRED-001",
            "title": "Peringatan Dini Cuaca Ekstrem Jalur Lintas Timur Palembang - Jambi",
            "type": "flood_risk",
            "severity": "high",
            "region": "south_sumatra",
            "lead_time_hours": 12.0,
            "probability": 0.82,
            "lat": -2.5500,
            "lon": 104.3500
        },
        {
            "id": "PRED-002",
            "title": "Potensi Gelombang Tinggi dan Hambatan Bongkar Muat Belawan",
            "type": "marine_risk",
            "severity": "medium",
            "region": "north_sumatra",
            "lead_time_hours": 24.0,
            "probability": 0.78,
            "lat": 3.7922,
            "lon": 98.6776
        }
    ]
    return {"items": risks, "total": len(risks)}


@router.get("/osint/feed")
@router.get("/osint/live")
async def get_osint_feed():
    """Returns real-time OSINT intelligence feed items."""
    try:
        from app.routers.news_router import get_live_news
        news_res = await get_live_news(force_refresh=False)
        articles = news_res.get("articles") or news_res.get("items") or []
        return {"items": articles, "total": len(articles)}
    except Exception as e:
        logger.warning(f"OSINT feed fallback: {e}")
        return {"items": [], "total": 0}


@router.get("/{incident_id}", response_model=dict)
async def get_incident(incident_id: str):
    """Get a single incident with full CrisisState detail."""
    # Check DEMO_STORE first
    try:
        from app.routers.demo_router import DEMO_STORE
        if incident_id in DEMO_STORE:
            # We return the crisis state associated with the current stage of the demo
            # to prevent showing future state early, or we can return the full state.
            # Let's return the full state because get_incident is called to open details on the sidebar.
            data = dict(DEMO_STORE[incident_id]["crisis_state"])
            data["id"] = data["crisis_id"]
            return data
    except Exception as demo_err:
        logger.debug(f"DEMO_STORE check failed: {demo_err}")

    try:
        from app.db.supabase_client import get_client
        sb = get_client()
        result = None
        try:
            result = sb.table("incidents").select("*").eq("incident_id", incident_id).single().execute()
        except Exception:
            pass
        if not result or not result.data:
            try:
                result = sb.table("incidents").select("*").eq("id", incident_id).single().execute()
            except Exception:
                pass

        if not result or not result.data:
            raise HTTPException(status_code=404, detail=f"Incident {incident_id} not found")
            
        data = dict(result.data)
        inc_id = data.get("incident_id") or data.get("id", incident_id)
        data["id"] = inc_id
        data["crisis_id"] = inc_id
        data["incident_id"] = inc_id
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
