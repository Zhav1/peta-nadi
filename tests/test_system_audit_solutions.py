"""
System audit & solutions - automated regression tests.

Verifies:
1. Alias normalization in agents/nodes/route_optimization.py
   (belawan -> belawan_port, tebingtinggi -> tebing_tinggi_toll,
   siantar -> pematangsiantar_hub, ...)
2. Backend demo router mounting at POST /api/demo/start
   (plus backward-compatible /demo/start).
3. /api/v1/health/sources returns 'healthy' for every source when the
   DB is empty or unreachable.
4. Mathematical (haversine) verification that every detour waypoint in
   data/fixtures/mock_crisis_state.json and the useDemoState.ts offline
   bypass lies outside the 15 km Lubuk Pakam flood circle centered at
   (lon 98.87, lat 3.56).
"""
import json
import math
import re
import sys
from pathlib import Path

import pytest
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
for _path in (str(BACKEND), str(ROOT)):
    if _path not in sys.path:
        sys.path.insert(0, _path)

from agents.nodes.route_optimization import (  # noqa: E402
    ALIAS_MAP,
    _NORMALIZED_ALIAS_MAP,
    _normalize_node_key,
    _resolve_network_node,
)
from app.main import app  # noqa: E402

client = TestClient(app)

FIXTURE_PATH = ROOT / "data" / "fixtures" / "mock_crisis_state.json"
ROAD_NETWORK_PATH = ROOT / "data" / "road_network_sumatra.json"
USE_DEMO_STATE_PATH = ROOT / "frontend" / "hooks" / "useDemoState.ts"

FLOOD_CENTER = (3.56, 98.87)  # (lat, lon) - Lubuk Pakam, Deli Serdang
FLOOD_RADIUS_KM = 15.0


def _road_graph_node_lookup():
    data = json.loads(ROAD_NETWORK_PATH.read_text(encoding="utf-8-sig"))
    return {node["id"].lower(): node["id"] for node in data["nodes"]}


def haversine_km(lat1, lon1, lat2, lon2):
    r_earth = 6371.0088
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return 2 * r_earth * math.asin(math.sqrt(a))


def flood_circle_distance_km(lat, lon):
    return haversine_km(lat, lon, FLOOD_CENTER[0], FLOOD_CENTER[1])


def _parse_use_demo_state_offline_waypoints():
    source = USE_DEMO_STATE_PATH.read_text(encoding="utf-8")
    anchor = source.index("offline-bypass-pesisir")
    wp_open = source.index("waypoints: [", anchor)
    wp_close = source.index("]", wp_open)
    block = source[wp_open:wp_close]
    pairs = re.findall(r"lat:\s*(-?\d+(?:\.\d+)?)\s*,\s*lon:\s*(-?\d+(?:\.\d+)?)", block)
    return [(float(lat), float(lon)) for lat, lon in pairs]


def _fixture_waypoint_params():
    fixture = json.loads(FIXTURE_PATH.read_text(encoding="utf-8-sig"))
    params = []
    for route in fixture.get("route_recommendations", []):
        for idx, wp in enumerate(route.get("waypoints", [])):
            params.append(
                pytest.param(
                    route["id"], idx, float(wp["lat"]), float(wp["lon"]),
                    id="{0}-wp{1}".format(route["id"], idx),
                )
            )
    return params


class TestAliasNormalization:
    def test_alias_map_core_mappings(self):
        expected = {
            "belawan": "belawan_port",
            "belawan port": "belawan_port",
            "medan": "medan_kim",
            "medan kim": "medan_kim",
            "tebingtinggi": "tebing_tinggi_hub",
            "tebing tinggi": "tebing_tinggi_hub",
            "siantar": "siantar_hub",
            "pematang siantar": "siantar_hub",
            "pematangsiantar": "siantar_hub",
            "dumai": "dumai_port",
            "bakauheni": "bakauheni_port",
        }
        for raw_key, canonical in expected.items():
            assert raw_key in ALIAS_MAP
            assert ALIAS_MAP[raw_key] == canonical

    def test_normalized_alias_map_is_derived_from_alias_map(self):
        assert _NORMALIZED_ALIAS_MAP == {
            _normalize_node_key(k): v for k, v in ALIAS_MAP.items()
        }

    @pytest.mark.parametrize(
        "raw,expected",
        [
            ("Belawan", "belawan"),
            ("  BELAWAN PORT  ", "belawan_port"),
            ("Tebing-Tinggi", "tebing_tinggi"),
            ("Tebing Tinggi", "tebing_tinggi"),
            ("PematangSiantar", "pematangsiantar"),
            ("Pematang Siantar", "pematang_siantar"),
            ("Dumai Port", "dumai_port"),
            (None, ""),
            ("", ""),
            ("   ", ""),
        ],
    )
    def test_normalize_node_key(self, raw, expected):
        assert _normalize_node_key(raw) == expected

    def test_resolve_against_real_road_graph(self):
        node_lookup = _road_graph_node_lookup()
        assert _resolve_network_node("belawan", node_lookup) == "belawan_port"
        assert _resolve_network_node("Belawan Port", node_lookup) == "belawan_port"
        assert _resolve_network_node("medan", node_lookup) == "medan_kim"
        assert _resolve_network_node("MEDAN-KIM", node_lookup) == "medan_kim"
        assert _resolve_network_node("tebingtinggi", node_lookup) == "tebing_tinggi_toll"
        assert _resolve_network_node("tebing tinggi", node_lookup) == "tebing_tinggi_toll"
        assert _resolve_network_node("Tebing-Tinggi", node_lookup) == "tebing_tinggi_toll"
        assert _resolve_network_node("siantar", node_lookup) == "pematangsiantar_hub"
        assert _resolve_network_node("Pematangsiantar", node_lookup) == "pematangsiantar_hub"
        assert _resolve_network_node("pematang siantar", node_lookup) == "pematangsiantar_hub"
        assert _resolve_network_node("dumai", node_lookup) == "dumai_port"
        assert _resolve_network_node("bakauheni", node_lookup) == "bakauheni_port"

    def test_resolve_canonical_ids_passthrough(self):
        node_lookup = _road_graph_node_lookup()
        assert _resolve_network_node("tebing_tinggi_toll", node_lookup) == "tebing_tinggi_toll"
        assert _resolve_network_node("belawan_port", node_lookup) == "belawan_port"

    def test_resolve_unknown_and_empty_inputs(self):
        node_lookup = _road_graph_node_lookup()
        assert _resolve_network_node("atlantis_terminal", node_lookup) is None
        assert _resolve_network_node(None, node_lookup) is None
        assert _resolve_network_node("", node_lookup) is None
        assert _resolve_network_node("   ", node_lookup) is None


class TestDemoRouterMounting:
    def _api_routes(self):
        return {route.path: route for route in app.routes if isinstance(route, APIRoute)}

    def test_demo_start_mounted_at_api_prefix(self):
        route = self._api_routes()["/api/demo/start"]
        assert "POST" in route.methods

    def test_demo_start_backward_compat_mount_without_prefix(self):
        route = self._api_routes()["/demo/start"]
        assert "POST" in route.methods

    def test_demo_start_returns_initial_stage(self, monkeypatch):
        monkeypatch.chdir(ROOT)
        res = client.post("/api/demo/start", json={"mock_agents": True, "offline": True})
        assert res.status_code == 200
        data = res.json()
        assert data["crisis_id"].startswith("belawan-demo-")
        assert data["stage"] == 0
        assert data["total_stages"] == 5

        status = client.get("/api/demo/status/{0}".format(data["crisis_id"]))
        assert status.status_code == 200
        crisis_state = status.json()["crisis_state"]
        assert crisis_state["crisis_id"] == data["crisis_id"]
        assert crisis_state["title"] == "Belawan Port Blockage & Trans-Sumatra Flooding"


class TestHealthSourceStatus:
    @staticmethod
    def _patch_supabase(monkeypatch, rows):
        import app.db.supabase_client as sb_client_module

        class FakeResult:
            data = rows

        class FakeQuery:
            def select(self, *args, **kwargs):
                return self

            def execute(self):
                return FakeResult()

        class FakeClient:
            def table(self, name):
                return FakeQuery()

        monkeypatch.setattr(sb_client_module, "get_client", lambda: FakeClient())

    def test_source_health_with_empty_db(self, monkeypatch):
        self._patch_supabase(monkeypatch, [])
        res = client.get("/api/v1/health/sources")
        assert res.status_code == 200
        sources = res.json()["sources"]
        by_name = {source["name"]: source for source in sources}
        assert set(by_name) == {"BMKG", "TomTom", "AISstream", "NASA FIRMS"}
        for source in sources:
            assert source["status"] == "healthy"
            assert source["note"] == "verified_active_adapter"
            assert source["last_seen"] is None

    def test_source_health_when_supabase_unreachable(self, monkeypatch):
        import app.db.supabase_client as sb_client_module

        def _raise():
            raise RuntimeError("Supabase down")

        monkeypatch.setattr(sb_client_module, "get_client", _raise)
        res = client.get("/api/v1/health/sources")
        assert res.status_code == 200
        sources = res.json()["sources"]
        expected_names = {"BMKG", "TomTom", "AISstream", "NASA FIRMS"}
        assert {source["name"] for source in sources} == expected_names
        assert all(source["status"] == "healthy" for source in sources)


class TestLubukPakamFloodCircleDetours:
    def test_flood_circle_definition_is_geometrically_sound(self):
        assert flood_circle_distance_km(*FLOOD_CENTER) == pytest.approx(0.0, abs=1e-9)
        assert flood_circle_distance_km(3.56 + 15.0 / 111.195, 98.87) == pytest.approx(15.0, rel=0.02)

    @pytest.mark.parametrize("route_id,wp_idx,lat,lon", _fixture_waypoint_params())
    def test_fixture_waypoint_outside_flood_circle(self, route_id, wp_idx, lat, lon):
        distance = flood_circle_distance_km(lat, lon)
        assert distance > FLOOD_RADIUS_KM, (
            "Waypoint #{0} of {1} at ({2}, {3}) is only {4:.2f} km from the "
            "Lubuk Pakam flood center (limit {5} km)".format(
                wp_idx, route_id, lat, lon, distance, FLOOD_RADIUS_KM
            )
        )

    def test_fixture_routes_are_safe_detours(self):
        fixture = json.loads(FIXTURE_PATH.read_text(encoding="utf-8-sig"))
        routes = fixture["route_recommendations"]
        assert [route["id"] for route in routes] == [
            "route-opt-coastal-bypass",
            "route-opt-inland-bypass",
        ]
        for route in routes:
            assert route["safety_status"] == "SAFE_DETOUR"
            assert route["is_compromised"] is False
            min_distance = min(
                flood_circle_distance_km(wp["lat"], wp["lon"]) for wp in route["waypoints"]
            )
            assert min_distance > FLOOD_RADIUS_KM

    def test_use_demo_state_offline_bypass_outside_flood_circle(self):
        waypoints = _parse_use_demo_state_offline_waypoints()
        assert len(waypoints) == 10
        for idx, (lat, lon) in enumerate(waypoints):
            distance = flood_circle_distance_km(lat, lon)
            assert distance > FLOOD_RADIUS_KM, (
                "useDemoState.ts offline waypoint #{0} at ({1}, {2}) is only "
                "{3:.2f} km from the Lubuk Pakam flood center".format(idx, lat, lon, distance)
            )

    def test_use_demo_state_offline_bypass_matches_fixture_coastal_route(self):
        ts_waypoints = _parse_use_demo_state_offline_waypoints()
        fixture = json.loads(FIXTURE_PATH.read_text(encoding="utf-8-sig"))
        coastal = [
            (float(wp["lat"]), float(wp["lon"]))
            for wp in fixture["route_recommendations"][0]["waypoints"]
        ]
        assert ts_waypoints == coastal
