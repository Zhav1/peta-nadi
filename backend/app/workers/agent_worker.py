import hashlib
import json
import logging
from typing import AsyncIterator
from langgraph.checkpoint.memory import MemorySaver
from agents.graph import build_crisis_graph
from agents.state import CrisisState

logger = logging.getLogger(__name__)

# Compile the graph
_graph = build_crisis_graph()
_memory = MemorySaver()
_compiled = _graph.compile(checkpointer=_memory)


def generate_crisis_id(event: dict) -> str:
    """Generates a stable 16-character hex ID for the crisis based on payload."""
    payload = json.dumps(event, sort_keys=True, default=str)
    return hashlib.sha256(payload.encode()).hexdigest()[:16]


async def process_crisis_event(event: dict) -> AsyncIterator[dict]:
    """Streams intermediate states as each node in the graph completes."""
    crisis_id = generate_crisis_id(event)
    config = {"configurable": {"thread_id": crisis_id}}
    
    # Initialize state
    initial_state = {
        **event,
        "crisis_id": crisis_id,
        "status": "detecting",
        "messages": ["Worker: Initiated crisis tracking."],
        "route_recommendations": [],
        "causal_chain": [],
        "hazard_polygons": [],
        "congestion_forecast": {},
        "ltm_episodes": [],
        "consensus_breakdown": {},
        "validated": False,
        "overall_confidence": 0.0,
        "created_at": datetime.now(timezone.utc).isoformat() if 'datetime' in globals() else "",
        "updated_at": datetime.now(timezone.utc).isoformat() if 'datetime' in globals() else ""
    }
    
    # Standardize datetime helper if not imported
    from datetime import datetime, timezone
    initial_state["created_at"] = datetime.now(timezone.utc).isoformat()
    initial_state["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    logger.info(f"Starting async streaming execution for crisis: {crisis_id}")
    async for chunk in _compiled.astream(initial_state, config=config):
        yield chunk


async def run_crisis_event(event: dict) -> CrisisState:
    """One-shot invocation - runs the graph to completion and returns the final state."""
    crisis_id = generate_crisis_id(event)
    config = {"configurable": {"thread_id": crisis_id}}
    
    from datetime import datetime, timezone
    initial_state = {
        **event,
        "crisis_id": crisis_id,
        "status": "detecting",
        "messages": ["Worker: Initiated crisis tracking (one-shot)."],
        "route_recommendations": [],
        "causal_chain": [],
        "hazard_polygons": [],
        "congestion_forecast": {},
        "ltm_episodes": [],
        "consensus_breakdown": {},
        "validated": False,
        "overall_confidence": 0.0,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    logger.info(f"Starting one-shot execution for crisis: {crisis_id}")
    result = await _compiled.ainvoke(initial_state, config=config)
    return result
