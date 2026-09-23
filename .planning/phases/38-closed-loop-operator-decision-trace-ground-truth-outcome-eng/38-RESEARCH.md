# RESEARCH — Phase 38: Closed-Loop Operator Decision Trace & Ground-Truth Outcome Engine

**Phase:** 38  
**Researched:** 2026-09-23  
**Researcher:** Antigravity (gsd-plan-phase 38)  

---

## Executive Summary

Phase 38 closes the critical operational feedback loop required for PreHub's final competition defense (Milestone M2). In real logistics operations, AI recommendations are only as good as their human verification and subsequent real-world outcome tracking. 

This phase delivers:
1. **Extended Operator Decision Logging (FR-12.1)**: Expands `/api/v1/approvals` into a comprehensive audit trace capturing multi-action operator responses (`ACCEPT`, `REJECT`, `OVERRIDE`), tactical maneuvers (`REROUTE`, `HOLD`, `CONTINUE`), and custom constraint overrides with mandatory reason logging.
2. **Ground-Truth Field Outcome Engine (FR-12.2)**: Implements `POST /api/v1/outcomes` and `GET /api/v1/outcomes` to log verified field realities at interim ($T+12\text{h}$) and terminal ($T+24\text{h}$) horizons, capturing actual clearance times, observed vehicle delays, and commodity price shifts.
3. **Prediction vs. Outcome Variance & Recalibration Engine (FR-12.3)**: Creates `backend/app/services/outcome_evaluation_service.py` to calculate absolute and percentage errors on delay and price forecasts, generating statistical recalibration advisories with a damped learning rate ($\eta = 0.05$) to advise sensor weight tuning without feedback oscillation.
4. **Resilient Local Persistence (FR-12.4, NFR-8)**: Implements `backend/app/db/local_storage.py` using standard Python `sqlite3` targeting `backend/data/prehub_local.db` with automated table self-initialization, offline queueing, and non-blocking Supabase sync.
5. **Interactive UI Integration**: Enhances `frontend/components/sidebar/MitigationTab.tsx` with tactical action buttons (`REROUTE`, `HOLD`, `OVERRIDE`) and reason input.

---

## 1. Operator Decision & Tactical Action Taxonomy (FR-12.1)

### Domain Problem
In Phase 5, approvals were logged as a single binary event (`INSERT INTO route_approvals ...`). This fails to capture:
- Rejections (why did the logistics commander refuse the detour?)
- Overrides (what constraints did the operator apply that the model missed?)
- Tactical nuance (is the fleet moving on a detour, holding at a staging hub, or continuing under restriction?)

### Extended Schema Design
```python
class DecisionAction(str, Enum):
    ACCEPT = "ACCEPT"
    REJECT = "REJECT"
    OVERRIDE = "OVERRIDE"

class TacticalManeuver(str, Enum):
    REROUTE = "REROUTE"
    HOLD = "HOLD"
    CONTINUE = "CONTINUE"

class DecisionTraceCreate(BaseModel):
    incident_id: str
    route_id: str
    action: DecisionAction
    tactical_action: TacticalManeuver
    operator_id: str
    recommended_route: Optional[Dict[str, Any]] = None
    custom_constraints: Optional[Dict[str, Any]] = None  # speed_limit_kmh, max_weight_tons, avoid_nodes
    notes: Optional[str] = None
```
**Invariants**:
- If `action` is `REJECT` or `OVERRIDE`, `notes` must not be empty (validation enforced via Pydantic model validator).
- Backward compatibility: Existing `ApprovalCreate` fields map seamlessly into `DecisionTraceCreate`.

---

## 2. Ground-Truth Field Outcome Ingestion Workflow (FR-12.2)

### Verification Horizons
Logistics disruptions in Sumatra unfold in two distinct empirical phases:
- **$T+12\text{h}$ Interim Horizon**: Assessment of physical obstruction clearance (e.g. flood waters receding at Belawan or debris cleared at Sitinjau Lauik) and interim convoy queue delays.
- **$T+24\text{h}$ Terminal Horizon**: Assessment of supply chain normalization and regional wholesale market price reaction (e.g. PIHPS cooking oil / chili index adjustments).

### Endpoint Specification
- `POST /api/v1/outcomes`: Ingest verified outcome report.
- `GET /api/v1/outcomes`: List outcome verification records, with optional filtering by `incident_id` or `horizon`.

```python
class OutcomeHorizon(str, Enum):
    T_12H = "T+12h"
    T_24H = "T+24h"

class VerificationSource(str, Enum):
    FIELD_REPORT = "FIELD_REPORT"
    ANTARA_NEWS = "ANTARA_NEWS"
    BMKG_ALL_CLEAR = "BMKG_ALL_CLEAR"
    POLDA_TRAFFIC_POLICE = "POLDA_TRAFFIC_POLICE"

class OutcomeCreate(BaseModel):
    incident_id: str
    horizon: OutcomeHorizon
    actual_clearance_time: Optional[datetime] = None
    observed_delay_hours: float
    actual_price_spike_pct: float
    verified_by: str
    verification_source: VerificationSource
    notes: Optional[str] = None
```

---

## 3. Prediction vs. Outcome Variance & Recalibration Engine (FR-12.3)

### Variance Formulation
For each closed incident with both prediction $\hat{y}$ and verified field outcome $y$:
1. **Delay Error**:
   $$\Delta t = |t_{\text{pred}} - t_{\text{actual}}| \quad (\text{hours})$$
   $$\text{RelDelayErr} = \frac{|t_{\text{pred}} - t_{\text{actual}}|}{\max(t_{\text{actual}}, 1.0)}$$
2. **Price Spike Error**:
   $$\Delta p = |p_{\text{pred}} - p_{\text{actual}}| \quad (\text{percentage points})$$

### Calibration Feedback & Advisory Recalibration
Rather than permitting uncontrolled automatic updates to sensor weights (which can lead to catastrophic instability if an unrepresentative incident occurs), the service computes a **Recalibration Advisory**:
$$w_k^{(\text{adj})} = w_k \cdot \left(1 - \eta \cdot \frac{\Delta t}{t_{\text{pred}} + \epsilon}\right)$$
normalized across channels:
$$w_k^{(\text{new})} = \frac{w_k^{(\text{adj})}}{\sum_j w_j^{(\text{adj})}}$$
With damped learning rate $\eta = 0.05$. This provides reproducible mathematical justification for competition judges.

---

## 4. Local SQLite Offline Persistence Architecture (FR-12.4, NFR-8)

### Architectural Rationale
- Supabase provides cloud replication, but network disruptions in disaster zones or competition evaluation environments cannot stall decision logging.
- Python standard library `sqlite3` requires zero external drivers, guarantees ACID transactions, and persists reliably to `backend/data/prehub_local.db`.

### Database Schema
```sql
CREATE TABLE IF NOT EXISTS route_decision_traces (
    id TEXT PRIMARY KEY,
    incident_id TEXT NOT NULL,
    route_id TEXT NOT NULL,
    action TEXT NOT NULL,
    tactical_action TEXT NOT NULL,
    operator_id TEXT NOT NULL,
    recommended_route TEXT,
    custom_constraints TEXT,
    notes TEXT,
    sync_status TEXT DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ground_truth_outcomes (
    id TEXT PRIMARY KEY,
    incident_id TEXT NOT NULL,
    horizon TEXT NOT NULL,
    actual_clearance_time TIMESTAMP,
    observed_delay_hours REAL NOT NULL,
    actual_price_spike_pct REAL NOT NULL,
    verified_by TEXT NOT NULL,
    verification_source TEXT NOT NULL,
    notes TEXT,
    sync_status TEXT DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 5. Test & Validation Architecture

- **Unit Tests**:
  - Test Pydantic validation (mandatory notes on REJECT/OVERRIDE, valid enum constraints).
  - Test SQLite local storage persistence (insert, query, queue status, offline fallback).
  - Test variance calculation and recalibration factor math.
- **Integration Tests**:
  - Test `POST /api/v1/approvals` with new multi-action payload.
  - Test `POST /api/v1/outcomes` and `GET /api/v1/outcomes`.
  - Test end-to-end evaluation flow linking recorded outcomes with benchmark scenarios.
- **Frontend Verification**:
  - `MitigationTab.tsx` compiles cleanly with zero TypeScript errors.
  - Allows selecting tactical action (REROUTE, HOLD, OVERRIDE) and triggers decision recording.
