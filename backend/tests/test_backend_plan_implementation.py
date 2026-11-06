import asyncio
import math
import pytest
from unittest.mock import AsyncMock, patch

from app.services.observed_disaster_service import (
    calculate_disaster_radius_km,
    generate_circle_polygon,
    get_northern_sumatra_flood_zones,
    NORTHERN_SUMATRA_FLOOD_BASINS,
)
from app.adapters.tomtom_adapter import (
    get_cached_sumatra_traffic,
    CHECKPOINT_CORRIDOR_MAP,
    tomtom_incidents_enabled,
)
from app.services.telemetry_service import telemetry_service
from app.routers.routing_router import coalesce_background_refresh, _INFLIGHT_REFRESH
from app.adapters.cpu_routing_adapter import get_cpu_router
from scripts.seed_hitl_demo import _solve_cpu, SCENARIOS


def test_multi_source_disaster_radii_and_northern_sumatra_floods():
    # 1. Test earthquake radius scaling: 2^(M-4) * 10
    # M=4.0 -> 10 km
    assert calculate_disaster_radius_km("earthquake", magnitude=4.0) == 10.0
    # M=5.0 -> 20 km
    assert calculate_disaster_radius_km("earthquake", magnitude=5.0) == 20.0
    # M=6.0 -> 40 km
    assert calculate_disaster_radius_km("earthquake", magnitude=6.0) == 40.0

    # 2. Test flood radius calculation
    critical_flood_radius = calculate_disaster_radius_km("flood", severity="critical")
    assert 25.0 <= critical_flood_radius <= 40.0

    # 3. Test 32-point polygon generation
    center_lat, center_lon = 3.65, 98.68
    polygon = generate_circle_polygon(center_lat, center_lon, radius_km=20.0, num_points=32)
    assert polygon["type"] == "Polygon"
    coords = polygon["coordinates"][0]
    assert len(coords) == 33  # 32 unique points + 1 closing point
    assert coords[0] == coords[-1]  # closed loop

    # Verify points lie roughly at radius_km distance
    for pt in coords[:-1]:
        dlon = math.radians(pt[0] - center_lon)
        dlat = math.radians(pt[1] - center_lat)
        a = (math.sin(dlat / 2.0) ** 2
             + math.cos(math.radians(center_lat)) * math.cos(math.radians(pt[1])) * math.sin(dlon / 2.0) ** 2)
        dist = 6371.0 * 2.0 * math.atan2(math.sqrt(a), math.sqrt(max(0.0, 1.0 - a)))
        assert abs(dist - 20.0) < 1.0  # within 1 km tolerance

    # 4. Test Northern Sumatra flood crisis zones
    flood_zones = get_northern_sumatra_flood_zones()
    assert len(flood_zones) == len(NORTHERN_SUMATRA_FLOOD_BASINS)
    for zone in flood_zones:
        assert zone["hazard_type"] == "flood"
        assert zone["title"] == "Northern Sumatra floods"
        assert zone["radius_km"] >= 15.0
        assert zone["geometry"]["type"] == "Polygon"
        assert "center" in zone
        assert "lat" in zone["center"] and "lon" in zone["center"]
        assert "severity" in zone
        assert len(zone["impacted_corridors"]) > 0


def test_tomtom_cached_sumatra_traffic():
    assert tomtom_incidents_enabled() is True
    traffic = get_cached_sumatra_traffic()
    assert "corridors" in traffic
    assert "segments" in traffic
    assert len(traffic["corridors"]) == len(CHECKPOINT_CORRIDOR_MAP)
    assert "incidents" in traffic
    assert traffic["source"] in ("tomtom_corridor_flow", "tomtom_live", "sumatra_corridor_empirical_baseline")

    for corridor in traffic["corridors"]:
        assert "corridor_id" in corridor
        assert "current_speed_kmh" in corridor
        assert "free_flow_speed_kmh" in corridor
        assert "congestion_ratio" in corridor
        assert corridor["status"] in ("FLOWING", "MODERATE", "CONGESTED")
        assert corridor["congestion_level"] in ("low", "moderate", "heavy")


@pytest.mark.asyncio
async def test_single_flight_coalescing():
    call_count = 0
    _INFLIGHT_REFRESH.clear()

    async def mock_upstream_fetch():
        nonlocal call_count
        call_count += 1
        await asyncio.sleep(0.05)
        return {"fetched": True, "count": 42}

    # Simulate 5 concurrent callers requesting the same refresh key
    results = await asyncio.gather(
        coalesce_background_refresh("test_coalesce_key", mock_upstream_fetch),
        coalesce_background_refresh("test_coalesce_key", mock_upstream_fetch),
        coalesce_background_refresh("test_coalesce_key", mock_upstream_fetch),
        coalesce_background_refresh("test_coalesce_key", mock_upstream_fetch),
        coalesce_background_refresh("test_coalesce_key", mock_upstream_fetch),
    )

    # Only 1 upstream call should have executed!
    assert call_count == 1
    for r in results:
        assert r == {"fetched": True, "count": 42}


def test_plane_telemetry_corridor_persistence():
    # Aircraft with AIR-001 id (scheduled Sumatra cargo)
    raw_flight = {
        "vehicle_id": "AIR-001-KNO-CGK",
        "name": "Garuda Cargo GA-7101",
        "origin": "KNO",
        "destination": "CGK",
        "modality": "air",
        "speed_kmh": 650.0,
        "temperature_c": 4.0,
    }

    enriched = telemetry_service._enrich_air_cargo(raw_flight)
    assert enriched["tracking_mode"] == "LIVE_GPS"
    assert enriched["signal_status"] == "LIVE_STREAM"
    assert enriched["telemetry_source"] == "SUMATRA_AIR_CORRIDOR"
    assert "waypoints" in enriched and len(enriched["waypoints"]) >= 2
    assert "origin_coords" in enriched
    assert "dest_coords" in enriched


def test_cpu_routing_adapter_waypoints_and_detour():
    router = get_cpu_router()
    # Medan to Binjai
    origin = (98.6722, 3.5952)  # Medan
    dest = (98.4853, 3.6001)    # Binjai

    # Create a hazard zone directly blocking the primary route
    hazards = [{
        "center": [98.58, 3.598],
        "radiusKm": 10.0,
    }]

    result = router.solve_shortest_path(
        origin_coords=origin,
        dest_coords=dest,
        origin_name="Medan",
        dest_name="Binjai",
        hazard_zones=hazards,
        hazard_evidence_coverage="complete",
        k_alternatives=2,
    )

    routes = result.get("routes", [])
    assert len(routes) >= 1

    primary = routes[0]
    assert "waypoints" in primary
    assert len(primary["waypoints"]) > 0
    assert "lat" in primary["waypoints"][0] and "lon" in primary["waypoints"][0]
    assert "corridor_type" in primary

    # If alternative route exists, verify detour semantics
    if len(routes) > 1:
        alt = routes[1]
        assert "waypoints" in alt
        assert alt.get("corridor_type") == "detour"
        assert alt.get("viable") is True
        assert alt.get("safety_status") in ("SAFE_REROUTE", "CLEAR")


def test_seed_hitl_demo_preserves_all_routes():
    sc = SCENARIOS[0]
    cpu_route, cpu_distance, baseline_dist, all_routes = _solve_cpu(sc)
    assert isinstance(cpu_route, dict)
    assert cpu_distance > 0.0
    assert baseline_dist > 0.0
    assert isinstance(all_routes, list)
    assert len(all_routes) >= 1
    assert all_routes[0] == cpu_route
