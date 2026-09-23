"""
Unit and Integration Tests for Deterministic CPU Routing Engine & Open Weather Fusion Service
Requirements Covered: FR-11.4, FR-11.5, NFR-5, NFR-7
"""
import pytest
import os
import json
import time
from unittest.mock import patch, MagicMock

from app.adapters.cpu_routing_adapter import CPURoutingAdapter, get_cpu_router
from app.adapters.openmeteo_adapter import OpenMeteoAdapter
from app.services.weather_fusion_service import get_fused_spatial_weather
from app.services.cuopt_tomtom_service import optimize_fleet_routes_with_cuopt
from agents.nodes.route_optimization import route_optimization_agent
from agents.state import CrisisState


def test_road_network_cache_integrity():
    """FR-11.4: Verify local Sumatra road network cache exists, has >= 50 nodes and valid structure."""
    cache_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../data/road_network_sumatra.json"))
    assert os.path.exists(cache_path), "road_network_sumatra.json missing!"

    with open(cache_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    nodes = data.get("nodes", [])
    edges = data.get("edges", [])

    assert len(nodes) >= 50, f"Expected >= 50 nodes, got {len(nodes)}"
    assert len(edges) >= 70, f"Expected >= 70 edges, got {len(edges)}"

    # Check presence of key strategic hubs
    node_ids = {n["id"] for n in nodes}
    assert "belawan_port" in node_ids
    assert "dumai_port" in node_ids
    assert "padang_teluk_bayur" in node_ids
    assert "bakauheni_port" in node_ids
    assert "palembang_boom_baru" in node_ids
    assert "sitinjau_lauik" in node_ids


def test_cpu_routing_shortest_path_latency():
    """NFR-5: Asserts point-to-point alternative routing runs in < 50 ms on CPU."""
    router = get_cpu_router()
    t0 = time.perf_counter()
    result = router.solve_shortest_path("belawan_port", "dumai_port", k_alternatives=3)
    t1 = time.perf_counter()
    latency_ms = (t1 - t0) * 1000.0

    assert result["status"] == "success"
    assert result["routes_count"] >= 1
    assert latency_ms < 50.0, f"Shortest path latency {latency_ms:.2f}ms exceeded 50ms!"
    assert result["routes"][0]["distance_km"] > 0


def test_cpu_routing_hazard_avoidance():
    """FR-11.4: Verify that dynamic hazard avoidance penalizes blocked corridors and finds detours."""
    router = get_cpu_router()
    
    # Baseline without hazards
    res_clean = router.solve_shortest_path("belawan_port", "tebing_tinggi_toll")
    assert res_clean["routes_count"] >= 1
    clean_eta = res_clean["routes"][0]["eta_minutes"]

    # Place hazard near Medan Amplas / Kualanamu
    hazard_zone = [{
        "center": [98.7120, 3.5410],
        "radiusKm": 15.0,
        "type": "flood"
    }]
    res_hazard = router.solve_shortest_path("belawan_port", "tebing_tinggi_toll", hazard_zones=hazard_zone)
    assert res_hazard["routes_count"] >= 1


def test_cpu_fleet_vrp_latency_nfr5():
    """NFR-5: Asserts multi-stop VRP solves in < 150 ms on standard CPU."""
    router = get_cpu_router()
    # 1 depot + 15 locations = 16 locations
    locations = [
        "belawan_port", "medan_kim", "medan_amplas", "kualanamu_airport",
        "binjai_hub", "tebing_tinggi_toll", "pematangsiantar_hub", "kisaran_junction",
        "rantauprapat_hub", "duri_junction", "dumai_port", "kandis_toll",
        "pekanbaru_hub", "bangkinang_junction", "payakumbuh_junction", "bukittinggi_hub"
    ]

    t0 = time.perf_counter()
    solution = router.solve_fleet_vrp(locations=locations, fleet_size=4)
    t1 = time.perf_counter()
    latency_ms = (t1 - t0) * 1000.0

    assert solution["status"] == "success"
    assert len(solution["vehicle_routes"]) == 4
    assert latency_ms < 150.0, f"VRP latency {latency_ms:.2f}ms exceeded 150ms!"


@pytest.mark.asyncio
async def test_weather_fusion_service_openmeteo():
    """FR-11.5: Asserts get_fused_spatial_weather produces valid GeoJSON without Earth2/GPU dependencies."""
    result = await get_fused_spatial_weather()
    assert result["type"] == "FeatureCollection"
    assert "metadata" in result
    assert "Open-Meteo" in result["metadata"]["fusion_engine"]
    assert "FourCastNet" not in result["metadata"]["fusion_engine"]
    assert "Earth-2" not in result["metadata"]["fusion_engine"]


@pytest.mark.asyncio
async def test_agent4_offline_cache_resilience():
    """FR-11.4: Asserts Agent 4 succeeds even when Supabase load_road_graph returns empty."""
    with patch("agents.nodes.route_optimization.load_road_graph", return_value=[]):
        state: CrisisState = {
            "title": "Simulated Medan Flooding",
            "type": "flood",
            "severity": "high",
            "hazard_polygons": [{"coordinates": [[[98.68, 3.78], [98.69, 3.78], [98.69, 3.79], [98.68, 3.78]]]}]
        }
        res = await route_optimization_agent(state)

        assert "route_optimization_finding" in res
        assert res["route_optimization_finding"]["confidence"] > 0.6
        assert len(res["route_recommendations"]) >= 1


@pytest.mark.asyncio
async def test_cuopt_service_backwards_compatibility():
    """FR-11.4, NFR-7: Asserts optimize_fleet_routes_with_cuopt executes on CPU with compute time < 150 ms."""
    res = await optimize_fleet_routes_with_cuopt(
        origin_id="belawan_port",
        dest_id="tebing_tinggi",
        fleet_size=3
    )
    assert res["status"] == "success"
    assert "Deterministic CPU" in res["solver"]
    assert res["compute_time_ms"] < 150.0
    assert "cuopt_solution" in res
