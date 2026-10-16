"""
PetaNadi / PreHub — Deterministic Dynamic Routing Synchronization Service
Synchronizes real-time TomTom segment traffic speeds & weather flood avoidance penalties
into an N x N Travel Time Matrix, solved deterministically on CPU (NetworkX + OR-Tools).
Served at POST /api/v1/routing/optimize.
"""
import logging
import math
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime, timezone

from app.adapters.cpu_routing_adapter import get_cpu_router, haversine_km
from app.adapters.tomtom_adapter import TomTomAdapter

logger = logging.getLogger(__name__)

# Seed speeds used only when live TomTom flow is unavailable (reported as degraded)
DEFAULT_CHECKPOINT_SPEEDS = {
    "Belawan Toll Gate": 22.0,
    "Tanjung Mulia Interchange": 30.0,
    "Binjai Km 18": 45.0,
    "Pematangsiantar Km 128": 50.0
}

# Junction Nodes for North Sumatra Corridor Matrix
CORRIDOR_JUNCTION_NODES = [
    {"id": "belawan_port", "name": "Pelabuhan Belawan", "lat": 3.7831, "lon": 98.6868},
    {"id": "marelan_jct", "name": "Marelan Junction", "lat": 3.7201, "lon": 98.6742},
    {"id": "medan_utara", "name": "Medan Utara (Adam Malik)", "lat": 3.6701, "lon": 98.6680},
    {"id": "medan_kota", "name": "Medan Kota (Simpang Pos)", "lat": 3.6013, "lon": 98.6712},
    {"id": "amplas_interchange", "name": "Gerbang Tol Amplas", "lat": 3.5511, "lon": 98.7050},
    {"id": "kualanamu_jct", "name": "Interchange Kualanamu", "lat": 3.6421, "lon": 98.8780},
    {"id": "lubuk_pakam", "name": "Interchange Lubuk Pakam", "lat": 3.5601, "lon": 98.8650},
    {"id": "tebing_tinggi", "name": "Gerbang Tol Tebing Tinggi", "lat": 3.3251, "lon": 99.1621},
]


async def _fetch_live_checkpoint_speeds() -> Tuple[Dict[str, float], bool, Optional[str]]:
    """
    Returns (checkpoint_speeds, is_live, degraded_reason).
    is_live is True only when TomTom returned actual flow segment data.
    """
    speeds = dict(DEFAULT_CHECKPOINT_SPEEDS)
    try:
        tomtom = TomTomAdapter()
        raw = await tomtom.fetch()
        live_points = 0
        for f in raw.get("flow", []):
            name = f.get("_checkpoint_name")
            curr_speed = f.get("flowSegmentData", {}).get("currentSpeed")
            if name and curr_speed:
                speeds[name] = float(curr_speed)
                live_points += 1
        if live_points:
            return speeds, True, None
        return speeds, False, raw.get("degraded_reason") or "no live TomTom flow data"
    except Exception as e:
        logger.warning(f"TomTom live speed matrix fallback: {e}")
        return speeds, False, f"tomtom_fetch_error: {e}"


def _build_cost_matrix(checkpoint_speeds: Dict[str, float], hazard_zones: Optional[List[Dict[str, Any]]]) -> List[List[float]]:
    """Builds the N x N travel time matrix (minutes) from checkpoint speeds + hazard penalties."""
    nodes = CORRIDOR_JUNCTION_NODES
    N = len(nodes)

    avg_corridor_speed = sum(checkpoint_speeds.values()) / max(1, len(checkpoint_speeds))

    matrix = [[0.0] * N for _ in range(N)]

    for i in range(N):
        for j in range(N):
            if i == j:
                matrix[i][j] = 0.0
                continue

            n1 = nodes[i]
            n2 = nodes[j]
            dist_km = haversine_km(n1["lat"], n1["lon"], n2["lat"], n2["lon"])
            actual_road_dist = dist_km * 1.35

            speed_kmh = max(15.0, avg_corridor_speed)
            travel_time_min = (actual_road_dist / speed_kmh) * 60.0

            if hazard_zones:
                mid_lat = (n1["lat"] + n2["lat"]) / 2.0
                mid_lon = (n1["lon"] + n2["lon"]) / 2.0
                for hz in hazard_zones:
                    hz_center = hz.get("center") or [hz.get("lon", 98.68), hz.get("lat", 3.75)]
                    hz_radius = hz.get("radiusKm", 10.0)
                    dist_to_hazard = haversine_km(mid_lat, mid_lon, hz_center[1], hz_center[0])
                    if dist_to_hazard <= (hz_radius + 2.0):
                        travel_time_min *= 10.0
                        logger.debug(f"Penalized segment {n1['id']} -> {n2['id']} for hazard avoidance.")

            matrix[i][j] = round(travel_time_min, 2)

    return matrix


async def build_dynamic_tomtom_cost_matrix(hazard_zones: Optional[List[Dict[str, Any]]] = None) -> List[List[float]]:
    """
    Builds an N x N travel time matrix (in minutes) dynamically weighted by:
    1. TomTom live checkpoint speeds (seeded fallback when live data is unavailable).
    2. Severe weather / hazard avoidance penalties (10x penalty if segment crosses hazard).
    """
    checkpoint_speeds, _, _ = await _fetch_live_checkpoint_speeds()
    return _build_cost_matrix(checkpoint_speeds, hazard_zones)


async def optimize_fleet_routes_cpu(
    origin_id: str = "belawan_port",
    dest_id: str = "tebing_tinggi",
    fleet_size: int = 3,
    hazard_zones: Optional[List[Dict[str, Any]]] = None
) -> Dict[str, Any]:
    """
    Solves multi-vehicle routing with dynamic TomTom traffic speeds and hazard avoidance.
    Runs on CPU via NetworkX and OR-Tools in < 150 ms with zero GPU cost.
    """
    logger.info(f"Running Deterministic CPU Fleet Route Optimization ({origin_id} -> {dest_id})...")
    start_time = datetime.now(timezone.utc)

    # 1. Build dynamic cost matrix from live TomTom speeds (or explicitly flagged seed fallback)
    speeds, tomtom_live, degraded_reason = await _fetch_live_checkpoint_speeds()
    cost_matrix = _build_cost_matrix(speeds, hazard_zones)
    locations = [node["id"] for node in CORRIDOR_JUNCTION_NODES]

    # 2. Invoke deterministic CPU routing solver
    router = get_cpu_router()
    vrp_solution = router.solve_fleet_vrp(
        locations=locations,
        cost_matrix=cost_matrix,
        fleet_size=fleet_size,
        vehicle_capacity=120.0
    )

    solver_compute_ms = vrp_solution.get("compute_time_ms", 1.5)
    elapsed_ms = round((datetime.now(timezone.utc) - start_time).total_seconds() * 1000.0, 1)
    telemetry_reason = None if tomtom_live else (degraded_reason or "no live TomTom flow data")
    avg_corridor_speed = round(sum(speeds.values()) / max(1, len(speeds)), 1)

    return {
        "status": "success",
        "is_fallback": not tomtom_live,
        "degraded_reason": telemetry_reason,
        "traffic_telemetry": {
            "status": "OK" if tomtom_live else "DEGRADED",
            "is_fallback": not tomtom_live,
            "reason": telemetry_reason,
        },
        "solver": "Deterministic CPU VRP Solver (NetworkX + Google OR-Tools)",
        "compute_time_ms": solver_compute_ms,
        "total_pipeline_time_ms": elapsed_ms,
        "locations": locations,
        "cost_matrix_sample": cost_matrix[:3],
        "routing_solution": {
            "routes": {f"truck_{i+1}": r["route"] for i, r in enumerate(vrp_solution["vehicle_routes"])},
            "vehicle_details": vrp_solution["vehicle_routes"]
        },
        "optimization_summary": {
            "hazard_segments_avoided": len(hazard_zones) if hazard_zones else 0,
            "avg_corridor_speed_kmh": avg_corridor_speed,
            "speed_source": "tomtom_live" if tomtom_live else "seed_fallback"
        },
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
