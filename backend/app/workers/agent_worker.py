import hashlib
import json
import logging
from datetime import datetime, timezone
from typing import AsyncIterator, Dict, Any, Tuple
from langgraph.checkpoint.memory import MemorySaver
from agents.graph import build_crisis_graph
from agents.memory.stm import save_crisis_state
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

# Nodes that emit a standard AgentFinding dict. consensus_gate and
# decision_support intentionally do not, so the worker resolves them from their
# real state keys below instead of looking up a non-existent
# "consensus_gate_finding" (which used to fall back to 0.85 / blank).
NODE_FINDING_KEYS = {
    "data_collection": "data_collection_finding",
    "osint_hazard": "osint_hazard_finding",
    "prediction": "prediction_finding",
    "economic_intelligence": "economic_intelligence_finding",
    "route_optimization": "route_optimization_finding",
}

_CHANNEL_LABELS = {
    "weather": "cuaca",
    "traffic": "lalu lintas",
    "osint": "OSINT",
    "economics": "ekonomi",
}


def _as_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def resolve_node_result(
    node_name: str,
    node_out: Any,
    state: Dict[str, Any],
) -> Tuple[float, str]:
    """Resolve the real confidence + summary for one completed node.

    ``state`` must already include ``node_out`` (the caller merges before
    calling). Gate/decision nodes have no ``<node>_finding`` payload, so their
    figures come from the actual state keys:
      - consensus_gate -> overall_confidence / consensus_breakdown / validated
      - decision_support -> overall_confidence / decision_support_output
    """
    out = node_out if isinstance(node_out, dict) else {}

    if node_name == "consensus_gate":
        confidence = _as_float(
            state.get("overall_confidence", out.get("overall_confidence")), 0.0
        )
        validated = bool(state.get("validated", out.get("validated")))
        breakdown = state.get("consensus_breakdown") or out.get("consensus_breakdown") or {}
        channels = [
            label
            for key, label in _CHANNEL_LABELS.items()
            if _as_float(breakdown.get(key), 0.0) > 0.0
        ]
        if validated:
            summary = f"Konsensus multi-sumber tervalidasi ({confidence * 100:.0f}%)."
            if channels:
                summary += f" Kanal aktif: {', '.join(channels)}."
        else:
            summary = (
                f"Konsensus belum tercapai ({confidence * 100:.0f}% < ambang 85%)."
            )
        return confidence, summary

    if node_name == "decision_support":
        confidence = _as_float(
            state.get("overall_confidence", out.get("overall_confidence")), 0.0
        )
        summary = str(
            state.get("decision_support_output")
            or out.get("decision_support_output")
            or ""
        ).strip()
        if not summary:
            summary = "Ringkasan eksekutif belum tersedia."
        elif len(summary) > 240:
            summary = summary[:237].rstrip() + "..."
        return confidence, summary

    if node_name == "archive":
        return 0.0, "Konsensus tidak tercapai; krisis diarsipkan tanpa alert tervalidasi."

    finding_key = NODE_FINDING_KEYS.get(node_name, f"{node_name}_finding")
    finding = out.get(finding_key)
    if not isinstance(finding, dict):
        state_finding = state.get(finding_key)
        finding = state_finding if isinstance(state_finding, dict) else {}

    confidence = _as_float(finding.get("confidence"), 0.0)
    summary = str(finding.get("summary") or "").strip()
    return confidence, summary


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
                confidence, summary = resolve_node_result(
                    node_name, node_out, accumulated_state
                )

                # Persist the live STM snapshot under the canonical key
                # (lrip:state:crisis:{id}) so resume/debug reads match redis_client.
                try:
                    await save_crisis_state(crisis_id, accumulated_state)
                except Exception as stm_err:
                    logger.debug(f"Crisis STM snapshot skipped for {crisis_id}: {stm_err}")

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

        # 2. Final completion event. It always carries the validated alert (the
        # documented SSE guarantee) in addition to routes/hedging/copilot output.
        yield {
            "event": "simulation_complete",
            "status": "complete",
            "crisis_id": crisis_id,
            "validated": accumulated_state.get("validated", True),
            "overall_confidence": accumulated_state.get("overall_confidence"),
            "routes": accumulated_state.get("route_recommendations", []),
            "hedging": accumulated_state.get("hedging_breakdown"),
            "compliance": accumulated_state.get("compliance_status"),
            "copilot_summary": accumulated_state.get("decision_support_output"),
            "causal_chain": accumulated_state.get("causal_chain", []),
            "alert": accumulated_state.get("validated_alert"),
            "notification_status": accumulated_state.get("notification_status"),
            "degraded_sources": accumulated_state.get("degraded_sources") or [],
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

    # Persist the terminal STM snapshot under the canonical crisis key.
    try:
        await save_crisis_state(crisis_id, result)
    except Exception as stm_err:
        logger.debug(f"Crisis STM snapshot skipped for {crisis_id}: {stm_err}")

    # Update AGENT_STATUS_STORE for all executed nodes with real confidences.
    try:
        from app.routers.agent_router import update_agent_status
        for node_name, (agent_id, _) in NODE_AGENT_MAP.items():
            if node_name in ("consensus_gate", "decision_support"):
                required_key = (
                    "overall_confidence"
                    if node_name == "consensus_gate"
                    else "decision_support_output"
                )
                if required_key not in result:
                    continue
            else:
                finding_key = NODE_FINDING_KEYS.get(
                    node_name, f"{node_name}_finding"
                )
                if finding_key not in result:
                    continue

            confidence, summary = resolve_node_result(node_name, result, result)
            update_agent_status(agent_id, "complete", confidence, summary)
    except Exception:
        pass

    return result
