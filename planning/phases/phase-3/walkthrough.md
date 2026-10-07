# Walkthrough: PetaNadi LangGraph Swarm Agent Pipeline & API

This walkthrough summarizes the technical implementation, verification plan, and test results for **Phase 3: LangGraph Swarm reasoning pipeline** of the PetaNadi / LRIP platform.

## What Was Accomplished

We successfully built the full **LangGraph Swarm Agent reasoning pipeline** featuring six cooperative specialized agents, a state machine, a consensus gate, a real-time worker layer, FastAPI integration, and a mock unit test suite.

### 1. State Space & Models (`agents/state.py`)
- Defined the unified `CrisisState` holding:
  - Incident details (coordinates, type, severity, status).
  - Individual agent findings (`data_collection`, `osint_hazard`, `prediction`, `route_optimization`, `economic_intelligence`).
  - Pipeline metadata (consensus routes, messages, inflation forecast, alternative routes).
- Implemented TypedDict structures for type-safe coordination.

### 2. Multi-Agent Reasoning Nodes (`agents/nodes/`)
- **Agent 1: DataCollectionAgent (`data_collection.py`)**: Checks for duplicates using event hashing in Redis STM, validates input payloads, and assesses source reliability against Supabase table metadata.
- **Agent 2: OSINTHazardAgent (`osint_hazard.py`)**: Queries active spatial hazard polygons in Supabase, filters social OSINT media streams for corroboration, and adds geographic context.
- **Agent 3: PredictionAgent (`prediction.py`)**: Models multi-horizon congestion forecasts (6h/12h/24h/48h) using linear regression / extrapolation via `numpy` from TomTom travel delays stored in Redis.
- **Agent 4: RouteOptimizationAgent (`route_optimization.py`)**: Compiles physical road graph segments and uses a Dijkstra-based route finder to identify alternate supply routes when primary corridors are blocked.
- **Agent 5: EconomicIntelligenceAgent (`economic_intelligence.py`)**: Detects staple price anomalies in Redis (PIHPS datasets) and queries similar historical precedents in pgvector LTM to project inflation multipliers.
- **Agent 6: DecisionSupportCopilot (`decision_support.py`)**: Integrates all findings, pulls context from GraphRAG, generates an executive summary using Gemini Flash, and saves the verified alert to Supabase.

### 3. Consensus Gate & Graph Compiler (`agents/graph.py`)
- Created `agents/tools/consensus_gate.py` to evaluate the weighted confidence of all agent findings (threshold: 85% to validate).
- Configured a routing state machine using LangGraph:
  - If duplicate: exits early.
  - If confidence >= 85%: routes to `decision_support` -> outputs validated alert.
  - If confidence < 85%: marks status as `unconfirmed` -> exits without writing to public table.
- Compiled the graph cleanly and validated graph serialization.

### 4. Real-time Worker & APIs (`backend/app/`)
- Created `backend/app/workers/agent_worker.py` to bridge the FastAPI thread with the async LangGraph event execution.
- Implemented WebSocket streaming of agent node-by-node updates to allow real-time progress visualization on the frontend dashboard.
- Registered endpoints in `backend/app/routers/agent_router.py` and connected them to `backend/app/main.py`.

---

## Technical File Mapping

- [state.py](file:///d:/College/Pidi.id/agents/state.py) — Type definitions & State schema
- [graph.py](file:///d:/College/Pidi.id/agents/graph.py) — LangGraph structure & Node compiling
- [consensus_gate.py](file:///d:/College/Pidi.id/agents/tools/consensus_gate.py) — Consensus voting logic
- [data_collection.py](file:///d:/College/Pidi.id/agents/nodes/data_collection.py) — Input validation & Redis duplicate filter
- [osint_hazard.py](file:///d:/College/Pidi.id/agents/nodes/osint_hazard.py) — Spatial hazards & OSINT corroboration
- [prediction.py](file:///d:/College/Pidi.id/agents/nodes/prediction.py) — NumPy traffic forecasting
- [route_optimization.py](file:///d:/College/Pidi.id/agents/nodes/route_optimization.py) — Dijkstra route solver
- [economic_intelligence.py](file:///d:/College/Pidi.id/agents/nodes/economic_intelligence.py) — PIHPS price anomalies & LTM matching
- [decision_support.py](file:///d:/College/Pidi.id/agents/nodes/decision_support.py) — GraphRAG entity expansion & narrative generator
- [agent_worker.py](file:///d:/College/Pidi.id/backend/app/workers/agent_worker.py) — LangGraph executor
- [agent_router.py](file:///d:/College/Pidi.id/backend/app/routers/agent_router.py) — API entrypoints & WebSocket streaming
- [test_agents.py](file:///d:/College/Pidi.id/backend/tests/test_agents.py) — Unit test suite (12 tests)

---

## Verification & Test Results

We validated the pipeline using a mock test suite covering all logic paths without external dependencies. 

```bash
$env:PYTHONPATH="backend;."
backend\.venv\Scripts\python.exe -m pytest backend/tests/test_agents.py -v
```

### Output:
```
============================= test session starts =============================
platform win32 -- Python 3.13.7, pytest-8.2.2, pluggy-1.6.0
rootdir: D:\College\Pidi.id
plugins: anyio-4.14.1, langsmith-0.10.0, asyncio-0.23.7
asyncio: mode=Mode.STRICT
collected 12 items

backend/tests/test_agents.py::test_data_collection_valid_event PASSED    [  8%]
backend/tests/test_agents.py::test_data_collection_duplicate_event PASSED [ 16%]
backend/tests/test_agents.py::test_data_collection_malformed_event PASSED [ 25%]
backend/tests/test_agents.py::test_osint_hazard_with_polygon PASSED      [ 33%]
backend/tests/test_agents.py::test_osint_hazard_no_polygon PASSED        [ 41%]
backend/tests/test_agents.py::test_prediction_with_tomtom_data PASSED    [ 50%]
backend/tests/test_agents.py::test_route_optimization_blocked_primary PASSED [ 58%]
backend/tests/test_agents.py::test_economic_intelligence_anomaly_detected PASSED [ 66%]
backend/tests/test_agents.py::test_consensus_gate_validates_at_85pct PASSED [ 75%]
backend/tests/test_agents.py::test_consensus_gate_rejects_below_85pct PASSED [ 83%]
backend/tests/test_agents.py::test_decision_support_output_format PASSED [ 91%]
backend/tests/test_agents.py::test_graph_compiles PASSED                 [100%]

======================= 12 passed, 4 warnings in 2.93s ========================
```

The pipeline compiles successfully and resolves consensus gates exactly as specified.
