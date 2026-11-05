"""
PetaNadi / PreHub : Deterministic Dynamic Routing Synchronization Service
Synchronizes real-time TomTom segment traffic speeds & weather flood avoidance penalties
into an N x N Travel Time Matrix, solved deterministically on CPU (NetworkX + OR-Tools).
Served at POST /api/v1/routing/optimize.
"""
import logging
import math
import json
import time
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime, timezone

from app.adapters.cpu_routing_adapter import get_cpu_router, haversine_km
from app.adapters.tomtom_adapter import TomTomAdapter, read_cached_flow_items
from app.services.hazard_evidence import (
    HAZARD_EVIDENCE_VERSION,
    assess_route_hazards,
    normalize_hazard_evidence,
    route_intersects_geometry,
    route_intersects_point,
)

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

    Cache share: reuse fresh lrip:tomtom:segment:* from the main poller when
    fresh (<TOMTOM_POLL_SECONDS, default 1800s); only fresh fetch() on cache
    miss. Falls back to seeds when cache empty and fetch yields nothing.
    """
    speeds = dict(DEFAULT_CHECKPOINT_SPEEDS)
    try:
        try:
            cached = read_cached_flow_items()
            if cached and cached.get("flow"):
                live_points = 0
                for f in cached["flow"]:
                    name = f.get("_checkpoint_name")
                    curr_speed = f.get("flowSegmentData", {}).get("currentSpeed")
                    if name and curr_speed:
                        speeds[name] = float(curr_speed)
                        live_points += 1
                if live_points:
                    return speeds, True, None
        except Exception as e:
            logger.debug(f"TomTom shared-cache bypass (routing): {e}")
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
    """Build a CPU travel-time matrix; only verified footprints can remove an edge."""
    nodes = CORRIDOR_JUNCTION_NODES
    N = len(nodes)

    avg_corridor_speed = sum(checkpoint_speeds.values()) / max(1, len(checkpoint_speeds))
    normalized_hazards = [
        normalize_hazard_evidence(hz)
        for hz in (hazard_zones or []) if isinstance(hz, dict)
    ]

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

            edge_coords = [[n1["lon"], n1["lat"]], [n2["lon"], n2["lat"]]]
            for evidence in normalized_hazards:
                intersects = route_intersects_geometry(edge_coords, evidence.get("geometry"))
                point = evidence.get("point")
                if not intersects and point:
                    intersects = route_intersects_point(edge_coords, point)
                radius = evidence.get("radius_km")
                center = evidence.get("risk_center") or point
                if not intersects and center and evidence.get("classification") == "PRECAUTIONARY_RISK":
                    intersects = route_intersects_point(edge_coords, center)
                if not intersects and radius and center:
                    center_lat, center_lon = float(center[1]), float(center[0])
                    dist_mid = haversine_km((n1["lat"] + n2["lat"]) / 2.0, (n1["lon"] + n2["lon"]) / 2.0, center_lat, center_lon)
                    dist_n1 = haversine_km(n1["lat"], n1["lon"], center_lat, center_lon)
                    dist_n2 = haversine_km(n2["lat"], n2["lon"], center_lat, center_lon)
                    intersects = min(dist_mid, dist_n1, dist_n2) <= radius
                if not intersects:
                    continue
                if evidence.get("classification") == "CONFIRMED_BLOCKAGE":
                    travel_time_min = math.inf
                    break
                # Unverified, stale, modeled and forecast inputs can influence
                # relative cost, but never become a closure or a guessed-radius block.
                travel_time_min *= 3.0 if evidence.get("classification") == "PRECAUTIONARY_RISK" else 1.5

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
    hazard_zones: Optional[List[Dict[str, Any]]] = None,
    hazard_evidence_coverage: str = "unknown",
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
    normalized_hazards = [
        normalize_hazard_evidence(hz)
        for hz in (hazard_zones or []) if isinstance(hz, dict)
    ]

    # 2. Invoke deterministic CPU routing solver
    router = get_cpu_router()
    vrp_solution = router.solve_fleet_vrp(
        locations=locations,
        cost_matrix=cost_matrix,
        fleet_size=fleet_size,
        vehicle_capacity=120.0
    )

    node_by_id = {node["id"]: node for node in CORRIDOR_JUNCTION_NODES}
    checked_vehicle_routes = []
    for vehicle_route in vrp_solution.get("vehicle_routes", []):
        route_nodes = vehicle_route.get("route") or []
        route_coords = [
            [node_by_id[node]["lon"], node_by_id[node]["lat"]]
            for node in route_nodes if node in node_by_id
        ]
        assessment = assess_route_hazards(
            route_coords, normalized_hazards, coverage_status=hazard_evidence_coverage
        )
        has_unavailable_edge = any(
            not math.isfinite(cost_matrix[locations.index(a)][locations.index(b)])
            for a, b in zip(route_nodes, route_nodes[1:])
            if a in locations and b in locations
        )
        if has_unavailable_edge or assessment["status"] == "BLOCKED":
            continue
        vehicle_route["hazard_assessment"] = assessment
        vehicle_route["viable"] = assessment["status"] == "CLEAR"
        checked_vehicle_routes.append(vehicle_route)
    no_safe_route = not checked_vehicle_routes or not any(route.get("viable") for route in checked_vehicle_routes)
    degraded_sources = []
    if hazard_evidence_coverage not in {"complete", "verified_complete"}:
        degraded_sources.append("hazard_coverage_unknown")
    if any(item.get("classification") == "UNKNOWN" for item in normalized_hazards):
        degraded_sources.append("hazard_evidence_unknown")
    solver_compute_ms = vrp_solution.get("compute_time_ms")
    elapsed_ms = round((datetime.now(timezone.utc) - start_time).total_seconds() * 1000.0, 1)
    if solver_compute_ms is None:
        # Honest fallback: solver did not report timing, use measured wall time.
        solver_compute_ms = elapsed_ms
    telemetry_reason = None if tomtom_live else (degraded_reason or "no live TomTom flow data")
    avg_corridor_speed = round(sum(speeds.values()) / max(1, len(speeds)), 1)

    return {
        "status": "no_safe_route" if no_safe_route else "success",
        "decision_status": "HOLD_DELAY" if no_safe_route else "SAFE_ROUTE_AVAILABLE",
        "safety_review_required": no_safe_route,
        "degraded_sources": degraded_sources,
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
        "cost_matrix_sample": [
            [value if math.isfinite(value) else None for value in row]
            for row in cost_matrix[:3]
        ],
        "routing_solution": {
            "routes": {f"truck_{i+1}": r["route"] for i, r in enumerate(checked_vehicle_routes)},
            "vehicle_details": checked_vehicle_routes
        },
        "hazard_evidence_version": HAZARD_EVIDENCE_VERSION,
        "hazard_evidence": normalized_hazards,
        "optimization_summary": {
            "hazard_segments_avoided": sum(
                1 for row in cost_matrix for value in row if not math.isfinite(value)
            ),
            "avg_corridor_speed_kmh": avg_corridor_speed,
            "speed_source": "tomtom_live" if tomtom_live else "seed_fallback",
            # No honest baseline exists for % savings (no free-flow reference run),
            # so these stay null and the HUD hides the savings pill. Do NOT
            # reintroduce fabricated literals (e.g. 18.5 / 14.2).
            "travel_time_savings_pct": None,
            "fuel_cost_reduction_pct": None
        },
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
