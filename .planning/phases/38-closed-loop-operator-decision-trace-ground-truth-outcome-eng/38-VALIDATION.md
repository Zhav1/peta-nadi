---
phase: 38
slug: closed-loop-operator-decision-trace-ground-truth-outcome-engine
status: ready
nyquist_compliant: true
wave_0_complete: true
created: 2026-09-23
---

# Phase 38 - Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 8.2.2 + pytest-cov 7.1.0 |
| **Config file** | .coveragerc |
| **Quick run command** | `backend/.venv/Scripts/python.exe -m pytest backend/tests/test_outcomes_decisions.py` |
| **Full suite command** | `backend/.venv/Scripts/python.exe -m pytest backend/tests --cov=app --cov=agents` |
| **Frontend build test** | `npm --prefix frontend run build` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick run command
- **After Wave 1 (38-01):** Run `test_outcomes_decisions.py` for models, SQLite persistence, and API endpoints
- **After Wave 2 (38-02):** Run variance evaluation engine tests and frontend verification
- **Before phase completion:** Full suite must pass with 100% green tests and zero regressions
- **Max feedback latency:** 20 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Secure Behavior | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------------|-----------|-------------------|--------|
| 38-01-01 | 01 | 1 | FR-12.1, FR-12.4 | Operator decision models & SQLite local storage | unit | `backend/.venv/Scripts/python.exe -m pytest backend/tests/test_outcomes_decisions.py -k test_decision_storage` | ⬜ pending |
| 38-01-02 | 01 | 1 | FR-12.1 | Multi-action approvals endpoint (`ACCEPT`, `REJECT`, `OVERRIDE`) | integration | `backend/.venv/Scripts/python.exe -m pytest backend/tests/test_outcomes_decisions.py -k test_approvals_endpoint` | ⬜ pending |
| 38-01-03 | 01 | 1 | FR-12.2, FR-12.4 | Ground-truth outcomes models & endpoint (`POST/GET /api/v1/outcomes`) | integration | `backend/.venv/Scripts/python.exe -m pytest backend/tests/test_outcomes_decisions.py -k test_outcomes_endpoint` | ⬜ pending |
| 38-02-01 | 02 | 2 | FR-12.3 | Prediction vs. Outcome variance & recalibration service | unit/math | `backend/.venv/Scripts/python.exe -m pytest backend/tests/test_outcomes_decisions.py -k test_variance_recalibration` | ⬜ pending |
| 38-02-02 | 02 | 2 | FR-12.3 | Benchmark scenario outcome evaluation linking | integration | `backend/.venv/Scripts/python.exe -m pytest backend/tests/test_outcomes_decisions.py -k test_benchmark_linking` | ⬜ pending |
| 38-02-03 | 02 | 2 | FR-12.1 | Frontend MitigationTab tactical actions (`REROUTE`, `HOLD`, `OVERRIDE`) | frontend compile | `npm --prefix frontend run build` | ⬜ pending |

---

## Wave 0 Requirements

- [x] Python virtual environment active with pytest and FastAPI test client
- [x] Benchmark dataset `data/benchmark/sumatra_disruptions_ground_truth.json` available
- [x] Pytest suite baseline running 67/67 passing

---

## Validation Sign-Off

- [x] All tasks have automated verify commands
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Feedback latency < 20s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** Approved 2026-09-23
