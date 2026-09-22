# Phase 36: Ground-Truth Benchmark Dataset & Automated Test Coverage Engine - Context

**Gathered:** 2026-09-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 36 establishes the empirical evaluation foundation for PreHub's Milestone M2 defense. It delivers:
1. A standardized Sumatra logistics disruption benchmark dataset ($N=60$) with multi-sensor readings and verified ground-truth labels.
2. An automated empirical evaluation script (`scripts/evaluate_metrics.py`) calculating Precision, Recall, F1, FPR, and Latency.
3. Test coverage configuration (`.coveragerc` and `pytest-cov`) enforcing line and branch coverage on critical logic modules.
4. A complete test suite inventory (`docs/test_matrix.md`) documenting all 39+ unit and integration tests for judge verification.

This phase is offline evaluation engineering. It does not alter live API ingestion or runtime frontend map streaming.
</domain>

<decisions>
## Implementation Decisions

### Dataset Architecture & Composition
- **D-01 (Balanced Realism):** The benchmark dataset (`data/benchmark/sumatra_disruptions_ground_truth.json`) consists of exactly $N=60$ scenarios:
  - **35 Positive Disruption Cases:** Real and synthetic critical events across 8 Sumatra provinces (North Sumatra, West Sumatra, Riau, Jambi, South Sumatra, Lampung, Aceh, Bengkulu) covering floods, landslides, port congestion, road subsidence, and commodity shocks.
  - **25 Negative / Benign Controls:** Routine peak-hour traffic, heavy rain without flooding, unverified social media rumors, and normal port operations to strictly evaluate False Positive Rates.
- **D-02 (Multi-Sensor Feature Schema):** Each scenario schema provides:
  - Location attributes: `id`, `province`, `corridor_name`, `coordinates` (`[lng, lat]`).
  - Sensor readings: BMKG weather alert level, Open-Meteo precipitation rate (mm/h), TomTom delay ratio / speed ratio, and OSINT verified news headline.
  - Ground-truth labels: binary `is_disruption` ($y \in \{0, 1\}$), verified delay (`actual_delay_hours`), and commodity price deviation (`observed_price_impact_pct`).

### Empirical Evaluation Runner
- **D-03 (Hybrid Reporting & Gating):** `scripts/evaluate_metrics.py` operates in hybrid mode:
  - Computes True Positives (TP), False Positives (FP), True Negatives (TN), False Negatives (FN), Precision, Recall, F1-Score, False Positive Rate (FPR), and average Detection Latency.
  - Outputs results to console formatted as a clean Markdown table and saves `test-results/benchmark_evaluation_report.json`.
  - Enforces gating assertions: exits with status code `1` if Precision < 0.85, Recall < 0.80, or F1 < 0.82.

### Coverage & Test Suite Documentation
- **D-04 (Pragmatic Core Coverage Threshold):** Configure `.coveragerc` targeting `backend/app` and `agents` with branch coverage enabled. Target threshold is $\ge 80\%$ on critical logic modules (`routers`, `services`, `nodes`, `consensus_gate`), omitting third-party external mock stubs.
- **D-05 (Test Matrix Inventory):** Create `docs/test_matrix.md` cataloging all 39+ existing and new test cases with Test ID, Module, Scenario, Type (Unit/Integration), and Status.

### the agent's Discretion
- Scenario naming and detailed meteorological parameters (wind speed, rain accumulation).
- Detailed formatting and styling of the evaluation report Markdown tables.
- Specific pytest flags and coverage omission regex patterns in `.coveragerc`.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & Roadmap
- `.planning/REQUIREMENTS.md` § FR-10.1 to FR-10.4, NFR-2, NFR-3, NFR-9
- `.planning/ROADMAP.md` § Phase 36: Ground-Truth Benchmark Dataset & Automated Test Coverage Engine
- `.planning/STATE.md` § Milestone M2 Scope & Decisions

### Codebase Evaluation & Agents
- `agents/tools/consensus_gate.py` - Existing weighted multi-sensor consensus formulation
- `backend/tests/` - Existing test suite (34+ passing pytest cases)
- `backend/app/adapters/` - Existing data source adapters (BMKG, TomTom, OSINT, Open-Meteo)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `agents/tools/consensus_gate.py`: Can be evaluated directly in `evaluate_metrics.py` using multi-sensor inputs.
- `backend/tests/conftest.py`: Existing test fixtures and FastAPI test client setup.
- `backend/app/schemas/`: Pydantic models for incidents, telemetry, and data sources.

### Established Patterns
- Pydantic models with `BaseModel` for validation.
- Pytest standard fixtures in `backend/tests/`.
- JSON-based mock/fixture seeding in `data/` directory.

### Integration Points
- `data/benchmark/sumatra_disruptions_ground_truth.json`: New primary dataset file.
- `scripts/evaluate_metrics.py`: Standalone CLI script for CI and local verification.
- `.coveragerc`: Root repository coverage configuration read by `pytest --cov`.
- `docs/test_matrix.md`: Root documentation file.

</code_context>

<specifics>
## Specific Ideas
- Benchmark dataset should include prominent historical Sumatra incidents: Sitinjau Lauik landslide (Padang-Solok), Jalintim Palembang-Betung flooding, Belawan Port rob/tidal flooding, and Bukit Barisan flash flood.
- The evaluation runner should support a `--verbose` flag to display individual scenario predictions and error analysis on false positives/negatives.

</specifics>

<deferred>
## Deferred Ideas
- Phase 37: Mathematical Consensus Independence Formula ($P = 1 - \prod(1 - w_k p_k)$) and Brier probability calibration.
- Phase 38: Ground-Truth post-incident field outcome tracking API (`POST /api/v1/outcomes`).
- Phase 40: Dedicated frontend Evaluation Tab displaying the benchmark metrics interactively to judges.

</deferred>

---

*Phase: 36-ground-truth-benchmark-dataset-automated-test-coverage-engine*
*Context gathered: 2026-09-23*