"""Phase 170 — small-town routing truth guards (SPEC decision 5).

Pins the three routing lies this phase removes:

* **Unbounded snap.** A coordinate 150 km from every graph node used to snap
  silently and become a straight-line "connector"; now it is a ``no_route`` with
  ``reason_code`` ORIGIN_TOO_FAR / DEST_TOO_FAR and the distance in km.
* **Same-node collapse.** Two endpoints resolving to one hub used to emit a
  one-node path (connectors only); now the destination retries the nearest hub
  >= 15 km away, or the solver refuses with ``SAME_NODE``.
* **Duplicate alternatives.** ``k_alternatives=3`` must return up to three
  DISTINCT geometries, never the same polyline twice.

The real 56-node Sumatra graph is used (no mocks): these assertions are about
the production adapter's behaviour, including the hazard-free weight path.
"""
import pytest

from app.adapters.cpu_routing_adapter import (
    MAX_SNAP_KM,
    SAME_NODE_MIN_SEPARATION_KM,
    get_cpu_router,
    haversine_km,
)

# Off the west coast of Aceh: 154 km from the nearest node (sigli_hub).
_FAR_ORIGIN = [96.0, 4.0]
# Normal in-range endpoints.
_MEDAN = [98.67, 3.59]
_TEBING_TINGGI = [99.16, 3.33]
# Two points that both snap to tebing_tinggi_toll (< 5 km from the hub).
_SAME_HUB_A = [99.20, 3.30]
_SAME_HUB_B = [99.18, 3.35]


def _router():
    return get_cpu_router()


def _geometry(route: dict) -> tuple:
    return tuple(tuple(pt) for pt in route.get("coordinates") or [])


# ---------------------------------------------------------------------------
# 1. Snap ceiling — 150 km away is a refusal, not a silent snap
# ---------------------------------------------------------------------------

def test_origin_beyond_snap_ceiling_is_no_route_with_reason_code():
    router = _router()
    node, dist = router._find_nearest_graph_node(_FAR_ORIGIN[0], _FAR_ORIGIN[1])
    assert dist > MAX_SNAP_KM, f"fixture must sit beyond the ceiling (nearest {node} = {dist:.1f} km)"

    result = router.solve_shortest_path(
        origin_coords=_FAR_ORIGIN,
        dest_coords=_TEBING_TINGGI,
        k_alternatives=3,
        include_proof=False,
    )

    assert result["status"] == "no_route"
    assert result["reason_code"] == "ORIGIN_TOO_FAR"
    assert "km" in result["reason"], f"reason must state the distance in km, got {result['reason']!r}"
    assert str(round(dist)) in result["reason"]
    assert result["routes"] == []
    assert result["routes_count"] == 0


def test_dest_beyond_snap_ceiling_is_no_route_with_reason_code():
    router = _router()
    result = router.solve_shortest_path(
        origin_coords=_MEDAN,
        dest_coords=_FAR_ORIGIN,
        k_alternatives=3,
        include_proof=False,
    )

    assert result["status"] == "no_route"
    assert result["reason_code"] == "DEST_TOO_FAR"
    assert "km" in result["reason"]
    assert result["routes"] == []


def test_snap_ceiling_is_calibrated_against_hub_spacing():
    """75 km ~= 2x the median 38.6 km hub spacing, and below the 139.5 km gap."""
    assert 60.0 <= MAX_SNAP_KM <= 80.0
    assert SAME_NODE_MIN_SEPARATION_KM == 15.0


# ---------------------------------------------------------------------------
# 2. Same-node collapse — retry on the 2nd-nearest hub, never a 1-node path
# ---------------------------------------------------------------------------

def test_same_hub_endpoints_resolve_to_two_nodes_or_refuse():
    router = _router()
    origin_node, _ = router._find_nearest_graph_node(_SAME_HUB_A[0], _SAME_HUB_A[1])
    dest_node, _ = router._find_nearest_graph_node(_SAME_HUB_B[0], _SAME_HUB_B[1])
    assert origin_node == dest_node, "fixture must collapse onto one hub"

    result = router.solve_shortest_path(
        origin_coords=_SAME_HUB_A,
        dest_coords=_SAME_HUB_B,
        k_alternatives=3,
        include_proof=False,
    )

    if result["status"] == "no_route":
        assert result["reason_code"] == "SAME_NODE"
        assert result["reason"]
        assert result["routes"] == []
        return

    assert result["status"] == "success"
    assert result["snapped_origin_node"] != result["snapped_dest_node"]
    assert result["routes_count"] >= 1
    for route in result["routes"]:
        assert len(route["nodes"]) >= 2, "a one-node path is connectors only, not a route"
        assert len(route["coordinates"]) >= 2
    # The retry hub must respect the 15 km separation rule.
    origin = router.nodes_dict[result["snapped_origin_node"]]
    dest = router.nodes_dict[result["snapped_dest_node"]]
    assert haversine_km(origin["lat"], origin["lon"], dest["lat"], dest["lon"]) >= 15.0


def test_identical_endpoint_ids_never_emit_a_one_node_route():
    router = _router()
    result = router.solve_shortest_path(
        origin_id="tebing_tinggi_toll",
        dest_id="tebing_tinggi_toll",
        k_alternatives=3,
        include_proof=False,
    )

    assert result["status"] == "no_route"
    assert result["reason_code"] == "SAME_NODE"
    assert result["routes"] == []


# ---------------------------------------------------------------------------
# 3. A normal in-range pair still routes through the graph
# ---------------------------------------------------------------------------

def test_medan_to_tebing_tinggi_returns_a_multi_node_route():
    router = _router()
    result = router.solve_shortest_path(
        origin_coords=_MEDAN,
        dest_coords=_TEBING_TINGGI,
        k_alternatives=3,
        include_proof=False,
    )

    assert result["status"] == "success"
    assert result["routes_count"] >= 1
    primary = result["routes"][0]
    assert len(primary["nodes"]) >= 2
    assert primary["distance_km"] > 0
    assert primary["eta_minutes"] > 0
    # The connectors are the real endpoints, the middle is hub geometry.
    assert primary["coordinates"][0] == _MEDAN
    assert primary["coordinates"][-1] == _TEBING_TINGGI


# ---------------------------------------------------------------------------
# 4. k_alternatives=3 yields up to 3 DISTINCT geometries
# ---------------------------------------------------------------------------

def test_k_alternatives_returns_distinct_geometries():
    router = _router()
    result = router.solve_shortest_path(
        "belawan_port", "bakauheni_port", k_alternatives=3, include_proof=False
    )

    assert result["status"] == "success"
    assert 1 <= result["routes_count"] <= 3
    geometries = [_geometry(r) for r in result["routes"]]
    assert len(set(geometries)) == len(geometries), "duplicate geometry emitted twice"
    for route in result["routes"]:
        assert len(route["nodes"]) >= 2
    assert [r["route_index"] for r in result["routes"]] == list(range(len(result["routes"])))


@pytest.mark.parametrize("k", [1, 2, 3])
def test_alternative_count_never_exceeds_k(k):
    router = _router()
    result = router.solve_shortest_path(
        "belawan_port", "bakauheni_port", k_alternatives=k, include_proof=False
    )
    assert result["routes_count"] <= k
