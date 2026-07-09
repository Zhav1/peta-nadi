import logging
import asyncio
from typing import List, Dict, Tuple, Any, Optional
from datetime import datetime, timezone
from app.db.supabase_client import get_client
from agents.state import CrisisState

logger = logging.getLogger(__name__)


async def write_incident(state: CrisisState) -> str:
    """Inserts or updates a validated alert in the Supabase 'incidents' table."""
    try:
        supabase = get_client()
        
        # Format payloads for JSONB fields
        evidence_chain = {
            "data_collection": state.get("data_collection_finding"),
            "osint_hazard": state.get("osint_hazard_finding"),
            "prediction": state.get("prediction_finding"),
            "route_optimization": state.get("route_optimization_finding"),
            "economic_intelligence": state.get("economic_intelligence_finding")
        }
        
        db_payload = {
            "title": state.get("title", "Unnamed Crisis Event"),
            "type": state.get("type", "unknown"),
            "is_simulated": state.get("is_simulated", False),
            "lat": state.get("lat"),
            "lon": state.get("lon"),
            "region": state.get("region"),
            "affected_polygon": state.get("affected_polygon"),
            "status": state.get("status", "validated"),
            "overall_confidence": state.get("overall_confidence", 0.0),
            "evidence_chain": evidence_chain,
            "route_recommendations": state.get("route_recommendations", []),
            "inflation_forecast": state.get("inflation_forecast"),
            "causal_chain": state.get("causal_chain", []),
            "decision_support_output": state.get("decision_support_output"),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        
        # Check if the incident already exists (using crisis_id as a key if stored or metadata)
        # For simplicity, we can do a select by title and region, or insert a new one
        res = await asyncio.to_thread(
            lambda: supabase.table("incidents").insert(db_payload).execute()
        )
        if res.data:
            incident_id = res.data[0]["incident_id"]
            logger.info(f"Successfully saved incident to Supabase: {incident_id}")
            return str(incident_id)
        return ""
    except Exception as e:
        logger.error(f"Failed to write incident to Supabase: {e}")
        return ""


async def get_hazard_polygons(lat: float, lon: float, radius_km: float = 50) -> List[Dict]:
    """Queries active incidents near (lat, lon) that contain affected polygons."""
    delta = radius_km / 111.0  # Approx degrees
    try:
        supabase = get_client()
        res = await asyncio.to_thread(
            lambda: supabase.table("incidents")
            .select("*")
            .gte("lat", lat - delta)
            .lte("lat", lat + delta)
            .gte("lon", lon - delta)
            .lte("lon", lon + delta)
            .execute()
        )
        
        hazards = []
        for row in (res.data or []):
            if row.get("affected_polygon"):
                hazards.append({
                    "incident_id": row["incident_id"],
                    "title": row["title"],
                    "type": row["type"],
                    "severity": "high",  # Default mapping
                    "polygon": row["affected_polygon"]
                })
        return hazards
    except Exception as e:
        logger.error(f"Failed to query hazard polygons: {e}")
        return []


async def get_source_health(source_name: str) -> str:
    """Queries source_health table for current status ('green', 'yellow', 'red')."""
    try:
        supabase = get_client()
        res = await asyncio.to_thread(
            lambda: supabase.table("source_health")
            .select("status")
            .eq("source_name", source_name)
            .execute()
        )
        if res.data:
            return res.data[0]["status"]
    except Exception as e:
        logger.error(f"Failed to query source health for {source_name}: {e}")
    return "yellow"  # Default fallback


async def load_entities_and_relations() -> Tuple[List[Dict], List[Dict]]:
    """Returns raw entity and relation rows for graph building."""
    try:
        supabase = get_client()
        ent_res = await asyncio.to_thread(
            lambda: supabase.table("entities").select("*").execute()
        )
        rel_res = await asyncio.to_thread(
            lambda: supabase.table("entity_relations").select("*").execute()
        )
        return ent_res.data or [], rel_res.data or []
    except Exception as e:
        logger.error(f"Failed to load entities and relations: {e}")
        return [], []


async def load_road_graph() -> List[Dict]:
    """Reads road_graph_edges table."""
    try:
        supabase = get_client()
        res = await asyncio.to_thread(
            lambda: supabase.table("road_graph_edges").select("*").execute()
        )
        return res.data or []
    except Exception as e:
        logger.error(f"Failed to load road graph edges: {e}")
        return []
