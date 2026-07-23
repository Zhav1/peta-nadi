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

    # 3. Check historical_episodes.json fixture data
    try:
        fixture_path = Path(__file__).parent.parent / "fixtures" / "historical_episodes.json"
        if fixture_path.exists():
            with open(fixture_path, "r", encoding="utf-8") as f:
                fix_data = json.load(f)
                all_items = fix_data.get("historical_episodes", []) + fix_data.get("predictive_risks", [])
                for item in all_items:
                    item_id = item.get("incident_id") or item.get("risk_id")
                    if item_id == incident_id:
                        from app.services.llm_reasoning_service import generate_natural_incident_reasoning
                        reasoning = generate_natural_incident_reasoning(
                            incident_id=item_id,
                            title=item.get("title", "Disaster Episode"),
                            hazard_type=item.get("type", "flood"),
                            impact_summary=item.get("impact_summary", ""),
                            price_impact=item.get("price_lag_impact", "")
                        )
                        return {
                            "id": item_id,
                            "crisis_id": item_id,
                            "title": item.get("title", "Disaster Episode"),
                            "type": item.get("type", "flood"),
                            "status": item.get("status", "resolved"),
                            "severity": item.get("severity") or item.get("predicted_severity") or "high",
                            "overall_confidence": item.get("confidence", 0.95),
                            "confidence": item.get("confidence", 0.95),
                            "lat": item.get("lat", 3.58),
                            "lon": item.get("lon", 98.67),
                            "region": "North Sumatra Corridor",
                            "is_simulated": True,
                            "validated": True,
                            "created_at": datetime.now().isoformat(),
                            "route_recommendations": [],
                            "evidence": {
                                "cctv_label": f"CAM_{item.get('type', 'CRISIS').upper()}_LOG",
                                "osint_author": "@LogisticsWatcher_ID",
                                "osint_text": reasoning["osint_text"]
                            },
                            "decision_support_output": reasoning["decision_support_output"]
                        }
    except Exception as fix_err:
        logger.debug(f"Fixture lookup check failed: {fix_err}")

    # 4. Check Supabase DB
    try:
        from app.db.supabase_client import get_client
        sb = get_client()
        result = sb.table("incidents").select("*").eq("incident_id", incident_id).single().execute()
        if result.data:
            data = dict(result.data)
            data["id"] = data["incident_id"]
            data["crisis_id"] = data["incident_id"]
            return data
    except Exception as e:
        logger.debug(f"Supabase incident fetch failed: {e}")

    # Final fallback: synthesized crisis state with natural LLM reasoning
    from app.services.llm_reasoning_service import generate_natural_incident_reasoning
    title = f"Incident {incident_id.replace('-', ' ').title()}"
    hazard_type = "flood" if "banjir" in incident_id or "flood" in incident_id or "rob" in incident_id else "earthquake" if "gempa" in incident_id else "landslide" if "longsor" in incident_id else "congestion"
    reasoning = generate_natural_incident_reasoning(incident_id, title, hazard_type)

    return {
        "id": incident_id,
        "crisis_id": incident_id,
        "title": title,
        "type": hazard_type,
        "status": "resolved" if "hist" in incident_id else "predicting" if "pred" in incident_id else "validated",
        "severity": "high",
        "overall_confidence": 0.92,
        "confidence": 0.92,
        "lat": 3.58,
        "lon": 98.67,
        "region": "North Sumatra Corridor",
        "is_simulated": True,
        "validated": True,
        "created_at": datetime.now().isoformat(),
        "route_recommendations": [],
        "evidence": {
            "cctv_label": "CAM_SUMUT_MONITOR_01",
            "osint_author": "@LogisticsWatcher_ID",
            "osint_text": reasoning["osint_text"]
        },
        "decision_support_output": reasoning["decision_support_output"]
    }


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


@router.get("/historical/episodes")
async def get_historical_episodes():
    """Queries LTM historical disaster memory episodes (Supabase pgvector / dynamic memory) + AI synthesis."""
    import json
    from pathlib import Path
    
    # 1. Try querying Supabase ltm_episodes table / RPC
    try:
        from app.db.supabase_client import get_client
        sb = get_client()
        result = sb.table("ltm_episodes").select("*").order("created_at", desc=True).limit(10).execute()
        if result.data and len(result.data) > 0:
            episodes = []
            for row in result.data:
                episodes.append({
                    "incident_id": row.get("episode_id", f"hist-{uuid.uuid4()}"),
                    "title": row.get("title", "Historical Disaster Precedent"),
                    "type": row.get("crisis_type", "flood"),
                    "status": "historical",
                    "severity": "high",
                    "confidence": float(row.get("similarity_score", 0.92)),
                    "lat": float(row.get("lat", 3.58)),
                    "lon": float(row.get("lon", 98.68)),
                    "impact_summary": row.get("description", "Historical precedent retrieved from pgvector memory."),
                    "price_lag_impact": f"Harga pangan naik +{int(row.get('inflation_multiplier', 1.15) * 10 - 10)}% 3 hari pasca bencana.",
                    "geojson_geometry": row.get("geojson_geometry") or {
                        "type": "Feature",
                        "geometry": {
                            "type": "Polygon",
                            "coordinates": [[[98.60, 3.65], [98.76, 3.65], [98.76, 3.50], [98.60, 3.50], [98.60, 3.65]]]
                        },
                        "properties": {"hazard_type": row.get("crisis_type", "flood"), "severity_label": "HISTORICAL LTM RECOVERY"}
                    }
                })
            return {"items": episodes, "total": len(episodes)}
    except Exception as sb_err:
        logger.debug(f"Supabase LTM query fallback to dynamic synthesis: {sb_err}")

    # 2. Fallback to fixture data with full GeoJSON & AI impact correlations
    try:
        fixture_path = Path(__file__).parent.parent / "fixtures" / "historical_episodes.json"
        if fixture_path.exists():
            with open(fixture_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                return {"items": data.get("historical_episodes", []), "total": len(data.get("historical_episodes", []))}
    except Exception as e:
        logger.error(f"Failed to load historical episodes: {e}")
    return {"items": [], "total": 0}


@router.get("/predictive/risks")
async def get_predictive_risks():
    """Returns 24-48h TFT predictive bottleneck risk zones (FourCastNet + PIHPS Z-score)."""
    import json
    from pathlib import Path

    try:
        from app.db.supabase_client import get_client
        sb = get_client()
        result = sb.table("predictive_risks").select("*").limit(10).execute()
        if result.data and len(result.data) > 0:
            return {"items": result.data, "total": len(result.data)}
    except Exception as sb_err:
        logger.debug(f"Supabase predictive query fallback: {sb_err}")

    try:
        fixture_path = Path(__file__).parent.parent / "fixtures" / "historical_episodes.json"
        if fixture_path.exists():
            with open(fixture_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                return {"items": data.get("predictive_risks", []), "total": len(data.get("predictive_risks", []))}
    except Exception as e:
        logger.error(f"Failed to load predictive risks: {e}")
    return {"items": [], "total": 0}


@router.get("/osint/feed")
async def get_osint_feed():
    """Returns news & social reports captured by Lightpanda OSINT scraper daemon."""
    import json
    from pathlib import Path

    try:
        from app.db.supabase_client import get_client
        sb = get_client()
        result = sb.table("osint_feed").select("*").order("timestamp", desc=True).limit(20).execute()
        if result.data and len(result.data) > 0:
            return {"items": result.data, "total": len(result.data)}
    except Exception as sb_err:
        logger.debug(f"Supabase OSINT query fallback: {sb_err}")

    try:
        fixture_path = Path(__file__).parent.parent / "fixtures" / "historical_episodes.json"
        if fixture_path.exists():
            with open(fixture_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                return {"items": data.get("osint_reports", []), "total": len(data.get("osint_reports", []))}
    except Exception as e:
        logger.error(f"Failed to load OSINT reports: {e}")
    return {"items": [], "total": 0}


@router.get("/osint/live")
async def get_live_osint():
    """Returns live BMKG and social OSINT stream items enriched with organic GeoJSON geometry."""
    import json
    from app.services.redis_client import get_redis
    from app.services.incident_geometry_service import generate_incident_geometry

    events = []
    try:
        r = get_redis()
        raw_items = r.lrange("lrip:live_events", 0, 19)
        for raw in raw_items:
            ev = json.loads(raw)
            # Attach organic GeoJSON geometry
            geom = generate_incident_geometry(
                hazard_type=ev.get("event_type", "flood"),
                lat=float(ev.get("lat", 3.58)),
                lon=float(ev.get("lon", 98.67)),
                magnitude=float(ev.get("magnitude", 5.2))
            )
            ev["geojson_geometry"] = geom
            events.append(ev)
    except Exception as e:
        logger.debug(f"Redis live events query failed: {e}")

    # If Redis is empty, fall back to mock live events enriched with organic geometry
    if not events:
        events = [
            {
                "id": "live-bmkg-eq-1",
                "source": "bmkg",
                "event_type": "earthquake",
                "severity": "medium",
                "lat": 3.58,
                "lon": 98.62,
                "title": "M5.2 Earthquake - Sesar Tarutung-Toba",
                "ts": datetime.now().isoformat(),
                "geojson_geometry": generate_incident_geometry("earthquake", 3.58, 98.62, magnitude=5.2)
            },
            {
                "id": "live-social-flood-1",
                "source": "social",
                "event_type": "flood",
                "severity": "high",
                "lat": 3.78,
                "lon": 98.67,
                "title": "[TWITTER] Belawan Port Coastal Inundation Reported",
                "ts": datetime.now().isoformat(),
                "geojson_geometry": generate_incident_geometry("flood", 3.78, 98.67, water_depth_m=1.4)
            }
        ]

    return {"items": events, "total": len(events), "source": "redis_stm"}


@router.get("/adm-boundaries")
async def get_adm_boundaries():
    """Returns North Sumatra ADM2/ADM3 GeoJSON boundary polygons (Google Maps Style)."""
    from app.services.adm_boundary_service import get_adm_boundaries
    return get_adm_boundaries()




