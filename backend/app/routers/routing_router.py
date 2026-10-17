"""
FastAPI Router for CPU Routing Optimization, Weather Fusion Polygons & TomTom Traffic Flow
"""
import logging
from fastapi import APIRouter, Query, HTTPException, Body
from typing import Dict, Any, List, Optional
from pydantic import BaseModel

from app.services.weather_fusion_service import get_fused_spatial_weather
from app.services.cpu_routing_service import optimize_fleet_routes_cpu, CORRIDOR_JUNCTION_NODES
from app.adapters.cpu_routing_adapter import get_cpu_router
from app.adapters.tomtom_adapter import TomTomAdapter

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Routing Optimization & Spatial Telemetry"])


@router.get("/weather/spatial-polygons")
async def fetch_spatial_weather_polygons() -> Dict[str, Any]:
    """
    Returns GeoJSON multi-polygons combining BMKG station warnings + Open-Meteo Global NWP
    spatial weather predictions with data-driven rainfall_mm and flood_risk_pct.
    """
    try:
        return await get_fused_spatial_weather()
    except Exception as e:
        logger.error(f"Error fetching spatial weather polygons: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


class RoutingRequestPayload(BaseModel):
    origin_id: Optional[str] = "belawan_port"
    dest_id: Optional[str] = "tebing_tinggi"
    fleet_size: Optional[int] = 3
    hazard_zones: Optional[List[Dict[str, Any]]] = []
    origin_coords: Optional[List[float]] = None
    dest_coords: Optional[List[float]] = None
    origin_name: Optional[str] = None
    dest_name: Optional[str] = None
    k_alternatives: Optional[int] = 3


@router.post("/routing/optimize")
async def optimize_routing(payload: RoutingRequestPayload = Body(...)) -> Dict[str, Any]:
    """
    Invokes deterministic CPU routing solver (NetworkX + OR-Tools) using dynamic travel time matrices
    weighted by TomTom live speeds and BMKG/Open-Meteo hazard avoidance penalties.
    Also supports point-to-point shortest path calculation when origin_coords/dest_coords are provided.
    """
    try:
        result = await optimize_fleet_routes_cpu(
            origin_id=payload.origin_id or "belawan_port",
            dest_id=payload.dest_id or "tebing_tinggi",
            fleet_size=payload.fleet_size or 3,
            hazard_zones=payload.hazard_zones
        )
        if payload.origin_coords or payload.dest_coords or payload.origin_name or payload.dest_name:
            router_adapter = get_cpu_router()
            path_solution = router_adapter.solve_shortest_path(
                origin_id=payload.origin_id,
                dest_id=payload.dest_id,
                hazard_zones=payload.hazard_zones,
                k_alternatives=payload.k_alternatives or 3,
                origin_coords=payload.origin_coords,
                dest_coords=payload.dest_coords,
                origin_name=payload.origin_name,
                dest_name=payload.dest_name
            )
            result["point_to_point_path"] = path_solution
            result["routes"] = path_solution.get("routes", [])
        return result
    except Exception as e:
        logger.error(f"Error executing CPU routing optimization: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/routing/solve-path")
async def solve_routing_path(payload: RoutingRequestPayload = Body(...)) -> Dict[str, Any]:
    """
    Computes deterministic point-to-point shortest paths with dynamic hazard avoidance,
    supporting universal village geocoding coordinates (snaps to nearest road network node
    and connects with last-mile road connectors).
    """
    try:
        router_adapter = get_cpu_router()
        result = router_adapter.solve_shortest_path(
            origin_id=payload.origin_id,
            dest_id=payload.dest_id,
            hazard_zones=payload.hazard_zones,
            k_alternatives=payload.k_alternatives or 3,
            origin_coords=payload.origin_coords,
            dest_coords=payload.dest_coords,
            origin_name=payload.origin_name,
            dest_name=payload.dest_name
        )
        return result
    except Exception as e:
        logger.error(f"Error solving routing path: {e}", exc_info=True)
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
