import logging
import asyncio
from datetime import datetime, timezone
import networkx as nx
from agents.state import CrisisState, AgentFinding, RouteRecommendation
from agents.tools.supabase_tools import load_road_graph
from app.config import get_settings
from app.services.spoilage_hedging_service import spoilage_hedging_service
from app.services.compliance_service import compliance_service
from app.services.intermodal_sync_service import IntermodalSyncService
from app.schemas.intermodal import HedgingSolveRequest, ComplianceVerifyRequest

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
        return {
            "route_recommendations": [],
            "route_optimization_finding": {
                "agent": "RouteOptimizationAgent",
                "confidence": 0.5,
                "summary": "No road network edges available for routing.",
                "data": {},
                "timestamp": datetime.now(timezone.utc).isoformat()
            }
        }
        
    # 2. Build DiGraph
    G = nx.DiGraph()
    for edge in edges:
        G.add_edge(
            edge["from_node"],
            edge["to_node"],
            distance_km=float(edge["distance_km"]),
            base_weight=float(edge.get("base_weight", 1.0)),
            corridor=edge.get("corridor")
        )
        
    # 3. Apply hazard & news intelligence penalties
    hazard_polygons = state.get("hazard_polygons") or []
    blocked_corridors = state.get("blocked_corridors") or []
    osint_finding = state.get("osint_hazard_finding", {})
    osint_data = osint_finding.get("data", {}) if isinstance(osint_finding, dict) else {}
    if not blocked_corridors and osint_data.get("blocked_corridors"):
        blocked_corridors = osint_data["blocked_corridors"]

    disrupted_corridors = set()
    for hazard in hazard_polygons:
        hz_type = str(
            (hazard.get("incident_type") if isinstance(hazard, dict) else None)
            or (hazard.get("type") if isinstance(hazard, dict) else None)
            or (hazard.get("event_type") if isinstance(hazard, dict) else None)
            or state.get("type")
            or state.get("event_type")
            or ""
        ).lower()
        hz_title = str(state.get("title", "")).lower()
        if isinstance(hazard, dict) and hazard.get("title"):
            hz_title = f"{hz_title} {str(hazard.get('title')).lower()}"
        if hz_type in ["port_closure", "port_congestion", "marine_wave"]:
            if "dumai" in hz_title:
                disrupted_corridors.add("dumai_access")
            elif "bayur" in hz_title or "padang" in hz_title:
                disrupted_corridors.add("teluk_bayur_access")
            elif "panjang" in hz_title:
                disrupted_corridors.add("panjang_access")
            elif "bakauheni" in hz_title:
                disrupted_corridors.add("bakauheni_access")
            elif "boom" in hz_title or "palembang" in hz_title:
                disrupted_corridors.add("boom_baru_access")
            else:
                disrupted_corridors.add("belawan_access")
        elif hz_type in ["flood", "landslide", "earthquake", "wildfire",
                         "congestion", "road_closure", "volcanic_eruption",
                         "other_disruption"]:
            disrupted_corridors.add("trans_sumatra")
        else:
            disrupted_corridors.add("trans_sumatra")
            
    # Include news-verified blockages
    if blocked_corridors:
        for bc in blocked_corridors:
            bc_low = bc.lower()
            if "jalinsum" in bc_low or "arteri" in bc_low or "lintas" in bc_low:
                disrupted_corridors.add("trans_sumatra")
            if "belawan" in bc_low:
                disrupted_corridors.add("belawan_access")
            if "dumai" in bc_low:
                disrupted_corridors.add("dumai_access")
            if "bayur" in bc_low:
                disrupted_corridors.add("teluk_bayur_access")
            if "bakauheni" in bc_low:
                disrupted_corridors.add("bakauheni_access")
            
    # Apply weights
    for u, v, data in G.edges(data=True):
        corridor = data.get("corridor")
        weight = data["distance_km"] * data["base_weight"]
        
        if corridor in disrupted_corridors:
            severity = state.get("severity") or "medium"
            if severity == "low":
                weight *= 1.5
            elif severity == "medium":
                weight *= 3.0
            elif severity == "high":
                weight *= 10.0
            elif severity == "critical" or blocked_corridors:
                weight = 9999.0  # blocked / severed
                
        G[u][v]["weight"] = weight

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
                            "no_route_reason": reason,
                            "disrupted_corridors": list(disrupted_corridors),
                        },
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    },
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
                
                # Dynamic waypoints along traversed path nodes
                waypoints = []
                for p_node in path:
                    if p_node in node_coords:
                        waypoints.append(node_coords[p_node])
                if not waypoints:
                    waypoints = [{"lat": 3.78 + (idx * 0.02), "lon": 98.68 - (idx * 0.02)}]
                wp_coords = [[wp["lon"], wp["lat"]] for wp in waypoints]
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

                recommendations.append({
                    "description": desc,
                    "waypoints": waypoints,
                    "coordinates": wp_coords,
                    "distance_km": round(distance_km, 2),
                    "eta_minutes": eta_minutes,
                    "fuel_increase_pct": max(0.0, round((distance_km - 26.0) * 0.12, 2)),
                    "risk_score": 0.15 if not is_detour else round(0.3 + (idx * 0.15), 2),
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
        recommendations = list(state.get("route_recommendations"))

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

    # Attach Route Detail Modal proof post-loop (same helper as CPU adapter).
    # risk_score stays a float; proof lives under rec['proof'].
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
                    _rec["risk_score"] = float(_rec.get("risk_score", 0.2))
                except (TypeError, ValueError):
                    _rec["risk_score"] = 0.2
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

    # 5. Compute confidence score
    confidence = 0.75  # Base
    if len(recommendations) >= 2:
        confidence += 0.15
    if recommendations and recommendations[0]["risk_score"] < 0.3:
        confidence += 0.1
        
    confidence = min(1.0, confidence)
    
    finding: AgentFinding = {
        "agent": "RouteOptimizationAgent",
        "confidence": confidence,
        "summary": f"Calculated {len(recommendations)} optimal fleet routes with real-time hazard, spoilage hedging, and BKHIT/MST compliance.",
        "data": {
            "routes": recommendations,
            "disrupted_corridors": list(disrupted_corridors),
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
        "messages": state.get("messages", []) + ["RouteOptimizationAgent: Solved multi-alternative fleet routing with Spoilage Hedging & Compliance."]
    }

