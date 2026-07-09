import logging
import asyncio
from datetime import datetime, timezone
import networkx as nx
from agents.state import CrisisState, AgentFinding, RouteRecommendation
from agents.tools.supabase_tools import load_road_graph

logger = logging.getLogger(__name__)


async def route_optimization_agent(state: CrisisState) -> dict:
    """Agent 4: NetworkX Dijkstra with hazard-weighted edges."""
    logger.info("Agent 4 [RouteOptimizationAgent] running...")
    
    # 1. Load road graph edges
    edges = await load_road_graph()
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
        
    # 3. Apply hazard penalties
    # Retrieve hazard polygons
    hazard_polygons = state.get("hazard_polygons") or []
    # Identify which corridors/edges are affected
    disrupted_corridors = set()
    for hazard in hazard_polygons:
        # Simplification: match hazard type or corridor
        # In a real system, we do ST_Intersects, but for MVP we match by proximity or name.
        # We can assume that if there is a port_closure or flood, it blocks the corridor.
        # E.g., if event is at Belawan Port, the belawan_access corridor is blocked.
        event_type = state.get("type") or state.get("event_type")
        if event_type == "port_closure" or event_type == "port_congestion":
            disrupted_corridors.add("belawan_access")
        else:
            disrupted_corridors.add("trans_sumatra")
            
    # Apply weights
    for u, v, data in G.edges(data=True):
        corridor = data.get("corridor")
        weight = data["distance_km"] * data["base_weight"]
        
        if corridor in disrupted_corridors:
            # Match severity penalty
            # Low: 1.5x, Medium: 3x, High: 10x, Critical: Remove edge
            severity = state.get("severity") or "medium"
            if severity == "low":
                weight *= 1.5
            elif severity == "medium":
                weight *= 3.0
            elif severity == "high":
                weight *= 10.0
            elif severity == "critical":
                weight = float('inf')  # blocked
                
        G[u][v]["weight"] = weight

    # 4. Find paths from origin to destination
    origin = "Belawan Port"
    destination = "Dumai Port"
    
    # Verify nodes are in graph
    if origin not in G or destination not in G:
        logger.warning(f"Routing endpoints not in road graph: {origin} -> {destination}")
        return {
            "route_recommendations": [],
            "route_optimization_finding": {
                "agent": "RouteOptimizationAgent",
                "confidence": 0.5,
                "summary": "Routing endpoints not found in road graph.",
                "data": {},
                "timestamp": datetime.now(timezone.utc).isoformat()
            }
        }
        
    recommendations: List[RouteRecommendation] = []
    
    try:
        # Find k-shortest paths
        paths = list(nx.shortest_simple_paths(G, origin, destination, weight="weight"))
        # Take up to 3 paths
        selected_paths = paths[:3]
        
        for idx, path in enumerate(selected_paths):
            # Calculate distance and eta
            distance_km = 0.0
            is_blocked = False
            for i in range(len(path) - 1):
                edge_data = G.get_edge_data(path[i], path[i+1])
                distance_km += edge_data["distance_km"]
                if edge_data.get("weight") == float('inf'):
                    is_blocked = True
                    
            if is_blocked and idx == 0:
                # If primary route is blocked, look at detours
                logger.info("Primary route is physically blocked. Diverting to alternatives.")
                
            # ETA based on avg 60 km/h
            eta_minutes = int((distance_km / 60.0) * 60)
            
            # Risk score (mocked based on edge disruptions)
            risk_score = 0.1 if idx == 0 and not is_blocked else (0.5 if idx == 1 else 0.8)
            if is_blocked:
                risk_score = 1.0
                
            # Generate description
            desc = f"Primary Route via {', '.join(path[1:4])}" if idx == 0 else f"Detour Option {idx} via {', '.join(path[1:4])}"
            
            recommendations.append({
                "description": desc,
                "waypoints": [{"lat": 3.78, "lon": 98.68}],  # Mock waypoints
                "distance_km": round(distance_km, 2),
                "eta_minutes": eta_minutes,
                "fuel_increase_pct": round((distance_km - recommendations[0]["distance_km"]) * 0.1, 2) if idx > 0 else 0.0,
                "risk_score": risk_score
            })
    except Exception as path_err:
        logger.error(f"Error calculating paths: {path_err}")

    # 5. Compute confidence score
    confidence = 0.7  # Base
    if len(recommendations) >= 2:
        confidence += 0.2
    if recommendations and recommendations[0]["risk_score"] < 0.3:
        confidence += 0.1
        
    confidence = min(1.0, confidence)
    
    finding: AgentFinding = {
        "agent": "RouteOptimizationAgent",
        "confidence": confidence,
        "summary": f"Calculated {len(recommendations)} routes. Primary route distance: {recommendations[0]['distance_km'] if recommendations else 0} km, ETA: {recommendations[0]['eta_minutes'] if recommendations else 0} mins.",
        "data": {"routes": recommendations},
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    
    logger.info(f"Agent 4 finished. Confidence: {confidence}")
    return {
        "route_recommendations": recommendations,
        "route_optimization_finding": finding,
        "messages": state.get("messages", []) + ["RouteOptimizationAgent: Calculated detour routes and risk profiles."]
    }
