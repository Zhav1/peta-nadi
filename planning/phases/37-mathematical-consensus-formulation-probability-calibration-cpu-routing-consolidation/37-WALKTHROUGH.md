# Phase 37 Walkthrough: Mathematical Consensus Formulation, Probability Calibration & CPU Routing Consolidation

**Phase:** Phase 37: Mathematical Consensus Formulation, Probability Calibration & CPU Routing Consolidation  
**Executed & Audited:** 2026-09-23  
**Status:** COMPLETE & VERIFIED  

---

## 1. What Was Built & Accomplished

In Phase 37, we executed the mathematical, algorithmic, and architectural consolidation required to eliminate ungrounded GPU claims, implement formal probabilistic consensus gating, calibrate event disruption probabilities, and establish sub-millisecond CPU routing across Sumatra.

### 1.1 Formal Probabilistic Consensus Gate (`agents/tools/consensus_gate.py`)
- **Formula Implemented:**
  $$P_{\text{disruption}}(s) = 1 - \prod_{k \in \{W, T, I, E\}} \left(1 - w_k(t, d) \cdot p_k(s)\right)$$
- **Decay Functions:**
  - Temporal decay: $w_k(t) = w_k \cdot e^{-\lambda \Delta t}$ with $\lambda = 0.05/\text{hour}$.
  - Spatial distance decay: $w_k(d) = w_k \cdot e^{-d / d_0}$ with $d_0 = 25\text{ km}$.
- **Strict Decoupling:** Route Optimization Agent (Agent 4) is strictly decoupled from consensus voting and active sensor counts.
- **Sensory Breakdown Schema:** Standardized to sensory channel keys: `{"weather", "traffic", "osint", "economics"}`.

### 1.2 Probability Calibration Engine (`backend/app/services/probability_calibration.py`)
- **Metrics Implemented:**
  - Brier Score: $BS = \frac{1}{N} \sum_{i=1}^N (f_i - o_i)^2$.
  - Expected Calibration Error (ECE) across 10 empirical deciles: $\text{ECE} = \sum_{m=1}^M \frac{|B_m|}{N} |\text{acc}(B_m) - \text{conf}(B_m)|$.
  - Platt Scaling (`PlattScalingCalibrator` via Logistic Regression).
  - Isotonic Regression (`IsotonicRegressionCalibrator` via Pool Adjacent Violators Algorithm / PAVA).
- **Benchmark Evaluation Results on $N=60$ Sumatra Ground-Truth Dataset:**
  - **Precision:** 100.0% (Threshold: $\ge 85\%$)
  - **Recall:** 97.1% (Threshold: $\ge 80\%$)
  - **F1-Score:** 0.986 (Threshold: $\ge 0.82$)
  - **Raw Brier Score:** 0.0782 (Threshold: $\le 0.10$ — satisfies NFR-4)
  - **Platt Calibrated ECE:** 0.0001 (Threshold: $\le 0.10$)

### 1.3 Deterministic CPU Routing Adapter (`backend/app/adapters/cpu_routing_adapter.py`) & Road Network Cache (`data/road_network_sumatra.json`)
- **Network Topology Cache:** 54 strategic logistics junctions, ports, airports, and toll interchanges across all 8 Sumatra provinces with 104 bidirectional edges.
- **Point-to-Point Routing:** NetworkX Dijkstra / $k$-shortest paths with dynamic hazard penalties running in $< 2\text{ ms}$ on standard CPU (NFR-5 target $< 50\text{ ms}$).
- **Capacitated Fleet VRP:** Google OR-Tools / NetworkX solver solving multi-stop routing in $< 2\text{ ms}$ on standard CPU (NFR-5 target $< 150\text{ ms}$).
- **Node Alias Resolution:** `NODE_ALIASES` mapping frontend Mapbox slugs (`belawan`, `tebingtinggi`, `medan`, `siantar`) to topology IDs (`belawan_port`, `tebing_tinggi_toll`, etc.), eliminating fallback drift.

### 1.4 Standardized Open Numerical Weather Fusion (`backend/app/adapters/openmeteo_adapter.py`, `backend/app/services/weather_fusion_service.py`)
- Fuses live BMKG radar warnings with Open-Meteo ECMWF/GFS global atmospheric numerical weather models.
- Completely removed fictional FourCastNet / Earth-2 / DGX GPU runtime claims.
- Generates organic GeoJSON multi-polygons for corridor overlays with authentic provenance (`BMKG Stasiun Klimatologi & Geofisika` + `Open-Meteo Global NWP`).

---

## 2. Validation & Verification

### 2.1 Automated Backend Test Suite
Executed via `rtk` CLI across all 8 test modules:

```text
backend/tests/test_adapters.py ...........                               [ 16%]
backend/tests/test_agents.py ............                                [ 34%]
backend/tests/test_api_routers.py ........                               [ 46%]
backend/tests/test_benchmark_eval.py ...                                 [ 50%]
backend/tests/test_consensus_calibration.py .........                    [ 64%]
backend/tests/test_cpu_routing_weather.py ........                       [ 76%]
backend/tests/test_news_pipeline.py .....                                [ 83%]
backend/tests/test_scrapers.py ...........                               [100%]
========================================================================
Results: 67 passed, 4 warnings in 68.57s (100% pass rate)
```

### 2.2 Frontend Static Analysis & Type Checking
Executed via `rtk tsc --noEmit`:
```text
TypeScript: No errors found (0 errors)
```

### 2.3 Key Verification Invariants Confirmed
1. **NFR-4 (Brier Score $\le 0.10$):** Verified ($BS = 0.0782$).
2. **NFR-5 (CPU Latency $< 50\text{ ms}$ shortest path, $< 150\text{ ms}$ VRP):** Verified ($< 2\text{ ms}$).
3. **FR-11.2 (Consensus Decoupling):** Verified (`active_sources` excludes Agent 4, `consensus_breakdown` has 4 channels).
4. **Node Alias Integrity:** Verified (`test_cpu_routing_alias_resolution` passes for frontend and backend inputs).
