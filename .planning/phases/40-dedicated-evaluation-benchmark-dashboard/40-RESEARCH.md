# Phase 40 — Technical Research: Dedicated Evaluation & Benchmark Dashboard

## 1. Domain & Background

Phase 40 delivers the operator-grade **Evaluation & Benchmark Dashboard** (`FR-14.1`, `FR-14.2`, `NFR-1`). This dashboard provides transparent empirical proof of PreHub's algorithmic claims for academic jury defense, government operators, and enterprise logistics stakeholders.

### Key Data Assets
1. **Benchmark Evaluation Report** (`test-results/benchmark_evaluation_report.json`):
   - $N=60$ balanced scenarios across all 8 Sumatra provinces (35 disruptions, 25 controls).
   - Empirical metrics: Precision = 1.00 (100%), Recall = 0.9714 (97.1%), F1 = 0.9855 (98.5%), Accuracy = 0.9833 (98.3%), Latency = 0.019 ms.
   - Calibration metrics: Raw Brier Score = 0.0782 ($\le 0.10$ threshold), Platt Calibrated Brier = 0.0000, Isotonic Calibrated Brier = 0.0000, ECE = 0.1899.
   - 10-bin calibration distribution ($[0.0, 0.1)$ to $[0.9, 1.0]$) with sample count, mean confidence, empirical accuracy, and calibration error.

2. **Automated Test Matrix** (`docs/test_matrix.md`):
   - 81 automated and architectural verification tests mapped across functional requirements:
     - FR-1: Early Warning (5 tests)
     - FR-2: Highway Congestion (5 tests)
     - FR-3: Maritime Tracking (2 tests)
     - FR-4: OSINT News Stream (12 tests)
     - FR-5: Multi-Agent Swarm (6 tests)
     - FR-6: Benchmark Dataset (5 tests)
     - FR-7: Fleet Tracking & Detours (3 tests)
     - FR-8: Food Inflation & PIHPS (5 tests)
     - FR-9: Human-in-the-Loop & Incident API (4 tests)
     - FR-10: System Health & Resilience (3 tests)
     - FR-11: Consensus & Calibration & CPU Routing (17 tests)
     - FR-12: Decision Trace & Outcomes (8 tests)
     - FR-13: Telemetry & God's-Eye HUD (6 tests)

3. **Closed-Loop Outcomes & Recalibration** (`backend/app/routers/outcomes_router.py`, `backend/app/services/outcome_evaluation_service.py`):
   - Endpoints: `GET /api/v1/outcomes`, `GET /api/v1/outcomes/benchmark/summary`.
   - Records operator actions (`ACCEPT`, `REJECT`, `OVERRIDE`) paired with T+12h / T+24h ground-truth outcomes and adaptive sensor weight adjustments ($\eta = 0.05$).

4. **Corridor Routing Optimization** (`backend/app/services/cuopt_tomtom_service.py`):
   - Real Sumatra road network cache (`data/road_network_sumatra.json`).
   - NetworkX Dijkstra & OR-Tools CPU solving in $< 2\text{ ms}$.
   - Corridor savings: Belawan-Medan-Tebing Tinggi detour avoids 8.5h flood blockage with a 42-minute detour, saving $\sim \text{Rp } 1.450.000$ per truck run.

---

## 2. Technical Decisions & Architectural Choices

### Decision 1: Pure Native SVG for the Reliability Diagram (Zero Heavyweight Chart Dependencies)
- **Problem**: Adding heavy charting libraries (`recharts`, `chart.js`, `plotly`) increases frontend bundle size, introduces hydration mismatches, and risks styling conflicts with Tailwind glassmorphism.
- **Solution**: Build `ReliabilityDiagram.tsx` using native React SVG elements (`<svg>`, `<line>`, `<rect>`, `<path>`, `<circle>`).
- **Benefits**:
  - Zero external bundle weight.
  - Pixel-perfect alignment with Tailwind dark tokens (`#0c0e12`, `#10b981`, `#00f0ff`).
  - Native responsiveness via `viewBox="0 0 500 350"` and `preserveAspectRatio="xMidYMid meet"`.
  - Direct hover tooltips via React state.

### Decision 2: Backend Evaluation Router (`evaluation_router.py`) with Resilient Fallback
- **Problem**: Frontend could read JSON files statically, but in production, benchmarks and test matrices should be served via REST APIs with live execution stats.
- **Solution**: Create `backend/app/routers/evaluation_router.py` exposing:
  - `GET /api/v1/evaluation/benchmark`: Returns parsed benchmark results.
  - `GET /api/v1/evaluation/test-matrix`: Returns the categorized 81-test inventory.
  - `GET /api/v1/evaluation/corridor-efficiency`: Returns deterministic corridor savings metrics.
- In `frontend/lib/api.ts`, query these endpoints and provide offline fallback data in case the backend is unseeded or running standalone.

### Decision 3: Unlocking Navigation Tabs in `DashboardClient.tsx`
- **Current State**: `ANALYTICS`, `SIMULATION`, and `REPORTS` are rendered with `<Lock className="w-3 h-3 text-slate-500" />` and `disabled`.
- **Target State**:
  - Remove `disabled` and lock icons.
  - Expand `activeSection` state: `'map' | 'analytics' | 'simulation' | 'reports' | 'evaluation'`.
  - Wire `id="nav-evaluation"` button with active cyan indicator.
  - Render `<EvaluationSection />` when `activeSection === 'evaluation'`.
  - Preserve all background WebSocket connections and map states.

---

## 3. Non-AI Design & Performance Constraints

- **No AI Gradients**: Strict adherence to `#0c0e12` (60%), `#13161c` (30%), `#00f0ff` (10%).
- **No Emojis**: Replace any emoji with Lucide SVG icons (`Award`, `CheckCircle2`, `BarChart3`, `ShieldCheck`, `Activity`, `Compass`, `Clock`).
- **Interactive Affordances**: Mandatory `cursor-pointer` on all buttons, tabs, filter pills, and expandable table rows.
- **Micro-Interactions**: Smooth 150ms – 250ms transitions (`transition duration-150 ease-out`).
