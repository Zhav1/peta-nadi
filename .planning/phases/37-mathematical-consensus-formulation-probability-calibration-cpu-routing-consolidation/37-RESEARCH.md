# RESEARCH — Phase 37: Mathematical Consensus Formulation, Probability Calibration & CPU Routing Consolidation

**Phase:** 37
**Researched:** 2026-09-23
**Researcher:** Antigravity (gsd-plan-phase 37)

---

## Executive Summary

Phase 37 consolidates PreHub's core algorithms to match the exact mathematical specifications presented in the technical proposal (`docs/Dokumen_Pendukung_PreHub.md` § 4.3), address judge concerns regarding unverified GPU claims, and establish statistical honesty through genuine probability calibration.

Key deliverables:
1. **Mathematical Consensus Formulation**: Transition `agents/tools/consensus_gate.py` from an ad-hoc linear sum to the formal probabilistic independence equation with temporal and spatial decay functions.
2. **Sensor Decoupling**: Strictly separate independent sensory observations from operational routing recommendations.
3. **Probability Calibration Service**: Provide Brier Score, Expected Calibration Error (ECE), Platt Scaling, and Isotonic Regression in `backend/app/services/probability_calibration.py`.
4. **Deterministic CPU Routing Engine**: Build `backend/app/adapters/cpu_routing_adapter.py` and offline arterial graph cache `data/road_network_sumatra.json` delivering <150 ms routing on standard CPU without NVIDIA GPU dependencies.
5. **Standardized Weather Fusion**: Formalize Open-Meteo and BMKG radar fusion in `backend/app/services/weather_fusion_service.py`, eliminating fictional FourCastNet GPU claims.

---

## 1. Probabilistic Consensus Formulation

### Proposal Equation Alignment
In `docs/Dokumen_Pendukung_PreHub.md` § 4.3, the disruption probability is formulated as:
$$P_{\text{disruption}}(s) = 1 - \prod_{k \in \{W, T, I\}} (1 - w_k \cdot p_k(s))$$

Where:
- $k \in \{W, T, I\}$ represents independent sensor channels:
  - $W$: Meteorological / Weather (BMKG Radar alerts + Open-Meteo precipitation rate)
  - $T$: Traffic Congestion & Obstruction (TomTom speed flow ratio + incident delays)
  - $I$: Verified OSINT News Intelligence (ANTARA regional bureaus + verified headlines)
  - Optional $E$: Economic Commodity Anomaly (PIHPS price spikes as an auxiliary validation signal)

### Spatio-Temporal Weight Decay
To prevent stale reports or distant anomalies from inflating local risk, weights dynamically decay:
$$w_k(t, d) = w_{k,0} \cdot e^{-\lambda \Delta t} \cdot e^{-d / d_0}$$

Where:
- $w_{k,0}$: Baseline channel weight ($\sum w_{k,0} = 1.0$; default: $w_W = 0.35$, $w_T = 0.35$, $w_I = 0.30$).
- $\lambda$: Temporal decay constant ($\lambda = 0.05/\text{hour}$; an alert 12 hours old retains $e^{-0.6} \approx 55\%$ weight).
- $d_0$: Spatial characteristic distance ($d_0 = 25.0\text{ km}$; an observation 25 km away has $e^{-1} \approx 36.8\%$ weight).

### Strict Sensor Decoupling (FR-11.2)
- **Problem in legacy code:** `agents/tools/consensus_gate.py` treated `route_optimization_finding` (Agent 4) as an independent vote inside `geo_conf` and `active_sources`. This creates circular reasoning (calculating detours reinforces the belief that a disruption exists).
- **Resolution:** Only external sensing agents (Agent 1 Data Collection, Agent 2 OSINT Hazard, Agent 3 Weather Forecast, Agent 5 Economic Intelligence) provide sensor probabilities $p_k(s)$. Agent 4 (Route Optimization) and Agent 6 (Decision Support Copilot) consume $P_{\text{disruption}}(s)$ and provide operational response, but never contribute to consensus voting.

---

## 2. Probability Calibration Service (`backend/app/services/probability_calibration.py`)

### The Calibration Problem
Heuristic scoring formulas produce confidence values $f_i \in [0, 1]$, but they often deviate from true posterior probabilities. A model predicting 80% confidence should be correct 80% of the time.

### Mathematical Formulations

#### 1. Brier Score ($BS$)
Measures the mean squared difference between predicted probabilities $f_i$ and binary ground-truth outcomes $o_i \in \{0, 1\}$:
$$BS = \frac{1}{N} \sum_{i=1}^N (f_i - o_i)^2$$
Target: $BS \le 0.10$ on the Sumatra Ground-Truth Benchmark ($N=60$). A lower score indicates superior calibration.

#### 2. Expected Calibration Error (ECE)
Partitions predicted probabilities into $M$ equal-width bins $B_m$ (typically $M=10$, deciles $[0.0, 0.1), [0.1, 0.2), \dots, [0.9, 1.0]$):
$$\text{ECE} = \sum_{m=1}^M \frac{|B_m|}{N} \left| \text{acc}(B_m) - \text{conf}(B_m) \right|$$
Where:
- $\text{conf}(B_m) = \frac{1}{|B_m|} \sum_{i \in B_m} f_i$ (average predicted confidence in bin $m$)
- $\text{acc}(B_m) = \frac{1}{|B_m|} \sum_{i \in B_m} o_i$ (empirical fraction of positives in bin $m$)

#### 3. Platt Scaling (Logistic Sigmoid Calibration)
Fits scalar parameters $A, B \in \mathbb{R}$ to minimize log-loss:
$$P_{\text{cal}}(f) = \frac{1}{1 + \exp(-(A \cdot f + B))}$$
Implemented via `scipy.optimize.minimize` with logistic cross-entropy loss.

#### 4. Isotonic Regression (PAVA Algorithm)
Fits a non-decreasing step function $m(f)$ that minimizes squared error $\sum (o_i - m(f_i))^2$ subject to $m(f_i) \le m(f_j)$ whenever $f_i \le f_j$.
Implemented using the classical Pool Adjacent Violators Algorithm (PAVA) in pure NumPy for deterministic, dependency-free execution.

---

## 3. Deterministic CPU Routing Engine & Local Road Cache

### Removing Theoretical GPU Dependencies (FR-11.4, NFR-5, NFR-7)
- PreHub previously referenced NVIDIA cuOpt and FourCastNet DGX AI. In reality, logistics routing for Sumatra arterial corridors (50–100 critical nodes) does not require a $30,000 NVIDIA H100 GPU cluster.
- A CPU-based solver combining **NetworkX Dijkstra / A*** for point-to-point alternative pathfinding and **Google OR-Tools VRP** (with a greedy heuristic fallback) solves a 50-node multi-vehicle routing problem in **< 50 milliseconds**.

### Local Road Network Graph Cache (`data/road_network_sumatra.json`)
The graph cache contains:
- **50+ Nodes:** Major ports (Belawan, Dumai, Teluk Bayur, Bakauheni), logistics distribution centers (KIM Medan, Palembang Depot, Pekanbaru Hub, Padang Warehouse), toll gates (Belmera, Medan-Tebing Tinggi, Terbanggi Besar-Kayu Agung), and arterial mountain passes (Sitinjau Lauik, Tarutung, Curup).
- **Edges:** Bi-directional arterial corridors and toll expressways with attributes:
  - `distance_km`: Real road distance.
  - `base_speed_kmh`: Realistic logistics speed limits (toll: 80 km/h, arterial: 45 km/h, mountain pass: 30 km/h).
  - `corridor_name`: Trans-Sumatra Highway (Jalinsum/Jalintim/Jalinbar), Tol Belmera, etc.
  - `is_toll`: Boolean flag.

### Routing Engine Interface (`backend/app/adapters/cpu_routing_adapter.py`)
```python
class CPURoutingAdapter:
    def solve_shortest_path(self, origin_id: str, dest_id: str, hazard_penalties: dict) -> dict: ...
    def solve_fleet_vrp(self, locations: list, cost_matrix: list, fleet_size: int, vehicle_capacity: float) -> dict: ...
```
- Guarantees execution time $< 150\text{ ms}$ on any standard CPU.
- Works 100% offline without database or internet connectivity.
- Backwards compatible with existing `POST /api/v1/routing/optimize-cuopt` endpoint payload.

---

## 4. Standardized Open Weather Fusion Service (`backend/app/services/weather_fusion_service.py`)

### Zero-GPU Architecture
- Ingests:
  1. **BMKG Warning Radar Alerts**: Direct observation station warnings (Sampali, Silangit, Minangkabau).
  2. **Open-Meteo Global Numerical Weather Model**: High-resolution atmospheric forecast (precipitation rate mm/h, wind gust, atmospheric pressure) from ECMWF/GFS.
- Merges alerts into organic GeoJSON polygons using `incident_geometry_service.py`.
- Replaces fictional labels like `"NVIDIA FourCastNet DGX AI Forecast"` with honest provenance: `"Open-Meteo NWP Forecast (ECMWF/GFS)"` and `"BMKG Radar Observation"`.

---

## 5. Verification Strategy & Test Plan

1. **Mathematical Consensus Tests (`backend/tests/test_consensus_calibration.py`)**:
   - Verify formula $P = 1 - \prod (1 - w_k p_k)$ across single-source, multi-source, and conflicting source inputs.
   - Verify that temporal decay reduces older reports properly ($t=24\text{h} \rightarrow \approx 30\%$ original weight).
   - Verify that spatial decay discounts distant reports ($d=50\text{ km} \rightarrow e^{-2} \approx 13.5\%$).
   - Verify strict sensor decoupling: passing `route_optimization_finding` does NOT increase $P_{\text{disruption}}$ or increment active sensor count.
2. **Calibration Engine Tests**:
   - Verify Brier Score $\le 0.10$ on the $N=60$ Sumatra Ground-Truth Benchmark.
   - Verify ECE calculation and reliability decile binning ($M=10$).
   - Verify Platt scaling and Isotonic regression monotonicity.
3. **CPU Routing Tests (`backend/tests/test_cpu_routing_weather.py`)**:
   - Verify loading and topology of `data/road_network_sumatra.json` (50+ nodes).
   - Benchmark execution time of 50-node VRP / shortest path ($< 150\text{ ms}$).
   - Verify hazard avoidance rerouting when high penalty is applied to an arterial segment.
4. **Open Weather Fusion Tests**:
   - Verify `weather_fusion_service.py` functions without errors and produces valid GeoJSON without Earth-2 / FourCastNet GPU dependencies.
