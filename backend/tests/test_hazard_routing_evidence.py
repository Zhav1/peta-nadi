from datetime import UTC, datetime, timedelta
from typing import Any

import networkx as nx
import pytest

from agents.nodes.route_optimization import route_optimization_agent
from agents.tools import supabase_tools
from app.adapters.cpu_routing_adapter import CPURoutingAdapter
from app.services.cpu_routing_service import CORRIDOR_JUNCTION_NODES, _build_cost_matrix
from app.services.hazard_evidence import (
    HAZARD_EVIDENCE_VERSION,
    assess_route_hazards,
    normalize_hazard_evidence,
)

_NOW = datetime.now(UTC)
_ROUTE = [[98.0, 3.0], [99.0, 3.0]]
_CROSSING_POLYGON = {
    "type": "Polygon",
    "coordinates": [[[98.45, 2.9], [98.55, 2.9], [98.55, 3.1], [98.45, 3.1], [98.45, 2.9]]],
}


def _current_closure(**overrides):
    value = {
        "incident_id": "closure-001",
        "type": "road_closure",
        "status": "active",
        "source": "BPJT",
        "observed_at": _NOW.isoformat(),
        "geometry": _CROSSING_POLYGON,
        "geometry_provenance": "observed",
    }
    value.update(overrides)
    return value


def test_current_official_road_closure_with_observed_footprint_is_hard_blockage():
    evidence = normalize_hazard_evidence(_current_closure(), now=_NOW)
    assessment = assess_route_hazards(_ROUTE, [evidence], coverage_status="complete")

    assert evidence["version"] == HAZARD_EVIDENCE_VERSION
    assert evidence["classification"] == "CONFIRMED_BLOCKAGE"
    assert assessment["status"] == "BLOCKED"
    assert assessment["risk_score"] == 1.0


def test_current_official_report_point_blocks_only_the_grounded_point():
    evidence = normalize_hazard_evidence(
        {
            "incident_id": "official-point-001",
            "type": "road_closure",
            "status": "active",
            "source": "BPJT",
            "observed_at": _NOW.isoformat(),
            "lat": 3.0,
            "lon": 98.5,
        },
        now=_NOW,
    )
    blocked = assess_route_hazards(_ROUTE, [evidence], coverage_status="complete")
    clear = assess_route_hazards([[98.0, 3.2], [99.0, 3.2]], [evidence], coverage_status="complete")

    assert evidence["classification"] == "CONFIRMED_BLOCKAGE"
    assert blocked["status"] == "BLOCKED"
    assert clear["status"] == "CLEAR"


def test_current_unverified_report_point_is_precautionary_not_a_hard_block():
    evidence = normalize_hazard_evidence(
        {
            "incident_id": "report-point-001",
            "type": "road_closure",
            "status": "active",
            "source": "local_report",
            "observed_at": _NOW.isoformat(),
            "lat": 3.0,
            "lon": 98.5,
        },
        now=_NOW,
    )
    assessment = assess_route_hazards(_ROUTE, [evidence], coverage_status="complete")

    assert evidence["classification"] == "PRECAUTIONARY_RISK"
    assert evidence["reason"] == "current_report_point_without_official_or_corroborated_verification"
    assert assessment["status"] == "PRECAUTIONARY_RISK"
    assert assessment["clearance_status"] == "REVIEW"


def test_forecast_or_modeled_polygon_is_precautionary_only():
    forecast = _current_closure(
        incident_id="forecast-001",
        type="flood",
        source="weather_model",
        is_forecast=True,
        geometry_provenance="generated",
    )
    evidence = normalize_hazard_evidence(forecast, now=_NOW)
    assessment = assess_route_hazards(_ROUTE, [evidence], coverage_status="complete")

    assert evidence["classification"] == "PRECAUTIONARY_RISK"
    assert evidence["is_forecast"] is True
    assert assessment["status"] == "PRECAUTIONARY_RISK"
    assert assessment["status"] != "BLOCKED"


def test_stale_evidence_is_unknown_even_when_geometry_crosses_route():
    evidence = normalize_hazard_evidence(
        _current_closure(observed_at=(_NOW - timedelta(hours=8)).isoformat()), now=_NOW
    )
    assessment = assess_route_hazards(_ROUTE, [evidence], coverage_status="complete")

    assert evidence["classification"] == "UNKNOWN"
    assert assessment["status"] == "UNKNOWN"
    assert assessment["risk_score"] is None


def test_missing_footprint_cannot_turn_official_current_report_into_blockage():
    evidence = normalize_hazard_evidence(
        _current_closure(geometry=None, geometry_provenance=None, lat=None, lon=None), now=_NOW
    )

    assert evidence["classification"] == "UNKNOWN"
    assert evidence["point"] is None
    assert assess_route_hazards(_ROUTE, [evidence], coverage_status="complete")["status"] == "UNKNOWN"


@pytest.mark.asyncio
async def test_hazard_read_preserves_official_source_point_without_polygon(monkeypatch):
    row = {
        "id": "incident-row-001",
        "incident_id": "point-read-001",
        "title": "Road closure at source point",
        "type": "road_closure",
        "severity": "high",
        "status": "active",
        "lat": 3.0,
        "lon": 98.5,
        "affected_area": None,
        "evidence": {"source": "BPJT", "observed_at": _NOW.isoformat()},
    }

    class Query:
        def select(self, columns):
            return self

        def gte(self, *_args):
            return self

        def lte(self, *_args):
            return self

        def execute(self):
            return type("Response", (), {"data": [row]})()

    class Client:
        def table(self, _name):
            return Query()

    monkeypatch.setattr(supabase_tools, "get_client", lambda: Client())
    hazards = await supabase_tools.get_hazard_polygons(3.0, 98.5, degraded_sources=[])

    assert len(hazards) == 1
    assert hazards[0]["polygon"] is None
    assert hazards[0]["hazard_evidence"]["classification"] == "CONFIRMED_BLOCKAGE"
    assert hazards[0]["hazard_evidence"]["point"] == [98.5, 3.0]


def test_missing_evidence_or_incomplete_coverage_is_not_clear():
    assert assess_route_hazards(_ROUTE, [], coverage_status="unknown")["status"] == "UNKNOWN"
    assert assess_route_hazards(_ROUTE, [], coverage_status="complete")["status"] == "CLEAR"


@pytest.mark.asyncio
async def test_fleet_cost_matrix_uses_hard_exclusion_for_closure_and_penalty_for_forecast():
    speeds = {"Belawan Toll Gate": 40.0}
    first = CORRIDOR_JUNCTION_NODES[0]
    closure_point = {
        "incident_id": "fleet-closure-001",
        "type": "road_closure",
        "status": "active",
        "source": "BPJT",
        "observed_at": _NOW.isoformat(),
        "lat": first["lat"],
        "lon": first["lon"],
    }
    closed_matrix = _build_cost_matrix(speeds, [closure_point])
    forecast_point = {
        **closure_point,
        "incident_id": "fleet-forecast-001",
        "type": "flood",
        "source": "weather_model",
        "is_forecast": True,
    }
    baseline = _build_cost_matrix(speeds, None)
    forecast_matrix = _build_cost_matrix(speeds, [forecast_point])

    assert closed_matrix[0][1] == float("inf")
    assert forecast_matrix[0][1] > baseline[0][1]
    assert forecast_matrix[0][1] < float("inf")


@pytest.mark.asyncio
async def test_agent_hard_excludes_verified_closure_and_holds_when_no_alternative(monkeypatch):
    edges = [{
        "from_node": "a",
        "to_node": "b",
        "distance_km": 10.0,
        "base_weight": 1.0,
        "from_lat": 3.0,
        "from_lon": 98.0,
        "to_lat": 3.0,
        "to_lon": 99.0,
    }]
    async def load_edges():
        return edges

    monkeypatch.setattr("agents.nodes.route_optimization.load_road_graph", load_edges)
    state: Any = {
        "origin": "a",
        "destination": "b",
        "hazard_polygons": [_current_closure()],
        "degraded_sources": [],
        "messages": [],
    }
    result = await route_optimization_agent(state)

    assert result["route_recommendations"]
    assert not any(route.get("viable") for route in result["route_recommendations"])
    assert all(route.get("safety_status") == "HOLD_DELAY" for route in result["route_recommendations"])
    assert result["decision_status"] == "HOLD_DELAY"
    assert result["route_optimization_finding"]["data"]["status"] == "no_safe_route"


def test_cpu_router_penalizes_forecast_risk_without_excluding_edge():
    router = CPURoutingAdapter(cache_path="missing-local-test-fixture.json")
    graph = nx.DiGraph()
    graph.add_edge("a", "b", distance_km=10.0, base_speed_kmh=40.0, travel_time_min=15.0, weight=15.0)
    router.graph = graph
    router.nodes_dict = {
        "a": {"id": "a", "lat": 3.0, "lon": 98.0, "name": "A"},
        "b": {"id": "b", "lat": 3.0, "lon": 99.0, "name": "B"},
    }
    forecast = _current_closure(
        incident_id="forecast-edge-001",
        type="flood",
        source="weather_model",
        is_forecast=True,
        geometry_provenance="generated",
    )
    result = router.solve_shortest_path(
        "a", "b", hazard_zones=[forecast],
        hazard_evidence_coverage="complete", include_proof=False,
    )

    assert result["hard_excluded_edge_count"] == 0
    assert result["routes_count"] == 1
    assert result["routes"][0]["hazard_assessment"]["status"] == "PRECAUTIONARY_RISK"
    assert result["routes"][0]["viable"] is False


def test_cpu_router_removes_all_edges_intersecting_verified_closure():
    router = CPURoutingAdapter(cache_path="missing-local-test-fixture.json")
    graph = nx.DiGraph()
    graph.add_edge("a", "b", distance_km=10.0, base_speed_kmh=40.0, travel_time_min=15.0, weight=15.0)
    router.graph = graph
    router.nodes_dict = {
        "a": {"id": "a", "lat": 3.0, "lon": 98.0, "name": "A"},
        "b": {"id": "b", "lat": 3.0, "lon": 99.0, "name": "B"},
    }
    result = router.solve_shortest_path(
        "a", "b", hazard_zones=[_current_closure()],
        hazard_evidence_coverage="complete", include_proof=False,
    )

    assert result["hard_excluded_edge_count"] == 1
    assert result["routes"] == []
    assert result["decision_status"] == "HOLD_DELAY"
    assert result["safety_review_required"] is True
