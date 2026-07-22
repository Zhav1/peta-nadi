"""
FastAPI Router for NVIDIA cuOpt Optimization, Weather Fusion Polygons & TomTom Traffic Flow
"""
import logging
from fastapi import APIRouter, Query, HTTPException, Body
from typing import Dict, Any, List, Optional
from pydantic import BaseModel

from app.services.weather_fusion_service import get_fused_spatial_weather
from app.services.cuopt_tomtom_service import optimize_fleet_routes_with_cuopt, CORRIDOR_JUNCTION_NODES
from app.adapters.tomtom_adapter import TomTomAdapter

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Routing Optimization & Spatial Telemetry"])


@router.get("/weather/spatial-polygons")
async def fetch_spatial_weather_polygons() -> Dict[str, Any]:
    """
    Returns GeoJSON multi-polygons combining BMKG station warnings + NVIDIA FourCastNet (Earth-2)
    spatial weather predictions with data-driven rainfall_mm and flood_risk_pct.
    """
    try:
        return await get_fused_spatial_weather()
    except Exception as e:
        logger.error(f"Error fetching spatial weather polygons: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


class CuOptRequestPayload(BaseModel):
    origin_id: Optional[str] = "belawan_port"
    dest_id: Optional[str] = "tebing_tinggi"
    fleet_size: Optional[int] = 3
    hazard_zones: Optional[List[Dict[str, Any]]] = []


@router.post("/routing/optimize-cuopt")
async def optimize_cuopt_routing(payload: CuOptRequestPayload = Body(...)) -> Dict[str, Any]:
    """
    Invokes GPU-accelerated NVIDIA cuOpt VRP solver using dynamic travel time matrices
    weighted by TomTom live speeds and BMKG/FourCastNet hazard avoidance penalties.
    """
    try:
        result = await optimize_fleet_routes_with_cuopt(
            origin_id=payload.origin_id,
            dest_id=payload.dest_id,
            fleet_size=payload.fleet_size,
            hazard_zones=payload.hazard_zones
        )
        return result
    except Exception as e:
        logger.error(f"Error executing cuOpt routing optimization: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/traffic/flow-segments")
async def fetch_tomtom_flow_segments() -> Dict[str, Any]:
    """
    Returns live TomTom traffic flow checkpoints & active incidents for Mapbox segment coloring.
    """
    try:
        tomtom = TomTomAdapter()
        raw = await tomtom.fetch()
        events = await tomtom.parse(raw)
        
        segments = []
        for flow in raw.get("flow", []):
            cp_name = flow.get("_checkpoint_name")
            lat = flow.get("_lat")
            lon = flow.get("_lon")
            seg = flow.get("flowSegmentData", {})
            curr_speed = seg.get("currentSpeed", 30)
            free_speed = seg.get("freeFlowSpeed", 60)
            
            c_score = max(0.0, 1.0 - (curr_speed / free_speed)) if free_speed > 0 else 0.0
            level = "heavy" if c_score >= 0.6 else "moderate" if c_score >= 0.3 else "low"
            
            segments.append({
                "checkpoint": cp_name,
                "lat": lat,
                "lon": lon,
                "current_speed_kmh": curr_speed,
                "free_flow_speed_kmh": free_speed,
                "congestion_level": level,
                "delay_seconds": max(0, int((1.0 / max(5, curr_speed) - 1.0 / max(10, free_speed)) * 3600))
            })
            
        return {
            "segments": segments,
            "incidents": raw.get("incidents", []),
            "total_segments": len(segments),
            "total_incidents": len(raw.get("incidents", []))
        }
    except Exception as e:
        logger.error(f"Error fetching TomTom traffic flow segments: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
