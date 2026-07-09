from langgraph.graph import StateGraph, END
from agents.state import CrisisState
from agents.nodes.data_collection import data_collection_agent
from agents.nodes.osint_hazard import osint_hazard_agent
from agents.nodes.prediction import prediction_agent
from agents.nodes.route_optimization import route_optimization_agent
from agents.nodes.economic_intelligence import economic_intelligence_agent
from agents.nodes.decision_support import decision_support_copilot
from agents.tools.consensus_gate import compute_consensus


def archive_unconfirmed(state: CrisisState) -> dict:
    """Terminal node for events that do not pass the consensus gate."""
    return {"status": "unconfirmed"}


def consensus_gate_node(state: CrisisState) -> dict:
    """Fan-in aggregation node that computes weighted confidence."""
    result = compute_consensus(state)
    return {
        "overall_confidence": result["overall_confidence"],
        "consensus_breakdown": result["consensus_breakdown"],
        "validated": result["route"] == "validated"
    }


def route_after_gate(state: CrisisState) -> str:
    """Determines branching logic based on validation status."""
    return "decision_support" if state.get("validated") else "archive"


def build_crisis_graph() -> StateGraph:
    """Assembles and compiles the LangGraph agent swarm StateGraph."""
    graph = StateGraph(CrisisState)

    # 1. Add all nodes
    graph.add_node("data_collection", data_collection_agent)
    graph.add_node("osint_hazard", osint_hazard_agent)
    graph.add_node("prediction", prediction_agent)
    graph.add_node("route_optimization", route_optimization_agent)
    graph.add_node("economic_intelligence", economic_intelligence_agent)
    graph.add_node("consensus_gate", consensus_gate_node)
    graph.add_node("decision_support", decision_support_copilot)
    graph.add_node("archive", archive_unconfirmed)

    # 2. Set entry point
    graph.set_entry_point("data_collection")

    # 3. Add edges (Fan-out)
    graph.add_edge("data_collection", "osint_hazard")
    graph.add_edge("data_collection", "prediction")
    graph.add_edge("data_collection", "route_optimization")
    graph.add_edge("data_collection", "economic_intelligence")

    # 4. Add edges (Fan-in)
    graph.add_edge("osint_hazard", "consensus_gate")
    graph.add_edge("prediction", "consensus_gate")
    graph.add_edge("route_optimization", "consensus_gate")
    graph.add_edge("economic_intelligence", "consensus_gate")

    # 5. Add conditional edges from consensus_gate
    graph.add_conditional_edges(
        "consensus_gate",
        route_after_gate,
        {
            "decision_support": "decision_support",
            "archive": "archive"
        }
    )

    # 6. Add terminal edges
    graph.add_edge("decision_support", END)
    graph.add_edge("archive", END)

    return graph
