import pickle
import logging
import asyncio
from typing import List, Tuple, Dict, Any, Optional
import networkx as nx
from app.db.supabase_client import get_client
from agents.memory.stm import get_async_redis
from agents.state import GraphRAGNode

logger = logging.getLogger(__name__)


async def load_entity_graph() -> nx.DiGraph:
    """Loads entities and relations from Supabase, builds a NetworkX DiGraph, and caches it in Redis."""
    r = get_async_redis()
    cache_key = "lrip:graph:entity"
    dirty_key = "lrip:graph:dirty"
    
    try:
        # Check if cache is dirty or missing
        is_dirty = await r.get(dirty_key)
        if not is_dirty:
            cached_data = await r.get(cache_key)
            if cached_data:
                # Redis returns string, but we want bytes if we set it as bytes
                # Since decode_responses=True is set on our Redis client, Redis will try to decode
                # to string. So it's safer to store and load via hex or base64, or just skip decode for this key.
                # Since our client has decode_responses=True, let's encode the string back to bytes to unpickle.
                if isinstance(cached_data, str):
                    try:
                        # If we stored it as latin-1, decode it back
                        return pickle.loads(cached_data.encode('latin-1'))
                    except Exception as pe:
                        logger.warning(f"Failed to unpickle cached graph: {pe}. Rebuilding.")
        
        # If dirty or missing, rebuild
        logger.info("Rebuilding entity graph from Supabase...")
        G = nx.DiGraph()
        supabase = get_client()
        
        # 1. Fetch entities
        ent_response = await asyncio.to_thread(
            lambda: supabase.table("entities").select("*").execute()
        )
        entities = ent_response.data or []
        for ent in entities:
            e_id = ent["entity_id"]
            G.add_node(
                e_id,
                entity_id=e_id,
                name=ent["name"],
                entity_type=ent["entity_type"],
                lat=ent.get("lat"),
                lon=ent.get("lon"),
                region=ent.get("region"),
                metadata=ent.get("metadata", {})
            )
            
        # 2. Fetch relations
        rel_response = await asyncio.to_thread(
            lambda: supabase.table("entity_relations").select("*").execute()
        )
        relations = rel_response.data or []
        for rel in relations:
            G.add_edge(
                rel["from_entity"],
                rel["to_entity"],
                relation_type=rel["relation_type"],
                weight=rel.get("weight", 1.0),
                relation_id=rel["relation_id"]
            )
            
        # 3. Cache the graph
        serialized = pickle.dumps(G).decode('latin-1')
        await r.set(cache_key, serialized, ex=3600)  # cache for 1 hour
        await r.delete(dirty_key)
        
        return G

    except Exception as e:
        logger.error(f"Failed to load or cache entity graph: {e}")
        # Return empty graph on error
        return nx.DiGraph()


def get_causal_chain(G: nx.DiGraph, disrupted_entity_id: str, max_depth: int = 4) -> List[GraphRAGNode]:
    """Runs a BFS from the disrupted node, following downstream links."""
    if disrupted_entity_id not in G:
        logger.warning(f"Disrupted entity ID {disrupted_entity_id} not found in graph.")
        return []
        
    chain: List[GraphRAGNode] = []
    
    # Run Breadth First Search (BFS) successions
    visited = {disrupted_entity_id}
    queue: List[Tuple[str, int]] = [(disrupted_entity_id, 0)]
    
    while queue:
        curr_id, depth = queue.pop(0)
        if depth >= max_depth:
            continue
            
        # Look at outbound edges (downstream dependencies)
        for neighbor_id in G.successors(curr_id):
            if neighbor_id not in visited:
                visited.add(neighbor_id)
                edge_data = G.get_edge_data(curr_id, neighbor_id)
                node_data = G.nodes[neighbor_id]
                
                # Relation type and weight
                relation = edge_data.get("relation_type", "DEPENDS_ON")
                weight = edge_data.get("weight", 1.0)
                
                # Impact score decreases with depth
                impact_score = max(0.0, min(1.0, weight / (depth + 1)))
                
                chain.append({
                    "entity_id": neighbor_id,
                    "entity_type": node_data.get("entity_type", "unknown"),
                    "name": node_data.get("name", "Unknown Node"),
                    "relation": relation,
                    "impact_score": round(impact_score, 2)
                })
                
                queue.append((neighbor_id, depth + 1))
                
    # Sort by impact score descending
    chain.sort(key=lambda x: x["impact_score"], reverse=True)
    return chain


async def query_graphrag(disrupted_entity_name: str) -> List[GraphRAGNode]:
    """Top-level function: resolves name to UUID, loads graph, runs BFS traversal."""
    try:
        supabase = get_client()
        # Resolve name to entity_id
        res = await asyncio.to_thread(
            lambda: supabase.table("entities").select("entity_id").ilike("name", f"%{disrupted_entity_name}%").execute()
        )
        if not res.data:
            logger.warning(f"Could not resolve entity name '{disrupted_entity_name}' to UUID.")
            return []
            
        entity_id = res.data[0]["entity_id"]
        G = await load_entity_graph()
        return get_causal_chain(G, entity_id)
        
    except Exception as e:
        logger.error(f"Error in query_graphrag: {e}")
        return []
