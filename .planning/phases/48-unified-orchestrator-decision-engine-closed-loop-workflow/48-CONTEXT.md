# Phase 48: Context, Constraints & Architectural Baseline

## 1. Background & Operational Reality
Following the forensic audit conducted during the `/grill-me` session, a critical disconnect was diagnosed across the engine, workflows, and decision-making systems of PreHub:

1. **Inverted LangGraph Swarm Topology:**
   - [graph.py](file:///d:/College/Pidi.id/agents/graph.py) initiates a blind parallel fan-out immediately after `data_collection`.
   - Agent 4 (`route_optimization_agent`) and Agent 5 (`economic_intelligence_agent`) execute concurrently with Agent 2 (`osint_hazard_agent`), attempting to read `hazard_polygons` and `blocked_corridors` from state before Agent 2 has even populated them.
   - Route optimization runs before the Consensus Gate validates whether the incident is real or false.

2. **Client-Side Simulation Disconnect:**
   - In [DashboardClient.tsx](file:///d:/College/Pidi.id/frontend/components/dashboard/DashboardClient.tsx), triggering a simulation (dropping a hazard pin in TheoTown mode or clicking an incident) bypasses the backend swarm completely.
   - The UI constructs a synthetic client-side mock (`simulated-active`) and computes detour paths using browser Mapbox Directions API calls in [aiDynamicRouter.ts](file:///d:/College/Pidi.id/frontend/lib/aiDynamicRouter.ts).
   - The 6-agent status endpoint (`/api/v1/agents/status`) polled by the UI returns a static, hardcoded dictionary (`AGENT_STATUS_STORE`), rather than real LangGraph execution telemetry.

3. **High-Value Solvers Trapped as Isolated Endpoints:**
   - Phase 44 built defense-grade operational math engines inspired by Globot:
     - [spoilage_hedging_service.py](file:///d:/College/Pidi.id/backend/app/services/spoilage_hedging_service.py): Closed-form monetary solver (Continue vs Reroute vs Hold factoring perishability, BPJT tolls, Pertamina fuel rates).
     - [compliance_service.py](file:///d:/College/Pidi.id/backend/app/services/compliance_service.py): BKHIT quarantine certificate hard-block and MST axle-load warnings.
     - [intermodal_sync_service.py](file:///d:/College/Pidi.id/backend/app/services/intermodal_sync_service.py): 18+ choke-point proximity delay multipliers.
   - None of these are wired into the 6-agent swarm or utilized by Agent 6 (`decision_support_copilot`).

4. **Write-Only Decision Gate:**
   - Approvals logged in [approvals.py](file:///d:/College/Pidi.id/backend/app/routers/approvals.py) terminate at the database. No active fleet rerouting occurs on the Mapbox canvas, no outbound TMS webhook is queued, and the operational feedback loop remains open.

Phase 48 unifies the 6-agent swarm, decision engines, real-time streaming SSE, and active fleet rerouting into an end-to-end, defense-grade operational decision-support platform.

---

## 2. Core Architectural Decisions (Aligned in /grill-me)

- **Preserve 6-Agent Infrastructure:** All 6 agent files, role specializations, and schemas are strictly preserved; only the DAG execution topology in `graph.py` is restructured into a 4-stage sequential-parallel pipeline.
- **Deterministic Tool Embedding:** Spoilage Hedging, Intermodal Delays, and Regulatory Compliance are embedded directly into Agent 4 (Routing) and Agent 6 (Decision Support Copilot).
- **Streaming Orchestrator Bridge:** A new SSE endpoint (`POST /api/v1/simulate/stream`) streams LangGraph checkpoint events live to the UI as each agent completes, animating the tactical HUD in real time.
- **Active Operational Fleet Re-routing:** On operator approval (`ACCEPT` or `OVERRIDE`), the selected route polyline is committed to the map, active trucks on that corridor re-anchor to the detour path, an outbound TMS dispatch webhook is queued, and the action is recorded for $T+12\text{h} / T+24\text{h}$ outcome verification.
- **Dynamic Context Injection for AI Copilot:** The Tactical AI Copilot dynamically incorporates active incident data, corridor metrics, cargo perishability values, and operator persona role into its system context.

---

## 3. Strict Constraints & Non-AI Anti-Patterns

1. **Non-AI Anti-Patterns (from `AGENTS.md`):**
   - Zero generic AI purple/pink gradients.
   - Zero emojis in UI or console outputs (monochrome SVG Lucide icons only).
   - Strict 12px floor on functional typography; `tabular-nums` on all ledgers and metrics.
   - Maintain solid elevated surfaces (`#080d14`, `#0c1017`, `#121822`) without heavy `backdrop-blur`.
2. **Zero GPU Requirement:**
   - All routing and hedging must remain 100% CPU-executable via NetworkX, OR-Tools, and closed-form NumPy/Python math.
3. **Documentation & Test Integrity:**
   - All 133 existing tests must remain passing with zero regression.
   - All file links must use GitHub markdown `file:///` format.
