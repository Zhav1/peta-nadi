# Phase 38 Audit, Gaps & Learnings: Closed-Loop Operator Decision Traces & Outcomes

**Date:** 2026-09-23
**Phase:** 38 - Closed-Loop Operator Decision Trace & Ground-Truth Outcome Engine
**Status:** COMPLETE & VERIFIED [x]

---

## 1. Context, Environment & Operational Constraints

During the development and testing of Phase 38, the following critical environment constraints and operational rules were enforced:

1. **Windows PowerShell Environment & RTK Token Killer:**
   - All shell executions must utilize the `rtk` (Rust Token Killer) proxy to compress verbose outputs and maximize LLM context efficiency.
   - When subshell sessions drop the PATH, refresh PATH via: `$env:PATH = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User"); rtk <cmd>`.

2. **Python Virtual Environment & Execution Rules:**
   - Python scripts and tests must always be invoked directly via `backend/.venv/Scripts/python.exe` (or `backend\/.venv\/Scripts\/python.exe`).
   - The environment runs Python 3.13 with FastAPI, Pydantic v2, pytest-cov, scipy, numpy, and sqlite3.

3. **Node.js & Next.js Build Constraints:**
   - Windows static page generation in Next.js 14.2 can trigger heap exhaustion if unconstrained. When running type checks, use `npx tsc --noEmit` or set `$env:NODE_OPTIONS="--max-old-space-size=4096"`.
   - UI/UX Design System Router: No AI purple/pink gradients, no emoji icons (use Lucide SVG only), mandatory `cursor-pointer` on all interactive buttons, and dark glassmorphic styling (`backdrop-blur-md bg-[#0c0e12]/80 border border-white/10`).

---

## 2. Issues Discovered During Execution & Exact Solutions

### Issue 1: Benchmark Dataset Root Schema Polymorphism
- **Symptom:** Initial code assumed `data/benchmark/sumatra_disruptions_ground_truth.json` contained a dictionary root with a `"scenarios"` key (`data["scenarios"]`), but the ground-truth benchmark JSON is actually a top-level list (`list[dict]`).
- **Fix:** Updated `outcome_evaluation_service.py` (`evaluate_benchmark_outcomes`) to handle both formats dynamically: `scenarios = data if isinstance(data, list) else data.get("scenarios", [])`.

### Issue 2: Timestamp Sorting Column Mismatch in Supabase (`approved_at` vs `created_at`)
- **Symptom:** `approvals.py` executed `.order("created_at", desc=True)` against Supabase `route_approvals`. In the Supabase DDL schema (`005_route_approvals.sql`), the column was named `approved_at`. In production Supabase, PostgREST throws `column route_approvals.created_at does not exist`.
- **Fix:**
  - Changed query to `.order("approved_at", desc=True)` in `approvals.py`.
  - Added `approved_at: Optional[datetime] = None` to `DecisionTraceResponse`.
  - Populated both `created_at` and `approved_at` across both Supabase and SQLite fallback responses.
  - Updated `ApprovalItem` in `frontend/lib/types.ts` to include both fields.

### Issue 3: Cross-Incident State Leakage in Frontend `MitigationTab`
- **Symptom:** When an operator navigated between crises, if the newly selected crisis had 0 recorded approvals (`res.items.length === 0`), `approvedRouteId` retained the previous crisis's approved route ID.
- **Fix:** Added an explicit `else` branch in `loadApprovals()` to clear `approvedRouteId` and `latestApproval` (`setApprovedRouteId(null); setLatestApproval(null);`).

### Issue 4: Remote Database Schema Drift (Missing Supabase Migration)
- **Symptom:** Local SQLite self-initialized with tactical columns (`action`, `tactical_action`, `custom_constraints`, `notes`, `sync_status`), but the repository lacked a corresponding Supabase migration for cloud deployment.
- **Fix:** Created `infra/supabase/migrations/006_decision_traces_and_outcomes.sql` with `ALTER TABLE route_approvals` and `CREATE TABLE ground_truth_outcomes`.

### Issue 5: Evaluation Prediction Fallback Grounding
- **Symptom:** When `evaluate_incident_outcome` was called without a `predicted` vector, it fell back to static constants.
- **Fix:** Enhanced `evaluate_incident_outcome` to inspect `local_storage.list_decision_traces(incident_id)` first to extract `predicted_delay_hours` from the actual operator approved route geometry (`eta_minutes / 60.0`).

### Issue 6: Tactical Status Badge Visual Ambiguity
- **Symptom:** When an operator ordered `TAHAN ARMADA` (HOLD), the card showed a green `APPROVED` badge with `CheckCircle2`, creating ambiguity about whether the fleet was rolling or stopped.
- **Fix:** Differentiated visual styling in `RouteCard`:
  - `HOLD`: Amber badge (`bg-amber-950/40 border-amber-500/50 text-amber-300`) with `PauseCircle`.
  - `OVERRIDE`: Indigo badge (`bg-indigo-950/40 border-indigo-500/50 text-indigo-300`) with `SlidersHorizontal`.
  - `ACCEPT / REROUTE`: Emerald badge (`bg-emerald-500/20 border-emerald-500/50 text-emerald-300`) with `CheckCircle2`.

---

## 3. Compliance Audit against Functional Requirements

| Requirement | Description | Status | Verification Reference |
| :--- | :--- | :---: | :--- |
| **FR-12.1** | Log multi-action operator decisions (`ACCEPT`, `REJECT`, `OVERRIDE`) with tactical actions (`REROUTE`, `HOLD`, `CONTINUE`). | Passed | `backend/tests/test_outcomes_decisions.py::test_decision_schema_validation`, `test_approvals_endpoint_multi_action` |
| **FR-12.2** | Mandatory operator rationale capture for non-default decisions (`REJECT`, `OVERRIDE`). | Passed | `DecisionTraceCreate` Pydantic validator, `test_decision_schema_validation` |
| **FR-12.3** | Closed-loop prediction vs. actual variance computation and sensor weight recalibration factor generation. | Passed | `backend/tests/test_outcomes_decisions.py::test_variance_recalibration`, `test_evaluation_endpoints` |
| **FR-12.4** | Dual-horizon ground-truth outcome ingestion (`T+12h`, `T+24h`) via `POST/GET /api/v1/outcomes`. | Passed | `backend/tests/test_outcomes_decisions.py::test_outcomes_endpoint` |
| **NFR-8** | High availability local offline persistence with zero data loss during network partition. | Passed | `backend/app/db/local_storage.py`, `test_decision_storage_sqlite` |
| **NFR-9** | Damped conservative recalibration (`eta = 0.05`) to prevent oscillatory sensor weight runaway. | Passed | `outcome_evaluation_service.py`, `test_variance_recalibration` |

---

## 4. Key Architectural Decisions & Trade-Offs

1. **Embedded SQLite with Auto-DDL vs External Agent:**
   - Embedded SQLite in `backend/app/db/local_storage.py` provides zero-configuration local ACID durability across cold starts without managing sidecar daemons.

2. **Conservative Recalibration Learning Rate (`eta = 0.05`):**
   - Fixed small learning rate ensures noisy field reports or temporary road clearance delays do not destabilize the multi-sensor consensus weights.

3. **Edge Validation vs Database Constraint:**
   - Validating mandatory notes in Pydantic v2 ensures bad payloads fail before touching the network or database layer, returning clear 422 errors to the frontend.

---

## 5. Verification Summary
- **Automated Backend Tests:** 75/75 pytest tests passing (100%).
- **Frontend Static Verification:** `npx tsc --noEmit` and `next lint` pass with 0 errors.
