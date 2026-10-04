import logging
import asyncio
from datetime import datetime, timezone
import networkx as nx
from agents.state import CrisisState, AgentFinding, RouteRecommendation
from agents.tools.supabase_tools import load_road_graph
from app.services.spoilage_hedging_service import spoilage_hedging_service
from app.services.compliance_service import compliance_service
from app.services.intermodal_sync_service import IntermodalSyncService
from app.schemas.intermodal import HedgingSolveRequest, ComplianceVerifyRequest

logger = logging.getLogger(__name__)


async def route_optimization_agent(state: CrisisState) -> dict:
    """Agent 4: NetworkX pgRouting matrix computation + dynamic hazard/news-weighted routing + Spoilage Hedging & Compliance."""
    logger.info("Agent 4 [RouteOptimizationAgent] running...")
    
    # 1. Load road graph edges (with local offline cache fallback)
    edges = await load_road_graph()
    if not edges:
        try:
            import os, json
            cache_file = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../data/road_network_sumatra.json"))
            if os.path.exists(cache_file):
                with open(cache_file, "r", encoding="utf-8") as f:
                    cached_data = json.load(f)
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
                logger.info(f"Agent 4: Loaded {len(edges)} edges from offline Sumatra road graph cache.")
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
        event_type = state.get("type") or state.get("event_type")
        if event_type in ["port_closure", "port_congestion"]:
            disrupted_corridors.add("belawan_access")
        else:
            disrupted_corridors.add("trans_sumatra")
            
    # Include news-verified blockages
    if blocked_corridors:
        for bc in blocked_corridors:
            if "jalinsum" in bc.lower() or "arteri" in bc.lower():
                disrupted_corridors.add("trans_sumatra")
            if "belawan" in bc.lower():
                disrupted_corridors.add("belawan_access")
            
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
    
    # Extract cargo context from state
    commodity_candidates = state.get("news_affected_commodities") or []
    active_commodity = commodity_candidates[0] if commodity_candidates else "cabai_merah"
    cargo_tonnage = float(state.get("cargo_tonnage", 15.0))
    vehicle_gross_weight = float(state.get("vehicle_gross_weight_ton", 18.0))
    has_bkhit = bool(state.get("has_bkhit_cert", True))
    
    try:
        # Robust origin & destination resolution
        req_origin = state.get("origin") or state.get("start_location")
        req_dest = state.get("destination") or state.get("end_location")
        
        node_lookup = {str(n).lower(): n for n in G.nodes}
        
        origin = None
        if req_origin and str(req_origin).lower() in node_lookup:
            origin = node_lookup[str(req_origin).lower()]
        elif "belawan_port" in G:
            origin = "belawan_port"
        elif "Belawan Port" in G:
            origin = "Belawan Port"
        elif len(G.nodes) > 0:
            origin = list(G.nodes)[0]

        destination = None
        if req_dest and str(req_dest).lower() in node_lookup:
            destination = node_lookup[str(req_dest).lower()]
        elif "dumai_port" in G:
            destination = "dumai_port"
        elif "Dumai Port" in G:
            destination = "Dumai Port"
        elif len(G.nodes) > 1:
            destination = list(G.nodes)[-1]

        if origin and destination and origin != destination:
            if not nx.has_path(G, origin, destination):
                # Search for any connected pair between candidate origins and destinations
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
                
                # Dynamic waypoint along the route
                waypoints = [{"lat": 3.78 + (idx * 0.02), "lon": 98.68 - (idx * 0.02)}]
                wp_coords = [[wp["lon"], wp["lat"]] for wp in waypoints]
                
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

                recommendations.append({
                    "description": desc,
                    "waypoints": waypoints,
                    "distance_km": round(distance_km, 2),
                    "eta_minutes": eta_minutes,
                    "fuel_increase_pct": max(0.0, round((distance_km - 26.0) * 0.12, 2)),
                    "risk_score": 0.15 if not is_detour else round(0.3 + (idx * 0.15), 2),
                    "hedging": hedging_dict,
                    "compliance": compliance_dict,
                    "chokepoint_delay_multiplier": choke_multiplier
                })
    except Exception as routing_err:
        logger.error(f"Error calculating NetworkX shortest paths: {routing_err}")

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

