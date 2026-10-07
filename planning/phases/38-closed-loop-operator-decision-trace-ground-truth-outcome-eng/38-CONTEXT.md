# Phase 38: Closed-Loop Operator Decision Trace & Ground-Truth Outcome Engine - Context

**Gathered:** 2026-09-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 38 delivers the closed-loop feedback engine connecting human operator decisions (acceptance, rejection, override, hold, reroute) with verified empirical post-incident ground-truth outcomes (T+12h / T+24h delay, price shift, clearance), complete with offline persistence fallback and error variance analytics for consensus recalibration.

</domain>

<decisions>
## Implementation Decisions

### 1. Operator Decision & Tactical Action Taxonomy (FR-12.1)
- **D-01: Action Types:** Support `ACCEPT` (approve swarm recommendation), `REJECT` (dismiss alert/route), and `OVERRIDE` (modify route or dispatch parameters).
- **D-02: Tactical Maneuvers:**
  - `REROUTE`: Dispatch fleet along detour road network (`cpu_routing_adapter.py`).
  - `HOLD`: Hold fleet at staging hub or origin until clearance is confirmed.
  - `CONTINUE`: Proceed on current corridor with caution/speed restriction.
- **D-03: Audit Fields:** Record `incident_id`, `route_id`, `action`, `tactical_action`, `operator_id`, `notes` (mandatory if `REJECT` or `OVERRIDE`), and `custom_constraints` (e.g. `speed_limit_kmh`, `max_weight_tons`, `avoid_nodes`).

### 2. Ground-Truth Field Outcome Ingestion Workflow (FR-12.2)
- **D-04: Endpoints:** Implement `POST /api/v1/outcomes` and `GET /api/v1/outcomes`.
- **D-05: Verification Horizons:** Support both `T+12h` (interim clearance & traffic check) and `T+24h` (full recovery & price stabilization).
- **D-06: Schema:** Capture `incident_id`, `horizon` (`T+12h` or `T+24h`), `actual_clearance_time`, `observed_delay_hours`, `actual_price_spike_pct`, `verified_by`, `verification_source` (`FIELD_REPORT`, `ANTARA_NEWS`, `BMKG_ALL_CLEAR`), and `notes`.
- **D-07: Dual Ingestion Path:** Interactive REST endpoint for live operators, plus an evaluation integration linking to scenarios in `data/benchmark/sumatra_disruptions_ground_truth.json` for deterministic automated testing.

### 3. Prediction vs. Outcome Variance & Recalibration Engine (FR-12.3)
- **D-08: Variance Engine:** Implement `backend/app/services/outcome_evaluation_service.py` to compare predicted vs. actual outcomes:
  - Delay Forecast Error: $\Delta t = |t_{\text{pred}} - t_{\text{actual}}|$ (hours)
  - Price Spike Variance: $\Delta p = |p_{\text{pred}} - p_{\text{actual}}|$ (%)
- **D-09: Recalibration Strategy:** Conservative gradient update with learning rate $\eta = 0.05$ that computes recommended sensor weight adjustments ($\Delta w_k$) rather than unconstrained silent weight mutation. This prevents feedback loop oscillation and preserves verifiable audit logs.

### 4. Resilient Local Storage Persistence (FR-12.4, NFR-8)
- **D-10: Primary Storage:** Supabase tables (`route_decision_traces`, `ground_truth_outcomes`).
- **D-11: Offline Fallback Storage:** Local SQLite database at `backend/data/prehub_local.db` using standard Python `sqlite3`.
- **D-12: Reconnection Sync:** When Supabase connection fails, writes commit to SQLite with status `local_queued`. When connectivity is restored, unsynced records batch-replicate to Supabase.

### The Agent's Discretion
- Database table indexing, connection management, and SQLite schema creation details.
- Exact Pydantic model naming and validation constraints.
- Error codes and HTTP status mappings for invalid state transitions.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & Roadmap
- `.planning/REQUIREMENTS.md` § FR-12 — Closed-Loop Operator Decision Trace & Ground-Truth Outcome Engine
- `.planning/ROADMAP.md` § Phase 38 — Deliverables and verification criteria
- `docs/Dokumen_Pendukung_PreHub.md` § 4.3 — Consensus gate and feedback formulation

### Benchmark & Calibration Assets
- `data/benchmark/sumatra_disruptions_ground_truth.json` — Ground-truth disruption scenarios ($N=60$)
- `backend/app/services/probability_calibration.py` — Brier score calibration service

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `backend/app/routers/approvals.py`: Existing approval endpoint with fallback stub, to be extended with action taxonomy and SQLite persistence.
- `backend/app/db/supabase_client.py`: Supabase client connection helper with fallback handling.
- `frontend/components/sidebar/MitigationTab.tsx`: Route mitigation tab with approval button, to be expanded with multi-action controls (Approve/Reroute, Hold, Reject/Override).
- `scripts/evaluate_metrics.py`: Metric evaluation runner from Phase 36 to be referenced for outcome comparison.

### Established Patterns
- Pydantic v2 schemas with `model_dump()` and optional fallback attributes.
- Async FastAPI endpoint handlers with non-blocking DB calls (`asyncio.to_thread`).
- Graceful offline fallback: system accepts payloads even if remote cloud DB is unreachable.

### Integration Points
- `backend/app/main.py`: Register `outcomes_router.py`.
- `backend/app/routers/approvals.py`: Refactor to support extended decision models.
- `backend/data/prehub_local.db`: SQLite database for offline fallback storage.

</code_context>

<specifics>
## Specific Ideas

- Ensure operator decisions and outcomes can be retrieved by `incident_id` or aggregated for the evaluation dashboard (Phase 40).
- SQLite database should self-initialize its tables on startup if the database file does not exist.

</specifics>

<deferred>
## Deferred Ideas

- None — discussion stayed strictly within Phase 38 scope.

</deferred>

---

*Phase: 38-closed-loop-operator-decision-trace-ground-truth-outcome-engine*
*Context gathered: 2026-09-23*
