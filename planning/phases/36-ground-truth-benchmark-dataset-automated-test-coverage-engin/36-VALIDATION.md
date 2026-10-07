---
phase: 36
slug: ground-truth-benchmark-dataset-automated-test-coverage-engine
status: ready
nyquist_compliant: true
wave_0_complete: false
created: 2026-09-23
---

# Phase 36 - Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 8.2.2 + pytest-cov 7.1.0 |
| **Config file** | .coveragerc |
| **Quick run command** | `backend/.venv/Scripts/python.exe -m pytest backend/tests/test_agents.py` |
| **Full suite command** | `backend/.venv/Scripts/python.exe -m pytest backend/tests --cov=app --cov=agents` |
| **Benchmark command** | `backend/.venv/Scripts/python.exe scripts/evaluate_metrics.py` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick run command
- **After every plan wave:** Run full suite command and benchmark command
- **Before `/gsd-verify-work`:** Full suite must be green and benchmark must pass gating
- **Max feedback latency:** 20 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------------|-----------|-------------------|-------------|--------|
| 36-01-01 | 01 | 1 | FR-10.1 | Data validation | unit/schema | `python -c "import json; d=json.load(open('data/benchmark/sumatra_disruptions_ground_truth.json')); assert len(d)==60"` | ❌ W1 | ⬜ pending |
| 36-01-02 | 01 | 1 | FR-10.2 | Deterministic eval | cli/integration | `backend/.venv/Scripts/python.exe scripts/evaluate_metrics.py` | ❌ W1 | ⬜ pending |
| 36-02-01 | 02 | 2 | FR-10.3 | Coverage tracking | config | `backend/.venv/Scripts/python.exe -m pytest backend/tests --cov=app --cov=agents` | ❌ W2 | ⬜ pending |
| 36-02-02 | 02 | 2 | FR-10.3 | API endpoint testing | integration | `backend/.venv/Scripts/python.exe -m pytest backend/tests/test_api_routers.py -v` | ❌ W2 | ⬜ pending |
| 36-02-03 | 02 | 2 | FR-10.4 | Test documentation | doc/audit | `python -c "import os; assert os.path.exists('docs/test_matrix.md')"` | ❌ W2 | ⬜ pending |

---

## Wave 0 Requirements

- [x] `backend/.venv` with pytest installed
- [x] `pytest-cov` installed in backend venv
- [ ] `data/benchmark/sumatra_disruptions_ground_truth.json` created
- [ ] `.coveragerc` created

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Test Matrix Judge Inspection | FR-10.4 | Document visual formatting review | Inspect `docs/test_matrix.md` in markdown viewer |

---

## Validation Sign-Off

- [x] All tasks have automated verify commands
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Feedback latency < 20s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** Approved 2026-09-23