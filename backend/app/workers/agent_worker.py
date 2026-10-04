import hashlib
import json
import logging
from datetime import datetime, timezone
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


NODE_AGENT_MAP = {
    "data_collection": ("DataCollectionAgent", "Data Collection & Health"),
    "osint_hazard": ("OSINTHazardAgent", "OSINT & Field Intelligence"),
    "prediction": ("PredictionAgent", "Congestion & Weather Forecast"),
    "consensus_gate": ("ConsensusGate", "Multi-Source Verification Gate"),
    "economic_intelligence": ("EconomicIntelligenceAgent", "Price & Inflation Intelligence"),
    "route_optimization": ("RouteOptimizationAgent", "Logistics & Graph Routing"),
    "decision_support": ("DecisionSupportCopilot", "AI Decision Support Copilot"),
}


async def process_crisis_event(event: dict) -> AsyncIterator[dict]:
    """Streams structured SSE events as each node in the 4-stage LangGraph completes."""
    crisis_id = generate_crisis_id(event)
    config = {"configurable": {"thread_id": crisis_id}}
    
    now_iso = datetime.now(timezone.utc).isoformat()
    accumulated_state: dict = {
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
        "created_at": now_iso,
        "updated_at": now_iso
    }
    
    logger.info(f"Starting async streaming execution for crisis: {crisis_id}")
    
    # 1. Initial event announcing start
    yield {
        "event": "simulation_started",
        "crisis_id": crisis_id,
        "title": event.get("title", f"[Simulasi] {event.get('type', 'Krisis')}"),
        "timestamp": now_iso
    }

    try:
        async for chunk in _compiled.astream(accumulated_state, config=config):
            for node_name, node_out in chunk.items():
                if isinstance(node_out, dict):
                    accumulated_state.update(node_out)
                
                agent_id, agent_name = NODE_AGENT_MAP.get(node_name, (node_name, node_name))
                finding_key = f"{node_name}_finding"
                finding = node_out.get(finding_key) if isinstance(node_out, dict) else {}
                
                confidence = 0.85
                summary = ""
                if isinstance(finding, dict):
                    confidence = float(finding.get("confidence", 0.85))
                    summary = str(finding.get("summary", ""))
                elif node_name == "consensus_gate":
                    confidence = float(accumulated_state.get("overall_confidence", 0.90))
                    summary = "Konsensus multi-sumber tervalidasi." if accumulated_state.get("validated") else "Konsensus belum tercapai."
                elif node_name == "decision_support":
                    confidence = 0.95
                    summary = "Ringkasan eksekutif dan rekomendasi mitigasi telah disusun."

                # Update live in-memory AGENT_STATUS_STORE
                try:
                    from app.routers.agent_router import update_agent_status
                    update_agent_status(agent_id, "complete", confidence, summary)
                except Exception:
                    pass

                yield {
                    "event": "node_update",
                    "node": node_name,
                    "agent_id": agent_id,
                    "agent_name": agent_name,
                    "status": "complete",
                    "confidence": round(confidence, 2),
                    "summary": summary,
                    "data": node_out,
                    "timestamp": datetime.now(timezone.utc).isoformat()
                }

        # 2. Final completion event containing validated routes, hedging & copilot summary
        yield {
            "event": "simulation_complete",
            "status": "complete",
            "crisis_id": crisis_id,
            "validated": accumulated_state.get("validated", True),
            "routes": accumulated_state.get("route_recommendations", []),
            "hedging": accumulated_state.get("hedging_breakdown"),
            "compliance": accumulated_state.get("compliance_status"),
            "copilot_summary": accumulated_state.get("decision_support_output"),
            "causal_chain": accumulated_state.get("causal_chain", []),
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "state": accumulated_state
        }
    except Exception as stream_err:
        logger.error(f"Error during LangGraph simulation stream: {stream_err}", exc_info=True)
        yield {
            "event": "error",
            "message": str(stream_err),
            "timestamp": datetime.now(timezone.utc).isoformat()
        }


async def run_crisis_event(event: dict) -> CrisisState:
    """One-shot invocation - runs the graph to completion and returns the final state."""
    crisis_id = generate_crisis_id(event)
    config = {"configurable": {"thread_id": crisis_id}}
    
    now_iso = datetime.now(timezone.utc).isoformat()
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
        "created_at": now_iso,
        "updated_at": now_iso
    }
    
    logger.info(f"Starting one-shot execution for crisis: {crisis_id}")
    result = await _compiled.ainvoke(initial_state, config=config)
    
    # Update AGENT_STATUS_STORE for all executed nodes
    try:
        from app.routers.agent_router import update_agent_status
        for node_name, (agent_id, _) in NODE_AGENT_MAP.items():
            finding = result.get(f"{node_name}_finding")
            if isinstance(finding, dict):
                update_agent_status(
                    agent_id,
                    "complete",
                    float(finding.get("confidence", 0.85)),
                    str(finding.get("summary", ""))
                )
    except Exception:
        pass

    return result
