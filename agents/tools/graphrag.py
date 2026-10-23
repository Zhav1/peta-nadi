import pickle
import logging
import asyncio
from typing import List, Tuple, Dict, Any, Optional
import networkx as nx
from app.db.supabase_client import get_client
from agents.memory.stm import get_async_redis
from agents.state import GraphRAGNode

logger = logging.getLogger(__name__)

# Canonical knowledge-graph tables (000_init.sql) with legacy MVP fallbacks.
# The graph used to be built ONLY from the legacy entities/entity_relations
# tables, which do not exist in the current schema, so causal_chain was always
# empty. kg_* is primary; legacy names remain as a read fallback.
ENTITY_TABLES = ("kg_entities", "entities")
RELATION_TABLES = ("kg_relationships", "entity_relations")

_GRAPH_CACHE_KEY = "lrip:graph:entity:v2"  # v2: schema-aware rebuild (busts old empty cache)


def _coerce_float(value: Any) -> Optional[float]:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _entity_lat_lon(row: Dict[str, Any]) -> Tuple[Optional[float], Optional[float]]:
    """Extracts coordinates from row columns, metadata, or GeoJSON-ish payloads."""
    metadata = row.get("metadata") if isinstance(row.get("metadata"), dict) else {}
    lat = _coerce_float(row.get("lat", metadata.get("lat", metadata.get("latitude"))))
    lon = _coerce_float(row.get("lon", metadata.get("lon", metadata.get("longitude"))))
    location = row.get("location")
    if isinstance(location, dict):
        coords = location.get("coordinates")
        if isinstance(coords, (list, tuple)) and len(coords) >= 2:
            lon = lon if lon is not None else _coerce_float(coords[0])
            lat = lat if lat is not None else _coerce_float(coords[1])
    return lat, lon


def _normalize_entity(row: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Normalizes kg_entities (id/type/location) and legacy entities rows."""
    if not isinstance(row, dict):
        return None
    entity_id = row.get("entity_id") or row.get("id")
    name = row.get("name")
    if not entity_id or not name:
        return None
    lat, lon = _entity_lat_lon(row)
    metadata = row.get("metadata") if isinstance(row.get("metadata"), dict) else {}
    return {
        "entity_id": str(entity_id),
        "name": str(name),
        "entity_type": row.get("entity_type") or row.get("type") or "unknown",
        "lat": lat,
        "lon": lon,
        "region": row.get("region") or metadata.get("province") or metadata.get("region"),
        "metadata": metadata,
    }


def _normalize_relation(row: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Normalizes kg_relationships (relation) and legacy entity_relations rows."""
    if not isinstance(row, dict):
        return None
    from_entity = (
        row.get("from_entity") or row.get("from_entity_id") or row.get("from_id")
    )
    to_entity = row.get("to_entity") or row.get("to_entity_id") or row.get("to_id")
    relation_type = row.get("relation_type") or row.get("relation") or "DEPENDS_ON"
    if not from_entity or not to_entity:
        return None
    return {
        "from_entity": str(from_entity),
        "to_entity": str(to_entity),
        "relation_type": str(relation_type),
        "weight": _coerce_float(row.get("weight")) or 1.0,
        "relation_id": str(
            row.get("relation_id")
            or row.get("id")
            or f"{from_entity}->{to_entity}:{relation_type}"
        ),
    }


async def _fetch_graph_rows(supabase, tables: Tuple[str, ...], label: str) -> List[Dict[str, Any]]:
    """Reads the first available table in ``tables``; missing tables fall back."""
    for table in tables:
        try:
            response = await asyncio.to_thread(
                lambda t=table: supabase.table(t).select("*").execute()
            )
            rows = response.data or []
            logger.debug("Loaded %d %s rows from %s", len(rows), label, table)
            return rows
        except Exception as exc:
            logger.warning(
                "Graph table %s unavailable for %s (%s); trying next fallback.",
                table,
                label,
                exc,
            )
    logger.error("No readable %s table found among %s", label, tables)
    return []


async def load_entity_graph() -> nx.DiGraph:
    """Loads entities and relations from Supabase, builds a NetworkX DiGraph, and caches it in Redis."""
    r = get_async_redis()
    cache_key = _GRAPH_CACHE_KEY
    dirty_key = "lrip:graph:dirty"

    # 1. Cache read is best-effort: a Redis outage must not zero the graph.
    try:
        is_dirty = await r.get(dirty_key)
        if not is_dirty:
            cached_data = await r.get(cache_key)
            if isinstance(cached_data, str):
                try:
                    return pickle.loads(cached_data.encode('latin-1'))
                except Exception as pe:
                    logger.warning(f"Failed to unpickle cached graph: {pe}. Rebuilding.")
    except Exception as cache_err:
        logger.warning(f"Graph cache read unavailable ({cache_err}); rebuilding from Supabase.")

    # 2. Rebuild from the canonical knowledge-graph tables.
    G = nx.DiGraph()
    try:
        logger.info("Rebuilding entity graph from Supabase...")
        supabase = get_client()

        entity_rows = await _fetch_graph_rows(supabase, ENTITY_TABLES, "entity")
        for row in entity_rows:
            entity = _normalize_entity(row)
            if not entity:
                continue
            e_id = entity["entity_id"]
            G.add_node(
                e_id,
                entity_id=e_id,
                name=entity["name"],
                entity_type=entity["entity_type"],
                lat=entity["lat"],
                lon=entity["lon"],
                region=entity["region"],
                metadata=entity["metadata"],
            )

        relation_rows = await _fetch_graph_rows(supabase, RELATION_TABLES, "relation")
        for row in relation_rows:
            relation = _normalize_relation(row)
            if not relation:
                continue
            G.add_edge(
                relation["from_entity"],
                relation["to_entity"],
                relation_type=relation["relation_type"],
                weight=relation["weight"],
                relation_id=relation["relation_id"],
            )
    except Exception as e:
        logger.error(f"Failed to rebuild entity graph from Supabase: {e}")
        return nx.DiGraph()

    # 3. Cache write is best-effort (never discard a successfully built graph).
    if G.number_of_nodes() > 0:
        try:
            serialized = pickle.dumps(G).decode('latin-1')
            await r.set(cache_key, serialized, ex=3600)  # cache for 1 hour
            await r.delete(dirty_key)
        except Exception as cache_err:
            logger.warning(f"Graph cache write skipped ({cache_err}).")

    return G


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
    """Top-level function: resolves name to entity id, loads graph, runs BFS traversal."""
    if not disrupted_entity_name:
        return []
    try:
        supabase = get_client()
        pattern = f"%{disrupted_entity_name}%"
        entity_id = None

        # Resolve against kg_entities first, then the legacy entities table.
        for table in ENTITY_TABLES:
            try:
                res = await asyncio.to_thread(
                    lambda t=table: supabase.table(t)
                    .select("*")
                    .ilike("name", pattern)
                    .execute()
                )
            except Exception as table_err:
                logger.warning(
                    "Entity resolution failed on %s (%s); trying fallback.",
                    table,
                    table_err,
                )
                continue

            rows = res.data or []
            if not rows:
                continue
            entity = _normalize_entity(rows[0])
            if entity:
                entity_id = entity["entity_id"]
                break

        if not entity_id:
            logger.warning(f"Could not resolve entity name '{disrupted_entity_name}' to an id.")
            return []

        G = await load_entity_graph()
        return get_causal_chain(G, entity_id)
        
    except Exception as e:
        logger.error(f"Error in query_graphrag: {e}")
        return []
