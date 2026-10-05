# Phase 48: Unified Orchestrator, Decision Engine & Closed-Loop Workflow — Walkthrough

## 1. Overview
This walkthrough demonstrates the unified multi-agent architecture and closed-loop operational workflows implemented in Phase 48.

---

## 2. End-to-End Workflow Demonstration

### Stage 1: Disruption Simulation via Real-Time SSE Stream
1. **Triggering Simulation:**
   - In the frontend TheoTown simulation bar or via API (`POST /api/v1/simulate/stream`), a disruption scenario is submitted (e.g. "Banjir Jalinsum Lubuk Pakam KM 42").
   - The backend compiles the 4-stage LangGraph DAG and opens a `text/event-stream` response.
2. **Sequential Node Progressions:**
   - Client receives `simulation_started`.
   - Node 1 (`data_collection`): Verifies telemetry source health across BMKG, TomTom, AIS, and PIHPS.
   - Node 2 (`osint_hazard` + `prediction`): In parallel, extracts PostGIS polygons, queries ANTARA news streams, and assesses TomTom highway delay.
   - Node 3 (`consensus_gate`): Evaluates multi-sensor independence formula. If confidence $\ge 0.85$, marks state `validated: True`.
   - Node 4 (`economic_intelligence`): Reads validated disruption, computes PIHPS price volatility, and estimates inflation multipliers.
   - Node 5 (`route_optimization`): Evaluates candidate detours on the Trans-Sumatra road graph, runs Spoilage Hedging monetary solver, and audits statutory BKHIT quarantine compliance.
   - Node 6 (`decision_support`): Generates Indonesian executive brief and tactical recommendations.
   - Client receives `simulation_complete` containing the full synthesized crisis state.

### Stage 2: Tactical Copilot Telemetry Injection
- The AI Tactical Copilot (`/simulation/chat`) receives real-time context:
  - Disrupted corridor and choke-point delay multiplier.
  - Cargo tonnage and commodity perishability tier.
  - Spoilage Hedging comparison (Continue vs Reroute vs Hold net savings).
  - Statutory BKHIT clearance and MST axle-load compliance status.

### Stage 3: Operator Approval & Closed-Loop Fleet Rerouting
1. **Dispatcher Review in Sidebar:**
   - Dispatcher inspects candidate routes in `MitigationTab.tsx`.
   - Causal chain panel renders full GraphRAG node traversals (`entity_id`, `relation`, `impact_score`).
   - News attributions display verified LKBN ANTARA / BMKG / BNPB citations with tier badges and working search links.
2. **Approval Action:**
   - Dispatcher clicks `REROUTE` (or `HOLD` / `OVERRIDE`).
   - `onCommitOperationalRoute` callback commits the corridor to the Mapbox WebGL canvas.
   - The affected fleet vehicle's 60 FPS animated trajectory re-binds to the approved detour polyline.
   - Dispatcher clicks "Kirim Disposisi WhatsApp ke Driver" to dispatch the official command directly to driver WhatsApp (`wa.me`).
3. **Outbound Telemetry & Outcome Logging:**
   - Backend records the decision trace in SQLite (`prehub_local.db`) and Supabase.
   - Simulates outbound TMS ping (`/api/v1/fleet/telemetry/simulate-ping`).
   - Registers a ground truth outcome row with `horizon="T+12h"` for automated field verification and sensor weight recalibration.

---

## 3. Verification & Test Evidence

### Automated Drill 4 Test (`backend/tests/test_pilot_e2e.py`)
```bash
pytest backend/tests/test_pilot_e2e.py -k test_drill4 -v
```
Output:
```text
tests/test_pilot_e2e.py::test_drill4_closed_loop_orchestration_and_rerouting_e2e PASSED
```

### Full Backend Suite (137 Tests)
```bash
pytest backend/tests/ -q
```
Output:
```text
137 passed in 30.58s
```

### Frontend Type Safety
```bash
npx tsc --noEmit
```
Output:
```text
TypeScript: No errors found
```
