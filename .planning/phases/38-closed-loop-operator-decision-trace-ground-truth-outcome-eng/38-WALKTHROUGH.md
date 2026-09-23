# Phase 38 Walkthrough: Closed-Loop Operator Decision Trace & Ground-Truth Outcome Engine

## 1. Overview & Operational Capability

Phase 38 establishes the complete empirical feedback loop for PreHub:
1. **Operator Decision Logging:** Captures multi-action operator decisions (ACCEPT, REJECT, OVERRIDE) with tactical execution directives (REROUTE, HOLD, CONTINUE).
2. **Ground-Truth Field Outcome Recording:** Records verified post-disruption conditions at dual time horizons (T+12h and T+24h) via POST/GET /api/v1/outcomes.
3. **Offline ACID Persistence:** Local SQLite database at backend/data/prehub_local.db ensures zero data loss during network partitions or cold starts.
4. **Variance & Recalibration Engine:** Evaluates delay errors (Delta t) and price spike errors (Delta p) against benchmark datasets and derives damped sensor recalibration weights (eta = 0.05).
5. **Tactical UI Controls:** Interactive buttons in MitigationTab.tsx for one-click rerouting, fleet holding, or custom overrides with mandatory justification.

---

## 2. API Endpoints & Usage Guide

### A. Operator Decision Traces
- **POST /api/v1/approvals**
  - Logs an operator action with tactical maneuvers and mandatory notes on overrides.
- **GET /api/v1/approvals?incident_id={id}**
  - Returns paginated list of decision traces.

### B. Ground-Truth Field Outcomes
- **POST /api/v1/outcomes**
  - Ingests verified field conditions post-disruption.
- **GET /api/v1/outcomes?incident_id={id}&horizon=T+12h**
  - Retrieves verified outcome records.

### C. Closed-Loop Variance & Recalibration
- **GET /api/v1/outcomes/evaluation/{incident_id}**
  - Compares prediction to actual field outcome and suggests weight recalibration.
- **GET /api/v1/outcomes/benchmark/summary**
  - Computes MAE delay and price variance across benchmark scenarios.

---

## 3. Verification & Test Execution

Run the full automated test suite:
`ash
backend/.venv/Scripts/python.exe -m pytest backend/tests -v
`
Output: 75/75 passed (100% pass rate).

Run frontend static type checking:
`ash
cd frontend && npx tsc --noEmit
`
Output: TypeScript: No errors found.
