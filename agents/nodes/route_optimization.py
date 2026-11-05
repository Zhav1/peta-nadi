import logging
import asyncio
import copy
from datetime import datetime, timezone
import networkx as nx
from agents.state import CrisisState, AgentFinding, RouteRecommendation
from agents.tools.supabase_tools import load_road_graph
from app.config import get_settings
from app.services.spoilage_hedging_service import spoilage_hedging_service
from app.services.compliance_service import compliance_service
from app.services.intermodal_sync_service import IntermodalSyncService
from app.schemas.intermodal import HedgingSolveRequest, ComplianceVerifyRequest
from app.services.hazard_evidence import (
    HAZARD_EVIDENCE_VERSION,
    assess_route_hazards,
    normalize_hazard_evidence,
    route_intersects_geometry,
    route_intersects_point,
)

logger = logging.getLogger(__name__)
settings = get_settings()

# Frontend/operator node keys -> canonical backend road network graph node ids
ALIAS_MAP = {
    "belawan": "belawan_port",
    "belawan port": "belawan_port",
    "pelabuhan belawan": "belawan_port",
    "medan": "medan_kim",
    "medan kim": "medan_kim",
    "medan hub": "medan_kim",
    "tebingtinggi": "tebing_tinggi_hub",
    "tebing tinggi": "tebing_tinggi_hub",
    "siantar": "siantar_hub",
    "pematang siantar": "siantar_hub",
    "pematangsiantar": "siantar_hub",
    "dumai": "dumai_port",
    "dumai port": "dumai_port",
    "bakauheni": "bakauheni_port",
    "padang": "padang_teluk_bayur",
    "teluk bayur": "padang_teluk_bayur",
    "pekanbaru": "pekanbaru_hub",
    "palembang": "palembang_hub",
    "bukittinggi": "bukittinggi_hub",
    "binjai": "binjai_hub",
    "kualanamu": "kualanamu_airport",
    "panjang": "panjang_port",
    "boom baru": "boom_baru_port",
}


def _normalize_node_key(raw) -> str:
    if raw is None:
        return ""
    return str(raw).strip().lower().replace("-", "_").replace(" ", "_")


_NORMALIZED_ALIAS_MAP = {_normalize_node_key(k): v for k, v in ALIAS_MAP.items()}


def _resolve_network_node(raw, node_lookup: dict):
    """Resolve a frontend/operator node key to the matching graph node id."""
    key = _normalize_node_key(raw)
    if not key:
        return None

    candidates = []
    alias = _NORMALIZED_ALIAS_MAP.get(key)
    if alias:
        candidates.append(alias)
    candidates.append(key)

    for candidate in candidates:
        if candidate in node_lookup:
            return node_lookup[candidate]

    # Graph ids may use longer canonical names than the alias target
    # (e.g. tebing_tinggi_hub -> tebing_tinggi_toll, siantar_hub -> pematangsiantar_hub)
    for candidate in candidates:
        base = candidate.replace("_hub", "").replace("_port", "")
        for node_key, node in node_lookup.items():
            if node_key.startswith(base) or base in node_key:
                return node
    return None


def _first_present(state: dict, *keys):
    """Return the first explicitly-set, non-None value among ``keys``."""
    for key in keys:
        if key in state:
            value = state.get(key)
            if value is not None:
                return value
    return None


def _coerce_float(value, default):
    """Coerce an operational numeric field; fall back only when unusable."""
    if value is None or isinstance(value, bool):
        return default
    try:
        number = float(value)
    except (TypeError, ValueError):
        return default
    if number != number or number in (float("inf"), float("-inf")):
        return default
    return number


def _coerce_bool(value, default):
    """Coerce a boolean flag without treating the string ``"false"`` as True."""
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in ("1", "true", "yes", "y", "on"):
            return True
        if normalized in ("0", "false", "no", "n", "off"):
            return False
    return default


def _coerce_coords(value):
    """Normalize OD coordinates to a ``[lon, lat]`` float pair."""
    if value is None:
        return None
    if isinstance(value, dict):
        lat, lon = value.get("lat"), value.get("lon")
        if lat is None or lon is None:
            return None
        value = [lon, lat]
    if isinstance(value, (list, tuple)) and len(value) >= 2:
        try:
            return [float(value[0]), float(value[1])]
        except (TypeError, ValueError):
            return None
    return None


def _edge_coordinates(edge: dict, node_coords: dict, from_node: str, to_node: str):
    """Return only stored or graph-grounded edge geometry; never invent a line."""
    raw = edge.get("coordinates") or edge.get("geometry")
    if isinstance(raw, dict):
        raw = raw.get("coordinates") if raw.get("type") in {"LineString", "MultiLineString"} else None
    if isinstance(raw, list) and raw:
        if raw and isinstance(raw[0], list) and raw[0] and isinstance(raw[0][0], (list, tuple)):
            raw = raw[0]
        coords = _coerce_coords_list(raw)
        if len(coords) >= 2:
            return coords
    a, b = node_coords.get(from_node), node_coords.get(to_node)
    if a and b and a.get("lat") is not None and b.get("lat") is not None:
        return [[float(a["lon"]), float(a["lat"])], [float(b["lon"]), float(b["lat"])]]
    return []


def _coerce_coords_list(value):
    coords = []
    for point in value if isinstance(value, list) else []:
        if isinstance(point, dict):
            pair = _coerce_coords(point)
        elif isinstance(point, (list, tuple)) and len(point) >= 2:
            pair = _coerce_coords(point)
        else:
            pair = None
        if pair:
            coords.append(pair)
    return coords


def _first_commodity(state: dict):
    """Resolve the actual shipment commodity before any default is applied."""
    for key in ("commodity", "commodity_key", "commodityKey"):
        commodity = state.get(key)
        if commodity is not None and str(commodity).strip():
            return str(commodity).strip()

    news_commodities = state.get("news_affected_commodities") or []
    if isinstance(news_commodities, str):
        news_commodities = [news_commodities]
    for item in news_commodities:
        if item is not None and str(item).strip():
            return str(item).strip()

    return None


async def route_optimization_agent(state: CrisisState) -> dict:
    """Agent 4: NetworkX pgRouting matrix computation + dynamic hazard/news-weighted routing + Spoilage Hedging & Compliance."""
    logger.info("Agent 4 [RouteOptimizationAgent] running...")
    
    # 1. Load road graph edges (with local offline cache fallback)
    edges = await load_road_graph()
    used_offline_graph = False
    node_coords: dict = {}
    if not edges:
        try:
            import os, json
            cache_file = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../data/road_network_sumatra.json"))
            if os.path.exists(cache_file):
                with open(cache_file, "r", encoding="utf-8") as f:
                    cached_data = json.load(f)
                    for n in cached_data.get("nodes", []):
                        node_coords[n["id"]] = {"lat": float(n["lat"]), "lon": float(n["lon"])}
                    edges = []
                    used_offline_graph = True
                    for e in cached_data.get("edges", []):
                        raw_c = e.get("corridor_name", "")
                        if "belmera" in raw_c.lower() or "belawan" in raw_c.lower():
                            c_id = "belawan_access"
                        else:
                            c_id = "trans_sumatra"
                        edges.append({
                            "from_node": e["from_node"],
                            "to_node": e["to_node"],
                            "distance_km": e.get("distance_km", 10.0),
                            "base_weight": 1.0,
                            "corridor": c_id
                        })
                logger.info(f"Agent 4: Loaded {len(edges)} edges and {len(node_coords)} node coordinates from offline Sumatra road graph cache.")
        except Exception as cache_err:
            logger.warning(f"Agent 4 local cache fallback error: {cache_err}")

    if not edges:
        logger.warning("Empty road graph loaded. Returning base findings.")
        degraded_sources = list(state.get("degraded_sources") or [])
        if "road_graph_unavailable" not in degraded_sources:
            degraded_sources.append("road_graph_unavailable")
        reason = "No road network edges available; route safety cannot be evaluated."
        return {
            "route_recommendations": [],
            "degraded_sources": degraded_sources,
            "route_optimization_finding": {
                "agent": "RouteOptimizationAgent",
                "confidence": 0.0,
                "summary": reason,
                "data": {"status": "no_safe_route", "decision_status": "HOLD_DELAY", "degraded_sources": degraded_sources},
                "timestamp": datetime.now(timezone.utc).isoformat()
            }
        }
        
    # 2. Build DiGraph
    G = nx.DiGraph()
    for edge in edges:
        u, v = edge["from_node"], edge["to_node"]
        for node_id, prefix in ((u, "from"), (v, "to")):
            lat = edge.get(f"{prefix}_lat")
            lon = edge.get(f"{prefix}_lon")
            if lat is None:
                lat = edge.get(f"{prefix}_latitude")
            if lon is None:
                lon = edge.get(f"{prefix}_longitude")
            pair = _coerce_coords({"lat": lat, "lon": lon}) if lat is not None and lon is not None else None
            if pair:
                node_coords.setdefault(node_id, {"lon": pair[0], "lat": pair[1]})
        edge_coords = _edge_coordinates(edge, node_coords, u, v)
        G.add_edge(
            u, v,
            distance_km=float(edge["distance_km"]),
            base_weight=float(edge.get("base_weight", 1.0)),
            corridor=edge.get("corridor") or edge.get("corridor_name"),
            route_coordinates=edge_coords,
        )

    # 3. Apply the shared evidence contract. Broad hazard type/title labels and
    # unqualified corridor names are not enough to sever a road edge.
    hazard_polygons = state.get("hazard_polygons") or []
    normalized_hazards = [
        normalize_hazard_evidence(item)
        for item in hazard_polygons if isinstance(item, dict)
    ]
    degraded_sources = list(state.get("degraded_sources") or [])
    if used_offline_graph and "road_graph_offline_cache" not in degraded_sources:
        degraded_sources.append("road_graph_offline_cache")
    if not hazard_polygons and "hazard_evidence_unavailable" not in degraded_sources:
        degraded_sources.append("hazard_evidence_unavailable")
    hazard_coverage = str(state.get("hazard_evidence_coverage") or "unknown")
    hard_blocked_corridors = set()
    unknown_geometry = False

    for u, v, data in list(G.edges(data=True)):
        edge_coords = data.get("route_coordinates") or []
        if len(edge_coords) < 2 and normalized_hazards:
            unknown_geometry = True
        weight = data["distance_km"] * data["base_weight"]
        penalty_multiplier = 1.0
        hard_block = False
        for evidence in normalized_hazards:
            intersects = bool(edge_coords) and route_intersects_geometry(edge_coords, evidence.get("geometry"))
            point = evidence.get("point")
            risk_center = evidence.get("risk_center") or point
            if not intersects and edge_coords and point:
                intersects = route_intersects_point(edge_coords, point)
            if not intersects and edge_coords and risk_center and evidence.get("classification") == "PRECAUTIONARY_RISK":
                intersects = route_intersects_point(edge_coords, risk_center)
            if not intersects:
                continue
            if evidence.get("classification") == "CONFIRMED_BLOCKAGE":
                hard_block = True
                if data.get("corridor"):
                    hard_blocked_corridors.add(str(data["corridor"]))
                break
            penalty_multiplier = max(
                penalty_multiplier,
                3.0 if evidence.get("classification") == "PRECAUTIONARY_RISK" else 1.5,
            )
        if hard_block:
            G.remove_edge(u, v)
        else:
            data["weight"] = weight * penalty_multiplier

    if unknown_geometry and "hazard_edge_geometry_unknown" not in degraded_sources:
        degraded_sources.append("hazard_edge_geometry_unknown")
    if hazard_coverage not in {"complete", "verified_complete"} and "hazard_coverage_unknown" not in degraded_sources:
        degraded_sources.append("hazard_coverage_unknown")
    disrupted_corridors = hard_blocked_corridors

    # 4. Generate Alternative Routes with Intermodal Delays, Compliance & Spoilage Hedging
    recommendations = []
    top_hedging_breakdown = None
    top_compliance_status = None
    intermodal_sync = IntermodalSyncService()
    
    # Extract cargo context from state. camelCase dashboard aliases are read
    # here too so this agent stays correct even when invoked outside the graph
    # (where data_collection's normalization has not run).
    active_commodity = _first_commodity(state) or "cabai_merah"
    cargo_tonnage = _coerce_float(
        _first_present(state, "cargo_tonnage", "cargoTonnage", "cargo_ton", "cargoTon"),
        15.0,
    )
    vehicle_gross_weight = _coerce_float(
        _first_present(
            state,
            "vehicle_gross_weight_ton",
            "vehicleGrossWeightTon",
            "gross_weight_ton",
        ),
        18.0,
    )
    has_bkhit = _coerce_bool(
        _first_present(state, "has_bkhit_cert", "hasBkhitCert", "bkhit_cert", "bkhitCert"),
        True,
    )
    
    try:
        # Robust origin & destination resolution. The dashboard selection is
        # authoritative; first/last graph nodes are only a legacy fallback when
        # the caller supplied no OD at all.
        req_origin = _first_present(state, "origin", "start_location", "origin_id", "origin_node")
        req_dest = _first_present(state, "destination", "end_location", "dest_id", "destination_node")
        origin_coords = _coerce_coords(_first_present(state, "origin_coords", "originCoords"))
        dest_coords = _coerce_coords(_first_present(state, "dest_coords", "destCoords"))

        # Support if req_origin / req_dest were passed directly as [lon, lat]
        if isinstance(req_origin, (list, tuple)) and len(req_origin) >= 2:
            origin_coords = _coerce_coords(req_origin)
            req_origin = None
        elif isinstance(req_origin, dict) and req_origin.get("lat") is not None:
            origin_coords = _coerce_coords(req_origin)
            req_origin = None
        if isinstance(req_dest, (list, tuple)) and len(req_dest) >= 2:
            dest_coords = _coerce_coords(req_dest)
            req_dest = None
        elif isinstance(req_dest, dict) and req_dest.get("lat") is not None:
            dest_coords = _coerce_coords(req_dest)
            req_dest = None

        od_declared = any(
            value is not None
            for value in (req_origin, req_dest, origin_coords, dest_coords)
        )

        node_lookup = {str(n).lower(): n for n in G.nodes}

        def _find_nearest_graph_node(coords):
            if not coords or len(coords) < 2 or not node_coords:
                return None
            lon, lat = float(coords[0]), float(coords[1])
            best_node = None
            best_dist = float("inf")
            for nid, c in node_coords.items():
                n_lat = c.get("lat")
                n_lon = c.get("lon")
                if n_lat is not None and n_lon is not None:
                    d = (lat - n_lat) ** 2 + (lon - n_lon) ** 2
                    if d < best_dist:
                        best_dist = d
                        best_node = nid
            return best_node

        origin = _resolve_network_node(req_origin, node_lookup)
        if origin is None and origin_coords:
            origin = _find_nearest_graph_node(origin_coords)

        destination = _resolve_network_node(req_dest, node_lookup)
        if destination is None and dest_coords:
            destination = _find_nearest_graph_node(dest_coords)

        if od_declared:
            # Never invent an endpoint from the graph's first/last node when the
            # operator declared an OD but one side could not be resolved.
            if origin is None or destination is None:
                missing = []
                if origin is None:
                    missing.append("origin")
                if destination is None:
                    missing.append("destination")
                reason = (
                    f"Titik {' & '.join(missing)} tidak dikenali pada graph jaringan "
                    "jalan dan koordinat tidak tersedia. Fallback ke node graph "
                    "pertama/terakhir dinonaktifkan."
                )
                logger.warning(f"Agent 4: {reason}")
                return {
                    "route_recommendations": [],
                    "route_optimization_finding": {
                        "agent": "RouteOptimizationAgent",
                        "confidence": 0.5,
                        "summary": reason,
                        "data": {
                            "routes": [],
                            "status": "no_route",
                            "decision_status": "HOLD_DELAY",
                            "no_route_reason": reason,
                            "disrupted_corridors": list(disrupted_corridors),
                            "degraded_sources": degraded_sources,
                        },
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    },
                    "degraded_sources": degraded_sources,
                    "decision_status": "HOLD_DELAY",
                    "messages": state.get("messages", []) + [f"RouteOptimizationAgent: {reason}"],
                }
        else:
            # Legacy behaviour for callers that only supply a hazard event.
            if origin is None and len(G.nodes) > 0:
                origin = list(G.nodes)[0]
            if destination is None and len(G.nodes) > 1:
                destination = list(G.nodes)[-1]

        if origin and destination and origin != destination:
            if not nx.has_path(G, origin, destination) and not od_declared:
                # Legacy only: search for any connected pair between candidate
                # origins and destinations. A declared OD is never rewritten.
                connected_pair = None
                for u in [origin] + list(G.nodes)[:5]:
                    for v in [destination] + list(G.nodes)[-5:]:
                        if u != v and nx.has_path(G, u, v):
                            connected_pair = (u, v)
                            break
                    if connected_pair:
                        break
                if connected_pair:
                    origin, destination = connected_pair

            paths = []
            if nx.has_path(G, origin, destination):
                for p in nx.shortest_simple_paths(G, origin, destination, weight="weight"):
                    paths.append(p)
                    if len(paths) >= 3:
                        break

            for idx, path in enumerate(paths):
                distance_km = 0.0
                for i in range(len(path) - 1):
                    if G.has_edge(path[i], path[i+1]):
                        distance_km += G[path[i]][path[i+1]]["distance_km"]
                
                # Route geometry comes only from stored edge or node coordinates.
                # Missing geometry remains unknown instead of a fabricated waypoint.
                wp_coords = []
                for edge_start, edge_end in zip(path, path[1:]):
                    edge_coords = G[edge_start][edge_end].get("route_coordinates") or []
                    if edge_coords:
                        if wp_coords and wp_coords[-1] == edge_coords[0]:
                            wp_coords.extend(edge_coords[1:])
                        else:
                            wp_coords.extend(edge_coords)
                waypoints = [{"lon": coord[0], "lat": coord[1]} for coord in wp_coords]
                if origin_coords and len(origin_coords) >= 2:
                    wp_coords = [[float(origin_coords[0]), float(origin_coords[1])]] + wp_coords
                if dest_coords and len(dest_coords) >= 2:
                    wp_coords = wp_coords + [[float(dest_coords[0]), float(dest_coords[1])]]
                
                # Intermodal Choke-Point Proximity Delay Multiplier
                choke_multiplier = intermodal_sync.calculate_route_intermodal_delay(wp_coords)
                eta_minutes = int((distance_km / 50.0) * 60 * choke_multiplier) # 50 km/h avg logistics speed modulated by choke-point
                
                is_detour = idx > 0
                desc = (
                    f"Rute Utama Teroptimasi via {', '.join(path[1:-1])}" if not is_detour
                    else f"Jalur Pengalihan Alternatif #{idx} via {', '.join(path[1:-1])}"
                )
                
                # Regulatory Compliance Check (BKHIT & MST)
                comp_req = ComplianceVerifyRequest(
                    vehicle_id=state.get("vehicle_id", "TRK-SUM-01"),
                    origin=str(path[0]),
                    destination=str(path[-1]),
                    commodity=active_commodity,
                    vehicle_gross_weight_ton=vehicle_gross_weight,
                    has_bkhit_cert=has_bkhit,
                    traversed_roads=[str(p) for p in path]
                )
                comp_result = compliance_service.verify_compliance(comp_req)
                compliance_dict = {
                    "status": comp_result.overall_status,
                    "summary": f"Kepatuhan regulasi: {comp_result.overall_status} (Dispatch: {'Diizinkan' if comp_result.can_dispatch else 'Dilarang'})",
                    "is_compliant": comp_result.can_dispatch,
                    "requires_override": comp_result.requires_override
                }
                
                # Spoilage Hedging Monetary Solve
                toll_segs = []
                path_str = " ".join(path).lower()
                if "tebing" in path_str or "mktt" in path_str:
                    toll_segs.append("MEDAN_TEBINGTINGGI")
                if "belmera" in path_str:
                    toll_segs.append("BELMERA")
                if "dumai" in path_str or "pekanbaru" in path_str:
                    toll_segs.append("PEKANBARU_DUMAI")
                if "bakauheni" in path_str:
                    toll_segs.append("BAKAUHENI_TERBANGGI")

                hedge_req = HedgingSolveRequest(
                    vehicle_id=state.get("vehicle_id", "TRK-SUM-01"),
                    commodity=active_commodity,
                    cargo_tonnage=cargo_tonnage,
                    origin=str(path[0]),
                    destination=str(path[-1]),
                    fuel_type="biosolar",
                    p_disruption=0.85,
                    disruption_delay_hours=max(1.0, round(eta_minutes / 60.0, 1)),
                    detour_distance_km=distance_km,
                    detour_time_hours=round(distance_km / 55.0, 1),
                    toll_segments=toll_segs,
                    hold_wait_hours=4.0
                )
                hedge_result = spoilage_hedging_service.solve_hedging_matrix(
                    hedge_req,
                    inflation_shock_factor=0.08
                )
                hedging_dict = {
                    "optimal_policy": hedge_result.optimal_policy,
                    "net_savings_idr": hedge_result.net_savings_idr,
                    "spoilage_loss_idr": hedge_result.spoilage_loss_idr,
                    "cargo_value_idr": hedge_result.cargo_value_idr,
                    "continue_cost_idr": hedge_result.continue_policy.cost_idr,
                    "reroute_cost_idr": hedge_result.reroute_policy.cost_idr,
                    "hold_cost_idr": hedge_result.hold_policy.cost_idr,
                    "recommendation_reason": hedge_result.recommendation_reason
                }
                
                if idx == 0:
                    top_hedging_breakdown = hedging_dict
                    top_compliance_status = compliance_dict

                leg = {
                    "modality": "truck",
                    "mode": "truck",
                    "color": "#10B981",
                    "coordinates": wp_coords,
                    "distance_km": round(distance_km, 2),
                    "eta_minutes": eta_minutes,
                }

                assessment = assess_route_hazards(
                    wp_coords, normalized_hazards, coverage_status=hazard_coverage,
                )
                if assessment["status"] == "BLOCKED":
                    continue
                is_clear = assessment["status"] == "CLEAR"
                recommendations.append({
                    "description": desc,
                    "waypoints": waypoints,
                    "coordinates": wp_coords,
                    "distance_km": round(distance_km, 2),
                    "eta_minutes": eta_minutes,
                    "fuel_increase_pct": max(0.0, round((distance_km - 26.0) * 0.12, 2)),
                    "risk_score": assessment.get("risk_score"),
                    "hazard_assessment": assessment,
                    "hazard_evidence_version": HAZARD_EVIDENCE_VERSION,
                    "hazard_evidence_ids": assessment.get("evidence_ids", []),
                    "is_compromised": assessment["status"] in {"BLOCKED", "PRECAUTIONARY_RISK"},
                    "safety_status": "CLEAR" if is_clear else "HOLD_DELAY",
                    "viable": is_clear,
                    "non_viable_reason": None if is_clear else assessment.get("reason"),
                    "hedging": hedging_dict,
                    "compliance": compliance_dict,
                    "chokepoint_delay_multiplier": choke_multiplier,
                    "legs": [leg],
                })

            # Multi-modal / Intermodal Sea corridor injection
            req_modality = _first_present(state, "modality", "transport_modality") or "truck"
            orig_pt = None
            dest_pt = None
            if origin_coords and len(origin_coords) >= 2:
                orig_pt = [float(origin_coords[0]), float(origin_coords[1])]
            elif origin and origin in node_coords:
                orig_pt = [node_coords[origin]["lon"], node_coords[origin]["lat"]]

            if dest_coords and len(dest_coords) >= 2:
                dest_pt = [float(dest_coords[0]), float(dest_coords[1])]
            elif destination and destination in node_coords:
                dest_pt = [node_coords[destination]["lon"], node_coords[destination]["lat"]]

            if orig_pt and dest_pt:
                from app.adapters.cpu_routing_adapter import calculate_sea_intermodal_corridor
                im_corridor = calculate_sea_intermodal_corridor(
                    origin_coords=orig_pt,
                    dest_coords=dest_pt,
                    origin_name=str(req_origin or origin or "Asal"),
                    dest_name=str(req_dest or destination or "Tujuan")
                )
                if im_corridor and im_corridor.get("legs"):
                    if req_modality in ("maritime", "intermodal", "multimodal"):
                        recommendations.insert(0, im_corridor)
                    elif len(recommendations) < 3:
                        recommendations.append(im_corridor)
    except Exception as routing_err:
        logger.error(f"Error calculating NetworkX shortest paths: {routing_err}")

    # Preserve pre-existing route recommendations with legs if present
    if not recommendations and state.get("route_recommendations"):
        recommendations = copy.deepcopy(list(state.get("route_recommendations")))

    # Ensure all route recommendations preserve or generate multi-modal legs
    for rec in recommendations:
        if not rec.get("legs"):
            coords = rec.get("coordinates")
            if not coords and rec.get("waypoints"):
                coords = [[w["lon"], w["lat"]] if "lon" in w else [w["longitude"], w["latitude"]] for w in rec["waypoints"]]
            coords = coords or []
            rec_mod = rec.get("modality", "truck")
            color = "#3B82F6" if rec_mod == "maritime" else "#10B981"
            rec["legs"] = [{
                "modality": rec_mod,
                "mode": rec_mod,
                "color": color,
                "coordinates": coords,
                "distance_km": rec.get("distance_km", 0.0),
                "eta_minutes": rec.get("eta_minutes", 0),
            }]

        # Enforce that maritime legs NEVER emit a 2-point straight Euclidean line across land
        for leg in rec.get("legs", []):
            leg_mod = leg.get("modality") or leg.get("mode")
            if leg_mod == "maritime":
                leg["color"] = "#3B82F6"
                l_coords = leg.get("coordinates") or []
                if len(l_coords) == 2:
                    from app.adapters.cpu_routing_adapter import generate_nautical_coastal_route
                    leg["coordinates"] = generate_nautical_coastal_route(l_coords[0], l_coords[1])

    # Recheck every returned alternative after route/leg assembly, including any
    # upstream shared snapshot recommendation. Intermodal routes require explicit
    # mode-specific checks; absent navigation evidence remains REVIEW, not CLEAR.
    for rec in recommendations:
        leg_assessments = []
        for leg in rec.get("legs", []):
            leg_mode = leg.get("modality") or leg.get("mode") or rec.get("modality") or "truck"
            coords = leg.get("coordinates") or []
            leg_assessment = assess_route_hazards(
                coords, normalized_hazards, coverage_status=hazard_coverage,
            )
            if leg_mode in {"maritime", "air"} and not leg.get("navigation_safety_checked"):
                leg_assessment = {
                    **leg_assessment,
                    "status": "UNKNOWN",
                    "clearance_status": "REVIEW",
                    "risk_score": None,
                    "reason": f"{leg_mode}_navigation_safety_not_checked",
                }
            leg_assessments.append(leg_assessment)
        if not leg_assessments:
            leg_assessments.append(assess_route_hazards([], normalized_hazards, coverage_status=hazard_coverage))
        if any(item.get("status") == "BLOCKED" for item in leg_assessments):
            overall_status = "BLOCKED"
        elif any(item.get("status") == "UNKNOWN" for item in leg_assessments):
            overall_status = "UNKNOWN"
        elif any(item.get("status") == "PRECAUTIONARY_RISK" for item in leg_assessments):
            overall_status = "PRECAUTIONARY_RISK"
        else:
            overall_status = "CLEAR"
        assessment = {
            "status": overall_status,
            "clearance_status": "CLEAR" if overall_status == "CLEAR" else "BLOCKED" if overall_status == "BLOCKED" else "REVIEW",
            "risk_score": 1.0 if overall_status == "BLOCKED" else max(
                (item.get("risk_score") or 0.0 for item in leg_assessments), default=None
            ) if overall_status == "PRECAUTIONARY_RISK" else 0.0 if overall_status == "CLEAR" else None,
            "evidence_ids": list(dict.fromkeys(
                evidence_id for item in leg_assessments for evidence_id in item.get("evidence_ids", [])
            )),
            "evidence_version": HAZARD_EVIDENCE_VERSION,
            "reason": "; ".join(dict.fromkeys(str(item.get("reason") or "") for item in leg_assessments if item.get("reason"))),
        }
        rec["hazard_assessment"] = assessment
        rec["hazard_evidence_version"] = HAZARD_EVIDENCE_VERSION
        rec["hazard_evidence_ids"] = assessment["evidence_ids"]
        rec["risk_score"] = assessment["risk_score"]
        rec["is_compromised"] = overall_status in {"BLOCKED", "PRECAUTIONARY_RISK"}
        rec["safety_status"] = (
            "HOLD_DELAY" if rec.get("corridor_type") == "hold_staging"
            else "CLEAR" if overall_status == "CLEAR"
            else "COMPROMISED" if overall_status == "BLOCKED"
            else "HOLD_DELAY"
        )
        rec["viable"] = overall_status == "CLEAR" and rec.get("corridor_type") != "hold_staging"
        if not rec["viable"]:
            rec["non_viable_reason"] = assessment.get("reason") or "Route requires safety review"

    # Attach Route Detail Modal proof post-loop (same helper as CPU adapter).
    # risk_score may be unavailable; proof lives under rec['proof'].
    if recommendations:
        try:
            from app.adapters.cpu_routing_adapter import enrich_route_with_proof
            _base_eta = None
            try:
                _base_eta = float(recommendations[0].get("eta_minutes", 0))
            except (TypeError, ValueError):
                _base_eta = None
            _news_ctx = state.get("verified_news_citations") or []
            _hz_ctx = hazard_polygons or []
            for _rec in recommendations:
                try:
                    raw_risk = _rec.get("risk_score")
                    _rec["risk_score"] = float(raw_risk) if raw_risk is not None else None
                except (TypeError, ValueError):
                    _rec["risk_score"] = None
                if _base_eta is not None:
                    try:
                        _rec_eta = float(_rec.get("eta_minutes", _base_eta))
                        _rec["time_delta_minutes"] = round(_rec_eta - _base_eta, 1)
                    except (TypeError, ValueError):
                        _rec.setdefault("time_delta_minutes", 0.0)
                else:
                    _rec.setdefault("time_delta_minutes", 0.0)
                _proof = enrich_route_with_proof(
                    _rec,
                    hazard_zones=_hz_ctx,
                    congestion_segments=[],
                    news_context=_news_ctx,
                    is_fallback=False,
                )
                _rec["proof"] = _proof
                _rec["dasar_risiko"] = _proof.get("dasar_risiko")
                _rec["dampak_uncertainty"] = _proof.get("dampak_uncertainty")
                _rec["keterbatasan_data"] = _proof.get("keterbatasan_data")
        except Exception as _pe:
            logger.debug(f"RouteOptimizationAgent proof enrichment skipped: {_pe}")

    # 4b. Phase 58 expansion (B): opencode-driver prose "why this route" explainer.
    # Computed distance_km / eta_minutes / risk_score / optimal_policy are injected
    # verbatim as ground truth; the model must not invent figures or alter waypoints/ETA.
    # On failure the templated desc above stands (honest fallback).
    if recommendations:
        try:
            from agents.llm_gateway import LLMGateway
            top = recommendations[0]
            top_hedge = top.get("hedging", {}) or {}
            prompt = (
                "Jelaskan dalam 1-2 kalimat Bahasa Indonesia mengapa rute berikut dipilih. "
                "Jangan mengarang angka; kutip hanya nilai yang diberikan.\n\n"
                f"Jarak: {top.get('distance_km')} km, ETA: {top.get('eta_minutes')} menit, "
                f"skor risiko: {top.get('risk_score')}, "
                f"kebijakan hedging: {top_hedge.get('optimal_policy')}, "
                f"penghematan bersih: Rp {top_hedge.get('net_savings_idr')}"
            )
            explainer = await LLMGateway.generate_content(
                prompt=prompt,
                model_name=settings.opencode_driver_model,
                temperature=0.2
            )
            if explainer and len(explainer.strip()) > 10:
                top["explainer"] = explainer.strip()
        except Exception as le:
            logger.debug(f"RouteOptimizationAgent: explainer expansion unavailable, keeping templated desc: {le}")

    # Confidence reflects evidence coverage and validated route clearance, not
    # the number/order of generated alternatives.
    clear_routes = [route for route in recommendations if route.get("viable") is True]
    complete_coverage = hazard_coverage in {"complete", "verified_complete"}
    confidence = 0.8 if complete_coverage and clear_routes and not degraded_sources else 0.35 if recommendations else 0.0
    decision_status = "SAFE_ROUTE_AVAILABLE" if clear_routes else "HOLD_DELAY"
    summary = (
        f"{len(clear_routes)} route(s) passed the supplied evidence checks."
        if clear_routes else "No adequately verified safe route; hold and review source coverage."
    )

    finding: AgentFinding = {
        "agent": "RouteOptimizationAgent",
        "confidence": confidence,
        "summary": summary,
        "data": {
            "routes": recommendations,
            "status": "success" if clear_routes else "no_safe_route",
            "decision_status": decision_status,
            "disrupted_corridors": list(disrupted_corridors),
            "hazard_evidence_version": HAZARD_EVIDENCE_VERSION,
            "hazard_evidence": normalized_hazards,
            "degraded_sources": degraded_sources,
            "top_hedging": top_hedging_breakdown,
            "top_compliance": top_compliance_status
        },
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    
    try:
        from app.routers.agent_router import update_agent_status
        update_agent_status("RouteOptimizationAgent", "complete", confidence, finding["summary"])
    except Exception:
        pass

    logger.info(f"Agent 4 finished. Confidence: {confidence}")
    return {
        "route_recommendations": recommendations,
        "route_optimization_finding": finding,
        "hedging_breakdown": top_hedging_breakdown,
        "compliance_status": top_compliance_status,
        "degraded_sources": degraded_sources,
        "decision_status": decision_status,
        "messages": state.get("messages", []) + [
            "RouteOptimizationAgent: alternatives checked against shared hazard evidence; HOLD_DELAY when safety is unknown."
        ]
    }

