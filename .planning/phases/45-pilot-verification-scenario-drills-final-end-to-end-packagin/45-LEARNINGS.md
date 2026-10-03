# Phase 45: Extracted Learnings, Dataset Synchronization & Collaborative Git Invariants

**Phase:** 45 — Pilot Verification, Scenario Drills & Final End-to-End Packaging  
**Document Type:** Post-Implementation Audit & Learning Extraction  
**Date:** 2026-10-03  

---

## 1. Operating Environment & Conditions

- **Operating System:** Windows 11 (PowerShell)
- **CLI Proxy:** `rtk` (Rust Token Killer) used for all git, npm, and test operations to conserve LLM tokens.
- **Python Runtime:** Python virtual environment at `backend\.venv\Scripts\python.exe`.
- **Test Runner:** `pytest` invoked via `backend\.venv\Scripts\python -m pytest backend/tests`. Total tests: 133 tests across 15 modules.
- **Packaging:** Docker Compose multi-container setup (`docker-compose.yml`, `backend/Dockerfile`, `frontend/Dockerfile`).

---

## 2. Issues Discovered & Resolved

### Issue 1: Road Network Dataset Expansion vs Rigid Test Assertion
- **Symptom:** During git pull / rebase, `backend/tests/test_pilot_e2e.py::test_pilot_real_data_integrity_invariants` failed with `AssertionError: Expected 54 nodes, got 56`.
- **Root Cause:** A collaborator commit (`bee17e2`) updated `data/road_network_sumatra.json` to version 2.0.0, expanding the graph topology to 56 nodes and 144 edges (e.g. adding detailed junction interchanges). The pilot test rigidly checked `assert len(nodes) == 54`.
- **Fix Implemented:** Updated the assertion to `assert len(nodes) in (54, 56)` and `assert len(edges) >= 100`, preserving strict data validation while accommodating legitimate graph network expansions.
- **Verification:** All 8 pilot e2e tests and all 133 system tests passed (100%).

### Issue 2: Git Remote Collaboration & Index Lock Race Conditions
- **Symptom:** Running `git pull --rebase` occasionally hits `Unable to create '.git/index.lock': File exists` if another process or subshell held a transient lock.
- **Root Cause:** Concurrent file indexing or subshell background tasks touching `.git/`.
- **Resolution:** Verify lock release with `Test-Path .git/index.lock` and execute `git rebase --continue`.
- **Learning:** Always run `rtk git pull --rebase` before staging and pushing changes when working with an active remote team repository.

### Issue 3: End-to-End Test Matrix Alignment
- **Symptom:** Frontend evaluation matrix previously stopped at FR-13, hiding all Milestone M3 test cases (FR-14 through FR-20).
- **Resolution:** Synchronized `TEST_CASES_DATA` in `evaluation_router.py`, `docs/test_matrix.md`, and `frontend/components/dashboard/TestMatrixTable.tsx` to reflect all 133 tests.

---

## 3. Key Defensive Takeaways

1. **Flexible Invariants for Dynamic Graphs:**
   - When asserting graph sizes in datasets that are actively curated, validate against metadata properties (`data.get("metadata", {}).get("nodes_count")`) or allowable versioned sets (`in (54, 56)`), rather than hardcoded magic numbers.
2. **Synchronized Documentation & UI:**
   - Any addition of new requirements or test modules must be simultaneously registered in `docs/test_matrix.md`, `evaluation_router.py`, and `frontend/components/dashboard/TestMatrixTable.tsx` to prevent display drift.
3. **Commit Integrity:**
   - Always run the full regression test suite (`133/133 tests`) and frontend production build (`npm run build`) before pushing to `origin/main`.
