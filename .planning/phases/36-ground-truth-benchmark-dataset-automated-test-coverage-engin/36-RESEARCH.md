# RESEARCH — Phase 36: Ground-Truth Benchmark Dataset & Automated Test Coverage Engine

**Phase:** 36
**Researched:** 2026-09-23
**Researcher:** Antigravity (gsd-plan-phase --research 36)

---

## Summary

Phase 36 addresses judge feedback regarding empirical validation and engineering rigor by building:
1. A ground-truth benchmark dataset ($N=60$) reflecting documented and synthetic Sumatra logistics disruptions.
2. An automated empirical evaluation script (`scripts/evaluate_metrics.py`) computing Precision, Recall, F1, False Positive Rate (FPR), and Detection Latency.
3. Automated test coverage configuration (`.coveragerc` and `pytest-cov`) targeting >=80% on critical logic modules.
4. A complete test suite inventory (`docs/test_matrix.md`) documenting all 39+ unit and integration tests.

---

## 1. Ground-Truth Benchmark Dataset Architecture

### Schema Design (`data/benchmark/sumatra_disruptions_ground_truth.json`)
The dataset contains an array of 60 scenario objects. Each scenario has:
```json
{
  "id": "SUM-SCN-001",
  "name": "Jalintim Palembang-Betung Flash Inundation",
  "province": "Sumatera Selatan",
  "corridor": "Palembang - Betung (KM 68)",
  "coordinates": [104.512, -2.854],
  "disaster_type": "flood",
  "sensor_inputs": {
    "bmkg_alert_level": "SIAGA",
    "openmeteo_rain_rate_mmh": 42.5,
    "tomtom_congestion_delay_min": 145,
    "tomtom_speed_ratio": 0.22,
    "osint_verified_headline": "Banjir Luapan Sungai Musi Genangi Jalintim Betung, Truk Sembako Macet 10 KM",
    "pihps_staple_price_shock_pct": 14.5
  },
  "ground_truth": {
    "is_disruption": 1,
    "actual_delay_hours": 6.5,
    "observed_price_impact_pct": 16.2,
    "corridor_severed": true
  }
}
```

### Scenario Distribution (Balanced Realism: 35 Disruption / 25 Control)
- **35 Positive Disruption Events:**
  - Floods (12 scenarios): Jalintim Betung, Langkat Waspada, Kampar Riau, Musi Banyuasin, Indragiri Hulu, etc.
  - Landslides (10 scenarios): Sitinjau Lauik (Padang-Solok), Bukit Barisan Tarutung-Sibolga, Curup-Lubuklinggau, Gayo Lues, etc.
  - Port Congestion & Rob (5 scenarios): Pelabuhan Belawan rob tide, Bakauheni ASDP ferry congestion, Dumai Ro-Ro terminal queue.
  - Road Subsidence & Bridge Impairment (5 scenarios): Jembatan Way Sekampung, Lintas Barat Bengkulu subsidence, Meulaboh culvert collapse.
  - Market Price Shocks (3 scenarios): North Sumatra cooking oil distributor disruption, West Sumatra chili spike.
- **25 Negative / Benign Controls:**
  - High precipitation (30-50 mm/h) with fully functioning drainage (8 scenarios).
  - Regular weekend/Friday evening commuter congestion near provincial capitals (7 scenarios).
  - Unverified social media rumors lacking news wire or sensor backing (6 scenarios).
  - Minor sea chop (wave height 1.2 m) not affecting inter-island Ro-Ro ferry sailings (4 scenarios).

---

## 2. Empirical Evaluation Engine (`scripts/evaluate_metrics.py`)

### Interface with Consensus Logic
The evaluation script imports `compute_consensus` from `agents.tools.consensus_gate` or backend router schemas.
For each benchmark scenario:
1. Normalizes raw sensor inputs into simulated state findings:
   - `data_collection_finding`: BMKG + weather sensors confidence
   - `osint_hazard_finding`: OSINT news verification confidence
   - `prediction_finding`: Open-Meteo numerical precipitation confidence
   - `route_optimization_finding`: TomTom congestion/delay confidence
   - `economic_intelligence_finding`: PIHPS price shock confidence
2. Computes the consensus result (`is_validated`).
3. Tallies confusion matrix:
   - **True Positive (TP):** `is_disruption == 1` and `is_validated == True`
   - **False Positive (FP):** `is_disruption == 0` and `is_validated == True`
   - **True Negative (TN):** `is_disruption == 0` and `is_validated == False`
   - **False Negative (FN):** `is_disruption == 1` and `is_validated == False`
4. Calculates metrics:
   $$\text{Precision} = \frac{TP}{TP + FP}$$
   $$\text{Recall} = \frac{TP}{TP + FN}$$
   $$\text{F1} = 2 \cdot \frac{\text{Precision} \cdot \text{Recall}}{\text{Precision} + \text{Recall}}$$
   $$\text{FPR} = \frac{FP}{FP + TN}$$
5. Enforces gating:
   - Asserts $\text{Precision} \ge 0.85$, $\text{Recall} \ge 0.80$, $\text{F1} \ge 0.82$.
   - Writes `test-results/benchmark_evaluation_report.json`.

---

## 3. Test Coverage & Pytest Engine Analysis

### Current Test Suite Baseline
- Pytest run on `backend/tests`: **39 passed in 8.64s**.
- Initial coverage across `backend/app` + `agents`: **43%**.
- High-coverage modules:
  - `agents/tools/consensus_gate.py`: 100%
  - `agents/nodes/data_collection.py`: 96%
  - `agents/graph.py`: 90%
  - `agents/nodes/economic_intelligence.py`: 86%
  - `agents/nodes/decision_support.py`: 78%
  - `agents/nodes/route_optimization.py`: 77%
  - `backend/app/adapters/bmkg_adapter.py`: 78%
  - `backend/app/adapters/tomtom_adapter.py`: 69%
- Zero-coverage modules:
  - `backend/app/routers/*` (0% across all 8 routers because tests directly tested adapters rather than router endpoints with `TestClient`).
  - `backend/app/main.py` (0%).

### Action Plan to Reach >=80% Core Coverage
1. Add `backend/tests/test_api_routers.py` using FastAPI `TestClient` to test:
   - `/health` and `/`
   - `/api/v1/incidents` (GET, GET by ID, live list)
   - `/api/v1/approvals` (GET, POST approval)
   - `/api/v1/commodity` (GET, price spikes)
   - `/api/v1/news` (live news, market regime)
   - `/api/v1/corridor` (corridor context)
2. Configure `.coveragerc` with:
   - `source = backend/app, agents`
   - `branch = True`
   - `omit`: mock stubs (`cuopt_adapter.py`, `earth2_adapter.py`, `workers/*`)
   - `fail_under = 80` (or target threshold on core packages)

---

## 4. Test Matrix Inventory (`docs/test_matrix.md`)

Structured catalog mapping existing and new tests to hackathon requirements:
- Group 1: Data Ingestion & Adapters (FR-1: BMKG, TomTom, AISstream, NASA FIRMS) — 11 tests
- Group 2: Agent Swarm & LangGraph State (FR-3: Data Collection, OSINT Hazard, Prediction, Route Optimization, Economic Intelligence, Consensus Gate, Decision Support) — 12 tests
- Group 3: News Intelligence & Natural Language Processing (FR-2: ANTARA News Ingestion, Heuristics, Gazetteer NER, Geocoding) — 5 tests
- Group 4: Scrapers & Price Shock Detectors (FR-2, FR-5: PIHPS Anomaly, Social OSINT, Crisis Mode Interval Switch) — 11 tests
- Group 5: API Routers & Integration (FR-6, FR-8: FastAPI Endpoints, Approvals, Incidents, Health) — New tests
- Group 6: Benchmark & Metric Evaluation (FR-10: 60-scenario evaluation harness) — New test

---

## Validation Architecture

### Automated Verification
```bash
# 1. Benchmark Evaluation Harness
& "backend/.venv/Scripts/python.exe" scripts/evaluate_metrics.py

# 2. Pytest Full Test Suite with Branch Coverage
$env:PYTHONPATH = "d:\College\Pidi.id\backend;d:\College\Pidi.id"
& "backend/.venv/Scripts/python.exe" -m pytest backend/tests --cov=app --cov=agents --cov-report=term-missing --cov-report=html
```

### Verification Criteria
- [ ] `data/benchmark/sumatra_disruptions_ground_truth.json` contains 60 valid scenarios matching schema.
- [ ] `scripts/evaluate_metrics.py` generates Precision > 85%, Recall > 80%, F1 > 82%, and exits 0.
- [ ] `pytest backend/tests` executes 45+ tests with zero failures.
- [ ] Pytest coverage meets >=80% on configured core modules.
- [ ] `docs/test_matrix.md` contains full inventory of test cases.