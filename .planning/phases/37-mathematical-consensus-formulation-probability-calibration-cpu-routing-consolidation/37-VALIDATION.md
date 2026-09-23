---
phase: 37
slug: mathematical-consensus-formulation-probability-calibration-cpu-routing-consolidation
status: ready
nyquist_compliant: true
wave_0_complete: true
created: 2026-09-23
---

# Phase 37 - Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 8.2.2 + pytest-cov 7.1.0 |
| **Config file** | .coveragerc |
| **Quick run command** | `backend/.venv/Scripts/python.exe -m pytest backend/tests/test_consensus_calibration.py` |
| **Full suite command** | `backend/.venv/Scripts/python.exe -m pytest backend/tests --cov=app --cov=agents` |
| **Benchmark command** | `backend/.venv/Scripts/python.exe scripts/evaluate_metrics.py` |
| **CPU Routing latency test** | `backend/.venv/Scripts/python.exe -m pytest backend/tests/test_cpu_routing_weather.py -k test_cpu_routing_shortest_path_latency` |
| **Estimated runtime** | ~20 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick run command
- **After Wave 1 (37-01):** Run `test_consensus_calibration.py` and `scripts/evaluate_metrics.py` (asserting Brier score <= 0.10)
- **After Wave 2 (37-02):** Run `test_cpu_routing_weather.py` and full test suite
- **Before phase completion:** Full suite must pass with 100% green tests and zero cuOpt/FourCastNet regressions
- **Max feedback latency:** 25 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Secure Behavior | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------------|-----------|-------------------|--------|
| 37-01-01 | 01 | 1 | FR-11.1, FR-11.2 | Probabilistic independence & sensor decoupling | unit | `backend/.venv/Scripts/python.exe -m pytest backend/tests/test_consensus_calibration.py -k test_consensus` | ⬜ pending |
| 37-01-02 | 01 | 1 | FR-11.3, NFR-4 | Brier score & ECE calibration transforms | unit/math | `backend/.venv/Scripts/python.exe -m pytest backend/tests/test_consensus_calibration.py -k test_calibration` | ⬜ pending |
| 37-01-03 | 01 | 1 | FR-11.3, NFR-4 | Benchmark evaluation integration & BS <= 0.10 | integration | `backend/.venv/Scripts/python.exe scripts/evaluate_metrics.py` | ⬜ pending |
| 37-02-01 | 02 | 2 | FR-11.4 | 50+ node Sumatra road network cache | schema/graph | `python -c "import json; d=json.load(open('data/road_network_sumatra.json')); assert len(d['nodes'])>=50"` | ⬜ pending |
| 37-02-02 | 02 | 2 | FR-11.4, NFR-5, NFR-7 | CPU VRP & shortest path <150ms | unit/perf | `backend/.venv/Scripts/python.exe -m pytest backend/tests/test_cpu_routing_weather.py -k test_cpu_routing` | ⬜ pending |
| 37-02-03 | 02 | 2 | FR-11.5 | Open-Meteo & BMKG weather fusion | integration | `backend/.venv/Scripts/python.exe -m pytest backend/tests/test_cpu_routing_weather.py -k test_weather` | ⬜ pending |
| 37-02-04 | 02 | 2 | FR-11.4, FR-11.5 | Agent 4 offline cache resilience & test suite | end-to-end | `backend/.venv/Scripts/python.exe -m pytest backend/tests/test_cpu_routing_weather.py` | ⬜ pending |

---

## Wave 0 Requirements

- [x] `backend/.venv` with pytest, numpy, scipy installed
- [x] Benchmark dataset `data/benchmark/sumatra_disruptions_ground_truth.json` available
- [x] Pytest suite baseline running 50/50 passing

---

## Validation Sign-Off

- [x] All tasks have automated verify commands
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Feedback latency < 25s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** Approved 2026-09-23
